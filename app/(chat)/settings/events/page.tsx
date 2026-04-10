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
  Search,
  X,
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
    | "agentmail"
    | "asana"
    | "box"
    | "confluence"
    | "discord"
    | "fireflies"
    | "github"
    | "gmail"
    | "googlecalendar"
    | "googledocs"
    | "googletasks"
    | "googlesheets"
    | "hubspot"
    | "jira"
    | "linear"
    | "mailchimp"
    | "notion"
    | "outlook"
    | "pipedrive"
    | "salesforce"
    | "slack"
    | "spotify"
    | "stripe"
    | "todoist"
    | "trello"
    | "zendesk"
    | "zoom";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const itemsPerPage = 10;

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
      // Reset to first page when data changes
      setCurrentPage(1);
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
      setSearchQuery("");
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
      agentmail: "/logos/agentmail.jpeg",
      asana: "/logos/asana.svg",
      box: "/logos/box.png",
      confluence: "/logos/confluence.svg",
      discord: "/logos/discord.svg",
      fireflies: "/logos/fireflies.svg",
      github: "/logos/github.svg",
      gmail: "/logos/gmail.svg",
      googlecalendar: "/logos/google-calendar.svg",
      googledocs: "/logos/google-docs.svg",
      googletasks: "/logos/google-task.png",
      googlesheets: "/logos/google-sheets.svg",
      hubspot: "/logos/hubspot.svg",
      jira: "/logos/jira.svg",
      linear: "/logos/linear.svg",
      mailchimp: "/logos/mailchimp.svg",
      notion: "/logos/notion.svg",
      outlook: "/logos/outlook.svg",
      pipedrive: "/logos/pipedrive.png",
      salesforce: "/logos/salesforce.svg",
      slack: "/logos/slack.svg",
      spotify: "/logos/spotify.png",
      stripe: "/logos/stripe.svg",
      todoist: "/logos/todoist.svg",
      trello: "/logos/trello.svg",
      zendesk: "/logos/zendesk.svg",
      zoom: "/logos/zoom.svg",
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

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return eventLogs.slice(start, start + itemsPerPage);
  }, [eventLogs, currentPage]);

  const totalPages = Math.ceil(eventLogs.length / itemsPerPage);

  const filteredTriggers = useMemo(() => {
    if (!searchQuery.trim()) return availableTriggers;
    const query = searchQuery.toLowerCase();
    return availableTriggers.filter(
      (trigger) =>
        trigger.name.toLowerCase().includes(query) ||
        trigger.description.toLowerCase().includes(query) ||
        trigger.app.toLowerCase().includes(query) ||
        trigger.slug.toLowerCase().includes(query)
    );
  }, [availableTriggers, searchQuery]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processed": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "received": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "failed": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6 bg-background">
      <div className="flex flex-col gap-3 sm:gap-4 max-w-7xl mx-auto w-full">
        {/* Header Section */}
        <div className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col space-y-0.5">
            <div className="flex items-center gap-1.5">
              <SidebarToggle />
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.back()} 
                className="size-7 sm:size-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="size-3.5 sm:size-4" />
              </Button>
              <h1 className="text-[15px] sm:text-[18px] md:text-[22px] font-semibold tracking-tight truncate">
                Events
              </h1>
            </div>
            <p className="text-muted-foreground text-[11px] sm:text-[13px] line-clamp-1 ml-9 sm:ml-10">
              Real-time event streams monitoring.
            </p>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (!open) {
              setSelectedTrigger(null);
              setSearchQuery("");
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 rounded-[12px] h-7 sm:h-8 md:h-9 px-2.5 sm:px-3 md:px-4 text-[11px] sm:text-[12px] md:text-[13px] font-medium transition-all active:scale-[1]">
                <Plus className="size-3 sm:size-3.5" />
                <span className="hidden xs:inline">Subscribe</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] xs:max-w-[340px] sm:max-w-[450px] md:max-w-[520px] rounded-2xl bg-card border-border shadow-lg p-4 sm:p-5 md:p-6">
              <DialogHeader>
                <DialogTitle className="text-[16px] sm:text-[18px] font-semibold">Subscribe to Event</DialogTitle>
                <DialogDescription className="text-[12px] sm:text-[13px] text-muted-foreground">
                  Choose a real-time event to watch and configure its parameters.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-2 sm:gap-3 md:gap-4 py-2">
                {!selectedTrigger ? (
                  <>
                    <div className="relative px-0.5 sm:px-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search triggers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 sm:pl-10 pr-8 sm:pr-9 rounded-[12px] sm:rounded-[14px] h-8 sm:h-9 md:h-10 text-[11px] sm:text-[12px] md:text-[13px] bg-muted/50 border-border/50 focus:border-primary/50 focus:bg-background transition-all"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-muted rounded-md"
                        >
                          <X className="size-3.5 sm:size-4" />
                        </button>
                      )}
                    </div>
                    {filteredTriggers.length > 0 && searchQuery && (
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground px-1.5 sm:px-2">
                        Found {filteredTriggers.length} trigger{filteredTriggers.length !== 1 ? "s" : ""}
                      </p>
                    )}
                  </>
                ) : null}
                {!selectedTrigger ? (
                  <div className="grid grid-cols-1 gap-1.5 sm:gap-2 max-h-[280px] xs:max-h-[320px] sm:max-h-[380px] md:max-h-[450px] overflow-y-auto pr-1.5 sm:pr-2 custom-scrollbar">
                    {filteredTriggers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 sm:py-8 gap-2 text-center">
                        <Search className="size-4 sm:size-5 text-muted-foreground/50" />
                        <p className="text-[11px] sm:text-[12px] md:text-[13px] font-medium text-muted-foreground">No triggers found</p>
                        <p className="text-[10px] sm:text-[11px] md:text-[12px] text-muted-foreground/70">Try adjusting your search</p>
                      </div>
                    ) : (
                      filteredTriggers.map((t) => (
                      <button
                        key={t.slug}
                        onClick={() => setSelectedTrigger(t)}
                        className="flex items-center gap-1.5 sm:gap-2.5 p-2 sm:p-2.5 rounded-[12px] sm:rounded-[16px] border border-border/50 bg-muted/30 hover:bg-accent/10 active:bg-accent/20 transition-all text-left group"
                      >
                        <div className="size-7 sm:size-9 md:size-10 rounded-[8px] sm:rounded-[10px] bg-background flex items-center justify-center border border-border shadow-inner shrink-0">
                          {getAppIcon(t.app, 16)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-[11px] sm:text-[12px] md:text-[13px] text-foreground truncate">{t.name}</h4>
                          <p className="text-[10px] sm:text-[11px] md:text-[12px] text-muted-foreground line-clamp-1">{t.description}</p>
                        </div>
                        <ChevronRight className="size-3 sm:size-3.5 md:size-4 text-muted-foreground shrink-0" />
                      </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 sm:space-y-5">
                    <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-2xl bg-muted/30 border border-border/50">
                      <div className="size-8 rounded-[10px] bg-background flex items-center justify-center border border-border">
                        {getAppIcon(selectedTrigger.app, 16)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-[12px] sm:text-[13px] text-foreground truncate">{selectedTrigger.name}</h4>
                        <p className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold">{selectedTrigger.app}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedTrigger(null); setSearchQuery(""); }} className="text-[11px] sm:text-[12px] h-7 sm:h-8 px-2 font-medium">Change</Button>
                    </div>

                    <div className="space-y-3 px-1">
                      {selectedTrigger.configFields.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-5 bg-muted/10 rounded-2xl border border-border/50">
                          <CheckCircle2 className="size-5 text-emerald-500/50" />
                          <p className="text-[12px] sm:text-[13px] font-medium text-muted-foreground">Ready to subscribe, no configuration needed.</p>
                        </div>
                      ) : (
                        selectedTrigger.configFields.map((field) => (
                          <div key={field.name} className="space-y-1.5">
                            <Label htmlFor={field.name} className="text-[12px] sm:text-[13px] font-medium text-foreground/80">
                              {field.label} {field.required && <span className="text-primary">*</span>}
                            </Label>
                            <Input
                              id={field.name}
                              placeholder={field.placeholder || field.description}
                              className="rounded-[12px] h-8 sm:h-9 text-[12px] sm:text-[13px]"
                              onChange={(e) => setTriggerConfig({ ...triggerConfig, [field.name]: e.target.value })}
                            />
                            <p className="text-[11px] sm:text-[12px] text-muted-foreground pl-1">{field.description}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-border sm:space-x-0">
                <Button variant="ghost" onClick={() => { setIsCreateDialogOpen(false); setSelectedTrigger(null); setSearchQuery(""); }} className="h-8 sm:h-9 text-[12px] sm:text-[13px] rounded-[10px] font-medium">Cancel</Button>
                <Button 
                  disabled={!selectedTrigger || isActionLoading === "create"} 
                  onClick={handleCreateTrigger}
                  className="rounded-[10px] h-8 sm:h-9 text-[12px] sm:text-[13px] px-5 font-medium"
                >
                  {isActionLoading === "create" ? <LoaderIcon className="size-3.5 animate-spin" /> : "Subscribe"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start pb-20">
          {/* Active Subscriptions Section */}
          <div className="lg:col-span-4 space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between px-1 sm:px-2">
              <h3 className="font-semibold text-[13px] sm:text-[15px] flex items-center gap-2 text-foreground">
                <Activity className="size-3.5 sm:size-5 text-muted-foreground" />
                Active Triggers
              </h3>
              <Badge variant="secondary" className="rounded-full bg-muted text-muted-foreground border border-border px-1.5 py-0 font-medium text-[10px] sm:text-[11px]">
                {activeTriggers.length}
              </Badge>
            </div>

            {isTriggersLoading ? (
              <div className="flex flex-col items-center justify-center py-6 sm:py-10 gap-2 sm:gap-3 border border-border rounded-2xl bg-muted/30">
                <LoaderIcon className="size-4 sm:size-6 animate-spin text-primary" />
                <p className="text-[10px] sm:text-[12px] font-medium text-muted-foreground">Syncing...</p>
              </div>
            ) : activeTriggers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center border-2 border-dashed rounded-2xl border-border bg-muted/10 gap-2 sm:gap-3 px-4 sm:px-6 relative overflow-hidden group">
                <div className="size-10 sm:size-12 rounded-xl bg-muted/50 flex items-center justify-center border border-border shadow-sm">
                  <Info className="size-5 sm:size-6 text-muted-foreground" />
                </div>
                <div className="relative z-10">
                  <p className="text-[12px] sm:text-[13px] font-semibold text-foreground/80">No active subscriptions</p>
                  <p className="text-[11px] sm:text-[12px] text-muted-foreground mt-0.5 max-w-[200px]">Set up your first trigger to stream events.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-4">
                {activeTriggers.map((t, idx) => {
                  const rawSlug = t.triggerSlug || (t as any).triggerName || (t as any).name || (t as any).id || "";
                  const def = availableTriggers.find(a => a.slug.toLowerCase() === rawSlug.toLowerCase());
                  const displaySlug = def?.name || rawSlug || "Unknown Event";
                  const triggerId = t.triggerId || (t as any).id;
                  
                  return (
                    <div key={triggerId || idx}>
                      <Card className="border-border bg-card shadow-sm hover:bg-muted/50 transition-colors group rounded-2xl relative overflow-hidden">
                        <CardHeader className="p-2 sm:p-3 flex flex-row items-center gap-2 sm:gap-3 space-y-0 text-foreground">
                          <div className="size-7 sm:size-9 rounded-[10px] bg-background flex items-center justify-center border border-border shadow-sm shrink-0">
                            {getAppIcon(def?.app || "", 16)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-[12px] sm:text-[14px] font-semibold truncate text-foreground/90">{displaySlug}</CardTitle>
                            <CardDescription className="text-[10px] sm:text-[12px] truncate text-muted-foreground mt-0 font-normal flex items-center gap-1">
                              <span className="inline-block size-1 rounded-full bg-emerald-500/50" />
                              ID: {triggerId?.slice(0, 8) ?? "N/A"}
                            </CardDescription>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 sm:size-8 rounded-[10px] text-zinc-500 hover:text-destructive hover:bg-destructive/15 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                            onClick={() => triggerId && handleDeleteTrigger(triggerId)}
                            disabled={isActionLoading === triggerId}
                          >
                            {isActionLoading === triggerId ? <LoaderIcon className="size-3.5 sm:size-4 animate-spin text-destructive" /> : <Trash2 className="size-3.5" />}
                          </Button>
                        </CardHeader>
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Event Timeline Section */}
          <div className="lg:col-span-8 space-y-3 sm:space-y-4">
             <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 bg-muted/30 border border-border rounded-2xl">
              <h3 className="font-semibold text-[13px] sm:text-[15px] flex items-center gap-2 text-foreground">
                <Clock className="size-3.5 sm:size-4 text-muted-foreground" />
                Live Stream
              </h3>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchEvents(true)} 
                disabled={isRefreshing}
                className="text-[11px] sm:text-[12px] h-7 sm:h-8 px-2 sm:px-3 font-medium gap-1 sm:gap-1.5 border-border bg-muted/50 hover:bg-muted text-muted-foreground rounded-full transition-all"
              >
                <Activity className={cn("size-2.5 sm:size-3", isRefreshing && "animate-spin text-primary")} /> 
                {isRefreshing ? "Sync" : "Refresh"}
              </Button>
            </div>

            <div className="relative">
              {/* Timeline Line */}
              {eventLogs.length > 0 && (
                <div className="absolute left-[19px] sm:left-[29px] top-6 bottom-4 w-px bg-border hidden xs:block" />
              )}

              <div className="space-y-3 sm:space-y-4 relative">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 sm:py-16 gap-3 sm:gap-4 rounded-2xl border border-border bg-muted/30">
                    <LoaderIcon className="size-5 sm:size-6 animate-spin text-primary" />
                    <p className="text-[11px] sm:text-[13px] text-muted-foreground font-medium">Connecting...</p>
                  </div>
                ) : eventLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center bg-muted/10 border border-border rounded-2xl gap-3 sm:gap-4 relative group overflow-hidden">
                    <Calendar className="size-5 sm:size-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    <div className="relative z-10 space-y-1">
                      <h3 className="text-[14px] sm:text-[16px] font-semibold text-foreground/80">Waiting for signals</h3>
                      <p className="text-[12px] sm:text-[13px] font-normal text-muted-foreground max-w-[200px] sm:max-w-sm mx-auto">
                        Real-time events will flow here.
                      </p>
                    </div>
                  </div>
                ) : (
                   <div className="flex flex-col gap-3 sm:gap-5">
                    {paginatedLogs.map((event, idx) => {
                      const rawSlug = event.triggerSlug || "";
                      const triggerDef = availableTriggers.find(a => a.slug.toLowerCase() === rawSlug.toLowerCase());
                      const displaySlug = triggerDef?.name || rawSlug;
                      const isExpanded = expandedEventId === event.id;
                      
                      return (
                        <div
                          key={event.id}
                          className="relative group xs:pl-10 sm:pl-[60px]"
                        >
                          {/* Timeline Dot */}
                          <div className="absolute left-[15px] sm:left-[24px] top-1/2 -translate-y-1/2 size-2 sm:size-2.5 rounded-full bg-background border-2 border-primary z-10 hidden xs:block shadow-sm" />
                          
                          <Card className={cn(
                            "border-border bg-card shadow-sm transition-all hover:bg-muted/30 rounded-2xl overflow-hidden relative",
                            isExpanded && "ring-1 ring-primary/20 bg-muted/50"
                          )}>
                              
                              <div 
                                className="p-2 sm:p-3 flex items-center gap-2 sm:gap-3 cursor-pointer select-none relative z-20"
                                onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                              >
                                <div className="size-8 sm:size-10 rounded-[10px] bg-background border border-border flex items-center justify-center shadow-inner shrink-0">
                                  {getAppIcon(triggerDef?.app || "", 16)}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-col xs:flex-row xs:items-center gap-0.5 sm:gap-2 mb-0.5">
                                    <h4 className="font-medium text-[13px] sm:text-[14px] tracking-tight text-foreground/90 truncate">{displaySlug}</h4>
                                    <Badge className={cn("w-fit font-medium rounded-[6px] text-[9px] sm:text-[10px] px-1.5 py-0 uppercase", getStatusColor(event.status))}>
                                      {event.status}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-wrap items-center font-normal text-[11px] sm:text-[12px] gap-1.5 sm:gap-2 text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock size={10} className="sm:size-3 text-muted-foreground/60" />
                                      {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Calendar size={10} className="sm:size-3 text-muted-foreground/60" />
                                      {new Date(event.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                </div>

                                <div className={cn(
                                  "size-6 sm:size-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground transition-all shrink-0",
                                  isExpanded && "bg-primary/10 text-primary"
                                )}>
                                  {isExpanded ? <ChevronUp size={12} className="sm:size-3.5" /> : <ChevronDown size={12} className="sm:size-3.5" />}
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-border bg-muted/30 relative z-10">
                                    <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <h5 className="text-[10px] sm:text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">Payload Inspection</h5>
                                        </div>
                                        <div className="rounded-[12px] border border-border bg-background p-2 sm:p-3 font-mono text-[10px] sm:text-[12px] text-foreground shadow-inner relative">
                                          <div className="max-h-[300px] sm:max-h-[500px] overflow-y-auto custom-scrollbar overflow-x-hidden">
                                            <pre className="relative z-10 text-foreground whitespace-pre-wrap break-all pr-2">{JSON.stringify(event.payload, null, 2)}</pre>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                </div>
                              )}
                            </Card>
                          </div>
                        );
                      })}

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-2 sm:px-3 py-2 sm:py-3 bg-muted/10 border border-border rounded-2xl mt-2">
                        <p className="text-[11px] sm:text-[12px] font-normal text-muted-foreground">
                          Showing <span className="text-foreground font-semibold">{Math.min(eventLogs.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(eventLogs.length, currentPage * itemsPerPage)}</span> of <span className="text-foreground font-semibold">{eventLogs.length}</span> signals
                        </p>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => prev - 1)}
                            className="h-7 px-2.5 rounded-[10px] text-[11px] sm:text-[12px] font-medium border-border transition-all active:scale-[1] disabled:opacity-50"
                          >
                            Previous
                          </Button>
                          <div className="flex items-center justify-center min-w-[50px] font-medium text-[11px] sm:text-[12px] text-muted-foreground">
                            {currentPage} / {totalPages}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => prev + 1)}
                            className="h-7 px-2.5 rounded-[10px] text-[11px] sm:text-[12px] font-medium border-border transition-all active:scale-[1] disabled:opacity-50"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
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
