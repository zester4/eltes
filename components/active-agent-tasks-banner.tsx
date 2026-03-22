"use client";

import Link from "next/link";
import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useActiveAgentTasks } from "@/hooks/use-active-agent-tasks";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export function ActiveAgentTasksBanner({
  chatId,
  className,
}: {
  chatId: string;
  className?: string;
}) {
  const { tasks, mutate } = useActiveAgentTasks(chatId);
  const [cancelling, setCancelling] = useState(false);

  if (tasks.length === 0) return null;

  const handleCancel = async (taskId: string) => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/cancel`, {
        method: "POST",
      });
      if (res.ok) await mutate();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-2 text-sm",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <LoaderIcon className="size-4 shrink-0 animate-spin text-primary" />
        <span className="truncate text-muted-foreground">
          {tasks.length === 1 ? (
            <>
              <strong className="text-foreground">
                {tasks[0]?.agentType.replace(/_/g, " ")}
              </strong>{" "}
              — {tasks[0]?.task.slice(0, 50)}
              {(tasks[0]?.task?.length ?? 0) > 50 ? "…" : ""}
            </>
          ) : (
            <>
              <strong className="text-foreground">{tasks.length} agents</strong>{" "}
              running
            </>
          )}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button asChild size="sm" type="button" variant="ghost">
          <Link
            className="text-muted-foreground text-xs"
            href="/settings/agents"
          >
            Activity
          </Link>
        </Button>
        {tasks.length === 1 && tasks[0] && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            disabled={cancelling}
            onClick={() => handleCancel(tasks[0].id)}
          >
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}
