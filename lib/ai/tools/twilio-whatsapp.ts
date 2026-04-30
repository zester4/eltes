import { tool } from "ai";
import { z } from "zod";

// ─── Twilio REST helpers ──────────────────────────────────────────────────────
//
// Required env vars:
//   TWILIO_ACCOUNT_SID   – Your Account SID (starts with AC)
//   TWILIO_AUTH_TOKEN    – Your Auth Token
//
// WhatsApp uses the standard Programmable Messaging API with a "whatsapp:" prefix.
// Template management uses the Content API at https://content.twilio.com/v1
//
// Key concepts:
//   • All WhatsApp phone numbers are addressed as "whatsapp:+E164"
//   • Free-form messages can only be sent within a 24-hour customer service window
//     (i.e., after the user has messaged you first)
//   • Business-initiated messages outside that window MUST use an approved template
//   • Templates are managed via the Content API (ContentSid starts with HX)

const TWILIO_MSG_BASE = "https://api.twilio.com/2010-04-01";
const TWILIO_CONTENT_BASE = "https://content.twilio.com/v1";

type TwilioParams = Record<string, string | number | boolean | undefined>;

function twilioAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token)
    throw new Error(
      "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables must be set."
    );
  return { sid, basic: Buffer.from(`${sid}:${token}`).toString("base64") };
}

/** Messaging / core REST helper (api.twilio.com) */
async function twilioMsgRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: TwilioParams
): Promise<T> {
  const { sid, basic } = twilioAuth();
  const url = `${TWILIO_MSG_BASE}/Accounts/${sid}${path}`;

  const filteredEntries = Object.entries(params ?? {})
    .filter((e): e is [string, string | number | boolean] => e[1] !== undefined)
    .map(([k, v]): [string, string] => [k, String(v)]);

  const headers: Record<string, string> = {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  let body: string | undefined;
  let finalUrl = url;

  if (method === "GET" && filteredEntries.length > 0) {
    finalUrl = `${url}?${new URLSearchParams(filteredEntries)}`;
  } else if (method !== "GET" && filteredEntries.length > 0) {
    body = new URLSearchParams(filteredEntries).toString();
  }

  const res = await fetch(finalUrl, { method, headers, body });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Twilio ${method} ${path} (${res.status}): ${errText}`);
  }
  if (method === "DELETE") return {} as T;
  return res.json() as Promise<T>;
}

/** Content API helper (content.twilio.com) */
async function twilioContentRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const { basic } = twilioAuth();
  const url = `${TWILIO_CONTENT_BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Content API ${method} ${path} (${res.status}): ${errText}`);
  }
  if (method === "DELETE") return {} as T;
  return res.json() as Promise<T>;
}

/** Format a phone number for WhatsApp addressing */
function waAddr(phone: string): string {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}

// =============================================================================
// SECTION 1 — FREE-FORM MESSAGING (within 24-hour session window)
// =============================================================================

// ─── 1. twilioWhatsAppSendMessage ─────────────────────────────────────────────

const sendMessageSchema = z.object({
  to: z
    .string()
    .describe(
      "Recipient WhatsApp number in E.164 format, e.g. +14155551234. " +
      "The 'whatsapp:' prefix is added automatically."
    ),
  from: z
    .string()
    .describe(
      "Your Twilio WhatsApp-enabled number in E.164 format. " +
      "Must be registered as a WhatsApp sender in your Twilio account."
    ),
  body: z
    .string()
    .optional()
    .describe(
      "Text body of the message. Required unless sending media-only. " +
      "NOTE: WhatsApp does not allow a text body alongside video, audio, document, or vCard."
    ),
  media_url: z
    .array(z.string())
    .optional()
    .describe(
      "Publicly accessible URLs of media to attach (image, video, audio, document). " +
      "Max one media item per WhatsApp message. Must not require authentication."
    ),
  status_callback: z
    .string()
    .optional()
    .describe(
      "Webhook URL Twilio POSTs delivery status events to. " +
      "WhatsApp surfaces a 'read' status in addition to sent/delivered."
    ),
  messaging_service_sid: z
    .string()
    .optional()
    .describe(
      "SID of a Messaging Service (starts with MG). Lets Twilio auto-select the sender. " +
      "When provided, 'from' can be omitted."
    ),
});

export const twilioWhatsAppSendMessage = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Send a free-form WhatsApp text or media message via Twilio. " +
      "⚠️  Can ONLY be sent within the 24-hour customer service window " +
      "(i.e., the recipient must have messaged your number first). " +
      "For business-initiated messages outside this window, use twilioWhatsAppSendTemplate instead. " +
      "Returns a Message SID to track delivery status.",
    inputSchema: sendMessageSchema,
    execute: async (params: z.infer<typeof sendMessageSchema>) => {
      try {
        if (!params.body && !params.media_url?.length)
          throw new Error("Either 'body' or 'media_url' is required.");

        const body: TwilioParams = {
          To: waAddr(params.to),
          From: params.from ? waAddr(params.from) : undefined,
        };
        if (params.body)                   body.Body                = params.body;
        if (params.messaging_service_sid)  body.MessagingServiceSid = params.messaging_service_sid;
        if (params.media_url?.length)      body.MediaUrl            = params.media_url[0]; // WA supports 1 media
        if (params.status_callback)        body.StatusCallback      = params.status_callback;

        const data = await twilioMsgRequest<Record<string, unknown>>("POST", "/Messages.json", body);
        return {
          success: true,
          message_sid: data.sid,
          status: data.status,
          to: data.to,
          from: data.from,
          data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 2. twilioWhatsAppGetMessage ──────────────────────────────────────────────

const getMessageSchema = z.object({
  message_sid: z
    .string()
    .describe("Message SID (starts with SM or MM) returned by twilioWhatsAppSendMessage."),
});

export const twilioWhatsAppGetMessage = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Fetch the current delivery status and metadata of a WhatsApp message. " +
      "WhatsApp-specific status 'read' is returned in addition to sent/delivered/failed. " +
      "Also returns error codes and pricing information.",
    inputSchema: getMessageSchema,
    execute: async ({ message_sid }: z.infer<typeof getMessageSchema>) => {
      try {
        const data = await twilioMsgRequest<Record<string, unknown>>(
          "GET",
          `/Messages/${message_sid}.json`
        );
        return {
          success: true,
          status: data.status,          // includes WhatsApp 'read' status
          error_code: data.error_code,
          error_message: data.error_message,
          date_sent: data.date_sent,
          price: data.price,
          price_unit: data.price_unit,
          direction: data.direction,
          num_media: data.num_media,
          data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 3. twilioWhatsAppListMessages ────────────────────────────────────────────

const listMessagesSchema = z.object({
  to: z
    .string()
    .optional()
    .describe("Filter to messages sent TO this WhatsApp number (E.164, whatsapp: prefix optional)."),
  from: z
    .string()
    .optional()
    .describe("Filter to messages sent FROM this WhatsApp number (E.164, whatsapp: prefix optional)."),
  date_sent_after: z.string().optional().describe("Return messages sent on or after YYYY-MM-DD."),
  date_sent_before: z.string().optional().describe("Return messages sent on or before YYYY-MM-DD."),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(20)
    .describe("Records per page (1–1000)."),
});

export const twilioWhatsAppListMessages = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List WhatsApp messages on your Twilio account with optional filters. " +
      "Filter by sender, recipient, or date range to audit conversations or check delivery.",
    inputSchema: listMessagesSchema,
    execute: async (params: z.infer<typeof listMessagesSchema>) => {
      try {
        const qs: TwilioParams = { PageSize: params.page_size };
        if (params.to)               qs.To           = waAddr(params.to);
        if (params.from)             qs.From         = waAddr(params.from);
        if (params.date_sent_after)  qs["DateSent>"] = params.date_sent_after;
        if (params.date_sent_before) qs["DateSent<"] = params.date_sent_before;

        const data = await twilioMsgRequest<Record<string, unknown>>("GET", "/Messages.json", qs);
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// =============================================================================
// SECTION 2 — TEMPLATE MESSAGING (business-initiated, outside 24h window)
// =============================================================================

// ─── 4. twilioWhatsAppSendTemplate ────────────────────────────────────────────

const sendTemplateSchema = z.object({
  to: z
    .string()
    .describe("Recipient WhatsApp number in E.164 format. The 'whatsapp:' prefix is added automatically."),
  from: z
    .string()
    .optional()
    .describe("Your Twilio WhatsApp-enabled number in E.164 format."),
  messaging_service_sid: z
    .string()
    .optional()
    .describe("SID of a Messaging Service (starts with MG). Either this or 'from' is required."),
  content_sid: z
    .string()
    .describe(
      "SID of a pre-approved Content template (starts with HX). " +
      "Obtain from twilioWhatsAppListTemplates or twilioWhatsAppCreateTemplate. " +
      "The template must have WhatsApp approval status 'approved'."
    ),
  content_variables: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Key-value map of template variable substitutions, e.g. { '1': 'John', '2': 'Order #456' }. " +
      "Keys are 1-indexed strings matching {{1}}, {{2}} placeholders in the template. " +
      "If omitted, the template's default placeholder values are used."
    ),
  status_callback: z
    .string()
    .optional()
    .describe("Webhook URL for delivery status events (sent, delivered, read, failed)."),
  schedule_type: z
    .literal("fixed")
    .optional()
    .describe("Set to 'fixed' to enable scheduled delivery. Requires messaging_service_sid."),
  send_at: z
    .string()
    .optional()
    .describe(
      "ISO 8601 datetime to schedule the message for future delivery. " +
      "Requires messaging_service_sid and schedule_type = 'fixed'."
    ),
});

export const twilioWhatsAppSendTemplate = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Send an approved WhatsApp template (Content API) message via Twilio. " +
      "Use this for business-initiated messages OUTSIDE the 24-hour session window. " +
      "Templates must be pre-approved by WhatsApp — check approval status with twilioWhatsAppGetApprovalStatus. " +
      "Supports dynamic variable substitution and scheduled delivery. " +
      "Returns a Message SID.",
    inputSchema: sendTemplateSchema,
    execute: async (params: z.infer<typeof sendTemplateSchema>) => {
      try {
        if (!params.from && !params.messaging_service_sid)
          throw new Error("Either 'from' or 'messaging_service_sid' is required.");

        const body: TwilioParams = {
          To: waAddr(params.to),
          ContentSid: params.content_sid,
        };

        if (params.from)                   body.From                = waAddr(params.from);
        if (params.messaging_service_sid)  body.MessagingServiceSid = params.messaging_service_sid;
        if (params.content_variables)      body.ContentVariables    = JSON.stringify(params.content_variables);
        if (params.status_callback)        body.StatusCallback      = params.status_callback;
        if (params.schedule_type)          body.ScheduleType        = params.schedule_type;
        if (params.send_at)                body.SendAt              = params.send_at;

        const data = await twilioMsgRequest<Record<string, unknown>>("POST", "/Messages.json", body);
        return {
          success: true,
          message_sid: data.sid,
          status: data.status,
          content_sid: params.content_sid,
          to: data.to,
          data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// =============================================================================
// SECTION 3 — CONTENT / TEMPLATE MANAGEMENT (Content API)
// =============================================================================

// ─── 5. twilioWhatsAppCreateTemplate ─────────────────────────────────────────

const templateContentTypeSchema = z.enum([
  "twilio/text",
  "twilio/media",
  "twilio/quick-reply",
  "twilio/call-to-action",
  "twilio/list-picker",
  "twilio/card",
  "twilio/carousel",
  "twilio/location",
  "whatsapp/card",
  "whatsapp/authentication",
]);

const createTemplateSchema = z.object({
  friendly_name: z
    .string()
    .describe(
      "Internal name for the template (not shown to recipients). " +
      "Use lowercase with underscores for WhatsApp approval, e.g. 'order_confirmation'."
    ),
  language: z
    .string()
    .default("en")
    .describe("ISO 639-1 two-letter language code, e.g. 'en', 'es', 'fr', 'pt'."),
  content_type: templateContentTypeSchema.describe(
    "The Twilio content type defining the message structure. " +
    "Most common for WhatsApp: 'twilio/text' (plain text), 'twilio/media' (image/video), " +
    "'twilio/quick-reply' (buttons), 'twilio/call-to-action' (URL/phone buttons), " +
    "'whatsapp/card' (header + body + buttons)."
  ),
  body: z
    .string()
    .describe(
      "The message body text. Use {{1}}, {{2}}, … as placeholders for dynamic variables."
    ),
  variables: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Default/sample values for template placeholders, e.g. { '1': 'Customer Name' }. " +
      "Required for WhatsApp approval submission as sample values."
    ),
  // Optional rich-content fields
  media_url: z
    .string()
    .optional()
    .describe("URL of a header image/video (for twilio/media, whatsapp/card content types)."),
  actions: z
    .array(
      z.union([
        z.object({
          type: z.literal("QUICK_REPLY"),
          title: z.string().describe("Button label text (max 20 chars for WhatsApp)."),
        }),
        z.object({
          type: z.literal("URL"),
          title: z.string(),
          url: z.string(),
        }),
        z.object({
          type: z.literal("PHONE_NUMBER"),
          title: z.string(),
          phone: z.string(),
        }),
      ])
    )
    .optional()
    .describe(
      "Interactive buttons (quick replies or call-to-action). " +
      "WhatsApp allows up to 3 quick reply buttons or 2 CTA buttons."
    ),
});

export const twilioWhatsAppCreateTemplate = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Create a new Content API template for WhatsApp via the Twilio Content API. " +
      "Returns a ContentSid (starts with HX) you'll use for sending and approval. " +
      "After creation, submit for WhatsApp approval with twilioWhatsAppSubmitApproval " +
      "if you need to send business-initiated messages.",
    inputSchema: createTemplateSchema,
    execute: async (params: z.infer<typeof createTemplateSchema>) => {
      try {
        // Build the `types` object based on content_type
        const types: Record<string, unknown> = {};

        if (params.content_type === "twilio/text") {
          types["twilio/text"] = { body: params.body };
        } else if (params.content_type === "twilio/media") {
          types["twilio/media"] = {
            body: params.body,
            media: params.media_url ? [params.media_url] : undefined,
          };
        } else if (params.content_type === "twilio/quick-reply") {
          types["twilio/quick-reply"] = {
            body: params.body,
            actions: params.actions?.map((a) => ({
              type: "QUICK_REPLY",
              title: (a as { title: string }).title,
            })),
          };
        } else if (params.content_type === "twilio/call-to-action") {
          types["twilio/call-to-action"] = {
            body: params.body,
            actions: params.actions,
          };
        } else if (params.content_type === "whatsapp/card") {
          types["whatsapp/card"] = {
            body: params.body,
            header_image: params.media_url ? { media: params.media_url } : undefined,
            actions: params.actions,
          };
        } else if (params.content_type === "whatsapp/authentication") {
          types["whatsapp/authentication"] = { add_security_recommendation: true };
        } else {
          // Generic fallback
          types[params.content_type] = { body: params.body };
        }

        const payload: Record<string, unknown> = {
          friendly_name: params.friendly_name,
          language: params.language,
          variables: params.variables ?? {},
          types,
        };

        const data = await twilioContentRequest<Record<string, unknown>>("POST", "/Content", payload);
        return {
          success: true,
          content_sid: data.sid,
          friendly_name: data.friendly_name,
          language: data.language,
          date_created: data.date_created,
          approval_link: (data.links as Record<string, string>)?.approval_create,
          data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 6. twilioWhatsAppListTemplates ──────────────────────────────────────────

const listTemplatesSchema = z.object({
  page_size: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(50)
    .describe("Number of templates per page (max 500, Twilio recommends ≤500 to stay under 1 MB response)."),
  page_token: z
    .string()
    .optional()
    .describe("Pagination token from the previous response's meta.next_page_url. Page numbers are not supported."),
  include_approvals: z
    .boolean()
    .optional()
    .default(false)
    .describe("When true, fetches templates with their WhatsApp approval status included."),
});

export const twilioWhatsAppListTemplates = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List all Content API templates in your Twilio account. " +
      "Optionally include WhatsApp approval statuses. Use page_token for pagination.",
    inputSchema: listTemplatesSchema,
    execute: async (params: z.infer<typeof listTemplatesSchema>) => {
      try {
        const path = params.include_approvals ? "/ContentAndApprovals" : "/Content";
        const qs = new URLSearchParams({ PageSize: String(params.page_size) });
        if (params.page_token) qs.set("PageToken", params.page_token);

        const data = await twilioContentRequest<Record<string, unknown>>(
          "GET",
          `${path}?${qs}`
        );

        type ContentItem = {
          sid: string;
          friendly_name: string;
          language: string;
          date_created: string;
          date_updated: string;
          approval_requests?: { status: string; rejection_reason?: string };
        };

        const contents = (data as { contents?: ContentItem[] }).contents ?? [];
        const summary = contents.map((c) => ({
          content_sid: c.sid,
          friendly_name: c.friendly_name,
          language: c.language,
          date_created: c.date_created,
          date_updated: c.date_updated,
          approval_status: c.approval_requests?.status,
          rejection_reason: c.approval_requests?.rejection_reason,
        }));

        const meta = (data as { meta?: { next_page_url?: string } }).meta;
        return {
          success: true,
          total: contents.length,
          templates: summary,
          next_page_token: meta?.next_page_url
            ? new URL(meta.next_page_url).searchParams.get("PageToken")
            : null,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 7. twilioWhatsAppGetTemplate ─────────────────────────────────────────────

const getTemplateSchema = z.object({
  content_sid: z
    .string()
    .describe("SID of the Content template to fetch (starts with HX)."),
});

export const twilioWhatsAppGetTemplate = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Fetch full details of a specific Content API template by its SID, " +
      "including its body, variables, content type, and metadata.",
    inputSchema: getTemplateSchema,
    execute: async ({ content_sid }: z.infer<typeof getTemplateSchema>) => {
      try {
        const data = await twilioContentRequest<Record<string, unknown>>(
          "GET",
          `/Content/${content_sid}`
        );
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 8. twilioWhatsAppDeleteTemplate ──────────────────────────────────────────

const deleteTemplateSchema = z.object({
  content_sid: z
    .string()
    .describe("SID of the Content template to permanently delete (starts with HX)."),
});

export const twilioWhatsAppDeleteTemplate = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Permanently delete a Content API template. " +
      "⚠️  Irreversible. You cannot delete a template that has been submitted for WhatsApp approval " +
      "or that has an 'approved' status.",
    inputSchema: deleteTemplateSchema,
    execute: async ({ content_sid }: z.infer<typeof deleteTemplateSchema>) => {
      try {
        await twilioContentRequest("DELETE", `/Content/${content_sid}`);
        return { success: true, message: `Template ${content_sid} deleted successfully.` };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// =============================================================================
// SECTION 4 — WHATSAPP TEMPLATE APPROVAL WORKFLOW
// =============================================================================

// ─── 9. twilioWhatsAppSubmitApproval ─────────────────────────────────────────

const submitApprovalSchema = z.object({
  content_sid: z
    .string()
    .describe("SID of the Content template to submit for approval (starts with HX)."),
  name: z
    .string()
    .describe(
      "Template name for WhatsApp (lowercase alphanumeric + underscores only). " +
      "Use a descriptive name, e.g. 'order_delivery_notification' — " +
      "WhatsApp reviewers use this to understand the template's purpose."
    ),
  category: z
    .enum(["UTILITY", "MARKETING", "AUTHENTICATION"])
    .describe(
      "WhatsApp template category. " +
      "UTILITY: transactional (order updates, appointment reminders). " +
      "MARKETING: promotions, offers, announcements. " +
      "AUTHENTICATION: OTPs and verification codes."
    ),
});

export const twilioWhatsAppSubmitApproval = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Submit a Content API template to WhatsApp for approval. " +
      "Approval is required before using the template for business-initiated messages. " +
      "The process typically takes 5 minutes to 24 hours. " +
      "Poll twilioWhatsAppGetApprovalStatus to check the result. " +
      "Note: You cannot edit a template after submitting it for approval.",
    inputSchema: submitApprovalSchema,
    execute: async (params: z.infer<typeof submitApprovalSchema>) => {
      try {
        const payload = {
          name: params.name,
          category: params.category,
        };
        const data = await twilioContentRequest<Record<string, unknown>>(
          "POST",
          `/Content/${params.content_sid}/ApprovalRequests/whatsapp`,
          payload
        );
        return {
          success: true,
          content_sid: params.content_sid,
          approval_status: (data as { approval_requests?: { status: string } })?.approval_requests?.status,
          data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 10. twilioWhatsAppGetApprovalStatus ──────────────────────────────────────

const getApprovalSchema = z.object({
  content_sid: z
    .string()
    .describe("SID of the Content template to check approval status for (starts with HX)."),
});

export const twilioWhatsAppGetApprovalStatus = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Fetch the WhatsApp approval status for a Content API template. " +
      "Possible statuses: received → pending → approved | rejected. " +
      "If rejected, a rejection_reason is provided. " +
      "Only templates with status 'approved' can be used for business-initiated messages.",
    inputSchema: getApprovalSchema,
    execute: async ({ content_sid }: z.infer<typeof getApprovalSchema>) => {
      try {
        const data = await twilioContentRequest<Record<string, unknown>>(
          "GET",
          `/Content/${content_sid}/ApprovalRequests`
        );

        type ApprovalData = {
          whatsapp?: {
            status: string;
            rejection_reason?: string;
            name?: string;
            category?: string;
          };
        };

        const approvals = (data as { approval_requests?: ApprovalData }).approval_requests;
        const wa = approvals?.whatsapp;

        return {
          success: true,
          content_sid,
          approval_status: wa?.status,
          rejection_reason: wa?.rejection_reason,
          template_name: wa?.name,
          category: wa?.category,
          is_approved: wa?.status === "approved",
          raw: data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// =============================================================================
// SECTION 5 — WHATSAPP SENDER / NUMBER MANAGEMENT
// =============================================================================

// ─── 11. twilioWhatsAppListSenders ────────────────────────────────────────────

const listSendersSchema = z.object({
  page_size: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(50)
    .describe("Records per page."),
});

export const twilioWhatsAppListSenders = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List all phone numbers on your Twilio account that are enabled for WhatsApp. " +
      "Use to discover which 'from' numbers are valid WhatsApp senders. " +
      "Returns the phone number, SID, friendly name, and capabilities.",
    inputSchema: listSendersSchema,
    execute: async (params: z.infer<typeof listSendersSchema>) => {
      try {
        const qs: TwilioParams = {
          PageSize: params.page_size,
          // Filter only WhatsApp-channel-capable numbers
          PhoneNumber: "whatsapp:*",
        };

        // Fetch all IncomingPhoneNumbers and filter by WhatsApp capability on the client
        const qs2: TwilioParams = { PageSize: params.page_size };
        const data = await twilioMsgRequest<Record<string, unknown>>(
          "GET",
          "/IncomingPhoneNumbers.json",
          qs2
        );

        type NumberEntry = {
          sid: string;
          phone_number: string;
          friendly_name: string;
          capabilities: Record<string, boolean>;
          origin: string;
          date_created: string;
        };

        const numbers =
          (data as { incoming_phone_numbers?: NumberEntry[] }).incoming_phone_numbers ?? [];

        // WhatsApp-enabled numbers have a channel_capabilities.whatsapp field
        // (They appear as normal numbers — WhatsApp enablement is configured separately)
        const summary = numbers.map((n) => ({
          sid: n.sid,
          phone_number: n.phone_number,
          whatsapp_address: `whatsapp:${n.phone_number}`,
          friendly_name: n.friendly_name,
          capabilities: n.capabilities,
          origin: n.origin,
          date_created: n.date_created,
        }));

        return {
          success: true,
          total: numbers.length,
          senders: summary,
          note: "WhatsApp enablement is configured per-number in the Twilio Console. " +
            "All numbers are returned; check the Console to confirm which are WhatsApp-enabled.",
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 12. twilioWhatsAppMarkMessageRead ────────────────────────────────────────
// (WhatsApp supports read receipts — you can update a received message to 'read')

const markReadSchema = z.object({
  message_sid: z
    .string()
    .describe("SID of the inbound WhatsApp message to mark as read."),
});

export const twilioWhatsAppMarkMessageRead = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Mark an inbound WhatsApp message as 'read', sending a read receipt to the sender. " +
      "This triggers the blue double-tick read indicator in WhatsApp. " +
      "Only applies to inbound messages received by your Twilio WhatsApp number.",
    inputSchema: markReadSchema,
    execute: async ({ message_sid }: z.infer<typeof markReadSchema>) => {
      try {
        const body: TwilioParams = { Status: "read" };
        const data = await twilioMsgRequest<Record<string, unknown>>(
          "POST",
          `/Messages/${message_sid}.json`,
          body
        );
        return { success: true, status: data.status, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// =============================================================================
// EXPORTS SUMMARY
// =============================================================================
//
// FREE-FORM MESSAGING  (within 24h session window only)
//   twilioWhatsAppSendMessage         – Send text or media message
//   twilioWhatsAppGetMessage          – Fetch message status (includes 'read' status)
//   twilioWhatsAppListMessages        – List WhatsApp message history
//
// TEMPLATE MESSAGING  (business-initiated, any time)
//   twilioWhatsAppSendTemplate        – Send an approved template with variable substitution
//
// CONTENT / TEMPLATE MANAGEMENT  (Content API — content.twilio.com)
//   twilioWhatsAppCreateTemplate      – Create a new message template
//   twilioWhatsAppListTemplates       – List all templates (optionally with approval status)
//   twilioWhatsAppGetTemplate         – Fetch a single template's details
//   twilioWhatsAppDeleteTemplate      – Delete a template (irreversible)
//
// APPROVAL WORKFLOW
//   twilioWhatsAppSubmitApproval      – Submit template to WhatsApp for approval
//   twilioWhatsAppGetApprovalStatus   – Poll approval status (received/pending/approved/rejected)
//
// SENDER MANAGEMENT
//   twilioWhatsAppListSenders         – List phone numbers available as WhatsApp senders
//   twilioWhatsAppMarkMessageRead     – Mark inbound message read (send read receipt)