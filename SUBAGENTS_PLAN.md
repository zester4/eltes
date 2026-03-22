ETLES — 16 SUB-AGENT BUILD PROMPTS
Developer Specification Document
================================================================

This document contains detailed build prompts for each of the 16 Etles
sub-agents. Each prompt covers: what the agent does, what triggers it,
step-by-step behaviour, which tools it integrates with, permission
boundaries, and how Etles spawns and communicates with it. Developers
should treat each section as a complete brief for one self-contained agent.

================================================================


AGENT 01 — 24/7 AUTONOMOUS INBOX OPERATOR
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that autonomously monitors and operates the user's
inboxes across Gmail, Outlook, Slack, WhatsApp Business, and LinkedIn DMs
around the clock. The agent reads every inbound message, classifies it by
type and urgency, responds to what it is authorised to handle, routes
sensitive items for human approval, and delivers a morning brief
summarising everything that happened overnight.

TRIGGER
New message webhook from Gmail / Outlook / Slack / WhatsApp Business API.

STEP-BY-STEP BEHAVIOUR
1. Classify every message: lead, support query, invoice, sensitive, spam,
   or personal.
2. For non-sensitive items: generate and send a contextual reply using the
   user's learned tone and prior conversation history.
3. For sensitive items (legal, financial, personal): send a push
   notification to the user with a pre-drafted response and an
   approve/reject action.
4. Chase unanswered threads after a configurable delay (e.g. 48h no reply
   = follow-up).
5. Each morning at a configurable time, post a structured digest to the
   user: messages received, actions taken, items awaiting approval.

TOOLS REQUIRED
Gmail, Outlook Mail, Slack, WhatsApp Business API, Telegram

PERMISSION BOUNDARIES
The agent must maintain a user profile: tone examples, blocked senders,
auto-approve rules, and sensitive keyword lists. All outbound sends must
be logged with timestamp and full content. Include a kill switch that
pauses all autonomous sending instantly.

HOW ETLES SPAWNS THIS AGENT
Etles spawns this agent when the user says anything like "handle my
inbox", "reply to emails while I'm away", or "monitor my messages". The
agent runs persistently in the background and reports back to the Etles
main thread on completion of each action.

================================================================


AGENT 02 — AUTONOMOUS SALES DEVELOPMENT REP (SDR)
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that runs a complete outbound sales pipeline from lead
sourcing to booked meeting without human involvement. The user provides a
target customer profile (ICP); the agent does everything else: find leads,
enrich them, write personalised outreach, send sequences, handle replies,
and book calls directly into the user's calendar.

TRIGGER
User provides ICP description and target volume (e.g. "50 SaaS founders
who raised seed in last 90 days").

STEP-BY-STEP BEHAVIOUR
1. Source leads from Hunter.io, Apollo, and LinkedIn based on ICP criteria.
2. Enrich each lead: company size, funding, recent news, mutual
   connections, recent content they have published.
3. Write a fully personalised first email referencing something specific
   about them — not a template.
4. Send via Gmail or Outlook. Follow up on days 3, 7, and 14 if no reply.
5. When a reply indicates interest: respond, handle objections, and book a
   slot via Calendly or Google Calendar.
6. Log every contact, touchpoint, and outcome to HubSpot or the user's
   active CRM.

TOOLS REQUIRED
Gmail, HubSpot, Salesforce, Pipedrive, Calendly, Google Calendar, LinkedIn

PERMISSION BOUNDARIES
User must pre-approve the ICP definition, email templates (first draft
only), and sending limits per day. All replies from prospects must be
shown to the user before the agent responds — unless the user has enabled
full autonomous mode.

HOW ETLES SPAWNS THIS AGENT
Etles spawns this agent when the user says "find me leads", "run
outbound", or "I need sales calls booked". It runs async, updating Etles
with progress every 24h and notifying on each booked meeting.

================================================================


AGENT 03 — CHIEF OF STAFF — DAILY BRIEFING AGENT
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that runs every morning before the user wakes up and
prepares a complete operational brief for the day. It reads overnight
communications, reviews the day's calendar, cross-references relevant
context, and delivers a structured daily brief with pre-drafted actions
ready for one-tap execution.

TRIGGER
Cron job at a user-configured time each morning (e.g. 6:30am local time).

STEP-BY-STEP BEHAVIOUR
1. Pull all emails and messages received since last brief. Summarise by
   priority.
2. Fetch today's calendar events. For each meeting: pull the attendee's
   recent emails, any related Notion or Drive docs, and news about their
   company.
3. Check all open commitments across Jira, Asana, Linear, and email for
   anything due today or overdue.
4. Draft follow-up messages for any meetings that ended yesterday without
   a follow-up being sent.
5. Compose and deliver a structured brief: Today's schedule | Overnight
   actions | Open commitments at risk | Pre-drafted messages ready to send.

TOOLS REQUIRED
Gmail, Google Calendar, Notion, Jira, Asana, Slack, Google Drive

PERMISSION BOUNDARIES
The agent reads all connected tools but only sends the brief — it does not
take autonomous action. The user approves any pre-drafted sends from
within the brief. Brief is delivered via Slack DM or email.

HOW ETLES SPAWNS THIS AGENT
Runs automatically on schedule. Etles also allows the user to request an
on-demand brief at any time with "give me my brief" or "what do I need to
know today".

================================================================


AGENT 04 — AUTONOMOUS PROJECT MANAGER
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that owns the full operational layer of any active
project — creating tickets from conversations, tracking progress, chasing
blockers, updating stakeholders, and managing timeline slippage
autonomously. The user stops doing project coordination and only makes
decisions.

TRIGGER
Connected to all active projects in Jira, Linear, Asana, or ClickUp. Also
monitors Slack channels and email threads flagged as project-related.

STEP-BY-STEP BEHAVIOUR
1. Parse Slack threads and emails for action items and auto-create tickets
   in the correct project tool with assignee, priority, and due date.
2. Daily: check every open ticket for progress. If a ticket has had no
   activity in 48h, send a professional nudge to the assignee.
3. When a deadline is at risk: automatically recalculate the timeline,
   update the project, notify the PM, and draft a client-facing status
   update.
4. Weekly: generate and send a project status report to configured
   stakeholders.
5. When a contractor or team member goes silent: escalate to the PM with
   options — reassign, extend deadline, or find backup.

TOOLS REQUIRED
Jira, Linear, Asana, ClickUp, Slack, Gmail, Notion, Google Drive

PERMISSION BOUNDARIES
The agent can create and update tickets, send nudges, and generate reports
autonomously. It cannot reassign work or change budgets without user
approval. All external client communications require approval before
sending.

HOW ETLES SPAWNS THIS AGENT
Etles spawns this agent at project kick-off or when the user says "manage
this project for me". It runs persistently and surfaces updates to Etles
whenever a decision is needed.

================================================================


AGENT 05 — SOCIAL MEDIA OPERATOR AND GROWTH ENGINE
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that runs the user's full social media presence — from
content creation and scheduling to engagement and performance
optimisation. It converts existing work (Notion docs, emails, Slack
messages, voice notes) into polished posts across LinkedIn, Twitter/X, and
newsletters, and manages the entire publishing workflow.

TRIGGER
Scheduled content calendar plus on-demand when user shares raw material.

STEP-BY-STEP BEHAVIOUR
1. When the user shares a doc, voice note, or raw idea: convert it into
   platform-optimised content (LinkedIn post, tweet thread, email
   newsletter draft) and present for approval.
2. Maintain a content calendar. Fill gaps by identifying trending topics
   in the user's niche and drafting relevant takes for approval.
3. Schedule approved posts for optimal engagement windows per platform.
4. Monitor comments and replies. Respond to engagement in the user's voice
   for non-sensitive interactions. Flag anything requiring a personal
   response.
5. Weekly: surface top-performing content, identify patterns, and
   recommend doubling down on what is working.

TOOLS REQUIRED
LinkedIn, Twitter/X API, Notion, Gmail, Mailchimp, ConvertKit, Slack

PERMISSION BOUNDARIES
Nothing is posted without user approval. The agent drafts, schedules on
approval, and monitors. Auto-replies to comments only if the user has
enabled this and only for generic positive engagement.

HOW ETLES SPAWNS THIS AGENT
Etles spawns this agent when user says "post this", "turn this into
content", or "manage my social". Can also be configured to run on a weekly
content creation schedule.

================================================================


AGENT 06 — AUTONOMOUS HIRING AND CONTRACTOR PIPELINE
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that manages the entire hiring process end-to-end — from
writing the job description to onboarding the selected candidate. It
removes all administrative overhead from recruiting while keeping the
human in control of final selection.

TRIGGER
User describes the role they need to fill.

STEP-BY-STEP BEHAVIOUR
1. Write a compelling job description based on the role brief and post it
   to configured platforms (LinkedIn, GitHub Jobs, relevant job boards).
2. Screen incoming applications: score CVs against defined criteria, rank
   candidates, and send rejection emails to non-matches.
3. For shortlisted candidates: book interviews into the user's calendar via
   Calendly, send pre-interview briefs to the hiring manager, and send
   candidate prep emails.
4. After each interview: collect feedback via a structured Notion form,
   aggregate scores, and surface a ranked recommendation.
5. On offer acceptance: send the offer letter, trigger onboarding steps
   (create accounts, send first-day doc, schedule onboarding calls).

TOOLS REQUIRED
Gmail, LinkedIn, Calendly, Google Calendar, Notion, Slack, Google Drive

PERMISSION BOUNDARIES
Agent handles all logistics autonomously. Job postings, offer letters, and
rejection emails require one-time approval of templates. Final hire
decision always rests with the user.

HOW ETLES SPAWNS THIS AGENT
Etles spawns on user request: "I need to hire a [role]". Updates Etles at
each stage: applications received, shortlist ready, interviews booked,
recommendation ready.

================================================================


AGENT 07 — FINANCE AND VENDOR ADMIN OPERATOR
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that manages all financial admin: monitoring
transactions, chasing late payments, negotiating renewals, cancelling
waste, reconciling expenses, and keeping books up to date — autonomously.

TRIGGER
Continuous monitoring of Stripe, bank feeds, email invoices, and
subscription services.

STEP-BY-STEP BEHAVIOUR
1. Monitor Stripe and bank accounts for failed payments, unusual charges,
   and overdue invoices.
2. When a client invoice is overdue by configured threshold: send a
   professional payment chase email. Escalate tone on each follow-up.
3. Detect subscription renewals approaching. For each: check usage data
   and draft a renewal negotiation email or cancellation request based on
   usage.
4. Parse incoming invoices from email. Verify against agreed rates, approve
   and trigger payment via Stripe or Wise, log to QuickBooks or Xero with
   correct category.
5. Monthly: generate a financial summary report — income, expenses by
   category, outstanding receivables, and upcoming commitments.

TOOLS REQUIRED
Stripe, Wise, PayPal, QuickBooks, Xero, Gmail, Google Drive

PERMISSION BOUNDARIES
Payments above a configurable threshold (e.g. $500) require user approval.
The agent can send chase emails and cancellation requests autonomously
below this threshold. All transactions are logged with full audit trail.

HOW ETLES SPAWNS THIS AGENT
Runs persistently in background. Etles notifies user when agent has taken
action or found an issue requiring a decision.

================================================================


AGENT 08 — COMPETITIVE AND MARKET INTELLIGENCE OPERATOR
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that continuously monitors the user's specific
competitive landscape and delivers actionable weekly intelligence briefs —
not generic market news, but signals tied directly to the user's situation
with recommended actions.

TRIGGER
User configures competitors, keywords, and strategic focus areas on setup.
Agent runs on a weekly cycle with continuous background monitoring.

STEP-BY-STEP BEHAVIOUR
1. Monitor competitor websites for changes (pricing, product pages, job
   postings). Flag significant changes immediately.
2. Track competitor job postings to infer strategic direction (e.g. sudden
   enterprise AE hiring = going upmarket).
3. Monitor review platforms for competitor weakness signals that represent
   openings.
4. Track funding announcements, leadership changes, and press mentions for
   each competitor.
5. Every Monday: deliver a synthesised intelligence brief with specific
   action recommendations. For each insight, suggest a concrete response
   and optionally draft it.

TOOLS REQUIRED
Gmail, Slack, Notion, HubSpot, LinkedIn, Google Analytics

PERMISSION BOUNDARIES
Monitoring and reporting are fully autonomous. Any recommended actions
(outreach drafts, pricing responses) require user approval before
execution.

HOW ETLES SPAWNS THIS AGENT
Etles spawns on setup and runs weekly. User can also ask "what's happening
with [competitor]" for an on-demand snapshot.

================================================================


AGENT 09 — AUTONOMOUS CUSTOMER SUCCESS AND SUPPORT OPERATOR
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that monitors all customer-facing channels, handles
support autonomously for common queries, detects churn signals early, and
triggers retention workflows — operating as a full CS function that never
sleeps.

TRIGGER
Continuous monitoring of all support channels: email, Slack, and any
connected ticketing system.

STEP-BY-STEP BEHAVIOUR
1. Classify inbound support messages. Resolve common queries (password
   reset, how-to, billing queries) instantly using a knowledge base built
   from existing docs.
2. For complex issues: create a support ticket, acknowledge the user with
   an ETA, and notify the right internal team member.
3. Monitor product usage data via Amplitude or Mixpanel. Flag accounts
   with declining engagement for proactive outreach.
4. When a customer emails with frustration or cancellation intent:
   immediately escalate to a human with full context and a pre-drafted
   retention offer.
5. Log every interaction to the CRM. Weekly: generate a support summary
   with volume, resolution rate, common issues, and churn risk accounts.

TOOLS REQUIRED
Gmail, Slack, HubSpot, Salesforce, Amplitude, Mixpanel, Notion

PERMISSION BOUNDARIES
Agent resolves Tier 1 queries autonomously. Tier 2 (billing disputes,
cancellations, complaints) always requires human review. Retention offers
must be pre-approved by the user.

HOW ETLES SPAWNS THIS AGENT
Runs persistently. Etles notifies the user immediately on any high-risk
churn signal or escalation.

================================================================


AGENT 10 — PERSONAL LIFE ADMIN AUTOPILOT
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that handles all personal administrative tasks requiring
coordination or scheduling — appointments, travel, insurance, renewals,
household services — removing the 6-8 hours per week the average person
spends on personal admin.

TRIGGER
User requests, monitored calendar deadlines, and document expiry
detection.

STEP-BY-STEP BEHAVIOUR
1. Book appointments (medical, dental, services) via email or phone based
   on user availability from calendar.
2. Manage travel end-to-end: flights, accommodation, transfers, and build
   a day-by-day itinerary in Notion.
3. Monitor document expiry dates (passport, driving licence, insurance).
   Alert at configurable lead times and initiate renewal process.
4. Handle household subscriptions: track all active subscriptions, flag
   underused ones, and negotiate or cancel on user instruction.
5. Coordinate with third parties (contractors, suppliers, services) — send
   enquiry emails, collect quotes, present options to user.

TOOLS REQUIRED
Gmail, Google Calendar, Notion, Twilio, Wise, Google Drive

PERMISSION BOUNDARIES
All bookings and payments require user confirmation before execution. The
agent prepares everything and presents for one-tap approval. Nothing is
committed on the user's behalf without explicit sign-off.

HOW ETLES SPAWNS THIS AGENT
Etles spawns this agent for any life admin request. Also runs proactively
when it detects upcoming deadlines in the user's profile.

================================================================


AGENT 11 — AUTONOMOUS INCIDENT RESPONSE ENGINEER
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that detects, diagnoses, and responds to production
incidents autonomously — without waking a human for the majority of cases.
It monitors error rates, traces the root cause, executes a rollback if
authorised, communicates to all stakeholders, and creates the incident
ticket — all within minutes of detection.

TRIGGER
Webhook from Sentry, Datadog, New Relic, or LogRocket when error
thresholds are breached.

STEP-BY-STEP BEHAVIOUR
1. On alert: immediately read the full stack trace and error context from
   Sentry.
2. Cross-reference GitHub or GitLab commit history to identify the most
   recent deploy touching the affected file or function.
3. Check Datadog or New Relic to quantify impact: how many users affected,
   which regions, what is the error rate trajectory.
4. If a clear culprit deploy is identified and the agent is authorised:
   trigger a rollback on Vercel or Netlify immediately.
5. Open a Slack incident channel. Tag on-call team. Post: error summary,
   affected users, suspected cause, actions taken so far.
6. Create a P1 Jira or Linear ticket with full context pre-populated.
7. If users are visibly impacted: send a status update email via SendGrid
   to the affected user segment.

TOOLS REQUIRED
Sentry, Datadog, New Relic, GitHub, GitLab, Vercel, Netlify, Slack,
Jira, Linear, SendGrid

PERMISSION BOUNDARIES
Rollbacks are only executed automatically if the user has pre-authorised
auto-rollback for that environment. Production rollbacks always notify the
user before execution and allow a 60-second cancel window.

HOW ETLES SPAWNS THIS AGENT
Always running. Incident detection is continuous. Etles surfaces incident
updates to the user in natural language when they are active in chat.

================================================================


AGENT 12 — REVENUE PROTECTION OPERATOR — STRIPE CHURN DEFENSE
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that intercepts every failed payment, subscription
cancellation, and churn signal from Stripe and orchestrates a personalised,
multi-channel recovery sequence — treating each account based on its actual
value and engagement level rather than sending generic dunning emails.

TRIGGER
Stripe webhooks: payment_failed, subscription_deleted,
customer.subscription.updated (downgrade).

STEP-BY-STEP BEHAVIOUR
1. On payment failure: immediately look up the customer in Salesforce or
   HubSpot to get ARR, account health, and relationship owner.
2. Check Amplitude or Mixpanel: is this customer actively using the product
   or already disengaged?
3. Review Gmail history: any recent complaints or support issues from this
   account?
4. Generate a tiered recovery response: high-value active user gets a
   personal email from the founder's address; low-value inactive gets an
   automated retry with a standard card update link.
5. If no response in 24h: attempt a Twilio call for accounts above a
   configurable ARR threshold.
6. Log every touchpoint to the CRM. If unresolved after full sequence:
   flag for manual key account manager follow-up.

TOOLS REQUIRED
Stripe, Salesforce, HubSpot, Amplitude, Mixpanel, Gmail, Twilio, Slack

PERMISSION BOUNDARIES
Agent sends recovery emails autonomously within pre-approved templates.
Personalised founder-address sends for high-value accounts require
approval. Phone calls are autonomous but logged in full.

HOW ETLES SPAWNS THIS AGENT
Runs persistently triggered by Stripe webhooks. Etles notifies user on
each high-value recovery attempt and outcome.

================================================================


AGENT 13 — AUTONOMOUS CODE REVIEW AND DEPLOYMENT AGENT
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that takes over the full pull request lifecycle —
reviewing code for quality and risk, managing the CI/CD process, executing
deployments, monitoring post-deploy stability, and communicating outcomes
to the team — so developers focus entirely on writing code.

TRIGGER
GitHub or GitLab webhook on pull_request opened or synchronised.

STEP-BY-STEP BEHAVIOUR
1. On PR open: check if CircleCI or Travis CI tests are passing. Block
   merge if tests fail.
2. Review the diff for: obvious bugs, security anti-patterns, missing error
   handling, and consistency with existing codebase conventions.
3. Leave inline code review comments on GitHub. Either request changes with
   specific guidance or approve.
4. On approval: merge the PR and trigger the configured deployment pipeline
   (Vercel, Netlify, or AWS/GCP).
5. Post-deploy: monitor Sentry for new errors and Datadog for latency and
   traffic anomalies for 15 minutes.
6. Post a deploy summary to the configured Slack channel: what was
   deployed, by whom, key changes, and any post-deploy anomalies detected.

TOOLS REQUIRED
GitHub, GitLab, Bitbucket, CircleCI, Travis CI, Vercel, Netlify, AWS,
Sentry, Datadog, Slack

PERMISSION BOUNDARIES
Code review comments are autonomous. Merging to main and production
deployments require a human approval step unless the user has enabled full
auto-merge for the repo. Rollback is always a human decision.

HOW ETLES SPAWNS THIS AGENT
Etles spawns or activates this agent per-repository. Developers can also
mention Etles directly in a PR comment to trigger a manual review.

================================================================


AGENT 14 — CLOUD COST INTELLIGENCE AND RIGHTSIZING OPERATOR
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that continuously monitors cloud spend across all
connected providers, identifies waste in real time (not at month end), and
autonomously rightsizes or terminates resources it is authorised to touch
— paying for itself within the first week.

TRIGGER
Scheduled scan every 6 hours across AWS, GCP, Azure, and DigitalOcean.

STEP-BY-STEP BEHAVIOUR
1. Identify idle resources: compute instances running below 10% CPU for
   7+ days, unused load balancers, orphaned storage volumes, forgotten dev
   environments.
2. Cross-reference GitHub activity: is there an active deployment pointing
   to this resource? If not, flag as zombie.
3. Detect cost anomalies: day-over-day spend increases above a configurable
   threshold trigger an immediate Slack alert with drill-down.
4. For resources below a size threshold (e.g. under $50/mo): terminate or
   downsize automatically if idle criteria are met.
5. For larger resources: send a Slack message with one-click approve or
   dismiss. No action without confirmation.
6. Monthly: produce a full cloud cost optimisation report in Notion —
   actions taken, savings realised, and next recommendations.

TOOLS REQUIRED
AWS, Google Cloud Platform, Microsoft Azure, DigitalOcean, Heroku,
Cloudflare, GitHub, Slack, Notion

PERMISSION BOUNDARIES
Auto-terminate threshold and auto-resize rules are configured by the user
on setup. Production resources are never touched autonomously regardless
of usage. All actions are logged with before/after cost impact.

HOW ETLES SPAWNS THIS AGENT
Always running. Etles delivers the weekly savings summary in the main chat
thread and notifies immediately on any spike or large waste detection.

================================================================


AGENT 15 — PRODUCT ANALYTICS TO ENGINEERING ACTION LOOP
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that closes the loop between product data and engineering
response — detecting meaningful metric changes in Amplitude or Mixpanel,
tracing the likely cause across recent deploys, creating the right ticket
with full context pre-written, notifying the right people, and queuing
re-engagement flows for affected users — all from a single data event.

TRIGGER
Amplitude or Mixpanel webhook or scheduled daily metric comparison scan.

STEP-BY-STEP BEHAVIOUR
1. Monitor key product metrics: DAU, retention cohorts, funnel step
   completion, feature adoption. Alert on statistically significant drops
   above a configurable threshold.
2. When a drop is detected: trace the funnel to identify the exact step
   and segment where the change occurred.
3. Cross-reference GitHub deploy history: did any deploy happen within 48h
   before the drop touching the relevant feature area?
4. Create a Linear or Jira ticket with: metric name, magnitude of drop,
   affected cohort, suspected deploy, and funnel link. Assign to the
   relevant squad.
5. Notify the product manager on Slack with a 5-line summary, ticket link,
   and severity rating.
6. For user-facing drops in activation or day-1 retention: queue a targeted
   re-engagement email via Klaviyo or ActiveCampaign to affected users.

TOOLS REQUIRED
Amplitude, Mixpanel, Segment, GitHub, Linear, Jira, Slack, Klaviyo,
ActiveCampaign, Notion

PERMISSION BOUNDARIES
Ticket creation and internal Slack notifications are fully autonomous.
External re-engagement emails to users require approval before sending.

HOW ETLES SPAWNS THIS AGENT
Runs on a daily scan schedule and responds to real-time webhooks. Etles
notifies user immediately on any critical metric drop.

================================================================


AGENT 16 — AUTONOMOUS CONTRACTOR AND VENDOR PAYMENT OPERATOR
----------------------------------------------------------------

OVERVIEW
Build a sub-agent that manages the complete accounts payable cycle — from
invoice receipt to payment execution to bookkeeping — for all contractors
and vendors. Every step that currently requires human coordination is fully
automated.

TRIGGER
Inbound email containing an invoice (detected via Gmail or Outlook
parsing) or contractor submitting via a configured form.

STEP-BY-STEP BEHAVIOUR
1. Parse the invoice on receipt: extract vendor name, amount, currency,
   due date, line items, and bank details.
2. Verify against the agreed rate stored in the CRM or a contracts register
   in Notion or Drive.
3. Confirm the associated deliverable or milestone is marked complete in
   Asana or Linear before approving payment.
4. For approved invoices: trigger the payment via Stripe, Wise, or PayPal
   according to vendor preference.
5. Automatically create the accounting entry in QuickBooks or Xero with
   the correct project code, category, and VAT treatment.
6. File the invoice PDF in the correct Google Drive folder (by vendor and
   month) and send a payment confirmation to the contractor.

TOOLS REQUIRED
Gmail, Outlook Mail, Asana, Linear, Stripe, Wise, PayPal, QuickBooks,
Xero, FreshBooks, Google Drive, Notion

PERMISSION BOUNDARIES
Payments below a user-configured threshold (e.g. $1,000) are executed
autonomously if all verification checks pass. Above the threshold: agent
prepares everything and requests one-tap approval. Discrepancies between
invoice and agreed rate always halt for human review.

HOW ETLES SPAWNS THIS AGENT
Runs persistently triggered by invoice emails. Etles notifies user of each
payment made and surfaces any invoice requiring approval or discrepancy
review.

================================================================
END OF DOCUMENT
================================================================