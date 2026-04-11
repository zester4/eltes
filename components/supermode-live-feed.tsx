"use client";

import {
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useSupermodeLiveForChat } from "@/hooks/use-supermode-live";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const ACTIVE = new Set([
  "planning",
  "running",
  "awaiting_approval",
]);

function actionIcon(type: string) {
  if (type === "completed") {
    return <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />;
  }
  if (type === "failed") {
    return <XCircle className="size-3.5 text-destructive" aria-hidden />;
  }
  if (type === "approval_requested") {
    return <Info className="size-3.5 text-amber-500" aria-hidden />;
  }
  if (type === "tool_call") {
    return <ExternalLink className="size-3.5 text-blue-500" aria-hidden />;
  }
  return <Info className="size-3.5 text-muted-foreground" aria-hidden />;
}

export function SupermodeLiveFeed({ chatId }: { chatId: string }) {
  const { live } = useSupermodeLiveForChat(chatId);

  if (!live) {
    return null;
  }

  const { session, actions } = live;
  if (!ACTIVE.has(session.status)) {
    return null;
  }

  return (
    <div
      className="not-prose w-full max-w-4xl rounded-xl border border-border/80 bg-muted/20 px-2.5 py-2 shadow-sm backdrop-blur-sm md:px-3"
      data-supermode-live-feed
      data-supermode-session-id={session.id}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background/80">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold tracking-tight">
              SuperMode
            </span>
            <Badge
              className="h-5 px-1.5 text-[10px] font-medium"
              variant="secondary"
            >
              {session.status === "awaiting_approval"
                ? "Awaiting approval"
                : session.status === "planning"
                  ? "Planning"
                  : "Running"}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              step {session.currentStep}/{session.maxSteps}
            </span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {session.objective}
          </p>
        </div>
        {(session.status === "running" || session.status === "planning") && (
          <Loader2
            className="size-4 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>

      <ScrollArea className="max-h-40 pr-2">
        <ul className="space-y-1.5 pb-1">
          {actions.length === 0 ? (
            <li className="py-2 text-center text-[11px] text-muted-foreground">
              Starting autonomous loop…
            </li>
          ) : (
            [...actions].reverse().map((a) => (
              <li
                className={cn(
                  "flex gap-2 rounded-md border border-transparent px-1.5 py-1 text-[11px] leading-snug",
                  "hover:border-border/60 hover:bg-background/40",
                )}
                key={a.id}
              >
                <span className="mt-0.5 shrink-0">{actionIcon(a.actionType)}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">
                    {a.summary ||
                      (a.toolName ? `Tool: ${a.toolName}` : a.actionType)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(a.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}
