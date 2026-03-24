"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoaderIcon } from "@/components/icons";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Plus,
  Github,
  Mail,
  Slack,
  Clock,
  ChevronRight,
  Info,
  Calendar,
  Activity,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Database,
  Book,
  FileText,
  Table2,
  Users,
  LifeBuoy,
  MessageSquare,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SidebarToggle } from "@/components/sidebar-toggle";

type TriggerDefinition = {
  slug: string;
  name: string;
  description: string;
  app:
    | "github"
    | "slack"
    | "gmail"
    | "stripe"
    | "notion"
    | "agentmail"
    | "confluence"
    | "googlecalendar"
    | "googledocs"
    | "googlesheets"
    | "hubspot"
    | "salesforce"
    | "zendesk"
    | "outlook"
    | "linear"
    | "discord";
  configFields: {
    name: string;
    label: string;
    type: "string" | "number" | "boolean";
    description: string;
    required: boolean;
    placeholder?: string;
  }[];
};

type ActiveTrigger = {
  triggerId: string;
  triggerSlug: string;
  status: string;
  config: any;
};

type EventLog = {
  id: string;
  triggerSlug: string;
  payload: any;
  createdAt: string;
  status: "received" | "processed" | "failed";
};

export default function EventsPage() {
  const [availableTriggers, setAvailableTriggers] = useState<TriggerDefinition[]>([]);
  const [activeTriggers, setActiveTriggers] = useState<ActiveTrigger[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggersLoading, setIsTriggersLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState<TriggerDefinition | null>(null);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const router = useRouter();

  async function fetchTriggers() {
    setIsTriggersLoading(true);
    try {
      const res = await fetch("/api/triggers", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch triggers");
      setAvailableTriggers(data.available || []);
      setActiveTriggers(data.active || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load triggers");
    } finally {
      setIsTriggersLoading(false);
    }
  }

  async function fetchEvents(manual = false) {
    if (manual) setIsRefreshing(true);
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch events");
      setEventLogs(data.events || []);
    } catch (error: any) {
      console.error(error);
    } finally {
      setIsLoading(false);
      if (manual) setIsRefreshing(false);
    }
  }

  useEffect(() => {
    fetchTriggers();
    fetchEvents();
    
    // Poll for new events
    const interval = setInterval(() => fetchEvents(false), 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreateTrigger() {
    if (!selectedTrigger) return;
    setIsActionLoading("create");
    try {
      const res = await fetch("/api/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerSlug: selectedTrigger.slug,
          config: triggerConfig,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create trigger");
      toast.success(`Subscribed to ${selectedTrigger.name}`);
      setIsCreateDialogOpen(false);
      setSelectedTrigger(null);
      setTriggerConfig({});
      await fetchTriggers();
    } catch (error: any) {
      toast.error(error.message || "Failed to subscribe to event");
    } finally {
      setIsActionLoading(null);
    }
  }

  async function handleDeleteTrigger(triggerId: string) {
    setIsActionLoading(triggerId);
    try {
      const res = await fetch("/api/triggers/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerId }),
      });
      if (!res.ok) throw new Error("Failed to delete trigger");
      toast.success("Unsubscribed successfully");
      await fetchTriggers();
    } catch (error: any) {
      toast.error("Failed to unsubscribe");
    } finally {
      setIsActionLoading(null);
    }
  }

  const getAppIcon = (app: string, size = 20) => {
    const appLower = app.toLowerCase();
    const logoMap: Record<string, string> = {
      github: "/logos/github.svg",
      slack: "/logos/slack.svg",
      gmail: "/logos/gmail.svg",
      stripe: "/logos/stripe.svg",
      notion: "/logos/notion.svg",
      confluence: "/logos/confluence.svg",
      googlecalendar: "/logos/google-calendar.svg",
      googledocs: "/logos/google-docs.svg",
      googlesheets: "/logos/google-sheets.svg",
      hubspot: "/logos/hubspot.svg",
      salesforce: "/logos/salesforce.svg",
      zendesk: "/logos/zendesk.svg",
      outlook: "/logos/outlook.svg",
      linear: "/logos/linear.svg",
      discord: "/logos/discord.svg",
    };

    if (logoMap[appLower]) {
      return (
        <div
          className="relative shrink-0"
          style={{ width: size, height: size }}
        >
          <Image
            src={logoMap[appLower]}
            alt={`${app} logo`}
            fill
            className={cn(
              "object-contain",
              (appLower === "notion" || appLower === "github") && "invert dark:invert-0",
            )}
          />
        </div>
      );
    }

    switch (appLower) {
      case "agentmail":
        return <Mail size={size} className="text-[#EA4335]" />;
      default:
        return <Activity size={size} className="text-primary" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processed": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "received": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "failed": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/30">
      {/* Premium Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background z-0 pointer-events-none opacity-60 dark:opacity-40" />
      <div className="absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-primary/10 to-transparent blur-[100px] z-0 pointer-events-none opacity-50 dark:opacity-30 translate-y-[-20%]" />
      
      <div className="flex flex-col gap-10 p-4 md:p-8 lg:px-12 max-w-7xl mx-auto w-full relative z-10 min-h-screen">
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 rounded-[2rem] bg-card/60 border border-border pb-8 shadow-2xl backdrop-blur-3xl relative overflow-hidden"
        >
          {/* Subtle top glare */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
          
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 md:gap-4">
              <SidebarToggle />
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.back()} 
                className="size-8 md:size-10 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="size-4 md:size-5" />
              </Button>
              <h1 className="text-xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent truncate">
                Events
              </h1>
            </div>
            <p className="text-muted-foreground ml-10 md:ml-14 text-[10px] md:text-sm font-medium line-clamp-1">
              Real-time event streams monitoring.
            </p>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-xl h-10 md:h-12 px-4 md:px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] text-xs md:text-base">
                <Plus className="size-3.5 md:size-4" />
                <span className="hidden sm:inline">Subscribe to Event</span>
                <span className="sm:hidden">Subscribe</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-3xl bg-card/95 backdrop-blur-2xl border-border shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Subscribe to Event</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Choose a real-time event to watch and configure its parameters.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-6 py-4">
                {!selectedTrigger ? (
                  <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {availableTriggers.map((t) => (
                      <button
                        key={t.slug}
                        onClick={() => setSelectedTrigger(t)}
                        className="flex items-center gap-4 p-4 rounded-2xl border border-border/50 bg-muted/30 hover:bg-accent/10 hover:border-primary/40 transition-all text-left group"
                      >
                        <div className="size-12 rounded-xl bg-background flex items-center justify-center border border-border shadow-inner group-hover:scale-110 group-hover:bg-accent transition-all">
                          {getAppIcon(t.app, 24)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">{t.name}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/30 border border-border/50">
                      <div className="size-10 rounded-xl bg-background flex items-center justify-center border border-border">
                        {getAppIcon(selectedTrigger.app, 20)}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-foreground">{selectedTrigger.name}</h4>
                        <p className="text-[10px] uppercase tracking-wider text-primary/80 font-bold">{selectedTrigger.app}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedTrigger(null)} className="ml-auto text-xs h-8 hover:bg-accent/50 text-muted-foreground rounded-lg">Change</Button>
                    </div>

                    <div className="space-y-5 px-1">
                      {selectedTrigger.configFields.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-8 bg-muted/10 rounded-2xl border border-border/50">
                          <CheckCircle2 className="size-6 text-emerald-500/50" />
                          <p className="text-sm font-medium text-muted-foreground">Ready to subscribe, no configuration needed.</p>
                        </div>
                      ) : (
                        selectedTrigger.configFields.map((field) => (
                          <div key={field.name} className="space-y-2">
                            <Label htmlFor={field.name} className="text-sm font-bold text-foreground/80">
                              {field.label} {field.required && <span className="text-primary">*</span>}
                            </Label>
                            <Input
                              id={field.name}
                              placeholder={field.placeholder || field.description}
                              className="rounded-xl h-11 bg-background border-border focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-all placeholder:text-muted-foreground/50 text-foreground"
                              onChange={(e) => setTriggerConfig({ ...triggerConfig, [field.name]: e.target.value })}
                            />
                            <p className="text-[11px] text-muted-foreground font-medium pl-1">{field.description}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-border sm:space-x-0">
                <Button variant="ghost" onClick={() => { setIsCreateDialogOpen(false); setSelectedTrigger(null); }} className="rounded-[1rem] hover:bg-accent hover:text-accent-foreground">Cancel</Button>
                <Button 
                  disabled={!selectedTrigger || isActionLoading === "create"} 
                  onClick={handleCreateTrigger}
                  className="rounded-[1rem] px-8 bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isActionLoading === "create" ? <LoaderIcon className="size-4 animate-spin" /> : "Confirm Subscription"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-20">
          {/* Active Subscriptions Section */}
          <div className="lg:col-span-4 space-y-4 md:space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="font-extrabold text-lg md:text-xl flex items-center gap-2 text-foreground">
                <div className="flex items-center justify-center size-7 md:size-8 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <Activity size={14} />
                </div>
                Active Triggers
              </h3>
              <Badge variant="secondary" className="rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 font-bold text-[10px] md:text-xs">
                {activeTriggers.length}
              </Badge>
            </div>

            {isTriggersLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 border border-border/50 rounded-[2rem] bg-card/60 backdrop-blur-md">
                <LoaderIcon className="size-6 animate-spin text-primary" />
                <p className="text-xs font-medium text-muted-foreground">Syncing with workspace...</p>
              </div>
            ) : activeTriggers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-[2rem] border-border/50 bg-card/60 backdrop-blur-md gap-4 px-6 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center border border-border shadow-inner">
                  <Info className="size-6 text-muted-foreground" />
                </div>
                <div className="relative z-10">
                  <p className="text-sm font-bold text-foreground/80">No active subscriptions</p>
                  <p className="text-[13px] text-muted-foreground mt-1 max-w-[200px]">Set up your first trigger to stream events here.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {activeTriggers.map((t, idx) => {
                  const rawSlug = t.triggerSlug || (t as any).triggerName || (t as any).name || (t as any).id || "";
                  const def = availableTriggers.find(a => a.slug.toLowerCase() === rawSlug.toLowerCase());
                  const displaySlug = def?.name || rawSlug || "Unknown Event";
                  const triggerId = t.triggerId || (t as any).id;
                  
                  return (
                    <motion.div
                      key={triggerId || idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card className="border-border/50 bg-card/60 backdrop-blur-xl hover:border-primary/40 hover:bg-accent/10 transition-all duration-300 group rounded-xl md:rounded-2xl shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardHeader className="p-3 md:p-4 flex flex-row items-center gap-3 md:gap-4 space-y-0 text-foreground">
                          <div className="size-9 md:size-11 rounded-lg md:rounded-[14px] bg-background flex items-center justify-center border border-border flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-300">
                            {getAppIcon(def?.app || "", 18)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-[15px] font-bold truncate text-foreground/90 group-hover:text-primary transition-colors">{displaySlug}</CardTitle>
                            <CardDescription className="text-[11px] truncate text-muted-foreground mt-0.5 font-medium flex items-center gap-1.5">
                              <span className="inline-block size-1.5 rounded-full bg-emerald-500/50" />
                              ID: {triggerId?.slice(0, 8) ?? "N/A"}
                            </CardDescription>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-xl text-zinc-500 hover:text-destructive hover:bg-destructive/15 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0"
                            onClick={() => triggerId && handleDeleteTrigger(triggerId)}
                            disabled={isActionLoading === triggerId}
                          >
                            {isActionLoading === triggerId ? <LoaderIcon className="size-4 animate-spin text-destructive" /> : <Trash2 className="size-4" />}
                          </Button>
                        </CardHeader>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Event Timeline Section */}
          <div className="lg:col-span-8 space-y-4 md:space-y-6">
             <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-card/60 border border-border/50 rounded-xl md:rounded-[1.5rem] backdrop-blur-md">
              <h3 className="font-extrabold text-lg md:text-xl flex items-center gap-2 text-foreground">
                <div className="flex items-center justify-center size-7 md:size-8 rounded-full bg-muted text-muted-foreground border border-border">
                  <Clock size={14} />
                </div>
                Live Stream
              </h3>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchEvents(true)} 
                disabled={isRefreshing}
                className="text-[10px] md:text-xs h-7 md:h-8 px-3 md:px-4 gap-1.5 border-border bg-muted/50 hover:bg-muted text-muted-foreground rounded-full transition-all"
              >
                <Activity className={cn("size-3 md:size-3.5", isRefreshing && "animate-spin text-primary")} /> 
                {isRefreshing ? "Syncing" : "Refresh"}
              </Button>
            </div>

            <div className="relative pl-2 md:pl-0">
              {/* Timeline Line */}
              {eventLogs.length > 0 && (
                <div className="absolute left-[29px] top-6 bottom-4 w-px bg-gradient-to-b from-primary/50 via-border to-transparent hidden md:block" />
              )}

              <div className="space-y-5 relative">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-28 gap-4 rounded-[2rem] border border-border/50 bg-card/60 backdrop-blur-sm">
                    <div className="size-12 rounded-full border-[3px] border-muted border-t-primary animate-spin" />
                    <p className="text-sm text-muted-foreground font-bold tracking-wide">Connecting to stream...</p>
                  </div>
                ) : eventLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 text-center bg-card/60 border border-border/50 rounded-[2.5rem] backdrop-blur-sm gap-5 relative group overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <div className="w-20 h-20 rounded-[2rem] bg-muted/50 border border-border flex items-center justify-center shadow-inner relative z-10 group-hover:scale-110 transition-transform duration-500 group-hover:border-primary/20">
                      <Calendar className="size-8 text-muted-foreground group-hover:text-primary transition-colors duration-500" />
                    </div>
                    <div className="relative z-10 space-y-1.5">
                      <h3 className="text-xl font-bold text-foreground/80">Waiting for signals</h3>
                      <p className="text-[14px] text-muted-foreground max-w-sm mx-auto font-medium">
                        When events are triggered by your connected apps, they will flow into this timeline in real-time.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    <AnimatePresence>
                      {eventLogs.map((event, idx) => {
                        const rawSlug = event.triggerSlug || "";
                        const triggerDef = availableTriggers.find(a => a.slug.toLowerCase() === rawSlug.toLowerCase());
                        const displaySlug = triggerDef?.name || rawSlug;
                        const isExpanded = expandedEventId === event.id;
                        
                        return (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0, scale: 0.98, x: -10 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            className="relative group md:pl-[60px]"
                          >
                            {/* Timeline Dot */}
                            <div className="absolute left-[24px] top-1/2 -translate-y-1/2 size-3 rounded-full bg-background border-2 border-primary z-10 hidden md:block shadow-[0_0_10px_rgba(234,179,8,0.5)] group-hover:scale-[1.5] transition-all duration-300" />
                            
                            <Card className={cn(
                              "border-border/50 bg-card/60 backdrop-blur-xl transition-all duration-300 hover:border-primary/30 hover:bg-accent/5 rounded-xl md:rounded-[1.5rem] overflow-hidden relative",
                              isExpanded && "ring-1 ring-primary/30 bg-accent/10"
                            )}>
                              {isExpanded && <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />}
                              
                              <div 
                                className="p-3 md:p-5 flex items-center gap-3 md:gap-5 cursor-pointer select-none"
                                onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                              >
                                <div className="size-10 md:size-12 rounded-lg md:rounded-xl bg-background border border-border flex items-center justify-center shadow-inner shrink-0 group-hover:bg-accent/20 transition-colors">
                                  {getAppIcon(triggerDef?.app || "", 20)}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 mb-1">
                                    <h4 className="font-extrabold text-sm md:text-[15px] tracking-tight text-foreground/90 group-hover:text-primary transition-colors truncate">{displaySlug}</h4>
                                    <Badge className={cn("w-fit text-[9px] md:text-[10px] px-1.5 py-0 rounded-md font-bold uppercase", getStatusColor(event.status))}>
                                      {event.status}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 md:gap-3 text-[10px] md:text-[12px] text-muted-foreground font-semibold">
                                    <span className="flex items-center gap-1 md:gap-1.5 bg-muted/50 px-1.5 py-0.5 md:px-2 md:py-1 rounded-md border border-border">
                                      <Clock size={10} className="text-muted-foreground/60" />
                                      {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="flex items-center gap-1 md:gap-1.5 bg-muted/50 px-1.5 py-0.5 md:px-2 md:py-1 rounded-md border border-border">
                                      <Calendar size={10} className="text-muted-foreground/60" />
                                      {new Date(event.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                </div>

                                <div className={cn(
                                  "size-7 md:size-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground transition-all shrink-0",
                                  isExpanded && "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                                )}>
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </div>
                              </div>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden border-t border-border/50 bg-muted/20"
                                  >
                                    <div className="p-5 space-y-4">
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <h5 className="text-[11px] uppercase tracking-widest font-extrabold text-muted-foreground">Payload Inspection</h5>
                                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-accent/20 px-2.5 py-1 rounded-md border border-border">
                                            <Info className="size-3 text-primary" />
                                            <span>via Composio</span>
                                          </div>
                                        </div>
                                        <div className="rounded-xl border border-border bg-background p-5 font-mono text-[12px] text-foreground overflow-x-auto shadow-inner custom-scrollbar relative">
                                          <pre className="relative z-10 text-foreground">{JSON.stringify(event.payload, null, 2)}</pre>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
