"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  Brain,
  CheckCircle2,
  Clock,
  Database,
  History,
  Info,
  Loader2,
  MessageSquare,
  Network,
  RefreshCw,
  Search,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Response } from "@/components/elements/response";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AgentTaskRow = {
  id: string;
  chatId: string;
  agentType: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  result: { text?: string; toolCalls?: any[]; error?: string } | null;
  createdAt: string;
  updatedAt: string;
};

type MemoryRow = {
  id: string;
  key: string;
  content: string;
  savedAt: string;
  tags?: string[];
};

type GoalRow = {
  id: string;
  title: string;
  description: string;
  status: "active" | "paused" | "completed" | "archived";
  priority: number;
  progress: number;
  targetDate?: string;
  nextAction?: string;
};

type GraphEntityRow = {
  id: string;
  name: string;
  entityType: string;
  summary: string;
  updatedAt: string;
};

function statusBadge(status: AgentTaskRow["status"]) {
  switch (status) {
    case "pending":
      return (
        <Badge
          className="gap-1 border-blue-500/20 bg-blue-500/10 text-blue-500"
          variant="outline"
        >
          <Clock className="size-3" />
          Pending
        </Badge>
      );
    case "running":
      return (
        <Badge
          className="gap-1 border-primary/20 bg-primary/10 text-primary"
          variant="outline"
        >
          <Loader2 className="size-3 animate-spin" />
          Running
        </Badge>
      );
    case "completed":
      return (
        <Badge
          className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
          variant="outline"
        >
          <CheckCircle2 className="size-3" />
          Done
        </Badge>
      );
    case "failed":
      return (
        <Badge
          className="gap-1 border-red-500/20 bg-red-500/10 text-red-500"
          variant="outline"
        >
          <XCircle className="size-3" />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AgentsSettingsPage() {
  const router = useRouter();

  // Tabs: "activity" | "memory" | "goals" | "graph"
  const [activeTab, setActiveTab] = useState<
    "activity" | "memory" | "goals" | "graph"
  >("activity");

  // Activity State
  const [tasks, setTasks] = useState<AgentTaskRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Memory State
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [graphEntities, setGraphEntities] = useState<GraphEntityRow[]>([]);
  const [loadingGraph, setLoadingGraph] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/agent/tasks?all=1&limit=100");
    if (!res.ok) {
      throw new Error("Failed to load tasks");
    }
    const data = await res.json();
    setTasks(data.tasks ?? []);
  }, []);

  const loadMemories = useCallback(async () => {
    setLoadingMemories(true);
    try {
      const res = await fetch("/api/agent/memory");
      if (!res.ok) {
        throw new Error("Failed to load memory");
      }
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch (e) {
      toast.error("Could not fetch memory");
    } finally {
      setLoadingMemories(false);
    }
  }, []);

  const loadGoals = useCallback(async () => {
    setLoadingGoals(true);
    try {
      const res = await fetch("/api/agent/goals");
      if (!res.ok) {
        throw new Error("Failed to load goals");
      }
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch {
      toast.error("Could not fetch goals");
    } finally {
      setLoadingGoals(false);
    }
  }, []);

  const loadGraph = useCallback(async () => {
    setLoadingGraph(true);
    try {
      const res = await fetch("/api/agent/knowledge-graph");
      if (!res.ok) {
        throw new Error("Failed to load graph");
      }
      const data = await res.json();
      setGraphEntities(data.entities ?? []);
    } catch {
      toast.error("Could not fetch knowledge graph");
    } finally {
      setLoadingGraph(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "activity") {
      setLoadingTasks(true);
      loadTasks()
        .catch((e) => toast.error(e.message))
        .finally(() => setLoadingTasks(false));
    } else if (activeTab === "memory") {
      loadMemories();
    } else if (activeTab === "goals") {
      loadGoals();
    } else {
      loadGraph();
    }
  }, [activeTab, loadTasks, loadMemories, loadGoals, loadGraph]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (activeTab === "activity") {
        await loadTasks();
      } else if (activeTab === "memory") {
        await loadMemories();
      } else if (activeTab === "goals") {
        await loadGoals();
      } else {
        await loadGraph();
      }
      toast.success("Sync complete");
    } catch (e) {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const deleteMemory = async (key: string) => {
    setIsActionLoading(key);
    try {
      const res = await fetch(
        `/api/agent/memory?key=${encodeURIComponent(key)}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        throw new Error("Failed to forget");
      }
      setMemories((prev) => prev.filter((m) => m.key !== key));
      toast.success(`Forgotten: ${key}`);
    } catch (e) {
      toast.error("Could not forget memory");
    } finally {
      setIsActionLoading(null);
    }
  };

  const markGoalCompleted = async (goalId: string) => {
    setIsActionLoading(goalId);
    try {
      const res = await fetch("/api/agent/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId, status: "completed", progress: 100 }),
      });
      if (!res.ok) {
        throw new Error("Failed to mark goal complete");
      }
      const data = await res.json();
      setGoals((prev) =>
        prev.map((g) => (g.id === goalId ? (data.goal as GoalRow) : g))
      );
      toast.success("Goal marked as completed");
    } catch {
      toast.error("Could not update goal");
    } finally {
      setIsActionLoading(null);
    }
  };

  const deleteGoalItem = async (goalId: string) => {
    setIsActionLoading(goalId);
    try {
      const res = await fetch(
        `/api/agent/goals?goalId=${encodeURIComponent(goalId)}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        throw new Error("Failed to delete goal");
      }
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
      toast.success("Goal deleted");
    } catch {
      toast.error("Could not delete goal");
    } finally {
      setIsActionLoading(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/30">
      {/* Premium Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background z-0 pointer-events-none opacity-60 dark:opacity-40" />
      <div className="absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-primary/10 to-transparent blur-[100px] z-0 pointer-events-none opacity-50 dark:opacity-30 translate-y-[-20%]" />

      <div className="flex flex-col gap-4 md:gap-8 p-3 md:p-8 lg:px-12 max-w-5xl mx-auto w-full relative z-10 min-h-screen">
        {/* Header/Nav Section */}
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 md:p-6 rounded-2xl md:rounded-[2rem] bg-card/60 border border-border/50 shadow-2xl backdrop-blur-3xl relative overflow-hidden"
          initial={{ opacity: 0, y: -10 }}
        >
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />

          <div className="flex items-center gap-3 md:gap-4">
            <SidebarToggle />
            <Button
              className="size-8 md:size-9 rounded-full shrink-0"
              onClick={() => router.push("/chat")}
              size="icon"
              variant="ghost"
            >
              <ArrowLeft className="size-4 md:size-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg md:text-2xl font-extrabold tracking-tight bg-gradient-to-br from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent truncate">
                Agents & Memory
              </h1>
              <p className="text-muted-foreground text-[10px] md:text-xs font-medium mt-0.5">
                Manage automated skills and long-term context.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center">
            <Button
              className="h-8 rounded-full border-border/50 bg-background/50 hover:bg-accent px-3 md:px-4"
              disabled={refreshing}
              onClick={onRefresh}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={cn(
                  "size-3.5 mr-2",
                  refreshing && "animate-spin text-primary"
                )}
              />
              Sync
            </Button>
          </div>
        </motion.header>

        {/* Custom Tabs */}
        <div className="flex gap-1 p-1 bg-muted border border-border rounded-xl w-fit">
          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              activeTab === "activity"
                ? "bg-card text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:bg-accent/50"
            )}
            onClick={() => setActiveTab("activity")}
          >
            <History
              className={cn(
                activeTab === "activity"
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
              size={14}
            />
            Activity
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              activeTab === "memory"
                ? "bg-card text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:bg-accent/50"
            )}
            onClick={() => setActiveTab("memory")}
          >
            <Brain
              className={cn(
                activeTab === "memory"
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
              size={14}
            />
            Memory
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              activeTab === "goals"
                ? "bg-card text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:bg-accent/50"
            )}
            onClick={() => setActiveTab("goals")}
          >
            <Target
              className={cn(
                activeTab === "goals" ? "text-primary" : "text-muted-foreground"
              )}
              size={14}
            />
            Goals
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              activeTab === "graph"
                ? "bg-card text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:bg-accent/50"
            )}
            onClick={() => setActiveTab("graph")}
          >
            <Network
              className={cn(
                activeTab === "graph" ? "text-primary" : "text-muted-foreground"
              )}
              size={14}
            />
            Graph
          </button>
        </div>

        <main className="flex-1 pb-20">
          <AnimatePresence mode="wait">
            {activeTab === "activity" ? (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
                exit={{ opacity: 0, x: 10 }}
                initial={{ opacity: 0, x: -10 }}
                key="activity"
              >
                {/* Statistics Cards */}
                <div className="grid grid-cols-2 gap-2">
                  <Card className="bg-card border-border/50 backdrop-blur-md rounded-xl">
                    <CardHeader className="p-2.5 flex flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-lg md:text-xl font-black">
                          {tasks.length}
                        </CardTitle>
                        <CardDescription className="text-[8px] uppercase tracking-widest font-black text-muted-foreground">
                          Total
                        </CardDescription>
                      </div>
                      <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
                        <Activity size={14} />
                      </div>
                    </CardHeader>
                  </Card>
                  <Card className="bg-card border-border/50 backdrop-blur-md rounded-xl">
                    <CardHeader className="p-2.5 flex flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-lg md:text-xl font-black">
                          {tasks.filter((t) => t.status === "completed").length}
                        </CardTitle>
                        <CardDescription className="text-[8px] uppercase tracking-widest font-black text-muted-foreground">
                          Success
                        </CardDescription>
                      </div>
                      <div className="size-7 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-500">
                        <CheckCircle2 size={14} />
                      </div>
                    </CardHeader>
                  </Card>
                </div>

                {/* Task List */}
                <div className="space-y-4">
                  {loadingTasks ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <Loader2 className="size-8 animate-spin text-primary" />
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        Reading Agent Logs...
                      </p>
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed rounded-[3rem] border-border/50 bg-card/10 backdrop-blur-md gap-6">
                      <div className="size-16 rounded-[2rem] bg-muted/50 flex items-center justify-center border border-border shadow-inner">
                        <Info className="size-8 text-muted-foreground/30" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground max-w-xs leading-relaxed px-6">
                        No sub-agent runs found. Ask Etles to perform a complex
                        task, or wait for an external integration trigger.
                      </p>
                    </div>
                  ) : (
                    tasks.map((t, idx) => (
                      <motion.div
                        animate={{ opacity: 1, y: 0 }}
                        initial={{ opacity: 0, y: 10 }}
                        key={t.id}
                        transition={{ delay: idx * 0.03 }}
                      >
                        <Card className="group overflow-hidden border-border/50 bg-card backdrop-blur-xl hover:border-primary/30 hover:bg-accent/5 transition-all duration-300 rounded-xl md:rounded-2xl shadow-lg relative">
                          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                          <div className="p-2.5 md:p-5 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                              <div className="space-y-1.5 min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {statusBadge(t.status)}
                                  <Badge
                                    className="bg-muted text-muted-foreground border-border uppercase text-[7px] font-black tracking-widest px-1 py-0 h-3.5"
                                    variant="secondary"
                                  >
                                    {t.task.startsWith("[Trigger")
                                      ? "Automated"
                                      : "Manual"}
                                  </Badge>
                                </div>
                                <h3 className="text-[11px] md:text-sm font-bold text-foreground leading-snug line-clamp-2 italic text-muted-foreground">
                                  “{t.task}”
                                </h3>
                              </div>
                              <Button
                                asChild
                                className="h-6 md:h-8 rounded-md md:rounded-lg border-border bg-muted/50 hover:bg-muted shrink-0 text-[9px] md:text-[10px] px-2 font-bold"
                                size="sm"
                                variant="secondary"
                              >
                                <Link
                                  href={`/chat/${t.chatId}?highlightTask=${encodeURIComponent(t.id)}`}
                                >
                                  <MessageSquare className="mr-1 size-2.5 md:size-3" />
                                  Details
                                </Link>
                              </Button>
                            </div>

                            {(t.status === "completed" ||
                              t.status === "failed") &&
                              (t.result?.text || t.result?.error) && (
                                <div className="rounded-xl border border-border bg-muted/30 p-3 font-normal text-[10px] md:text-xs text-foreground/80 overflow-hidden line-clamp-3 shadow-inner">
                                  {t.result.error ? (
                                    <div className="flex gap-1.5 text-destructive font-mono">
                                      <XCircle className="shrink-0" size={12} />
                                      <span>{t.result.error}</span>
                                    </div>
                                  ) : (
                                    <Response className="[&_p]:leading-normal">
                                      {t.result.text!}
                                    </Response>
                                  )}
                                </div>
                              )}

                            <div className="flex items-center gap-3 text-[9px] md:text-[11px] font-bold text-muted-foreground/30 uppercase tracking-tighter">
                              <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {new Date(t.createdAt).toLocaleString(
                                  undefined,
                                  { dateStyle: "short", timeStyle: "short" }
                                )}
                              </span>
                              {t.result?.toolCalls && (
                                <span className="flex items-center gap-1">
                                  <Database size={10} />
                                  {t.result.toolCalls.length} tools used
                                </span>
                              )}
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            ) : activeTab === "memory" ? (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
                exit={{ opacity: 0, x: -10 }}
                initial={{ opacity: 0, x: 10 }}
                key="memory"
              >
                {/* Memory Hero Section */}
                <Card className="bg-primary/5 border-primary/20 backdrop-blur-md rounded-2xl md:rounded-[2.5rem] overflow-hidden">
                  <CardHeader className="p-6 md:p-8 text-center space-y-3 md:space-y-4">
                    <div className="size-12 md:size-16 rounded-xl md:rounded-[1.5rem] bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto text-primary shadow-xl md:shadow-2xl">
                      <Brain className="md:size-8" size={24} />
                    </div>
                    <div className="space-y-1 md:space-y-2">
                      <CardTitle className="text-lg md:text-2xl font-black uppercase tracking-tighter">
                        Your Vault
                      </CardTitle>
                      <CardDescription className="max-w-md mx-auto text-[10px] md:text-sm leading-relaxed px-4">
                        Etles acts with continuity using long-term context.
                        Manage everything currently stored in your memory vault
                        here.
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>

                {/* Memory Listing */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-4">
                    <h3 className="font-extrabold text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <Search size={14} />
                      Current Recollections ({memories.length})
                    </h3>
                  </div>

                  {loadingMemories ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <Loader2 className="size-8 animate-spin text-primary" />
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        Searching Vault...
                      </p>
                    </div>
                  ) : memories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed rounded-[3rem] border-border/50 bg-card/10 backdrop-blur-md gap-6">
                      <div className="size-16 rounded-[2rem] bg-muted/50 flex items-center justify-center border border-border shadow-inner">
                        <Brain className="size-8 text-primary/20" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground max-w-xs leading-relaxed px-6">
                        Etles hasn't saved any long-term memories yet. Share
                        some preferences or facts in chat to see them here!
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {memories.map((m, idx) => (
                        <motion.div
                          animate={{ opacity: 1, scale: 1 }}
                          initial={{ opacity: 0, scale: 0.98 }}
                          key={m.id}
                          transition={{ delay: idx * 0.05 }}
                        >
                          <Card className="group relative border-border/50 bg-card backdrop-blur-xl hover:border-primary/30 hover:bg-accent/5 transition-all duration-300 rounded-xl md:rounded-2xl overflow-hidden flex flex-col min-h-[70px]">
                            <div className="p-2.5 md:p-4 flex-1 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <Badge
                                  className="bg-primary/5 text-primary border-primary/10 tracking-widest font-black text-[7px] uppercase h-3.5 px-1.5"
                                  variant="outline"
                                >
                                  {m.key}
                                </Badge>
                                <Button
                                  className="size-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100"
                                  disabled={isActionLoading === m.key}
                                  onClick={() => deleteMemory(m.key)}
                                  size="icon"
                                  variant="ghost"
                                >
                                  {isActionLoading === m.key ? (
                                    <Loader2
                                      className="animate-spin"
                                      size={10}
                                    />
                                  ) : (
                                    <Trash2 size={10} />
                                  )}
                                </Button>
                              </div>
                              <p className="text-[10px] md:text-sm font-medium leading-relaxed text-foreground/70 line-clamp-2 group-hover:text-foreground transition-colors">
                                {m.content}
                              </p>
                            </div>
                            <div className="px-2.5 md:px-4 py-1 bg-muted/30 border-t border-border/50 flex items-center justify-between text-[7px] font-black text-muted-foreground/40 uppercase tracking-widest">
                              <span>
                                Recorded{" "}
                                {new Date(m.savedAt).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" }
                                )}
                              </span>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : activeTab === "goals" ? (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
                exit={{ opacity: 0, x: -10 }}
                initial={{ opacity: 0, x: 10 }}
                key="goals"
              >
                {loadingGoals ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="size-8 animate-spin text-primary" />
                  </div>
                ) : goals.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">
                    No goals yet.
                  </Card>
                ) : (
                  goals.map((goal) => (
                    <Card className="p-4 space-y-2" key={goal.id}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold">{goal.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {goal.description || "No description"}
                          </div>
                        </div>
                        <Badge className="capitalize" variant="outline">
                          {goal.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Priority {goal.priority} • Progress {goal.progress}%
                        {goal.targetDate
                          ? ` • Target ${new Date(goal.targetDate).toLocaleDateString()}`
                          : ""}
                      </div>
                      {goal.nextAction ? (
                        <div className="text-xs text-muted-foreground">
                          Next: {goal.nextAction}
                        </div>
                      ) : null}
                      <div className="flex gap-2 pt-1">
                        <Button
                          disabled={
                            isActionLoading === goal.id ||
                            goal.status === "completed"
                          }
                          onClick={() => markGoalCompleted(goal.id)}
                          size="sm"
                        >
                          <CheckCircle2 className="mr-1 size-3" />
                          Mark Complete
                        </Button>
                        <Button
                          disabled={isActionLoading === goal.id}
                          onClick={() => deleteGoalItem(goal.id)}
                          size="sm"
                          variant="outline"
                        >
                          <Trash2 className="mr-1 size-3" />
                          Delete
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </motion.div>
            ) : (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
                exit={{ opacity: 0, x: -10 }}
                initial={{ opacity: 0, x: 10 }}
                key="graph"
              >
                {loadingGraph ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="size-8 animate-spin text-primary" />
                  </div>
                ) : graphEntities.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">
                    Knowledge graph is empty.
                  </Card>
                ) : (
                  graphEntities.map((entity) => (
                    <Card className="p-4 space-y-1" key={entity.id}>
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-sm">{entity.name}</div>
                        <Badge className="capitalize" variant="outline">
                          {entity.entityType}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entity.summary || "No summary"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Updated{" "}
                        {new Date(entity.updatedAt).toLocaleDateString()}
                      </div>
                    </Card>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
