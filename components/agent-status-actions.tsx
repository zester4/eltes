"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  Loader2, 
  RefreshCw, 
  Pause, 
  Play 
} from "lucide-react";

type AgentStatusActionsProps = {
  status: "active" | "inactive" | "error" | "pending" | "paused";
};

export function AgentStatusActions({ status }: AgentStatusActionsProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleAction(action: "sync" | "pause" | "resume") {
    if (action === "sync") setSyncing(true);
    else setToggling(true);

    try {
      const res = await fetch("/api/agent/status/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error(await res.text());

      toast.success(
        action === "sync" 
          ? "Heartbeat triggered successfully" 
          : `Agent ${action === "pause" ? "paused" : "resumed"} successfully`
      );
      
      router.refresh();
    } catch (error: any) {
      toast.error(`Action failed: ${error.message}`);
    } finally {
      setSyncing(false);
      setToggling(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={syncing || status === "paused"}
        onClick={() => handleAction("sync")}
        className="h-8 text-[10px] sm:text-xs"
      >
        {syncing ? (
          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-3 w-3" />
        )}
        Sync Now
      </Button>

      {status === "paused" ? (
        <Button
          variant="default"
          size="sm"
          disabled={toggling}
          onClick={() => handleAction("resume")}
          className="h-8 text-[10px] sm:text-xs bg-emerald-600 hover:bg-emerald-700"
        >
          {toggling ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Play className="mr-2 h-3 w-3" />
          )}
          Resume Agent
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={toggling || status === "inactive"}
          onClick={() => handleAction("pause")}
          className="h-8 text-[10px] sm:text-xs"
        >
          {toggling ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Pause className="mr-2 h-3 w-3" />
          )}
          Pause Agent
        </Button>
      )}
    </div>
  );
}
