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

  if (tasks.length === 0) {
    return null;
  }

  const handleCancel = async (taskId: string) => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        await mutate();
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      className={cn(
        "mx-2 mt-2 flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm shadow-xs backdrop-blur md:mx-3",
        className
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
        <Button
          asChild
          className="h-7 rounded-lg"
          size="sm"
          type="button"
          variant="ghost"
        >
          <Link
            className="text-muted-foreground text-xs"
            href="/settings/agents"
          >
            Activity
          </Link>
        </Button>
        {tasks.length === 1 && tasks[0] && (
          <Button
            className="h-7 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
            disabled={cancelling}
            onClick={() => handleCancel(tasks[0].id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}
