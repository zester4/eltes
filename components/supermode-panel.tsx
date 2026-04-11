"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { toast } from "sonner";
import {
  Loader2,
  StopCircle,
  CheckCircle2,
  XCircle,
  Info,
  ExternalLink,
  Maximize2,
  Minimize2,
  PanelRightClose,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SupermodeActionType =
  | "planning"
  | "tool_call"
  | "reasoning"
  | "approval_requested"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

interface SupermodeAction {
  id: string;
  stepIndex: number;
  actionType: SupermodeActionType;
  toolName: string | null;
  summary: string | null;
  createdAt: string;
}

interface SupermodeSession {
  id: string;
  objective: string;
  status: string;
  currentStep: number;
  maxSteps: number;
}

const PANEL_HIDDEN_KEY = "etles-supermode-panel-hidden";
const PANEL_EXPANDED_KEY = "etles-supermode-panel-expanded";

export function SupermodePanel() {
  const [session, setSession] = useState<SupermodeSession | null>(null);
  const [actions, setActions] = useState<SupermodeAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStopping, setIsStopping] = useState(false);
  const [panelHidden, setPanelHidden] = useLocalStorage(PANEL_HIDDEN_KEY, false);
  const [panelExpanded, setPanelExpanded] = useLocalStorage(
    PANEL_EXPANDED_KEY,
    false,
  );

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/supermode/sessions?active=1");
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);

        if (data.session) {
          const actionsRes = await fetch(
            `/api/supermode/sessions/${data.session.id}/action`,
          );
          if (actionsRes.ok) {
            const parsed = (await actionsRes.json()) as {
              actions?: SupermodeAction[];
            };
            setActions(parsed.actions ?? []);
          }
        } else {
          setActions([]);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStop = async () => {
    if (!session) {
      return;
    }
    setIsStopping(true);
    try {
      const res = await fetch(`/api/supermode/sessions/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          action: "cancel",
        }),
      });
      if (res.ok) {
        toast.success("SuperMode stopped.");
        fetchStatus();
      } else {
        toast.error("Failed to stop SuperMode.");
      }
    } catch {
      toast.error("An error occurred while stopping SuperMode.");
    } finally {
      setIsStopping(false);
    }
  };

  if (loading && !session) {
    return null;
  }
  if (!session) {
    return null;
  }

  const progress = (session.currentStep / session.maxSteps) * 100;
  const scrollHeight = panelExpanded ? "h-44" : "h-32";
  const cardWidth = panelExpanded ? "w-[22rem] sm:w-96" : "w-80";

  if (panelHidden) {
    return (
      <div className="fixed bottom-24 right-2 z-50 flex flex-col items-end gap-1 sm:right-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 gap-1.5 rounded-full border border-primary/30 bg-background/95 px-3 text-xs shadow-md backdrop-blur-sm"
          onClick={() => setPanelHidden(false)}
        >
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          SuperMode
        </Button>
      </div>
    );
  }

  return (
    <Card
      className={cn(
        "fixed bottom-24 right-2 z-50 animate-in shadow-xl border-primary/20 slide-in-from-right-4 sm:right-4",
        "max-w-[calc(100vw-1rem)]",
        cardWidth,
      )}
    >
      <CardHeader className="space-y-1 p-3 pb-2 sm:p-4 sm:pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex flex-1 flex-wrap items-center gap-2 text-sm font-bold">
            <Badge className="animate-pulse bg-primary" variant="default">
              SuperMode
            </Badge>
          </CardTitle>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              title={panelExpanded ? "Compact panel" : "Expand panel"}
              onClick={() => setPanelExpanded(!panelExpanded)}
            >
              {panelExpanded ? (
                <Minimize2 className="size-4" aria-hidden />
              ) : (
                <Maximize2 className="size-4" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              title="Hide panel"
              onClick={() => setPanelHidden(true)}
            >
              <PanelRightClose className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              disabled={isStopping}
              title="Stop SuperMode"
              onClick={handleStop}
            >
              <StopCircle className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <CardDescription className="mt-1 line-clamp-2 text-xs italic">
          &quot;{session.objective}&quot;
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0 sm:p-4 sm:pt-0">
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            <span>Progress</span>
            <span>
              {session.currentStep} / {session.maxSteps} steps
            </span>
          </div>
          <Progress className="h-1.5" value={progress} />
        </div>

        <div className="rounded-md border bg-muted/30 p-2">
          <div className="mb-2 flex items-center gap-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
            <Info className="size-3" aria-hidden />
            Activity feed
          </div>
          <ScrollArea className={cn(scrollHeight, "pr-2")}>
            <div className="space-y-2">
              {actions.length === 0 ? (
                <div className="py-4 text-center text-[10px] text-muted-foreground">
                  Running autonomous loop…
                </div>
              ) : (
                [...actions].reverse().map((action) => (
                  <div className="flex gap-2" key={action.id}>
                    <div className="mt-0.5 shrink-0">
                      {getActionIcon(action.actionType)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[11px] leading-none font-medium text-foreground">
                        {action.summary || getActionTitle(action)}
                      </div>
                      <div className="text-[9px] text-muted-foreground">
                        {new Date(action.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
      <CardFooter className="mt-2 flex justify-between gap-2 border-t p-2.5 pt-0 sm:p-3 sm:pt-0">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {session.status === "awaiting_approval" ? (
            <span className="flex items-center gap-1 font-medium text-orange-500">
              <Info className="size-3" aria-hidden /> Awaiting approval
            </span>
          ) : session.status === "running" ? (
            <span className="flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Working…
            </span>
          ) : (
            <span>Status: {session.status}</span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function getActionIcon(type: SupermodeActionType) {
  switch (type) {
    case "completed":
      return <CheckCircle2 className="size-3 text-emerald-500" aria-hidden />;
    case "failed":
      return <XCircle className="size-3 text-destructive" aria-hidden />;
    case "approval_requested":
      return <Info className="size-3 text-orange-500" aria-hidden />;
    case "tool_call":
      return <ExternalLink className="size-3 text-blue-500" aria-hidden />;
    default:
      return <div className="size-3 rounded-full bg-muted-foreground/30" />;
  }
}

function getActionTitle(action: SupermodeAction) {
  switch (action.actionType) {
    case "planning":
      return "Planning";
    case "reasoning":
      return "Reasoning";
    case "tool_call":
      return action.toolName ? `Tool: ${action.toolName}` : "Tool call";
    case "approval_requested":
      return "Awaiting approval";
    default:
      return action.actionType;
  }
}
