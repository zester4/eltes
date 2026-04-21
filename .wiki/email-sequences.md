# Email Sequences

*Cold email, nurture sequences, subject lines, deliverability, and automation. What actually works in 2025-2026.*

---

## Cold Email Fundamentals

Cold email works when it is: specific, short, and human. It fails when it is: generic, long, or obviously automated.

**The 4-part formula:**
1. **Personalized first line** — references something real and specific about them
2. **Relevance bridge** — connects what you noticed to why you're writing
3. **Value or curiosity** — give something or create a gap they want to close
4. **Single soft CTA** — one low-friction ask

**Length:** Under 120 words. If it can't be said in 120 words, the value proposition is unclear.

---

## Subject Line Formulas

| Formula | Example | Use for |
|---|---|---|
| `Quick question` | "Quick question" | Highest open rate for cold; implies you need them specifically |
| `[First name],` | "Sarah," | Feels like it got cut off; extreme curiosity |
| `Re: [topic]` | "Re: your Q4 strategy" | Implies ongoing conversation; high open, risky if overused |
| `[Specific outcome]` | "3 clients in 30 days" | Results-led; works for warm audiences |
| `[Mutual connection] suggested` | "Alex Kim suggested I reach out" | Social proof; massive open rate if honest |
| Blunt question | "Are you the right person?" | Disarms with directness |
| Pattern interrupt | "This email might not be for you" | Reverse psychology; works on skeptical audiences |

**Rules:**
- Under 50 characters for mobile
- No ALL CAPS
- No emojis in cold email (spam signal)
- Never use "following up" as a subject — it signals you've been ignored
- Test subject lines by sending to yourself across devices before a campaign

---

## First Line Personalization

The first line determines whether they read line 2. It must be unmistakably about them, not templated.

**Tier 1 (best):** References something they created or said
- "Your post about [specific topic] last week changed how I think about [thing]."
- "I read your case study on [client] — the part about [specific finding] was the bit that stuck."

**Tier 2:** References a company-specific event
- "Saw that [company] just launched [product] — congrats on shipping."
- "The [company] Series B announcement explains a lot — you're clearly moving into [market]."

**Tier 3:** References their role or problem
- "Most [job title] I talk to are dealing with [specific pain] right now — guessing you're not immune."

**Never use:**
- "I came across your profile on LinkedIn" (screams template)
- "I hope this email finds you well"
- Any opener that could apply to 100+ people without changing a word

---

## Cold Email Sequence Structure

**5-touch sequence for outbound:**

| Day | Email | Goal |
|---|---|---|
| 0 | Personalized first touch | Open + reply or click |
| 3 | Follow-up #1 — new angle | Re-engage non-openers |
| 7 | Follow-up #2 — add value (resource, insight, data point) | Give before asking again |
| 14 | Follow-up #3 — shift approach (different pain point or social proof) | Last real attempt |
| 21 | Break-up email | Permission to close or reopen |

**Break-up email formula:**
> "I've reached out a few times and haven't heard back — I'll assume the timing isn't right. If you ever want to [outcome], I'm here. No hard feelings either way."

The break-up email often gets the highest reply rate of the sequence because it removes all pressure.

---

## Nurture Sequence Structure (Post-Signup / Opt-in)

**Welcome sequence (first 7 days):**

| Day | Purpose | Content |
|---|---|---|
| 0 | Deliver what was promised | Immediate value, no selling |
| 1 | Quick win | One actionable thing they can do right now |
| 3 | Story | Your origin story or a customer story; builds trust |
| 5 | Proof | Case study with specific metrics |
| 7 | Offer | First soft introduction of your product/service |

**Ongoing newsletter rhythm:**
- 1x/week is the sweet spot — frequent enough to stay top of mind, infrequent enough to be an event
- Same send time each week — trains expectation
- Subject line should feel like something worth opening, not an obligation

---

## Deliverability

Before sending at volume, check:

**Technical setup (non-negotiable):**
- SPF record: `v=spf1 include:[your ESP] ~all`
- DKIM: Enabled in your ESP, DNS record published
- DMARC: `v=DMARC1; p=none; rua=mailto:postmaster@yourdomain` (monitor first, enforce later)
- Custom tracking domain: Use subdomain (mail.yourdomain.com), not shared ESP domain
- Warm up new domains: Start at 10/day, double every 3 days over 4 weeks

**Sending behavior:**
- Never buy email lists
- Send from a human-named address (sarah@company.com not info@)
- Plain text or minimal HTML — heavy HTML triggers spam filters
- One link maximum in cold email; unsubscribe link required in commercial email
- Hard bounce rate must stay under 2%; clean your list monthly
- Spam complaint rate must stay under 0.1%

**Inbox placement test:** Before a campaign, send to seed addresses across Gmail, Outlook, and Yahoo. Tools: GlockApps, Mail-Tester, MXToolbox.

---

## Email Copywriting for Sequences

**CTAs that work:**
- "Would this be useful to you?" (response invitation, not a hard ask)
- "Are you open to a 15-minute call this week?" (specific + easy yes)
- "Reply 'yes' and I'll send you [resource]" (micro-commitment)
- "Click here to [specific outcome]" (transactional, works for warm audiences)

**CTAs that don't work:**
- "Let me know your thoughts" (vague, no action)
- "Feel free to reach out if you have any questions" (passive)
- "I'd love to connect sometime" (no urgency, no specific ask)

**The P.S. line:** The most-read part of any email after the subject line. Use it for: the real CTA if you buried it, a piece of social proof, or a time-sensitive element.

---

## Metrics Benchmarks

| Metric | Cold Email | Nurture | Newsletter |
|---|---|---|---|
| Open rate | 30-50% (good) | 40-60% | 25-35% |
| Reply rate | 3-8% | n/a | n/a |
| Click rate | n/a | 2-5% | 1-3% |
| Unsubscribe | <0.5% | <0.3% | <0.2% |

If open rates are below benchmark: deliverability or subject line problem.
If open rates are fine but replies/clicks are low: body copy or CTA problem.

---

*Last updated by Etles: 2026-04-21*
