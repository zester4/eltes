// lib/ai/trigger-routing.ts
import type { AgentSlug } from "@/lib/agent/subagent-definitions";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single route: which agent handles this trigger, at what priority,
 * and how to extract a human-readable context string from the raw payload.
 */
export type TriggerRoute = {
  /** Target sub-agent slug from SUBAGENT_DEFINITIONS */
  agentSlug: AgentSlug;

  /**
   * immediate → run the agent synchronously in the webhook handler
   * queued    → publish to QStash for async execution (use for heavy agents)
   */
  priority: "immediate" | "queued";

  /**
   * Extracts a plain-English description of what happened from the raw
   * Composio trigger payload. This becomes the agent's task prompt.
   * If omitted, the raw payload JSON is used.
   */
  contextExtractor?: (payload: Record<string, any>) => string;
};

export type TriggerRoutingMap = Record<string, TriggerRoute[]>;

// ─────────────────────────────────────────────────────────────────────────────
// Routing Map
// ─────────────────────────────────────────────────────────────────────────────

export const TRIGGER_ROUTES: TriggerRoutingMap = {

  // ── GitHub ──────────────────────────────────────────────────────────────────

  GITHUB_COMMIT_EVENT: [
    {
      agentSlug: "code_review",
      priority: "immediate",
      contextExtractor: (p) =>
        `A new commit was pushed to ${p.repository?.full_name ?? "a repository"} ` +
        `by ${p.pusher?.name ?? "someone"}: "${p.head_commit?.message ?? "unknown message"}". ` +
        `Branch: ${p.ref?.replace("refs/heads/", "") ?? "unknown"}. ` +
        `Review for quality, security issues, and consistency.`,
    },
  ],

  GITHUB_PULL_REQUEST_OPENED: [
    {
      agentSlug: "code_review",
      priority: "immediate",
      contextExtractor: (p) =>
        `PR #${p.number} opened in ${p.repository?.full_name ?? "a repository"}: ` +
        `"${p.pull_request?.title ?? "untitled"}" by ${p.pull_request?.user?.login ?? "unknown"}. ` +
        `${p.pull_request?.additions ?? 0} additions, ${p.pull_request?.deletions ?? 0} deletions across ` +
        `${p.pull_request?.changed_files ?? 0} files. ` +
        `Perform a full code review: correctness, security, performance, consistency.`,
    },
    {
      agentSlug: "docs_keeper",
      priority: "queued",
      contextExtractor: (p) =>
        `PR #${p.number} opened in ${p.repository?.full_name}: "${p.pull_request?.title}". ` +
        `Review the code changes for any mismatch with existing documentation in Notion/Confluence. ` +
        `If documentation is missing for this new feature, draft a first version from the PR diff.`,
    },
  ],

  GITHUB_ISSUE_OPENED: [
    {
      agentSlug: "project_manager",
      priority: "queued",
      contextExtractor: (p) =>
        `A new GitHub issue was opened in ${p.repository?.full_name ?? "a repository"}: ` +
        `"${p.issue?.title ?? "untitled"}" by ${p.issue?.user?.login ?? "unknown"}. ` +
        `Body: ${p.issue?.body?.slice(0, 500) ?? "no description"}. ` +
        `Triage this issue, assign priority, create or link a tracking ticket, and notify the relevant team member.`,
    },
  ],

  GITHUB_ISSUE_COMMENT_CREATED: [
    {
      agentSlug: "project_manager",
      priority: "queued",
      contextExtractor: (p) =>
        `A comment was added to issue #${p.issue?.number} in ${p.repository?.full_name}: ` +
        `by ${p.comment?.user?.login ?? "unknown"}: "${p.comment?.body?.slice(0, 300) ?? ""}". ` +
        `Check if this comment contains a blocker, a decision, or an action item that needs to be tracked.`,
    },
  ],

  GITHUB_STAR_ADDED: [
    {
      agentSlug: "social_media",
      priority: "queued",
      contextExtractor: (p) =>
        `${p.sender?.login ?? "Someone"} just starred ${p.repository?.full_name ?? "your repository"}. ` +
        `Consider drafting a thank-you or a social post celebrating the milestone if a round number was hit ` +
        `(current stars: ${p.repository?.stargazers_count ?? "unknown"}).`,
    },
  ],

  // ── Slack ────────────────────────────────────────────────────────────────────

  SLACK_NEW_MESSAGE: [
    {
      agentSlug: "inbox_operator",
      priority: "immediate",
      contextExtractor: (p) =>
        `New Slack message in channel ${p.channel ?? "unknown"} from ${p.user ?? "unknown"}: ` +
        `"${p.text?.slice(0, 500) ?? ""}". ` +
        `Classify this message, determine if it requires a response or action, and handle accordingly.`,
    },
    {
      agentSlug: "brand_monitor",
      priority: "queued",
      contextExtractor: (p) =>
        `New Slack message in ${p.channel}: "${p.text?.slice(0, 300)}". ` +
        `Check sentiment. If this is a crisis (complaint/outage) or a high-value opportunity, triage immediately.`,
    },
    {
      agentSlug: "docs_keeper",
      priority: "queued",
      contextExtractor: (p) =>
        `Slack message in ${p.channel}: "${p.text?.slice(0, 300)}". ` +
        `Scan for technical questions. If this is a recurring question, flag as a "Documentation Gap" and draft a doc entry.`,
    },
  ],

  SLACK_USER_JOINED_CHANNEL: [
    {
      agentSlug: "inbox_operator",
      priority: "queued",
      contextExtractor: (p) =>
        `User ${p.user ?? "unknown"} just joined the Slack channel ${p.channel ?? "unknown"}. ` +
        `Send a warm, personalised welcome message that makes them feel included.`,
    },
  ],

  SLACK_REACTION_ADDED: [
    {
      agentSlug: "inbox_operator",
      priority: "queued",
      contextExtractor: (p) =>
        `Reaction :${p.reaction ?? "unknown"}: was added to a message in ${p.item?.channel ?? "unknown"} ` +
        `by ${p.user ?? "unknown"}. Assess if this reaction signals approval, a question, or an action item.`,
    },
  ],

  SLACK_FILE_SHARED: [
    {
      agentSlug: "project_manager",
      priority: "queued",
      contextExtractor: (p) =>
        `A file was shared in Slack channel ${p.channel_id ?? "unknown"}: "${p.file?.name ?? "unknown file"}". ` +
        `Determine if this file should be saved to a project folder, linked to a ticket, or routed to a team member.`,
    },
  ],

  // ── Gmail ────────────────────────────────────────────────────────────────────

  GMAIL_NEW_GMAIL_MESSAGE: [
    {
      agentSlug: "inbox_operator",
      priority: "immediate",
      contextExtractor: (p) =>
        `New email received. From: ${p.from ?? "unknown"}. ` +
        `Subject: "${p.subject ?? "no subject"}". ` +
        `Snippet: "${p.snippet?.slice(0, 400) ?? ""}". ` +
        `Classify (LEAD / SUPPORT / INVOICE / SENSITIVE / SPAM / PERSONAL) and take the appropriate action.`,
    },
    {
      agentSlug: "legal_operator",
      priority: "queued",
      contextExtractor: (p) =>
        `New email received from ${p.from}: "${p.subject}". ` +
        `If this email contains a contract, renewal notice, or sensitive legal document (DocuSign/PandaDoc), ` +
        `extract obligations and update the contract register immediately.`,
    },
    {
      agentSlug: "brand_monitor",
      priority: "queued",
      contextExtractor: (p) =>
        `New email from ${p.from}: "${p.subject}". ` +
        `Check for brand mentions, PR enquiries, or crisis signals. Triage and draft response if needed.`,
    },
    {
      agentSlug: "investor_relations",
      priority: "queued",
      contextExtractor: (p) =>
        `New email from ${p.from}: "${p.subject}". ` +
        `Check if this is an investor inquiry or data request. If so, draft a response with metrics from connected tools.`,
    },
  ],

  GMAIL_LABEL_ADDED: [
    {
      agentSlug: "inbox_operator",
      priority: "queued",
      contextExtractor: (p) =>
        `Label "${p.labelId ?? "unknown"}" was added to an email. ` +
        `Message ID: ${p.messageId ?? "unknown"}. ` +
        `Check if this label indicates an action is required (e.g. URGENT, INVOICE, FOLLOW-UP) and respond accordingly.`,
    },
  ],

  GMAIL_DRAFT_CREATED: [
    {
      agentSlug: "inbox_operator",
      priority: "queued",
      contextExtractor: (p) =>
        `A new draft email was created. Draft ID: ${p.draftId ?? "unknown"}. ` +
        `Review this draft for tone, completeness, and any commitments that require approval before it is sent.`,
    },
  ],

  // ── Outlook ──────────────────────────────────────────────────────────────────

  OUTLOOK_MESSAGE_TRIGGER: [
    {
      agentSlug: "inbox_operator",
      priority: "immediate",
      contextExtractor: (p) =>
        `New Outlook email received from ${p.from?.emailAddress?.address ?? "unknown"}. ` +
        `Subject: "${p.subject ?? "no subject"}". ` +
        `Body preview: "${p.bodyPreview?.slice(0, 400) ?? ""}". ` +
        `Classify and handle this message through the full inbox operating protocol.`,
    },
  ],

  // ── Stripe ───────────────────────────────────────────────────────────────────

  STRIPE_CHARGE_FAILED_TRIGGER: [
    {
      agentSlug: "stripe_churn",
      priority: "immediate",
      contextExtractor: (p) =>
        `Stripe charge failed. Customer: ${p.customer ?? "unknown"} (${p.billing_details?.email ?? "no email"}). ` +
        `Amount: ${((p.amount ?? 0) / 100).toFixed(2)} ${(p.currency ?? "usd").toUpperCase()}. ` +
        `Failure reason: "${p.failure_message ?? "unknown"}". ` +
        `Triage the account, classify as ENGAGED/AT-RISK/LOST, and execute the appropriate recovery sequence.`,
    },
    {
      agentSlug: "revenue_forecasting",
      priority: "queued",
      contextExtractor: (p) =>
        `Stripe charge failed for ${p.billing_details?.email}. ` +
        `Update the revenue forecast model and flag this as a potential hit to the month-end target.`,
    },
  ],

  STRIPE_PAYMENT_FAILED_TRIGGER: [
    {
      agentSlug: "stripe_churn",
      priority: "immediate",
      contextExtractor: (p) =>
        `Stripe payment intent failed for customer ${p.customer ?? "unknown"}. ` +
        `Amount: ${((p.amount ?? 0) / 100).toFixed(2)} ${(p.currency ?? "usd").toUpperCase()}. ` +
        `Last error: "${p.last_payment_error?.message ?? "unknown"}". ` +
        `Run the full churn defense triage and execute the appropriate recovery sequence immediately.`,
    },
  ],

  STRIPE_SUBSCRIPTION_DELETED_TRIGGER: [
    {
      agentSlug: "stripe_churn",
      priority: "immediate",
      contextExtractor: (p) =>
        `Stripe subscription cancelled. Customer: ${p.customer ?? "unknown"}. ` +
        `Plan: ${p.items?.data?.[0]?.price?.nickname ?? p.items?.data?.[0]?.plan?.id ?? "unknown"}. ` +
        `Cancellation reason: "${p.cancellation_details?.reason ?? "not provided"}". ` +
        `Run the full churn defense protocol immediately.`,
    },
    {
      agentSlug: "finance",
      priority: "queued",
      contextExtractor: (p) =>
        `A Stripe subscription was cancelled for customer ${p.customer ?? "unknown"}. ` +
        `Update MRR records, adjust revenue forecasts, and log this as churned ARR in the financial system.`,
    },
  ],

  STRIPE_CHECKOUT_SESSION_COMPLETED_TRIGGER: [
    {
      agentSlug: "customer_success",
      priority: "queued",
      contextExtractor: (p) =>
        `New Stripe checkout completed. Customer: ${p.customer_details?.email ?? "unknown"}. ` +
        `Amount: ${((p.amount_total ?? 0) / 100).toFixed(2)} ${(p.currency ?? "usd").toUpperCase()}. ` +
        `Trigger the new customer onboarding sequence and schedule a day-3 check-in.`,
    },
    {
      agentSlug: "finance",
      priority: "queued",
      contextExtractor: (p) =>
        `New Stripe checkout completed for ${p.customer_details?.email ?? "unknown"}. ` +
        `Amount: ${((p.amount_total ?? 0) / 100).toFixed(2)} ${(p.currency ?? "usd").toUpperCase()}. ` +
        `Log this transaction in the accounting system with the correct revenue category.`,
    },
  ],

  STRIPE_INVOICE_PAYMENT_SUCCEEDED_TRIGGER: [
    {
      agentSlug: "finance",
      priority: "queued",
      contextExtractor: (p) =>
        `Stripe invoice paid. Customer: ${p.customer_email ?? "unknown"}. ` +
        `Invoice: ${p.number ?? "unknown"}, Amount: ${((p.amount_paid ?? 0) / 100).toFixed(2)} ${(p.currency ?? "usd").toUpperCase()}. ` +
        `Log the payment in the accounting system, update the receivables register, and send a payment receipt if not auto-sent by Stripe.`,
    },
    {
      agentSlug: "revenue_forecasting",
      priority: "queued",
      contextExtractor: (p) =>
        `Successful Stripe payment: ${((p.amount_paid ?? 0) / 100).toFixed(2)} ${p.currency?.toUpperCase()}. ` +
        `Update actual vs. forecasted revenue for the current month.`,
    },
    {
      agentSlug: "investor_relations",
      priority: "queued",
      contextExtractor: (p) =>
        `Revenue event: ${((p.amount_paid ?? 0) / 100).toFixed(2)} ${p.currency?.toUpperCase()}. ` +
        `Update MRR and growth metrics for the next investor update.`,
    },
  ],

  STRIPE_SUBSCRIPTION_ADDED_TRIGGER: [
    {
      agentSlug: "customer_success",
      priority: "queued",
      contextExtractor: (p) =>
        `New Stripe subscription created for customer ${p.customer ?? "unknown"}. ` +
        `Plan: ${p.items?.data?.[0]?.price?.nickname ?? "unknown"}. ` +
        `Trigger the full new subscriber onboarding sequence immediately.`,
    },
  ],

  STRIPE_PRODUCT_CREATED_TRIGGER: [
    {
      agentSlug: "finance",
      priority: "queued",
      contextExtractor: (p) =>
        `New Stripe product created: "${p.name ?? "unknown"}". ` +
        `Product ID: ${p.id ?? "unknown"}. ` +
        `Add this product to the financial catalog and ensure it has correct category tagging for reporting.`,
    },
  ],

  // ── Notion ───────────────────────────────────────────────────────────────────

  NOTION_PAGE_UPDATED_TRIGGER: [
    {
      agentSlug: "project_manager",
      priority: "queued",
      contextExtractor: (p) =>
        `A Notion page was updated: "${p.properties?.Name?.title?.[0]?.plain_text ?? p.id ?? "unknown page"}". ` +
        `Check if this update closes a tracked deliverable, creates new action items, or requires ticket updates in Jira or Linear.`,
    },
  ],

  NOTION_PAGE_ADDED_TO_DATABASE: [
    {
      agentSlug: "project_manager",
      priority: "queued",
      contextExtractor: (p) =>
        `A new page was added to a Notion database. ` +
        `Page ID: ${p.id ?? "unknown"}. ` +
        `Check if this represents a new project, task, or deliverable that needs a corresponding ticket created.`,
    },
    {
      agentSlug: "legal_operator",
      priority: "queued",
      contextExtractor: (p) =>
        `New entry in Notion database (ID: ${p.id}). ` +
        `Check if this is a newly added contract. If yes, analyze it for renewal dates and key obligations.`,
    },
  ],

  NOTION_COMMENTS_ADDED_TRIGGER: [
    {
      agentSlug: "inbox_operator",
      priority: "queued",
      contextExtractor: (p) =>
        `A new comment was added to a Notion page. ` +
        `Comment: "${p.rich_text?.[0]?.plain_text?.slice(0, 300) ?? ""}". ` +
        `Determine if this comment requires a response, contains an action item, or needs to be routed to a team member.`,
    },
  ],

  // ── Agent Mail ───────────────────────────────────────────────────────────────

  AGENT_MAIL_NEW_EMAIL_TRIGGER: [
    {
      agentSlug: "inbox_operator",
      priority: "immediate",
      contextExtractor: (p) =>
        `New Agent Mail email received from ${p.from ?? "unknown"}. ` +
        `Subject: "${p.subject ?? "no subject"}". ` +
        `Body: "${p.body?.slice(0, 500) ?? ""}". ` +
        `This is likely an inbound sales or support enquiry. Classify and handle immediately.`,
    },
    {
      agentSlug: "sdr",
      priority: "queued",
      contextExtractor: (p) =>
        `An inbound email arrived via Agent Mail from ${p.from ?? "unknown"}: "${p.subject ?? ""}". ` +
        `Assess whether this is a sales lead. If yes, log to CRM, score it, and draft the first response.`,
    },
  ],

  // ── Google Calendar ───────────────────────────────────────────────────────────

  GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_CREATED_TRIGGER: [
    {
      agentSlug: "chief_of_staff",
      priority: "queued",
      contextExtractor: (p) =>
        `A new calendar event was created: "${p.summary ?? "untitled"}". ` +
        `Time: ${p.start?.dateTime ?? p.start?.date ?? "unknown"}. ` +
        `Attendees: ${p.attendees?.map((a: any) => a.email).join(", ") ?? "none"}. ` +
        `Pull context on all attendees and prepare a pre-meeting brief.`,
    },
  ],

  GOOGLECALENDAR_EVENT_STARTING_SOON_TRIGGER: [
    {
      agentSlug: "chief_of_staff",
      priority: "immediate",
      contextExtractor: (p) =>
        `Event starting soon: "${p.summary ?? "untitled"}". ` +
        `Starting at: ${p.start?.dateTime ?? "unknown"}. ` +
        `Attendees: ${p.attendees?.map((a: any) => a.email).join(", ") ?? "none"}. ` +
        `Deliver a concise pre-meeting brief immediately: who is attending, their context, open items, and talking points.`,
    },
  ],

  GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_UPDATED_TRIGGER: [
    {
      agentSlug: "chief_of_staff",
      priority: "queued",
      contextExtractor: (p) =>
        `A calendar event was updated: "${p.summary ?? "unknown event"}". ` +
        `Check if this rescheduling creates conflicts, breaks a prep sequence, or requires downstream notifications.`,
    },
  ],

  GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER: [
    {
      agentSlug: "chief_of_staff",
      priority: "queued",
      contextExtractor: (p) =>
        `A calendar event was cancelled or deleted: "${p.summary ?? "unknown event"}". ` +
        `Check if any prep work, follow-ups, or attendee notifications need to be triggered as a result.`,
    },
  ],

  GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER: [
    {
      agentSlug: "chief_of_staff",
      priority: "queued",
      contextExtractor: (p) =>
        `An attendee response changed for event "${p.summary ?? "unknown"}". ` +
        `Check if a key stakeholder declined and whether the meeting should be rescheduled or cancelled.`,
    },
  ],

  // ── Google Docs ───────────────────────────────────────────────────────────────

  GOOGLEDOCS_DOCUMENT_UPDATED_TRIGGER: [
    {
      agentSlug: "project_manager",
      priority: "queued",
      contextExtractor: (p) =>
        `A Google Doc was updated: "${p.title ?? p.documentId ?? "unknown"}". ` +
        `Check if this document is linked to an active project deliverable. If yes, update the corresponding ticket status.`,
    },
  ],

  GOOGLEDOCS_DOCUMENT_CREATED_TRIGGER: [
    {
      agentSlug: "chief_of_staff",
      priority: "queued",
      contextExtractor: (p) =>
        `A new Google Doc was created: "${p.title ?? "untitled"}". ` +
        `Determine if this document should be filed in a project folder, linked to a ticket, or flagged for review.`,
    },
    {
      agentSlug: "legal_operator",
      priority: "queued",
      contextExtractor: (p) =>
        `Google Doc created: "${p.title}". ` +
        `Analyze this document for legal commitments, renewal terms, or obligation clauses. Update contract register if applicable.`,
    },
  ],

  // ── Google Sheets ─────────────────────────────────────────────────────────────

  GOOGLESHEETS_NEW_ROWS_TRIGGER: [
    {
      agentSlug: "product_analytics",
      priority: "queued",
      contextExtractor: (p) =>
        `New rows were added to a Google Sheet: "${p.spreadsheetId ?? "unknown"}". ` +
        `Sheet: "${p.sheetTitle ?? "unknown"}". ` +
        `Assess whether this data represents a metric event, a new lead, or a reportable data point.`,
    },
  ],

  GOOGLESHEETS_SPREADSHEET_ROW_CHANGED_TRIGGER: [
    {
      agentSlug: "finance",
      priority: "queued",
      contextExtractor: (p) =>
        `A row changed in Google Sheet "${p.spreadsheetId ?? "unknown"}". ` +
        `Check if this row is part of a financial tracker. If yes, update the accounting system accordingly.`,
    },
  ],

  // ── HubSpot ──────────────────────────────────────────────────────────────────

  HUBSPOT_CONTACT_CREATED_TRIGGER: [
    {
      agentSlug: "sdr",
      priority: "immediate",
      contextExtractor: (p) =>
        `New HubSpot contact created: ${p.properties?.firstname ?? ""} ${p.properties?.lastname ?? ""} ` +
        `(${p.properties?.email ?? "no email"}) at ${p.properties?.company ?? "unknown company"}. ` +
        `Score this lead, enrich their profile, and if they meet the ICP, draft and queue the first outreach touch.`,
    },
  ],

  HUBSPOT_DEAL_STAGE_UPDATED_TRIGGER: [
    {
      agentSlug: "sdr",
      priority: "queued",
      contextExtractor: (p) =>
        `HubSpot deal stage updated. Deal: "${p.properties?.dealname ?? "unknown"}". ` +
        `New stage: "${p.properties?.dealstage ?? "unknown"}". ` +
        `Determine the appropriate next action for this stage and execute it: follow-up, proposal draft, or contract initiation.`,
    },
    {
      agentSlug: "investor_relations",
      priority: "queued",
      contextExtractor: (p) =>
        `HubSpot deal stage updated for "${p.properties?.dealname}". ` +
        `Update pipeline velocity metrics and draft the product/sales win section for the monthly investor update.`,
    },
  ],

  // ── Salesforce ────────────────────────────────────────────────────────────────

  SALESFORCE_NEW_LEAD_TRIGGER: [
    {
      agentSlug: "sdr",
      priority: "immediate",
      contextExtractor: (p) =>
        `New Salesforce lead: ${p.FirstName ?? ""} ${p.LastName ?? ""} ` +
        `(${p.Email ?? "no email"}) at ${p.Company ?? "unknown company"}. ` +
        `Source: ${p.LeadSource ?? "unknown"}. ` +
        `Enrich this lead, score them against the ICP, and if qualified, trigger the outbound sequence immediately.`,
    },
  ],

  SALESFORCE_NEW_OR_UPDATED_OPPORTUNITY_TRIGGER: [
    {
      agentSlug: "chief_of_staff",
      priority: "queued",
      contextExtractor: (p) =>
        `Salesforce opportunity created or updated: "${p.Name ?? "unknown"}". ` +
        `Stage: ${p.StageName ?? "unknown"}, Amount: ${p.Amount ?? "unknown"}, Close date: ${p.CloseDate ?? "unknown"}. ` +
        `Update the pipeline brief and flag any commitments or follow-ups required before the close date.`,
    },
  ],

  SALESFORCE_NEW_CONTACT_TRIGGER: [
    {
      agentSlug: "sdr",
      priority: "queued",
      contextExtractor: (p) =>
        `New Salesforce contact: ${p.FirstName ?? ""} ${p.LastName ?? ""} (${p.Email ?? "no email"}) ` +
        `at ${p.Account?.Name ?? "unknown account"}. ` +
        `Assess if this contact should be enrolled in an outreach sequence or is already an existing customer.`,
    },
  ],

  SALESFORCE_TASK_CREATED_OR_COMPLETED_TRIGGER: [
    {
      agentSlug: "project_manager",
      priority: "queued",
      contextExtractor: (p) =>
        `Salesforce task ${p.Status === "Completed" ? "completed" : "created"}: "${p.Subject ?? "unknown"}". ` +
        `Owner: ${p.Owner?.Name ?? "unknown"}. Due: ${p.ActivityDate ?? "no due date"}. ` +
        `Sync this task status to the project management tool and update any linked deliverables.`,
    },
  ],

  // ── Zendesk ──────────────────────────────────────────────────────────────────

  ZENDESK_NEW_ZENDESK_TICKET_TRIGGER: [
    {
      agentSlug: "customer_success",
      priority: "immediate",
      contextExtractor: (p) =>
        `New Zendesk support ticket #${p.id ?? "unknown"} from ${p.requester?.email ?? "unknown"}. ` +
        `Subject: "${p.subject ?? "no subject"}". ` +
        `Priority: ${p.priority ?? "normal"}. ` +
        `Classify the issue, determine if it is Tier 1 (resolve autonomously) or Tier 2 (escalate), and respond accordingly.`,
    },
  ],

  ZENDESK_NEW_USER_TRIGGER: [
    {
      agentSlug: "customer_success",
      priority: "queued",
      contextExtractor: (p) =>
        `New Zendesk user created: ${p.name ?? "unknown"} (${p.email ?? "no email"}). ` +
        `Trigger the new user onboarding check-in sequence and add them to the customer success tracker.`,
    },
  ],

  // ── Confluence ────────────────────────────────────────────────────────────────

  CONFLUENCE_PAGE_CREATED_TRIGGER: [
    {
      agentSlug: "project_manager",
      priority: "queued",
      contextExtractor: (p) =>
        `New Confluence page created: "${p.title ?? "untitled"}". ` +
        `Space: ${p.space?.name ?? "unknown"}. ` +
        `Check if this page maps to an active project and link it to the relevant ticket or project tracker.`,
    },
  ],

  CONFLUENCE_PAGE_UPDATED_TRIGGER: [
    {
      agentSlug: "chief_of_staff",
      priority: "queued",
      contextExtractor: (p) =>
        `Confluence page updated: "${p.title ?? "untitled"}". ` +
        `Check if this page is a decision log, meeting notes, or project spec. If so, extract any new action items and track them.`,
    },
    {
      agentSlug: "docs_keeper",
      priority: "queued",
      contextExtractor: (p) =>
        `Confluence page updated: "${p.title}". ` +
        `Review the update against current code and other docs. Identify any inconsistencies or knowledge gaps to resolve.`,
    },
  ],

  CONFLUENCE_NEW_TASK_CREATED_TRIGGER: [
    {
      agentSlug: "project_manager",
      priority: "immediate",
      contextExtractor: (p) =>
        `A new task was created in Confluence: "${p.title ?? "untitled task"}". ` +
        `Assignee: ${p.assignee?.displayName ?? "unassigned"}. ` +
        `Create a mirrored ticket in Jira or Linear, assign it correctly, and set the due date.`,
    },
  ],

  CONFLUENCE_NEW_BLOG_POST_CREATED_TRIGGER: [
    {
      agentSlug: "social_media",
      priority: "queued",
      contextExtractor: (p) =>
        `A new Confluence blog post was published: "${p.title ?? "untitled"}". ` +
        `Assess if this content is suitable for external distribution. If yes, draft adapted versions for LinkedIn and the newsletter.`,
    },
  ],

  CONFLUENCE_FOOTER_COMMENT_ADDED_TRIGGER: [
    {
      agentSlug: "inbox_operator",
      priority: "queued",
      contextExtractor: (p) =>
        `A comment was added to a Confluence page: "${p.comment?.body?.slice(0, 300) ?? ""}". ` +
        `Check if this comment requires a response or contains an action item.`,
    },
  ],

  // ── Linear ────────────────────────────────────────────────────────────────────
  // (Linear is referenced in subagent toolkits but not in SUPPORTED_TRIGGERS —
  //  these stubs are ready for when it is added.)
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the routes for a given trigger slug.
 * Returns an empty array if the trigger is not mapped.
 */
export function resolveRoutes(triggerSlug: string): TriggerRoute[] {
  return TRIGGER_ROUTES[triggerSlug] ?? [];
}

/**
 * Build the task prompt for an agent given a trigger route and raw payload.
 * Falls back to the raw JSON if no contextExtractor is defined.
 */
export function buildTaskPrompt(
  route: TriggerRoute,
  payload: Record<string, any>,
  triggerSlug: string
): string {
  if (route.contextExtractor) {
    try {
      return route.contextExtractor(payload);
    } catch {
      // extractor failed — fall through to raw JSON
    }
  }
  return (
    `Trigger "${triggerSlug}" fired with the following payload:\n` +
    JSON.stringify(payload, null, 2).slice(0, 2000)
  );
}

/**
 * Indicate whether a given trigger has any registered routes.
 */
export function isTriggerRouted(triggerSlug: string): boolean {
  return triggerSlug in TRIGGER_ROUTES;
}