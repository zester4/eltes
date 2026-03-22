"use client";

import type { ToolUIPart } from "ai";
import {
  ChevronDownIcon,
  ZapIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { isValidElement } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// ─── Tool Container ───────────────────────────────────────────────────────────

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "not-prose mb-3 w-full rounded-lg border border-border/50 bg-muted/30 overflow-hidden",
      className
    )}
    {...props}
  />
);

// ─── Name Formatting ─────────────────────────────────────────────────────────

const META_TOOL_NAMES: Record<string, string> = {
  COMPOSIO_SEARCH_TOOLS: "Search Tools",
  COMPOSIO_MULTI_EXECUTE_TOOL: "Execute Actions",
  COMPOSIO_MANAGE_CONNECTIONS: "Manage Connections",
  COMPOSIO_INITIATE_CONNECTION: "Connect Account",
  COMPOSIO_GET_CONNECTION_STATUS: "Check Connection",
};

const KNOWN_APP_PREFIXES: Record<string, string> = {
  GMAIL: "Gmail",
  SLACK: "Slack",
  GITHUB: "GitHub",
  NOTION: "Notion",
  YOUTUBE: "YouTube",
  TWITTER: "Twitter",
  LINKEDIN: "LinkedIn",
  GOOGLE_CALENDAR: "Google Calendar",
  GOOGLE_DRIVE: "Google Drive",
  GOOGLE_SHEETS: "Google Sheets",
  GOOGLE_DOCS: "Google Docs",
  DISCORD: "Discord",
  HUBSPOT: "HubSpot",
  SALESFORCE: "Salesforce",
  ASANA: "Asana",
  JIRA: "Jira",
  TRELLO: "Trello",
  DROPBOX: "Dropbox",
  ONEDRIVE: "OneDrive",
  SHOPIFY: "Shopify",
  STRIPE: "Stripe",
  FIGMA: "Figma",
  ZOOM: "Zoom",
  AIRTABLE: "Airtable",
  OUTLOOK: "Outlook",
  PERPLEXITYAI: "Perplexity AI",
  SUPABASE: "Supabase",
};

export const formatToolName = (type: string): string => {
  const raw = type.replace(/^tool-/, "");

  if (META_TOOL_NAMES[raw]) return META_TOOL_NAMES[raw];

  if (raw === "getWeather") return "Get Weather";
  if (raw === "renderChart") return "Render Chart";
  if (raw === "createDocument") return "Create Document";
  if (raw === "updateDocument") return "Update Document";
  if (raw === "requestSuggestions") return "Request Suggestions";

  // Match known app prefix: GMAIL_FETCH_EMAILS → "Gmail — Fetch Emails"
  for (const [prefix, appName] of Object.entries(KNOWN_APP_PREFIXES)) {
    if (raw.startsWith(prefix + "_")) {
      const action = raw
        .slice(prefix.length + 1)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return `${appName} — ${action}`;
    }
  }

  // Generic fallback
  return raw
    .replace(/^COMPOSIO_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// ─── Status Indicator ─────────────────────────────────────────────────────────

const getStatusIndicator = (state: ToolUIPart["state"]) => {
  if (state === "output-available") {
    return (
      <span className="text-[11px] font-medium text-emerald-500 ml-1">
        Completed
      </span>
    );
  }
  if (state === "output-error" || state === "output-denied") {
    return (
      <span className="text-[11px] font-medium text-destructive ml-1">
        {state === "output-denied" ? "Denied" : "Error"}
      </span>
    );
  }
  if (state === "approval-requested") {
    return (
      <span className="text-[11px] font-medium text-yellow-500 ml-1 animate-pulse">
        Awaiting Approval
      </span>
    );
  }
  return (
    <span className="text-[11px] font-medium text-muted-foreground ml-1 animate-pulse">
      {state === "input-streaming" ? "Thinking…" : "Running…"}
    </span>
  );
};

// ─── Tool Header ─────────────────────────────────────────────────────────────

export type ToolHeaderProps = {
  title?: string;
  type: ToolUIPart["type"];
  state: ToolUIPart["state"];
  className?: string;
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  ...props
}: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "group flex w-full items-center justify-between gap-3 px-3 py-2",
      className
    )}
    {...props}
  >
    <div className="flex items-center gap-2 min-w-0">
      <ZapIcon className="size-3.5 text-muted-foreground/70 shrink-0" />
      <span className="font-medium text-sm text-foreground/80 truncate">
        {title ?? formatToolName(type)}
      </span>
      {getStatusIndicator(state)}
    </div>
    <ChevronDownIcon className="size-3.5 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
);

// ─── Tool Content ─────────────────────────────────────────────────────────────

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "border-t border-border/40 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
);

// ─── Tool Input ───────────────────────────────────────────────────────────────

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolUIPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1 p-3", className)} {...props}>
    <h4 className="text-[10px] font-semibold text-muted-foreground tracking-[0.12em] uppercase">
      ARGS
    </h4>
    <pre className="overflow-x-auto rounded-lg bg-background/60 border border-border/30 p-2 font-mono text-xs text-foreground/80 leading-relaxed">
      {JSON.stringify(input, null, 2)}
    </pre>
  </div>
);

// ─── Tool Output ──────────────────────────────────────────────────────────────

export type ToolOutputProps = ComponentProps<"div"> & {
  output: unknown; // Accept any value — we stringify objects ourselves
  errorText?: string | null;
};

const safeRenderOutput = (output: unknown) => {
  // Never render plain objects — always stringify them
  if (
    output !== null &&
    output !== undefined &&
    typeof output === "object" &&
    !isValidElement(output)
  ) {
    return (
      <pre className="overflow-x-auto p-2 font-mono text-xs text-foreground/80 leading-relaxed">
        {JSON.stringify(output, null, 2)}
      </pre>
    );
  }
  if (typeof output === "string") {
    return (
      <pre className="overflow-x-auto p-2 font-mono text-xs text-foreground/80">
        {output}
      </pre>
    );
  }
  if (isValidElement(output)) {
    return <div className="p-2">{output}</div>;
  }
  if (output !== null && output !== undefined) {
    return (
      <pre className="overflow-x-auto p-2 font-mono text-xs text-foreground/80">
        {String(output)}
      </pre>
    );
  }
  return null;
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  // Only treat errorText as a real error if it's a non-empty string
  const hasRealError =
    typeof errorText === "string" && errorText.trim().length > 0;

  if (!output && !hasRealError) {
    return null;
  }

  return (
    <div className={cn("space-y-1 p-3", className)} {...props}>
      <h4 className="text-[10px] font-semibold text-muted-foreground tracking-[0.12em] uppercase">
        {hasRealError ? "ERROR" : "RESULT"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-lg border text-xs",
          hasRealError
            ? "bg-destructive/5 border-destructive/20 text-destructive"
            : "bg-background/60 border-border/30 text-foreground"
        )}
      >
        {hasRealError && <div className="p-2">{errorText}</div>}
        {!hasRealError && safeRenderOutput(output)}
      </div>
    </div>
  );
};
