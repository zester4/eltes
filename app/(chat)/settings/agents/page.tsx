"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Response } from "@/components/elements/response";

type AgentTaskRow = {
  id: string;
  chatId: string;
  agentType: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  result: { text?: string; error?: string } | null;
  createdAt: string;
  updatedAt: string;
};

function statusBadge(status: AgentTaskRow["status"]) {
  switch (status) {
    case "pending":
      return (
        <Badge className="gap-1" variant="secondary">
          <Clock className="size-3" />
          Pending
        </Badge>
      );
    case "running":
      return (
        <Badge className="gap-1" variant="default">
          <Loader2 className="size-3 animate-spin" />
          Running
        </Badge>
      );
    case "completed":
      return (
        <Badge className="gap-1 bg-emerald-600" variant="default">
          <CheckCircle2 className="size-3" />
          Done
        </Badge>
      );
    case "failed":
      return (
        <Badge className="gap-1" variant="destructive">
          <XCircle className="size-3" />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AgentsActivityPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<AgentTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/agent/tasks?all=1&limit=100");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "Failed to load agent tasks");
    }
    const data = await res.json();
    setTasks(data.tasks ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
      toast.success("Refreshed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const active = tasks.filter(
    (t) => t.status === "pending" || t.status === "running",
  );

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <SidebarToggle />
        <Button
          className="gap-2"
          onClick={() => router.push("/chat")}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex flex-1 items-center gap-2">
          <Bot className="size-5 text-primary" />
          <h1 className="font-semibold text-lg tracking-tight">
            Agent activity
          </h1>
        </div>
        <Button
          disabled={refreshing}
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw
            className={cn("mr-2 size-4", refreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 md:p-8">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-5 text-primary" />
              Sub-agents and delegations
            </CardTitle>
            <CardDescription>
              See every delegated agent run: what ran, current status, and
              outcome. Open the chat to continue the thread. Active runs also
              show a pulsing dot in the sidebar and a banner in the chat.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-muted-foreground text-sm">
            <span>
              <strong className="text-foreground">{active.length}</strong>{" "}
              active
            </span>
            <span>
              <strong className="text-foreground">{tasks.length}</strong> shown
              (latest 100)
            </span>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-10 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No agent tasks yet. In chat, ask Etles to delegate (e.g. inbox
              operator, SDR, chief of staff).
            </CardContent>
          </Card>
        ) : (
          <motion.ul className="space-y-3" initial={false}>
            {tasks.map((t, i) => (
              <motion.li
                animate={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 8 }}
                key={t.id}
                transition={{ delay: i * 0.02 }}
              >
                <Card className="overflow-hidden border-border/60 transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {statusBadge(t.status)}
                          <span className="font-mono text-muted-foreground text-xs">
                            {t.agentType.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-foreground text-sm leading-relaxed">
                          {t.task}
                        </p>
                        {(t.status === "completed" || t.status === "failed") &&
                          (t.result?.text || t.result?.error) && (
                            <div className="line-clamp-4 rounded-md bg-muted/50 p-3 text-muted-foreground text-xs prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border border-white/10 overflow-hidden">
                              {t.result.error ? (
                                <span className="text-destructive font-mono">{t.result.error}</span>
                              ) : (
                                <Response>{t.result.text!}</Response>
                              )}
                            </div>
                          )}
                        <p className="text-muted-foreground text-xs">
                          Started{" "}
                          {new Date(t.createdAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="secondary">
                        <Link
                          href={`/chat/${t.chatId}?highlightTask=${encodeURIComponent(t.id)}`}
                        >
                          <MessageSquare className="mr-2 size-4" />
                          Open chat
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </main>
    </div>
  );
}
