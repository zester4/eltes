"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus, ArrowRight, Loader2 } from "lucide-react";
import { initiateComposioAuthFlow } from "@/lib/composio-auth";
import { cn } from "@/lib/utils";

// ─── Data ──────────────────────────────────────────────────────────────────

const FEATURED_APPS = [
  {
    slug: "gmail",
    name: "Gmail",
    description: "Draft replies, summarize threads, & search your inbox",
    logo: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/gmail.svg",
    fallbackColor: "#EA4335",
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Send messages, create canvases, and fetch Slack data",
    logo: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/slack.svg",
    fallbackColor: "#4A154B",
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Search, update, and power workflows across your workspace",
    logo: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/notion.svg",
    fallbackColor: "#000000",
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    description: "Manage your schedule and coordinate meetings effortlessly",
    logo: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/googlecalendar.svg",
    fallbackColor: "#4285F4",
  },
  {
    slug: "github",
    name: "GitHub",
    description: "Manage repos, PRs, issues, and code reviews",
    logo: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/github.svg",
    fallbackColor: "#181717",
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Track issues, sprints, and project progress",
    logo: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linear.svg",
    fallbackColor: "#5E6AD2",
  },
];

const ROLES = [
  "Founder",
  "Manager",
  "Developer",
  "Designer",
  "Sales",
  "Marketing",
  "Other",
];

const PAIN_POINTS = [
  "Inbox management",
  "Scheduling",
  "Project tracking",
  "Data entry",
  "Code reviews",
  "Other",
];

// Suggestions per connected app
function buildSuggestions(
  connectedApps: string[],
  role: string
): Array<{ slug: string; appName: string; text: string }> {
  const suggestions: Array<{ slug: string; appName: string; text: string }> = [];

  if (connectedApps.includes("gmail")) {
    suggestions.push(
      { slug: "gmail", appName: "Gmail", text: "Tell me which emails I subscribe to usually go unread" },
      { slug: "gmail", appName: "Gmail", text: "Pull out important points from my latest work emails" }
    );
  }
  if (connectedApps.includes("slack")) {
    suggestions.push({
      slug: "slack",
      appName: "Slack",
      text: "Summarize what happened in my top Slack channels today",
    });
  }
  if (connectedApps.includes("googlecalendar")) {
    suggestions.push({
      slug: "googlecalendar",
      appName: "Google Calendar",
      text: "What's on my calendar this week? Any conflicts?",
    });
  }
  if (connectedApps.includes("notion")) {
    suggestions.push({
      slug: "notion",
      appName: "Notion",
      text: "Create a new task in my Notion for the project sync",
    });
  }
  if (connectedApps.includes("github")) {
    suggestions.push({
      slug: "github",
      appName: "GitHub",
      text: "What PRs need my review right now?",
    });
  }
  if (connectedApps.includes("linear")) {
    suggestions.push({
      slug: "linear",
      appName: "Linear",
      text: "What are my open and overdue Linear issues?",
    });
  }

  // Role-based fallback suggestions
  if (suggestions.length < 3) {
    if (role === "Founder" || role === "Manager") {
      suggestions.push({
        slug: "",
        appName: "",
        text: "Help me write a weekly team update based on what we shipped",
      });
    } else if (role === "Developer") {
      suggestions.push({
        slug: "",
        appName: "",
        text: "Review my latest code changes and flag any issues",
      });
    } else {
      suggestions.push({
        slug: "",
        appName: "",
        text: "Help me draft a professional email to a client",
      });
    }
  }

  return suggestions.slice(0, 3);
}

// App logo component
function AppLogo({ app }: { app: (typeof FEATURED_APPS)[number] }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
        style={{ backgroundColor: app.fallbackColor }}
      >
        {app.name[0]}
      </div>
    );
  }
  return (
    <img
      src={app.logo}
      alt={app.name}
      className="h-8 w-8 object-contain"
      onError={() => setFailed(true)}
      style={{ filter: "invert(1) brightness(0.9)" }}
    />
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────

const slideVariants = {
  enter: { opacity: 0, y: 24 },
  center: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.2, ease: "easeIn" } },
};

// ─── Wizard ───────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [painPoints, setPainPoints] = useState<string[]>([]);
  const [roleLoading, setRoleLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 1) nameRef.current?.focus();
  }, [step]);

  // Toast helper
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // Step 1: Save name
  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setNameLoading(true);
    try {
      await fetch("/api/onboarding/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch {}
    setNameLoading(false);
    setStep(2);
  }

  // Step 2: Connect an app via popup
  async function handleConnect(slug: string) {
    if (connectedApps.includes(slug) || connectingApp) return;
    setConnectingApp(slug);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: slug }),
      });
      const data = await res.json();
      if (!data.redirectUrl) throw new Error(data.error || "No URL");

      await initiateComposioAuthFlow(data.redirectUrl, "status");
      setConnectedApps((prev) => [...prev, slug]);
      const appName = FEATURED_APPS.find((a) => a.slug === slug)?.name ?? slug;
      showToast(`Connected to ${appName}.`);
    } catch (err: any) {
      if (!err.message?.includes("closed before completion")) {
        showToast("Connection failed. Please try again.");
      }
    } finally {
      setConnectingApp(null);
    }
  }

  // Step 2: Continue to step 3
  function handleContinueToStep3() {
    setStep(3);
  }

  // Step 2: Skip to step 3
  function handleSkipApps() {
    setStep(3);
  }

  // Step 3: Save role + pain points, go to step 4
  async function handleRoleSubmit() {
    if (!role) return;
    setRoleLoading(true);
    try {
      await fetch("/api/onboarding/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, painPoints }),
      });
    } catch {}
    setRoleLoading(false);
    setStep(4);
  }

  // Step 4: Complete onboarding + navigate
  async function handleComplete(query?: string) {
    setCompleting(true);
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch {}
    if (query) {
      window.location.assign(`/chat?query=${encodeURIComponent(query)}`);
    } else {
      window.location.assign("/chat");
    }
  }

  // Skip entirely
  async function handleSkipAll() {
    if (skipping) return;
    setSkipping(true);
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch {}
    window.location.assign("/chat");
  }

  const suggestions = buildSuggestions(connectedApps, role);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0f0f0f] px-6 py-12 overflow-hidden">
      {/* Amber glow blob */}
      <div className="pointer-events-none absolute top-0 left-0 h-[500px] w-[500px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-amber-600/10 blur-[140px]" />

      {/* Skip button — top right */}
      <div className="absolute top-5 right-5 z-20">
        <button
          onClick={handleSkipAll}
          disabled={skipping}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
        >
          {skipping ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : null}
          Skip setup
        </button>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: -8, x: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed top-5 right-5 z-50 flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs text-zinc-200 shadow-xl"
          >
            <span className="text-blue-400">ⓘ</span>
            {toast}
            <button
              className="ml-1 text-zinc-500 hover:text-zinc-300"
              onClick={() => setToast(null)}
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Etles Sparkle Icon */}
      <div className="mb-6 self-start sm:self-auto sm:absolute sm:top-10 sm:left-10">
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          className="text-amber-500"
        >
          <path
            d="M20 2L22.5 15.5L36 13L24.5 20L36 27L22.5 24.5L20 38L17.5 24.5L4 27L15.5 20L4 13L17.5 15.5L20 2Z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      </div>

      {/* Step content */}
      <div className="relative z-10 w-full max-w-[520px]">
        <AnimatePresence mode="wait">
          {/* ── Step 1: Name ── */}
          {step === 1 && (
            <motion.div
              key="step1"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex flex-col gap-8"
            >
              <h1 className="text-2xl font-semibold leading-snug text-white">
                Before we get started, what should I call you?
              </h1>
              <form onSubmit={handleNameSubmit}>
                <div className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-3 focus-within:border-amber-500/60 transition-colors">
                  <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex-shrink-0" />
                  <input
                    ref={nameRef}
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
                    maxLength={60}
                  />
                  <button
                    type="submit"
                    disabled={!name.trim() || nameLoading}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-700 text-white transition-all hover:bg-amber-500 disabled:opacity-40"
                  >
                    {nameLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ── Step 2: App Connections ── */}
          {step === 2 && (
            <motion.div
              key="step2"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex flex-col gap-6"
            >
              <div>
                <h1 className="text-2xl font-semibold leading-snug text-white">
                  Nice to meet you,{" "}
                  <span className="text-amber-400">{name.trim()}</span>.{" "}
                  I'd love to learn more about the way you work.
                </h1>
                <p className="mt-2 text-sm text-zinc-400">
                  Connect your tools and I'll have a much better sense of what's useful to you.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {FEATURED_APPS.map((app) => {
                  const isConnected = connectedApps.includes(app.slug);
                  const isConnecting = connectingApp === app.slug;
                  return (
                    <button
                      key={app.slug}
                      onClick={() => handleConnect(app.slug)}
                      disabled={isConnecting || !!connectingApp && !isConnecting}
                      className={cn(
                        "group flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all",
                        isConnected
                          ? "border-zinc-600 bg-zinc-800/60"
                          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-800/60"
                      )}
                    >
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                        <AppLogo app={app} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{app.name}</p>
                        <p className="text-xs text-zinc-500 truncate">{app.description}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {isConnecting ? (
                          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                        ) : isConnected ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 transition-all group-hover:border-zinc-500 group-hover:text-zinc-200">
                            <Plus className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col items-center gap-2 pt-2">
                <button
                  onClick={handleContinueToStep3}
                  className="w-full max-w-xs rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-100 active:scale-95"
                >
                  Continue
                </button>
                <button
                  onClick={handleSkipApps}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1"
                >
                  Skip for now
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Role & Pain Points ── */}
          {step === 3 && (
            <motion.div
              key="step3"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex flex-col gap-6"
            >
              <h1 className="text-2xl font-semibold leading-snug text-white">
                Almost done! What best describes your role?
              </h1>

              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                      role === r
                        ? "border-amber-500 bg-amber-500/10 text-amber-300"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-zinc-300">
                  What takes up too much of your time?
                </p>
                <div className="flex flex-wrap gap-2">
                  {PAIN_POINTS.map((p) => {
                    const selected = painPoints.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() =>
                          setPainPoints((prev) =>
                            selected
                              ? prev.filter((x) => x !== p)
                              : [...prev, p]
                          )
                        }
                        className={cn(
                          "rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                          selected
                            ? "border-amber-500 bg-amber-500/10 text-amber-300"
                            : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 pt-2">
                <button
                  onClick={handleRoleSubmit}
                  disabled={!role || roleLoading}
                  className="w-full max-w-xs rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-100 active:scale-95 disabled:opacity-40"
                >
                  {roleLoading ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    "Continue"
                  )}
                </button>
                <button
                  onClick={() => handleComplete()}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1"
                >
                  Skip for now
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 4: Suggestions ── */}
          {step === 4 && (
            <motion.div
              key="step4"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex flex-col gap-6"
            >
              <div>
                <h1 className="text-2xl font-semibold leading-snug text-white">
                  All set! Here are a few ideas just for you.
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  Where should we start?
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {suggestions.map((s, i) => {
                  const app = FEATURED_APPS.find((a) => a.slug === s.slug);
                  return (
                    <button
                      key={i}
                      onClick={() => handleComplete(s.text)}
                      disabled={completing}
                      className="group flex w-full items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 text-left transition-all hover:border-zinc-600 hover:bg-zinc-800/60 disabled:opacity-50"
                    >
                      {app ? (
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-zinc-800">
                          <AppLogo app={app} />
                        </div>
                      ) : (
                        <div className="h-7 w-7 flex-shrink-0 rounded-md bg-zinc-800" />
                      )}
                      <span className="text-sm text-zinc-200">{s.text}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => handleComplete()}
                  disabled={completing}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
                >
                  {completing ? (
                    <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                  ) : null}
                  I have my own topic
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
