/**
 * components/elements/workflow-step.tsx
 *
 * Renders the live progress card for `/agent` slash-command workflow runs.
 *
 * Visual design:
 *   ┌──────────────────────────────────────────────────┐
 *   │ ⚡ Agent Run  ·  [task preview]                   │
 *   │ ─────────────────────────────────────────────    │
 *   │ ✅ Recalling context               1.2 s         │
 *   │ ⟳  Executing · tavilySearch (14 calls)           │
 *   │ ○  Complete                                      │
 *   │ ─────────────────────────────────────────────    │
 *   │ Running · 2 / 3 steps complete                   │
 *   └──────────────────────────────────────────────────┘
 *
 * When overallStatus === "completed":
 *   • The header turns green.
 *   • All step rows show ✅.
 *   • The footer shows total duration.
 */

"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  WorkflowProgress,
  WorkflowStep,
  WorkflowStepStatus,
} from "@/lib/agent/workflow-progress";

// ── Step icon ─────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: WorkflowStepStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />;
    case "failed":
      return <XCircle className="size-3.5 shrink-0 text-destructive" />;
    case "running":
      return (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
      );
    default:
      return <Circle className="size-3.5 shrink-0 text-muted-foreground/40" />;
  }
}

// ── Duration formatter ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// ── Single step row ───────────────────────────────────────────────────────────

function StepRow({ step }: { step: WorkflowStep }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = Boolean(step.output);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <StepIcon status={step.status} />

        {/* Label */}
        <span
          className={cn("flex-1 text-xs", {
            "text-foreground": step.status === "running",
            "text-muted-foreground": step.status !== "running",
          })}
        >
          {step.label}
          {step.status === "running" && step.currentTool && (
            <span className="ml-1 text-primary/80">
              ·{" "}
              <span className="font-mono text-[10px]">{step.currentTool}</span>
            </span>
          )}
          {step.status === "running" &&
            (step.toolCallCount ?? 0) > 0 && (
              <span className="ml-1 text-muted-foreground/60 text-[10px]">
                ({step.toolCallCount} call{step.toolCallCount === 1 ? "" : "s"})
              </span>
            )}
        </span>

        {/* Duration or tool call count */}
        <div className="flex shrink-0 items-center gap-1.5">
          {step.status === "completed" && step.durationMs !== undefined && (
            <span className="text-[10px] text-muted-foreground/60">
              {formatDuration(step.durationMs)}
            </span>
          )}
          {step.status === "completed" &&
            (step.toolCallCount ?? 0) > 0 && (
              <span className="text-[10px] text-muted-foreground/60">
                {step.toolCallCount} tool
                {step.toolCallCount === 1 ? "" : "s"}
              </span>
            )}
          {hasOutput && step.status === "completed" && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              aria-label={expanded ? "Collapse output" : "Expand output"}
            >
              {expanded ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expandable output preview */}
      {expanded && step.output && (
        <div className="ml-[1.375rem] mt-0.5 rounded border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground leading-relaxed">
          {step.output}
        </div>
      )}

      {/* Error */}
      {step.status === "failed" && step.error && (
        <div className="ml-[1.375rem] mt-0.5 rounded border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive leading-relaxed">
          {step.error}
        </div>
      )}
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function WorkflowProgressCard({
  progress,
}: {
  progress: WorkflowProgress;
}) {
  const { task, steps, overallStatus, startedAt, completedAt } = progress;

  const isRunning = overallStatus === "running";
  const isFailed = overallStatus === "failed";
  const isCompleted = overallStatus === "completed";

  const completedSteps = steps.filter((s) => s.status === "completed").length;
  const totalSteps = steps.length;

  // Total elapsed / total wall-clock time
  const elapsedMs =
    completedAt
      ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
      : Date.now() - new Date(startedAt).getTime();

  // Pending steps that haven't appeared in the steps array yet
  // We show them as grey placeholders so the card doesn't jump in height.
  // Typical workflow = 3 steps (recall-context, execute, finalize)
  const TOTAL_EXPECTED_STEPS = 3;
  const pendingCount = Math.max(0, TOTAL_EXPECTED_STEPS - steps.length);
  const pendingPlaceholders: WorkflowStep[] = Array.from(
    { length: pendingCount },
    (_, i) => ({
      stepIndex: steps.length + i,
      name: "pending",
      label: ["Executing", "Finalising"][i] ?? "Pending",
      status: "pending",
      startedAt: "",
    }),
  );

  const allRows = [...steps, ...pendingPlaceholders];

  return (
    <div
      className={cn(
        "w-[min(100%,480px)] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm",
        {
          "border-border": isRunning,
          "border-emerald-500/30": isCompleted,
          "border-destructive/30": isFailed,
        },
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center gap-2 border-b px-3.5 py-2.5",
          {
            "border-border bg-muted/20": isRunning,
            "border-emerald-500/20 bg-emerald-500/5": isCompleted,
            "border-destructive/20 bg-destructive/5": isFailed,
          },
        )}
      >
        {isRunning ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
        ) : isCompleted ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="size-3.5 shrink-0 text-destructive" />
        )}

        <Zap className="size-3 shrink-0 text-muted-foreground/50" />

        <span className="flex-1 truncate text-xs font-medium text-foreground">
          {task.length > 60 ? `${task.slice(0, 60)}…` : task}
        </span>

        {isRunning && (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            Running
          </span>
        )}
        {isCompleted && (
          <span className="shrink-0 text-[10px] text-muted-foreground/60">
            {formatDuration(elapsedMs)}
          </span>
        )}
      </div>

      {/* ── Steps ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        {allRows.map((step, idx) => (
          <StepRow key={step.name === "pending" ? `pending-${idx}` : step.name} step={step} />
        ))}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="border-t border-border/50 px-3.5 py-2 text-[10px] text-muted-foreground/60">
        {isRunning
          ? `Running · ${completedSteps} / ${TOTAL_EXPECTED_STEPS} steps complete`
          : isCompleted
          ? `Completed · ${completedSteps} steps · ${formatDuration(elapsedMs)} total`
          : `Failed · ${completedSteps} / ${totalSteps} steps completed`}
      </div>
    </div>
  );
}