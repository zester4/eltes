// app/api/agent/mission/[...any]/route.ts
// NOTE: This MUST be a catch-all route for serveMany to work.
// Create at: app/api/agent/mission/[...any]/route.ts

import { WorkflowContext } from "@upstash/workflow";
import { createWorkflow, serveMany } from "@upstash/workflow/nextjs";
import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { saveMessages } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";

export const maxDuration = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

type MissionPayload = {
  missionId: string;
  userId: string;
  chatId: string;
  goal: string;
  startupDescription: string;
  productUrl?: string;
};

type Lead = {
  name: string;
  email: string;
  company: string;
  role: string;
  personalisation: string;
  reason: string;
};

type LeadPayload = {
  missionId: string;
  userId: string;
  chatId: string;
  lead: Lead;
};

type SocialPayload = {
  missionId: string;
  chatId: string;
  productDescription: string;
  targetAudience: string;
  durationDays: number;
};

type CommunityPayload = {
  missionId: string;
  chatId: string;
  productDescription: string;
  communities: Array<{ name: string; platform: string; vibe: string }>;
};

type MissionPlan = {
  productDescription: string;
  targetAudience: string;
  icps: Array<{ title: string; painPoint: string; channels: string[] }>;
  leads: Lead[];
  communities: Array<{ name: string; platform: string; vibe: string }>;
  dailyTargets: { outreach: number; signups: number };
  campaignDuration: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postToChat(chatId: string, text: string) {
  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [{ type: "text", text }],
        attachments: [],
        createdAt: new Date(),
      },
    ],
  });
}

async function handleLeadReply({
  lead,
  reply,
  chatId,
}: {
  lead: Lead;
  reply: unknown;
  userId: string;
  chatId: string;
}) {
  const { text } = await generateText({
    model: getLanguageModel("google/gemini-3-flash"),
    prompt: `${lead.name} replied to our outreach. Draft the perfect follow-up.

Their reply: ${JSON.stringify(reply)}

Rules:
- Match their energy and tone exactly
- Interested → offer 2 specific call time slots
- Objections → address directly, empathetically
- Needs info → give exactly what they need + clear next step
- Never sound desperate. Max 4 sentences.`,
  });

  await postToChat(
    chatId,
    `📬 **${lead.name} replied!**\n\n**Suggested response:**\n\n${text}\n\n_Reply "send it" to approve, or edit directly._`
  );
}

// ── Lead Lifecycle Workflow ───────────────────────────────────────────────────
// Each lead gets their own 14-day durable sequence.
// waitForEvent pauses with ZERO compute cost until they reply.

const leadLifecycleWorkflow = createWorkflow(
  async (context: WorkflowContext<LeadPayload>) => {
    const { missionId, userId, chatId, lead } = context.requestPayload;

    // Day 0: Send first personalised email
    await context.run("send-first-touch", async () => {
      const { text } = await generateText({
        model: getLanguageModel("google/gemini-3-flash"),
        prompt: `Write a cold outreach email to ${lead.name} at ${lead.company}.

Personalisation hook: ${lead.personalisation}
Why they'd care: ${lead.reason}

Rules:
- 5-7 sentences MAX
- Open with the personalisation hook, not "I"
- Never say "hope this finds you well", "I wanted to reach out", "touch base"
- Be specific about the problem you solve for their role
- One clear ask: 15-min call OR link to try the product
- Sound like a thoughtful founder, not a sales robot`,
      });

      await postToChat(
        chatId,
        `📤 **Outreach → ${lead.name}** (${lead.company}, ${lead.role})\n\n${text}`
      );
    });

    // Wait up to 3 days for reply — ZERO compute during wait
    const { eventData: reply1, timeout: ghosted1 } =
      await context.waitForEvent(
        "await-reply-3d",
        `lead-reply:${missionId}:${lead.email}`,
        { timeout: "3d" }
      );

    if (!ghosted1) {
      await context.run("handle-reply-1", async () => {
        await handleLeadReply({ lead, reply: reply1, userId, chatId });
      });
      return;
    }

    // Day 3: Follow-up — new angle, new value
    await context.run("send-followup-1", async () => {
      const { text } = await generateText({
        model: getLanguageModel("google/gemini-3-flash"),
        prompt: `Write follow-up #1 to ${lead.name}. No reply to the first email.

NEVER say "just following up", "circling back", "wanted to bump this up".
Instead: add ONE new thing — a relevant stat, a question about their situation, 
or something you noticed about their company.
End with a DIFFERENT, lower-friction ask.
3 sentences MAX.`,
      });

      await postToChat(
        chatId,
        `📤 **Follow-up #1 → ${lead.name}**\n\n${text}`
      );
    });

    const { eventData: reply2, timeout: ghosted2 } =
      await context.waitForEvent(
        "await-reply-7d",
        `lead-reply:${missionId}:${lead.email}`,
        { timeout: "4d" }
      );

    if (!ghosted2) {
      await context.run("handle-reply-2", async () => {
        await handleLeadReply({ lead, reply: reply2, userId, chatId });
      });
      return;
    }

    // Day 7: Completely different angle — short, intriguing
    await context.run("send-angle-shift", async () => {
      const { text } = await generateText({
        model: getLanguageModel("google/gemini-3-flash"),
        prompt: `Write follow-up #2 to ${lead.name}. Two previous emails, no reply.

Try a completely different frame — a short question only, a relevant industry 
observation, or a counterintuitive take.
1-2 sentences. Short enough to read in 5 seconds. No pitch.`,
      });

      await postToChat(
        chatId,
        `📤 **Angle shift → ${lead.name}**\n\n${text}`
      );
    });

    const { eventData: reply3, timeout: ghosted3 } =
      await context.waitForEvent(
        "await-reply-14d",
        `lead-reply:${missionId}:${lead.email}`,
        { timeout: "7d" }
      );

    if (!ghosted3) {
      await context.run("handle-reply-3", async () => {
        await handleLeadReply({ lead, reply: reply3, userId, chatId });
      });
      return;
    }

    // Day 14: Graceful break-up — paradoxically gets the most replies
    await context.run("send-breakup", async () => {
      const { text } = await generateText({
        model: getLanguageModel("google/gemini-3-flash"),
        prompt: `Write a gracious break-up email to ${lead.name}. 3 emails, no reply.

2 sentences. No pressure. Thank them. Leave the door open warmly.
Example tone: "Totally understand if the timing isn't right. I'll leave it here — if things change, I'm easy to find."
This email often gets the highest reply rate because it removes all pressure.`,
      });

      await postToChat(
        chatId,
        `📤 **Break-up email → ${lead.name}** (sequence complete)\n\n${text}`
      );
    });
  }
);

// ── Social Campaign Workflow ───────────────────────────────────────────────────

const socialCampaignWorkflow = createWorkflow(
  async (context: WorkflowContext<SocialPayload>) => {
    const { chatId, productDescription, targetAudience, durationDays } =
      context.requestPayload;

    const themes = [
      "the problem you're solving and why it matters",
      "a specific customer story or use case",
      "behind-the-scenes: how you built this",
      "a counterintuitive insight about your industry",
      "data or results you've seen",
      "a mistake you made and what you learned",
      "what your ideal customer looks like and why",
    ];

    for (let day = 1; day <= durationDays; day++) {
      const theme = themes[(day - 1) % themes.length];

      await context.run(`post-day-${day}`, async () => {
        const { text } = await generateText({
          model: getLanguageModel("google/gemini-3-flash"),
          prompt: `Write a LinkedIn post for day ${day} of a startup launch campaign.

Product: ${productDescription}
Target audience: ${targetAudience}
Theme: ${theme}

Rules:
- Open with a scroll-stopping hook (not "Excited to share...")
- Tell a real story or share a specific insight
- No corporate speak, max 2 relevant hashtags
- End with a genuine question or invite to try something
- 150-250 words max
- Sound like a smart founder who has earned the right to share this`,
        });

        await postToChat(
          chatId,
          `📱 **Day ${day} social post ready**\n\n${text}\n\n_Say "post it" to publish, or edit first._`
        );
      });

      if (day < durationDays) {
        await context.sleep(`wait-day-${day + 1}`, "1d");
      }
    }
  }
);

// ── Community Workflow ────────────────────────────────────────────────────────

const communityWorkflow = createWorkflow(
  async (context: WorkflowContext<CommunityPayload>) => {
    const { chatId, productDescription, communities } = context.requestPayload;

    for (let i = 0; i < communities.length; i++) {
      const community = communities[i];

      await context.run(`engage-${community.platform}-${i}`, async () => {
        const { text } = await generateText({
          model: getLanguageModel("google/gemini-3-flash"),
          prompt: `Write an authentic post for the ${community.name} community on ${community.platform}.

Community vibe: ${community.vibe}
Product context: ${productDescription}

Rules:
- Lead with genuine value to THIS community, not a product pitch
- If you mention the product, it should feel natural, not promotional
- Ask a real question you'd actually want answered
- Goal: become a trusted member, not convert immediately
- Match the exact tone of ${community.platform}
- If this community rejects product plugs: DON'T PLUG IT. Provide value only.`,
        });

        await postToChat(
          chatId,
          `🏘️ **Community post ready for ${community.name} (${community.platform})**\n\n${text}\n\n_Say "post it" to publish._`
        );
      });

      if (i < communities.length - 1) {
        await context.sleep(`stagger-community-${i}`, "4h");
      }
    }
  }
);

// ── Master Mission Workflow ────────────────────────────────────────────────────

const missionWorkflow = createWorkflow(
  async (context: WorkflowContext<MissionPayload>) => {
    const { missionId, userId, chatId, goal, startupDescription, productUrl } =
      context.requestPayload;

    // ── Step 1: AI strategist plans the full campaign ────────────────────────
    const plan = await context.run("plan-mission", async () => {
      const { text } = await generateText({
        model: getLanguageModel("google/gemini-3-flash"),
        prompt: `You are a world-class growth strategist. Plan a 14-day user acquisition campaign.

Goal: ${goal}
Startup: ${startupDescription}
${productUrl ? `Product URL: ${productUrl}` : ""}

Return ONLY valid JSON (no markdown fences, no backticks):
{
  "productDescription": "one-line description",
  "targetAudience": "who exactly you're targeting",
  "icps": [{ "title": "Job title", "painPoint": "specific problem", "channels": ["LinkedIn"] }],
  "leads": [
    {
      "name": "Full Name", "email": "email@company.com", "company": "Company",
      "role": "Job Title", "personalisation": "specific hook", "reason": "why they'd care"
    }
  ],
  "communities": [{ "name": "r/startups", "platform": "Reddit", "vibe": "skeptical founders" }],
  "dailyTargets": { "outreach": 5, "signups": 1 },
  "campaignDuration": 14
}

Include 15 leads and 5 communities minimum.`,
      });

      try {
        const clean = text.replace(/```json|```/g, "").trim();
        return JSON.parse(clean) as MissionPlan;
      } catch {
        // Return a safe fallback if JSON parsing fails
        return {
          productDescription: startupDescription.slice(0, 100),
          targetAudience: "startup founders",
          icps: [{ title: "Founder", painPoint: goal, channels: ["LinkedIn", "email"] }],
          leads: [],
          communities: [
            { name: "r/startups", platform: "Reddit", vibe: "founders community" },
          ],
          dailyTargets: { outreach: 5, signups: 1 },
          campaignDuration: 14,
        } satisfies MissionPlan;
      }
    });

    // ── Step 2: Announce mission start ──────────────────────────────────────
    await context.run("announce-mission", async () => {
      await postToChat(
        chatId,
        `🚀 **Mission launched: ${goal}**

Here's your 14-day campaign plan:

**Target users:** ${plan.icps.map((i) => i.title).join(", ")}
**Leads queued:** ${plan.leads.length} personalised outreach sequences
**Communities:** ${plan.communities.map((c) => c.name).join(", ")}
**Daily targets:** ${plan.dailyTargets.outreach} outreach/day, ${plan.dailyTargets.signups} signups/day

Running outreach, social content, and community engagement simultaneously. Each lead gets a personalised 14-day sequence. When someone replies, I'll bring it to you immediately with a draft response.

I'll check in every morning. You don't need to do anything unless I flag something.`
      );
    });

    // ── Step 3: Launch all 3 tracks in parallel via context.invoke ──────────
    // Each is its own durable workflow — independently restartable, no shared state.
    const leadCount = Math.min(plan.leads.length, 15);
    const leadInvocations = plan.leads.slice(0, leadCount).map((lead, i) =>
      context.invoke(`lead-sequence-${i}`, {
        workflow: leadLifecycleWorkflow,
        body: { missionId, userId, chatId, lead },
      })
    );

    await Promise.all([
      context.invoke("social-campaign", {
        workflow: socialCampaignWorkflow,
        body: {
          missionId,
          chatId,
          productDescription: plan.productDescription,
          targetAudience: plan.targetAudience,
          durationDays: plan.campaignDuration,
        },
      }),
      context.invoke("community-campaign", {
        workflow: communityWorkflow,
        body: {
          missionId,
          chatId,
          productDescription: plan.productDescription,
          communities: plan.communities,
        },
      }),
      ...leadInvocations,
    ]);

    // ── Step 4: Daily mission reports ───────────────────────────────────────
    // sleep = zero compute. Wake up → assess → report → course-correct.
    for (let day = 1; day <= plan.campaignDuration; day++) {
      await context.sleep(`mission-sleep-day-${day}`, "1d");

      await context.run(`daily-report-day-${day}`, async () => {
        const { text } = await generateText({
          model: getLanguageModel("google/gemini-3-flash"),
          prompt: `Generate a brief daily mission report for Day ${day}/${plan.campaignDuration}.

Goal: ${goal}
Product: ${plan.productDescription} targeting ${plan.targetAudience}

3-4 bullet points covering:
- What ran today (outreach sent, posts published, communities engaged)
- Any signals worth acting on
- What's running tomorrow
- One tactical recommendation

Tone: crisp, direct. No fluff.`,
        });

        await postToChat(
          chatId,
          `📊 **Mission Day ${day}/${plan.campaignDuration}**\n\n${text}\n\n_Reply to adjust strategy, or let it run._`
        );
      });
    }

    // ── Step 5: Mission complete ────────────────────────────────────────────
    await context.run("mission-complete", async () => {
      await postToChat(
        chatId,
        `🏁 **Mission complete: ${goal}**

Your ${plan.campaignDuration}-day campaign has run its full course.

**What ran:**
- ${leadCount} personalised outreach sequences (each a ${plan.campaignDuration}-day journey)
- ${plan.campaignDuration} days of social content
- ${plan.communities.length} community engagements

Check your product analytics for signups. Check your inbox for replies I flagged.

Ready to run another campaign or go deeper on what worked? Just say the word.`
      );
    });
  }
);

// ── serveMany: all workflows under same catch-all route ───────────────────────
// Route keys become URL suffixes: /api/agent/mission/mission-workflow, etc.
export const { POST } = serveMany({
  "mission-workflow": missionWorkflow,
  "lead-lifecycle": leadLifecycleWorkflow,
  "social-campaign": socialCampaignWorkflow,
  "community-campaign": communityWorkflow,
});