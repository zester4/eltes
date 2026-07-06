"use client";

import { Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type AgentStatusActionsProps = {
  status: "active" | "inactive" | "error" | "pending" | "paused";
};

export function AgentStatusActions({ status }: AgentStatusActionsProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleAction(action: "sync" | "pause" | "resume") {
    if (action === "sync") {
      setSyncing(true);
    } else {
      setToggling(true);
    }

    try {
      const res = await fetch("/api/agent/status/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

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
        className="h-8 text-[10px] sm:text-xs"
        disabled={syncing || status === "paused"}
        onClick={() => handleAction("sync")}
        size="sm"
        variant="outline"
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
          className="h-8 text-[10px] sm:text-xs bg-emerald-600 hover:bg-emerald-700"
          disabled={toggling}
          onClick={() => handleAction("resume")}
          size="sm"
          variant="default"
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
          className="h-8 text-[10px] sm:text-xs"
          disabled={toggling || status === "inactive"}
          onClick={() => handleAction("pause")}
          size="sm"
          variant="secondary"
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
