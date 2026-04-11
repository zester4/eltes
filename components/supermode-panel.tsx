"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, StopCircle, CheckCircle2, XCircle, Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SupermodeAction {
  id: string;
  stepIndex: number;
  actionType: "planning" | "tool_call" | "reasoning" | "approval_requested" | "approved" | "rejected" | "completed" | "failed";
  toolName: string | null;
  summary: string | null;
  createdAt: string;
}

interface SupermodeSession {
  id: string;
  objective: string;
  status: "planning" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";
  currentStep: number;
  maxSteps: number;
}

export function SupermodePanel() {
  const [session, setSession] = useState<SupermodeSession | null>(null);
  const [actions, setActions] = useState<SupermodeAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStopping, setIsStopping] = useState(false);

  const fetchStatus = async () => {
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
            const actionsData = await actionsRes.json();
            setActions(actionsData.actions);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch SuperMode status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStop = async () => {
    if (!session) return;
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
    } catch (err) {
      toast.error("An error occurred while stopping SuperMode.");
    } finally {
      setIsStopping(false);
    }
  };

  if (loading && !session) return null;
  if (!session) return null;

  const progress = (session.currentStep / session.maxSteps) * 100;

  return (
    <Card className="fixed bottom-24 right-4 z-50 w-80 shadow-xl border-primary/20 animate-in slide-in-from-right-4">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Badge variant="default" className="bg-primary animate-pulse">SuperMode</Badge>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-muted-foreground"
            onClick={handleStop}
            disabled={isStopping}
          >
            <StopCircle className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription className="text-xs line-clamp-2 mt-1 italic">
          "{session.objective}"
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              <span>Progress</span>
              <span>{session.currentStep} / {session.maxSteps} steps</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Activity Feed
            </div>
            <ScrollArea className="h-32 pr-2">
              <div className="space-y-2">
                {actions.length === 0 && (
                  <div className="text-[10px] text-center text-muted-foreground py-4">
                    Initializing autonomous loop...
                  </div>
                )}
                {[...actions].reverse().map((action) => (
                  <div key={action.id} className="flex gap-2">
                    <div className="mt-0.5 shrink-0">
                      {getActionIcon(action.actionType)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium leading-none text-foreground truncate">
                        {action.summary || getActionTitle(action)}
                      </div>
                      <div className="text-[9px] text-muted-foreground">
                        {new Date(action.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-3 pt-0 flex justify-between gap-2 border-t mt-2">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          {session.status === "awaiting_approval" ? (
            <span className="text-orange-500 font-medium flex items-center gap-1">
              <Info className="h-3 w-3" /> Awaiting Telegram approval
            </span>
          ) : session.status === "running" ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
            </span>
          ) : (
            <span>Status: {session.status}</span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function getActionIcon(type: SupermodeAction["actionType"]) {
  switch (type) {
    case "completed": return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    case "failed": return <XCircle className="h-3 w-3 text-destructive" />;
    case "approval_requested": return <Info className="h-3 w-3 text-orange-500" />;
    case "tool_call": return <ExternalLink className="h-3 w-3 text-blue-500" />;
    default: return <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />;
  }
}

function getActionTitle(action: SupermodeAction) {
  switch (action.actionType) {
    case "planning": return "Creating plan";
    case "reasoning": return "Deciding next step";
    case "tool_call": return `Calling ${action.toolName}`;
    case "approval_requested": return "Waiting for approval";
    default: return action.actionType;
  }
}
