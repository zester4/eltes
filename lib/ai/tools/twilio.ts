import { tool } from "ai";
import { z } from "zod";

// ─── Twilio REST helpers ──────────────────────────────────────────────────────
//
// Required env vars:
//   TWILIO_ACCOUNT_SID   – Your Account SID (starts with AC)
//   TWILIO_AUTH_TOKEN    – Your Auth Token
//
// Base: https://api.twilio.com/2010-04-01
// Auth: HTTP Basic – AccountSID as username, AuthToken as password
// Body: application/x-www-form-urlencoded for POST

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

function twilioAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token)
    throw new Error(
      "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables must be set."
    );
  return { sid, basic: Buffer.from(`${sid}:${token}`).toString("base64") };
}

// Shared type for all Twilio request bodies / query strings
type TwilioParams = Record<string, string | number | boolean | undefined>;

async function twilioRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: TwilioParams
): Promise<T> {
  const { sid, basic } = twilioAuth();
  const url = `${TWILIO_BASE}/Accounts/${sid}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // Filter out undefined values and stringify everything
  const filteredEntries = Object.entries(params ?? {})
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([k, v]): [string, string] => [k, String(v)]);

  let body: string | undefined;
  let finalUrl = url;

  if (method === "GET" && filteredEntries.length > 0) {
    finalUrl = `${url}?${new URLSearchParams(filteredEntries).toString()}`;
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

// ─── TwiML builder helper ─────────────────────────────────────────────────────
// Not a tool — call this in your app code to generate the `twiml` param value.

type TwiMLAction =
  | { type: "say"; text: string; voice?: string; language?: string }
  | { type: "play"; url: string }
  | { type: "gather_digits"; prompt: string; action_url: string; num_digits?: number; timeout?: number }
  | { type: "connect_stream"; stream_url: string }
  | { type: "record"; action_url: string; max_length?: number; transcribe?: boolean };

export function buildTwiML(action: TwiMLAction): string {
  switch (action.type) {
    case "say":
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${action.voice ?? "alice"}" language="${action.language ?? "en-US"}">${action.text}</Say></Response>`;
    case "play":
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${action.url}</Play></Response>`;
    case "gather_digits":
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather numDigits="${action.num_digits ?? 1}" timeout="${action.timeout ?? 5}" action="${action.action_url}"><Say>${action.prompt}</Say></Gather></Response>`;
    case "connect_stream":
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${action.stream_url}" /></Connect></Response>`;
    case "record":
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Record action="${action.action_url}" maxLength="${action.max_length ?? 120}" transcribe="${action.transcribe ?? false}" /></Response>`;
  }
}

// =============================================================================
// VOICE TOOLS
// =============================================================================

// ─── 1. twilioMakeCall ────────────────────────────────────────────────────────

const makeCallSchema = z.object({
  to: z
    .string()
    .describe("Destination phone number in E.164 format, e.g. +14155551234."),
  from: z
    .string()
    .describe("Your Twilio phone number or verified caller ID in E.164 format."),
  twiml: z
    .string()
    .optional()
    .describe(
      "Inline TwiML XML controlling the call. Use buildTwiML() to generate this. " +
      "Mutually exclusive with url."
    ),
  url: z
    .string()
    .optional()
    .describe(
      "Publicly reachable URL Twilio fetches TwiML from when the call connects. " +
      "Mutually exclusive with twiml."
    ),
  application_sid: z
    .string()
    .optional()
    .describe("SID of a TwiML App on your account. Takes precedence over url and twiml."),
  method: z
    .enum(["GET", "POST"])
    .optional()
    .default("POST")
    .describe("HTTP method Twilio uses to fetch TwiML from the url parameter."),
  status_callback: z
    .string()
    .optional()
    .describe("URL Twilio POSTs call status events to (initiated, ringing, answered, completed)."),
  status_callback_event: z
    .array(z.enum(["initiated", "ringing", "answered", "completed"]))
    .optional()
    .describe("Which status events fire to status_callback. Defaults to completed."),
  record: z
    .boolean()
    .optional()
    .default(false)
    .describe("Record the call audio."),
  recording_channels: z
    .enum(["mono", "dual"])
    .optional()
    .describe("mono = mixed track; dual = separate caller/callee tracks."),
  timeout: z
    .number()
    .int()
    .min(5)
    .max(600)
    .optional()
    .default(30)
    .describe("Seconds to let the call ring before giving up (5–600)."),
  machine_detection: z
    .enum(["Enable", "DetectMessageEnd"])
    .optional()
    .describe(
      "Answering machine detection. " +
      "'Enable' detects on connect; 'DetectMessageEnd' waits for the beep."
    ),
  send_digits: z
    .string()
    .optional()
    .describe("DTMF digits to send on connect, e.g. '1234#'. Useful for auto-navigating IVRs."),
  time_limit: z
    .number()
    .int()
    .optional()
    .describe("Maximum call duration in seconds."),
});

export const twilioMakeCall = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Place an outbound phone call via Twilio Voice API. " +
      "Control what happens on connect via inline TwiML (use buildTwiML()) or a hosted URL. " +
      "For real-time AI voice agents, use buildTwiML connect_stream pointing at a wss:// WebSocket. " +
      "Returns a Call SID to track or modify the call.",
    inputSchema: makeCallSchema,
    execute: async (params: z.infer<typeof makeCallSchema>) => {
      try {
        const body: TwilioParams = {
          To: params.to,
          From: params.from,
          Method: params.method,
          Record: params.record,
          Timeout: params.timeout,
        };
        if (params.twiml)                  body.Twiml               = params.twiml;
        if (params.url)                    body.Url                 = params.url;
        if (params.application_sid)        body.ApplicationSid      = params.application_sid;
        if (params.status_callback)        body.StatusCallback      = params.status_callback;
        if (params.status_callback_event?.length)
          body.StatusCallbackEvent = params.status_callback_event.join(" ");
        if (params.recording_channels)     body.RecordingChannels   = params.recording_channels;
        if (params.machine_detection)      body.MachineDetection    = params.machine_detection;
        if (params.send_digits)            body.SendDigits          = params.send_digits;
        if (params.time_limit != null)     body.TimeLimit           = params.time_limit;

        const data = await twilioRequest<Record<string, unknown>>("POST", "/Calls.json", body);
        return {
          success: true,
          call_sid: data.sid,
          status: data.status,
          direction: data.direction,
          data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 2. twilioGetCall ─────────────────────────────────────────────────────────

const getCallSchema = z.object({
  call_sid: z
    .string()
    .describe("The Call SID (starts with CA) returned when the call was created."),
});

export const twilioGetCall = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Fetch current status and metadata of a specific call by its SID. " +
      "Check whether a call is ringing, in-progress, or completed, and retrieve duration, direction, and price.",
    inputSchema: getCallSchema,
    execute: async ({ call_sid }: z.infer<typeof getCallSchema>) => {
      try {
        const data = await twilioRequest<Record<string, unknown>>("GET", `/Calls/${call_sid}.json`);
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 3. twilioListCalls ───────────────────────────────────────────────────────

const listCallsSchema = z.object({
  to: z.string().optional().describe("Filter by destination phone number in E.164 format."),
  from: z.string().optional().describe("Filter by originating phone number in E.164 format."),
  status: z
    .enum(["queued", "ringing", "in-progress", "canceled", "completed", "failed", "busy", "no-answer"])
    .optional()
    .describe("Filter calls by status."),
  start_time_after: z.string().optional().describe("Return calls started on or after YYYY-MM-DD."),
  start_time_before: z.string().optional().describe("Return calls started on or before YYYY-MM-DD."),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(20)
    .describe("Records per page (1–1000)."),
});

export const twilioListCalls = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List calls made to or from your Twilio account with optional filters. " +
      "Audit call history or check statuses of multiple calls at once.",
    inputSchema: listCallsSchema,
    execute: async (params: z.infer<typeof listCallsSchema>) => {
      try {
        const qs: TwilioParams = { PageSize: params.page_size };
        if (params.to)                qs.To            = params.to;
        if (params.from)              qs.From          = params.from;
        if (params.status)            qs.Status        = params.status;
        if (params.start_time_after)  qs["StartTime>"] = params.start_time_after;
        if (params.start_time_before) qs["StartTime<"] = params.start_time_before;

        const data = await twilioRequest<Record<string, unknown>>("GET", "/Calls.json", qs);
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 4. twilioModifyCall ──────────────────────────────────────────────────────

const modifyCallSchema = z.object({
  call_sid: z.string().describe("SID of the active call to modify (starts with CA)."),
  status: z
    .enum(["canceled", "completed"])
    .optional()
    .describe("'completed' hangs up an in-progress call. 'canceled' ends a queued/ringing call."),
  url: z.string().optional().describe("Redirect the call to TwiML at this URL immediately."),
  twiml: z.string().optional().describe("Inline TwiML to redirect the call to immediately."),
  method: z.enum(["GET", "POST"]).optional().describe("HTTP method for fetching from url."),
});

export const twilioModifyCall = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Modify or terminate an active call in real-time. " +
      "Hang up, cancel, or redirect a call to new TwiML mid-call.",
    inputSchema: modifyCallSchema,
    execute: async (params: z.infer<typeof modifyCallSchema>) => {
      try {
        const body: TwilioParams = {};
        if (params.status) body.Status = params.status;
        if (params.url)    body.Url    = params.url;
        if (params.twiml)  body.Twiml  = params.twiml;
        if (params.method) body.Method = params.method;

        const data = await twilioRequest<Record<string, unknown>>(
          "POST",
          `/Calls/${params.call_sid}.json`,
          body
        );
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// =============================================================================
// MESSAGING TOOLS
// =============================================================================

// ─── 5. twilioSendSMS ─────────────────────────────────────────────────────────

const sendSMSSchema = z.object({
  to: z.string().describe("Recipient phone number in E.164 format, e.g. +14155551234."),
  from: z
    .string()
    .optional()
    .describe(
      "Your Twilio phone number or short code in E.164 format. " +
      "Either from or messaging_service_sid is required."
    ),
  messaging_service_sid: z
    .string()
    .optional()
    .describe(
      "SID of a Twilio Messaging Service. Twilio auto-selects the optimal sender. " +
      "Either from or messaging_service_sid is required."
    ),
  body: z
    .string()
    .describe(
      "Text content of the message. " +
      "Messages over 160 GSM-7 chars are split into segments and billed per segment."
    ),
  media_url: z
    .array(z.string())
    .optional()
    .describe(
      "Publicly accessible media URLs to attach (makes this an MMS). " +
      "Twilio fetches and saves the media; URLs must not require authentication."
    ),
  status_callback: z
    .string()
    .optional()
    .describe("Webhook URL Twilio POSTs delivery status events to."),
  send_at: z
    .string()
    .optional()
    .describe(
      "ISO 8601 future datetime to schedule delivery. Requires messaging_service_sid."
    ),
  shorten_urls: z
    .boolean()
    .optional()
    .describe("Shorten links in the body (requires Messaging Service)."),
  max_price: z
    .string()
    .optional()
    .describe("Max price in USD; message not sent if cost exceeds this value."),
  validity_period: z
    .number()
    .int()
    .min(1)
    .max(14400)
    .optional()
    .describe("Seconds before an undelivered message expires (1–14400)."),
});

export const twilioSendSMS = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Send an SMS or MMS message via Twilio Programmable Messaging. " +
      "Supports plain text SMS, media attachments (MMS), scheduled delivery, " +
      "and Messaging Service pools for smart sender-selection. " +
      "Returns a Message SID to track delivery.",
    inputSchema: sendSMSSchema,
    execute: async (params: z.infer<typeof sendSMSSchema>) => {
      try {
        if (!params.from && !params.messaging_service_sid)
          throw new Error("Either 'from' or 'messaging_service_sid' is required.");

        const body: TwilioParams = { To: params.to, Body: params.body };
        if (params.from)                   body.From                = params.from;
        if (params.messaging_service_sid)  body.MessagingServiceSid = params.messaging_service_sid;
        if (params.media_url?.length)      body.MediaUrl            = params.media_url.join(",");
        if (params.status_callback)        body.StatusCallback      = params.status_callback;
        if (params.send_at) {
          body.SendAt       = params.send_at;
          body.ScheduleType = "fixed";
        }
        if (params.shorten_urls != null)   body.ShortenUrls         = params.shorten_urls;
        if (params.max_price)              body.MaxPrice            = params.max_price;
        if (params.validity_period != null) body.ValidityPeriod     = params.validity_period;

        const data = await twilioRequest<Record<string, unknown>>("POST", "/Messages.json", body);
        return {
          success: true,
          message_sid: data.sid,
          status: data.status,
          direction: data.direction,
          num_segments: data.num_segments,
          data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 6. twilioGetMessage ──────────────────────────────────────────────────────

const getMessageSchema = z.object({
  message_sid: z
    .string()
    .describe("The Message SID (starts with SM or MM) from twilioSendSMS."),
});

export const twilioGetMessage = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Fetch the current delivery status and metadata of a specific SMS/MMS message. " +
      "Statuses: accepted → queued → sending → sent → delivered / undelivered / failed.",
    inputSchema: getMessageSchema,
    execute: async ({ message_sid }: z.infer<typeof getMessageSchema>) => {
      try {
        const data = await twilioRequest<Record<string, unknown>>(
          "GET",
          `/Messages/${message_sid}.json`
        );
        return {
          success: true,
          status: data.status,
          error_code: data.error_code,
          error_message: data.error_message,
          date_sent: data.date_sent,
          price: data.price,
          data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 7. twilioListMessages ────────────────────────────────────────────────────

const listMessagesSchema = z.object({
  to: z.string().optional().describe("Filter messages sent to this phone number."),
  from: z.string().optional().describe("Filter messages sent from this phone number or short code."),
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

export const twilioListMessages = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List SMS/MMS messages on your account with optional filters. " +
      "Find recent conversations, messages to/from a number, or history for a date range.",
    inputSchema: listMessagesSchema,
    execute: async (params: z.infer<typeof listMessagesSchema>) => {
      try {
        const qs: TwilioParams = { PageSize: params.page_size };
        if (params.to)               qs.To           = params.to;
        if (params.from)             qs.From         = params.from;
        if (params.date_sent_after)  qs["DateSent>"] = params.date_sent_after;
        if (params.date_sent_before) qs["DateSent<"] = params.date_sent_before;

        const data = await twilioRequest<Record<string, unknown>>("GET", "/Messages.json", qs);
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// =============================================================================
// PHONE NUMBER MANAGEMENT TOOLS
// =============================================================================

// ─── 8. twilioListMyNumbers ───────────────────────────────────────────────────

const listMyNumbersSchema = z.object({
  phone_number: z
    .string()
    .optional()
    .describe(
      "Filter by full or partial E.164 number. Use '*' as a wildcard digit, e.g. '+1415*'."
    ),
  friendly_name: z
    .string()
    .optional()
    .describe("Filter by the friendly name label assigned to the number."),
  beta: z
    .boolean()
    .optional()
    .describe("Include numbers new to the Twilio platform. Default true."),
  origin: z
    .enum(["twilio", "hosted"])
    .optional()
    .describe("Filter by origin: 'twilio' (purchased) or 'hosted' (ported in)."),
  capabilities_voice: z
    .boolean()
    .optional()
    .describe("Only return voice-capable numbers."),
  capabilities_sms: z
    .boolean()
    .optional()
    .describe("Only return SMS-capable numbers."),
  capabilities_mms: z
    .boolean()
    .optional()
    .describe("Only return MMS-capable numbers."),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(50)
    .describe("Records per page (1–1000)."),
});

export const twilioListMyNumbers = ({ userId }: { userId: string }) =>
  tool({
    description:
      "List all phone numbers provisioned on your Twilio account. " +
      "Use to autonomously discover which numbers are available to make calls or send SMS from, " +
      "filter by capability (voice/SMS/MMS), or find numbers matching a pattern. " +
      "Returns SID, phone_number, friendly_name, and capabilities for each number.",
    inputSchema: listMyNumbersSchema,
    execute: async (params: z.infer<typeof listMyNumbersSchema>) => {
      try {
        const qs: TwilioParams = { PageSize: params.page_size };
        if (params.phone_number != null)       qs.PhoneNumber  = params.phone_number;
        if (params.friendly_name != null)      qs.FriendlyName = params.friendly_name;
        if (params.beta != null)               qs.Beta         = params.beta;
        if (params.origin != null)             qs.Origin       = params.origin;
        if (params.capabilities_voice != null) qs.VoiceCapable = params.capabilities_voice;
        if (params.capabilities_sms != null)   qs.SmsCapable   = params.capabilities_sms;
        if (params.capabilities_mms != null)   qs.MmsCapable   = params.capabilities_mms;

        const data = await twilioRequest<Record<string, unknown>>(
          "GET",
          "/IncomingPhoneNumbers.json",
          qs
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

        const summary = numbers.map((n) => ({
          sid: n.sid,
          phone_number: n.phone_number,
          friendly_name: n.friendly_name,
          capabilities: n.capabilities,
          origin: n.origin,
          date_created: n.date_created,
        }));

        return { success: true, total: numbers.length, numbers: summary };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 9. twilioSearchAvailableNumbers ─────────────────────────────────────────

const searchAvailableSchema = z.object({
  country_code: z
    .string()
    .length(2)
    .default("US")
    .describe("ISO 3166-1 alpha-2 country code, e.g. 'US', 'GB', 'NG'."),
  type: z
    .enum(["Local", "TollFree", "Mobile"])
    .default("Local")
    .describe(
      "Number type. 'Local' = geographic. 'TollFree' = 800/833/etc. 'Mobile' = mobile-specific."
    ),
  area_code: z
    .number()
    .int()
    .optional()
    .describe("US/Canada 3-digit area code, e.g. 415 for San Francisco."),
  contains: z
    .string()
    .optional()
    .describe("Pattern match with '*' as wildcard digit, e.g. '*555*'."),
  in_region: z
    .string()
    .optional()
    .describe("2-letter US state/province code, e.g. 'CA', 'NY'."),
  in_postal_code: z
    .string()
    .optional()
    .describe("5-digit US ZIP code to find numbers in a specific locality."),
  sms_enabled: z
    .boolean()
    .optional()
    .default(true)
    .describe("Only return SMS-capable numbers."),
  voice_enabled: z
    .boolean()
    .optional()
    .default(true)
    .describe("Only return voice-capable numbers."),
  mms_enabled: z
    .boolean()
    .optional()
    .default(false)
    .describe("Only return MMS-capable numbers."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(40)
    .optional()
    .default(10)
    .describe("Max results to return (1–40)."),
});

export const twilioSearchAvailableNumbers = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Search Twilio's inventory for available phone numbers you can purchase. " +
      "Filter by country, area code, region, ZIP, capabilities, or number pattern. " +
      "Use before twilioProvisionNumber to find the right number to buy.",
    inputSchema: searchAvailableSchema,
    execute: async (params: z.infer<typeof searchAvailableSchema>) => {
      try {
        const qs: TwilioParams = {
          PageSize: params.limit,
          SmsEnabled: params.sms_enabled,
          VoiceEnabled: params.voice_enabled,
          MmsEnabled: params.mms_enabled,
        };
        if (params.area_code != null) qs.AreaCode     = params.area_code;
        if (params.contains)          qs.Contains     = params.contains;
        if (params.in_region)         qs.InRegion     = params.in_region;
        if (params.in_postal_code)    qs.InPostalCode = params.in_postal_code;

        const endpoint = `/AvailablePhoneNumbers/${params.country_code}/${params.type}.json`;
        const data = await twilioRequest<Record<string, unknown>>("GET", endpoint, qs);

        type AvailableNumber = {
          phone_number: string;
          friendly_name: string;
          lata?: string;
          rate_center?: string;
          region?: string;
          postal_code?: string;
          iso_country: string;
          capabilities: Record<string, boolean>;
        };

        const numbers =
          (data as { available_phone_numbers?: AvailableNumber[] }).available_phone_numbers ?? [];

        const summary = numbers.map((n) => ({
          phone_number: n.phone_number,
          friendly_name: n.friendly_name,
          lata: n.lata,
          rate_center: n.rate_center,
          region: n.region,
          postal_code: n.postal_code,
          iso_country: n.iso_country,
          capabilities: n.capabilities,
        }));

        return { success: true, total: numbers.length, numbers: summary };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 10. twilioProvisionNumber ────────────────────────────────────────────────

const provisionNumberSchema = z.object({
  phone_number: z
    .string()
    .describe(
      "The exact E.164 phone number to purchase, taken from twilioSearchAvailableNumbers results."
    ),
  friendly_name: z
    .string()
    .optional()
    .describe("Human-readable label for this number, e.g. 'Support Line US'."),
  voice_url: z
    .string()
    .optional()
    .describe("URL Twilio fetches TwiML from when this number receives an inbound call."),
  voice_method: z
    .enum(["GET", "POST"])
    .optional()
    .describe("HTTP method for voice_url. Default POST."),
  sms_url: z
    .string()
    .optional()
    .describe("URL Twilio POSTs to when this number receives an inbound SMS."),
  sms_method: z
    .enum(["GET", "POST"])
    .optional()
    .describe("HTTP method for sms_url. Default POST."),
  status_callback: z
    .string()
    .optional()
    .describe("URL Twilio POSTs call status events to."),
});

export const twilioProvisionNumber = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Purchase and provision a phone number onto your Twilio account. " +
      "Use twilioSearchAvailableNumbers first to find a number, then call this with the phone_number. " +
      "Optionally configure voice and SMS webhook URLs at provision time.",
    inputSchema: provisionNumberSchema,
    execute: async (params: z.infer<typeof provisionNumberSchema>) => {
      try {
        const body: TwilioParams = { PhoneNumber: params.phone_number };
        if (params.friendly_name)    body.FriendlyName  = params.friendly_name;
        if (params.voice_url)        body.VoiceUrl      = params.voice_url;
        if (params.voice_method)     body.VoiceMethod   = params.voice_method;
        if (params.sms_url)          body.SmsUrl        = params.sms_url;
        if (params.sms_method)       body.SmsMethod     = params.sms_method;
        if (params.status_callback)  body.StatusCallback = params.status_callback;

        const data = await twilioRequest<Record<string, unknown>>(
          "POST",
          "/IncomingPhoneNumbers.json",
          body
        );
        return {
          success: true,
          sid: data.sid,
          phone_number: data.phone_number,
          friendly_name: data.friendly_name,
          capabilities: data.capabilities,
          date_created: data.date_created,
          data,
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 11. twilioReleaseNumber ──────────────────────────────────────────────────

const releaseNumberSchema = z.object({
  phone_number_sid: z
    .string()
    .describe(
      "SID of the IncomingPhoneNumber to release (starts with PN). " +
      "Get this from twilioListMyNumbers."
    ),
});

export const twilioReleaseNumber = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Release (delete) a provisioned phone number from your Twilio account. " +
      "The number will no longer be billed or receive calls/SMS. " +
      "⚠️ Irreversible — the number returns to Twilio's inventory pool.",
    inputSchema: releaseNumberSchema,
    execute: async ({ phone_number_sid }: z.infer<typeof releaseNumberSchema>) => {
      try {
        await twilioRequest("DELETE", `/IncomingPhoneNumbers/${phone_number_sid}.json`);
        return { success: true, message: `Number ${phone_number_sid} released successfully.` };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

// ─── 12. twilioUpdateNumber ───────────────────────────────────────────────────

const updateNumberSchema = z.object({
  phone_number_sid: z
    .string()
    .describe("SID of the IncomingPhoneNumber to update (starts with PN)."),
  friendly_name: z
    .string()
    .optional()
    .describe("New human-readable label for this number."),
  voice_url: z
    .string()
    .optional()
    .describe("New URL for handling inbound voice calls."),
  voice_method: z
    .enum(["GET", "POST"])
    .optional()
    .describe("HTTP method for voice_url."),
  sms_url: z
    .string()
    .optional()
    .describe("New URL for handling inbound SMS/MMS messages."),
  sms_method: z
    .enum(["GET", "POST"])
    .optional()
    .describe("HTTP method for sms_url."),
  voice_application_sid: z
    .string()
    .optional()
    .describe(
      "SID of a TwiML App to handle inbound voice calls. Overrides voice_url when set."
    ),
  sms_application_sid: z
    .string()
    .optional()
    .describe(
      "SID of a TwiML App to handle inbound SMS. Overrides sms_url when set."
    ),
  status_callback: z
    .string()
    .optional()
    .describe("URL to receive call status events."),
});

export const twilioUpdateNumber = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Update the configuration of a provisioned phone number. " +
      "Reassign voice/SMS webhook URLs, update the friendly name, " +
      "or point it at a different TwiML App.",
    inputSchema: updateNumberSchema,
    execute: async (params: z.infer<typeof updateNumberSchema>) => {
      try {
        const body: TwilioParams = {};
        if (params.friendly_name)          body.FriendlyName        = params.friendly_name;
        if (params.voice_url)              body.VoiceUrl            = params.voice_url;
        if (params.voice_method)           body.VoiceMethod         = params.voice_method;
        if (params.sms_url)                body.SmsUrl              = params.sms_url;
        if (params.sms_method)             body.SmsMethod           = params.sms_method;
        if (params.voice_application_sid)  body.VoiceApplicationSid = params.voice_application_sid;
        if (params.sms_application_sid)    body.SmsApplicationSid   = params.sms_application_sid;
        if (params.status_callback)        body.StatusCallback      = params.status_callback;

        const data = await twilioRequest<Record<string, unknown>>(
          "POST",
          `/IncomingPhoneNumbers/${params.phone_number_sid}.json`,
          body
        );
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });