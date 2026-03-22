export type TriggerDefinition = {
  slug: string;
  name: string;
  description: string;
  app:
    | "github"
    | "slack"
    | "gmail"
    | "stripe"
    | "notion"
    | "agentmail"
    | "confluence"
    | "googlecalendar"
    | "googledocs"
    | "googlesheets"
    | "hubspot"
    | "salesforce"
    | "zendesk"
    | "outlook"
    | "linear"
    | "discord";
  configFields: {
    name: string;
    label: string;
    type: "string" | "number" | "boolean";
    description: string;
    required: boolean;
    placeholder?: string;
  }[];
};

export const SUPPORTED_TRIGGERS: TriggerDefinition[] = [
  // GitHub Triggers
  {
    slug: "GITHUB_COMMIT_EVENT",
    name: "New Commit",
    description: "Triggers when a new commit is pushed to a repository.",
    app: "github",
    configFields: [
      { name: "owner", label: "Owner", type: "string", description: "GitHub username or organization", required: true, placeholder: "composio" },
      { name: "repo", label: "Repository", type: "string", description: "Repository name", required: true, placeholder: "sdk" },
    ],
  },
  {
    slug: "GITHUB_ISSUE_OPENED",
    name: "Issue Opened",
    description: "Triggers when a new issue is created.",
    app: "github",
    configFields: [
      { name: "owner", label: "Owner", type: "string", description: "GitHub username or organization", required: true },
      { name: "repo", label: "Repository", type: "string", description: "Repository name", required: true },
    ],
  },
  {
    slug: "GITHUB_PULL_REQUEST_OPENED",
    name: "PR Opened",
    description: "Triggers when a new pull request is opened.",
    app: "github",
    configFields: [
      { name: "owner", label: "Owner", type: "string", description: "GitHub username or organization", required: true },
      { name: "repo", label: "Repository", type: "string", description: "Repository name", required: true },
    ],
  },
  {
    slug: "GITHUB_STAR_ADDED",
    name: "New Star",
    description: "Triggers when someone stars the repository.",
    app: "github",
    configFields: [
      { name: "owner", label: "Owner", type: "string", description: "GitHub username or organization", required: true },
      { name: "repo", label: "Repository", type: "string", description: "Repository name", required: true },
    ],
  },
  {
    slug: "GITHUB_ISSUE_COMMENT_CREATED",
    name: "New Issue Comment",
    description: "Triggers when a comment is added to an issue.",
    app: "github",
    configFields: [
      { name: "owner", label: "Owner", type: "string", description: "GitHub username or organization", required: true },
      { name: "repo", label: "Repository", type: "string", description: "Repository name", required: true },
    ],
  },

  // Slack Triggers
  {
    slug: "SLACK_NEW_MESSAGE",
    name: "New Message",
    description: "Triggers when a new message is posted in a channel.",
    app: "slack",
    configFields: [
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the Slack channel", required: true, placeholder: "C123456" },
    ],
  },
  {
    slug: "SLACK_CHANNEL_CREATED",
    name: "Channel Created",
    description: "Triggers when a new public channel is created.",
    app: "slack",
    configFields: [],
  },
  {
    slug: "SLACK_USER_JOINED_CHANNEL",
    name: "User Joined Channel",
    description: "Triggers when a user joins a channel.",
    app: "slack",
    configFields: [
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the Slack channel", required: true },
    ],
  },
  {
    slug: "SLACK_REACTION_ADDED",
    name: "Reaction Added",
    description: "Triggers when a reaction is added to a message.",
    app: "slack",
    configFields: [],
  },
  {
    slug: "SLACK_FILE_SHARED",
    name: "File Shared",
    description: "Triggers when a file is shared in a workspace.",
    app: "slack",
    configFields: [],
  },

  // Gmail Triggers
  {
    slug: "GMAIL_NEW_GMAIL_MESSAGE",
    name: "New Email",
    description: "Triggers when a new email is received in the inbox.",
    app: "gmail",
    configFields: [
      { name: "labelIds", label: "Labels", type: "string", description: "Comma-separated labels (e.g. INBOX, UNREAD)", required: false, placeholder: "INBOX" },
    ],
  },
  {
    slug: "GMAIL_MESSAGE_TRASHED",
    name: "Email Trashed",
    description: "Triggers when an email is moved to trash.",
    app: "gmail",
    configFields: [],
  },
  {
    slug: "GMAIL_THREAD_TRASHED",
    name: "Thread Trashed",
    description: "Triggers when an entire thread is moved to trash.",
    app: "gmail",
    configFields: [],
  },
  {
    slug: "GMAIL_LABEL_ADDED",
    name: "Label Added",
    description: "Triggers when a label is added to a message.",
    app: "gmail",
    configFields: [
      { name: "labelId", label: "Label ID", type: "string", description: "Specific label to watch", required: false },
    ],
  },
  {
    slug: "GMAIL_DRAFT_CREATED",
    name: "Draft Created",
    description: "Triggers when a new draft is created.",
    app: "gmail",
    configFields: [],
  },

  // Outlook Triggers
  {
    slug: "OUTLOOK_MESSAGE_TRIGGER",
    name: "New Outlook Email",
    description: "Triggers when a new email is received in Outlook.",
    app: "outlook",
    configFields: [],
  },

  // Stripe Triggers
  {
    slug: "STRIPE_CHARGE_FAILED_TRIGGER",
    name: "Charge Failed",
    description: "Triggers when a charge attempt fails.",
    app: "stripe",
    configFields: [],
  },
  {
    slug: "STRIPE_CHECKOUT_SESSION_COMPLETED_TRIGGER",
    name: "Checkout Completed",
    description: "Triggers when a checkout session is successfully completed.",
    app: "stripe",
    configFields: [],
  },
  {
    slug: "STRIPE_INVOICE_PAYMENT_SUCCEEDED_TRIGGER",
    name: "Invoice Paid",
    description: "Triggers when an invoice is successfully paid.",
    app: "stripe",
    configFields: [],
  },
  {
    slug: "STRIPE_PAYMENT_FAILED_TRIGGER",
    name: "Payment Failed",
    description: "Triggers when a payment intent fails.",
    app: "stripe",
    configFields: [],
  },
  {
    slug: "STRIPE_PRODUCT_CREATED_TRIGGER",
    name: "Product Created",
    description: "Triggers when a new product is created.",
    app: "stripe",
    configFields: [],
  },
  {
    slug: "STRIPE_SUBSCRIPTION_ADDED_TRIGGER",
    name: "Subscription Added",
    description: "Triggers when a new subscription is created.",
    app: "stripe",
    configFields: [],
  },
  {
    slug: "STRIPE_SUBSCRIPTION_DELETED_TRIGGER",
    name: "Subscription Deleted",
    description: "Triggers when a subscription is cancelled or ends.",
    app: "stripe",
    configFields: [],
  },

  // Notion Triggers
  {
    slug: "NOTION_ALL_PAGE_EVENTS_TRIGGER",
    name: "All Page Events",
    description: "Triggers on any page-related event in Notion.",
    app: "notion",
    configFields: [],
  },
  {
    slug: "NOTION_COMMENTS_ADDED_TRIGGER",
    name: "New Comment",
    description: "Triggers when a new comment is added.",
    app: "notion",
    configFields: [],
  },
  {
    slug: "NOTION_PAGE_ADDED_TO_DATABASE",
    name: "New Page in Database",
    description: "Triggers when a new page is added to a database.",
    app: "notion",
    configFields: [],
  },
  {
    slug: "NOTION_PAGE_ADDED_TRIGGER",
    name: "Page Added to Page",
    description: "Triggers when a new page is added to another page.",
    app: "notion",
    configFields: [],
  },
  {
    slug: "NOTION_PAGE_UPDATED_TRIGGER",
    name: "Page Updated",
    description: "Triggers when a page is updated.",
    app: "notion",
    configFields: [],
  },

  // Agent Mail Triggers
  {
    slug: "AGENT_MAIL_NEW_EMAIL_TRIGGER",
    name: "New Agent Email",
    description: "Triggers when a new email is received via Agent Mail.",
    app: "agentmail",
    configFields: [],
  },

  // Confluence Triggers
  {
    slug: "CONFLUENCE_ATTACHMENT_ADDED_TRIGGER",
    name: "Attachment Added",
    description: "Triggers when a new attachment is added.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_BLOG_POST_ADDED_TO_LABEL_TRIGGER",
    name: "Blog Post Added to Label",
    description: "Triggers when a blog post is added to a label.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_BLOGPOST_INLINE_COMMENT_ADDED_TRIGGER",
    name: "Blogpost Inline Comment",
    description: "Triggers when an inline comment is added to a blog post.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_BLOGPOST_LIKE_COUNT_CHANGED_TRIGGER",
    name: "Blog Post Like Count Changed",
    description: "Triggers when a blog post like count changes.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_BLOGPOST_UPDATED_TRIGGER",
    name: "Blog Post Updated",
    description: "Triggers when a blog post is updated.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_CONTENT_RESTRICTIONS_CHANGED_TRIGGER",
    name: "Content Restrictions Changed",
    description: "Triggers when content restrictions change.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_FOOTER_COMMENT_ADDED_TRIGGER",
    name: "Footer Comment Added",
    description: "Triggers when a footer comment is added to a page.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_NEW_AUDIT_LOG_TRIGGER",
    name: "New Audit Log",
    description: "Triggers when a new audit log record is created.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_NEW_BLOG_POST_CREATED_TRIGGER",
    name: "New Blog Post",
    description: "Triggers when a new blog post is created.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_NEW_CHILD_PAGE_TRIGGER",
    name: "New Child Page",
    description: "Triggers when a new child page is created.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_NEW_CQL_CONTENT_MATCH_TRIGGER",
    name: "New CQL Content Match",
    description: "Triggers when a new CQL content match occurs.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_NEW_TASK_CREATED_TRIGGER",
    name: "New Task",
    description: "Triggers when a new task is created.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_PAGE_CONTENT_PROPERTIES_CHANGED_TRIGGER",
    name: "Page Content Properties Changed",
    description: "Triggers when page content properties change.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_PAGE_CREATED_TRIGGER",
    name: "New Page Created",
    description: "Triggers when a new page is created.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_PAGE_INLINE_COMMENT_ADDED_TRIGGER",
    name: "Inline Comment Added",
    description: "Triggers when an inline comment is added to a page.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_PAGE_LIKE_COUNT_CHANGED_TRIGGER",
    name: "Page Like Count Changed",
    description: "Triggers when a page like count changes.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_PAGE_MOVED_TRIGGER",
    name: "Page Moved",
    description: "Triggers when a page is moved.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_PAGE_UPDATED_TRIGGER",
    name: "Page Updated",
    description: "Triggers when a page is updated.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_PAGE_VERSION_CREATED_TRIGGER",
    name: "Page Version Created",
    description: "Triggers when a new page version is created.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_SPACE_CONTENT_ADDED_TRIGGER",
    name: "Space Content Added",
    description: "Triggers when new content is added to a space.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_SPACE_CREATED_TRIGGER",
    name: "New Space Created",
    description: "Triggers when a new space is created.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_SPACE_DETAILS_CHANGED_TRIGGER",
    name: "Space Details Changed",
    description: "Triggers when space details change.",
    app: "confluence",
    configFields: [],
  },
  {
    slug: "CONFLUENCE_SPACE_PROPERTIES_CHANGED_TRIGGER",
    name: "Space Properties Changed",
    description: "Triggers when space properties change.",
    app: "confluence",
    configFields: [],
  },

  // Google Calendar Triggers
  {
    slug: "GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER",
    name: "Attendee Response Changed",
    description: "Triggers when an attendee response changes.",
    app: "googlecalendar",
    configFields: [],
  },
  {
    slug: "GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER",
    name: "Event Canceled or Deleted",
    description: "Triggers when an event is canceled or deleted.",
    app: "googlecalendar",
    configFields: [],
  },
  {
    slug: "GOOGLECALENDAR_EVENT_STARTING_SOON_TRIGGER",
    name: "Event Starting Soon",
    description: "Triggers when an event is starting soon.",
    app: "googlecalendar",
    configFields: [],
  },
  {
    slug: "GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_CHANGE_TRIGGER",
    name: "Calendar Event Changes",
    description: "Triggers on any calendar event change.",
    app: "googlecalendar",
    configFields: [],
  },
  {
    slug: "GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_CREATED_TRIGGER",
    name: "Event Created",
    description: "Triggers when a new event is created.",
    app: "googlecalendar",
    configFields: [],
  },
  {
    slug: "GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_SYNC_TRIGGER",
    name: "Calendar Event Sync",
    description: "Triggers on calendar event sync.",
    app: "googlecalendar",
    configFields: [],
  },
  {
    slug: "GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_UPDATED_TRIGGER",
    name: "Event Updated",
    description: "Triggers when an event is updated.",
    app: "googlecalendar",
    configFields: [],
  },

  // Google Docs Triggers
  {
    slug: "GOOGLEDOCS_DOCUMENT_CREATED_TRIGGER",
    name: "New Document Created",
    description: "Triggers when a new document is created.",
    app: "googledocs",
    configFields: [],
  },
  {
    slug: "GOOGLEDOCS_DOCUMENT_DELETED_TRIGGER",
    name: "Document Deleted",
    description: "Triggers when a document is deleted.",
    app: "googledocs",
    configFields: [],
  },
  {
    slug: "GOOGLEDOCS_DOCUMENT_PLACEHOLDER_FILLED_TRIGGER",
    name: "Document Placeholder Filled",
    description: "Triggers when a document placeholder is filled.",
    app: "googledocs",
    configFields: [],
  },
  {
    slug: "GOOGLEDOCS_DOCUMENT_SEARCH_UPDATE_TRIGGER",
    name: "Document Search Update",
    description: "Triggers on document search update.",
    app: "googledocs",
    configFields: [],
  },
  {
    slug: "GOOGLEDOCS_DOCUMENT_STRUCTURE_CHANGED_TRIGGER",
    name: "Document Structure Changed",
    description: "Triggers when document structure changes.",
    app: "googledocs",
    configFields: [],
  },
  {
    slug: "GOOGLEDOCS_DOCUMENT_UPDATED_TRIGGER",
    name: "Document Updated",
    description: "Triggers when a document is updated.",
    app: "googledocs",
    configFields: [],
  },
  {
    slug: "GOOGLEDOCS_DOCUMENT_WORD_COUNT_THRESHOLD_TRIGGER",
    name: "Word Count Threshold",
    description: "Triggers when a document reaches a word count threshold.",
    app: "googledocs",
    configFields: [],
  },
  {
    slug: "GOOGLEDOCS_FOLDER_CREATED_TRIGGER",
    name: "New Folder in Root",
    description: "Triggers when a new folder is created in root.",
    app: "googledocs",
    configFields: [],
  },

  // Google Sheets Triggers
  {
    slug: "GOOGLESHEETS_AGGREGATE_METRIC_CHANGED_TRIGGER",
    name: "Aggregate Metric Changed",
    description: "Triggers when an aggregate metric changes.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_CELL_RANGE_VALUES_CHANGED_TRIGGER",
    name: "Cell Range Values Changed",
    description: "Triggers when cell range values change.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_CONDITIONAL_FORMAT_RULE_CHANGED_TRIGGER",
    name: "Conditional Format Rule Changed",
    description: "Triggers when a conditional format rule changes.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_DATA_VALIDATION_RULE_CHANGED_TRIGGER",
    name: "Data Validation Rule Changed",
    description: "Triggers when a data validation rule changes.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_DEVELOPER_METADATA_CHANGED_TRIGGER",
    name: "Developer Metadata Changed",
    description: "Triggers when developer metadata changes.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_FILTERED_RANGE_VALUES_CHANGED_TRIGGER",
    name: "Filtered Range Values Changed",
    description: "Triggers when filtered range values change.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_NEW_ROWS_TRIGGER",
    name: "New Rows in Google Sheet",
    description: "Triggers when new rows are added.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_NEW_SHEET_ADDED_TRIGGER",
    name: "New Sheet Added",
    description: "Triggers when a new sheet is added.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_NEW_SPREADSHEET_CREATED_TRIGGER",
    name: "New Spreadsheet Created",
    description: "Triggers when a new spreadsheet is created.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_SPREADSHEET_METADATA_CHANGED_TRIGGER",
    name: "Spreadsheet Metadata Changed",
    description: "Triggers when spreadsheet metadata changes.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_SPREADSHEET_PROPERTIES_CHANGED_TRIGGER",
    name: "Spreadsheet Properties Changed",
    description: "Triggers when spreadsheet properties change.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_SPREADSHEET_ROW_CHANGED_TRIGGER",
    name: "Spreadsheet Row Changed",
    description: "Triggers when a spreadsheet row changes.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_SPREADSHEET_SEARCH_MATCH_TRIGGER",
    name: "Spreadsheet Search Match",
    description: "Triggers on spreadsheet search match.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_TABLE_QUERY_RESULT_CHANGED_TRIGGER",
    name: "Table Query Result Changed",
    description: "Triggers when a table query result changes.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_TABLE_SCHEMA_CHANGED_TRIGGER",
    name: "Table Schema Changed",
    description: "Triggers when a table schema changes.",
    app: "googlesheets",
    configFields: [],
  },
  {
    slug: "GOOGLESHEETS_WORKSHEET_NAMES_CHANGED_TRIGGER",
    name: "Worksheet Names Changed",
    description: "Triggers when worksheet names change.",
    app: "googlesheets",
    configFields: [],
  },

  // HubSpot Triggers
  {
    slug: "HUBSPOT_CONTACT_CREATED_TRIGGER",
    name: "Contact Created",
    description: "Triggers when a new contact is created.",
    app: "hubspot",
    configFields: [],
  },
  {
    slug: "HUBSPOT_DEAL_STAGE_UPDATED_TRIGGER",
    name: "Deal Stage Updated",
    description: "Triggers when a deal stage is updated.",
    app: "hubspot",
    configFields: [],
  },

  // Salesforce Triggers
  {
    slug: "SALESFORCE_ACCOUNT_CREATED_OR_UPDATED_TRIGGER",
    name: "Account Created or Updated",
    description: "Triggers when an account is created or updated.",
    app: "salesforce",
    configFields: [],
  },
  {
    slug: "SALESFORCE_CONTACT_UPDATED_TRIGGER",
    name: "Contact Updated",
    description: "Triggers when a contact is updated.",
    app: "salesforce",
    configFields: [],
  },
  {
    slug: "SALESFORCE_GENERIC_S_OBJECT_RECORD_UPDATED_TRIGGER",
    name: "Record Updated (Generic SObject)",
    description: "Triggers when a generic SObject record is updated.",
    app: "salesforce",
    configFields: [],
  },
  {
    slug: "SALESFORCE_NEW_CONTACT_TRIGGER",
    name: "New Contact",
    description: "Triggers when a new contact is created.",
    app: "salesforce",
    configFields: [],
  },
  {
    slug: "SALESFORCE_NEW_LEAD_TRIGGER",
    name: "New Lead",
    description: "Triggers when a new lead is created.",
    app: "salesforce",
    configFields: [],
  },
  {
    slug: "SALESFORCE_NEW_OR_UPDATED_OPPORTUNITY_TRIGGER",
    name: "New or Updated Opportunity",
    description: "Triggers when an opportunity is created or updated.",
    app: "salesforce",
    configFields: [],
  },
  {
    slug: "SALESFORCE_TASK_CREATED_OR_COMPLETED_TRIGGER",
    name: "Task Created or Completed",
    description: "Triggers when a task is created or completed.",
    app: "salesforce",
    configFields: [],
  },

  // Zendesk Triggers
  {
    slug: "ZENDESK_NEW_USER_TRIGGER",
    name: "New User Created",
    description: "Triggers when a new user is created.",
    app: "zendesk",
    configFields: [],
  },
  {
    slug: "ZENDESK_NEW_ZENDESK_TICKET_TRIGGER",
    name: "New Zendesk Ticket",
    description: "Triggers when a new ticket is created.",
    app: "zendesk",
    configFields: [],
  },
];
