"use client";

import { useState } from "react";
import { 
  Github, 
  Mail, 
  Slack, 
  Activity, 
  ChevronDown, 
  ChevronUp, 
  Info,
  Clock,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type EventData = {
  slug: string;
  app?: string;
  summary?: string;
  payload?: any;
  timestamp?: string;
};

export const parseEventMessage = (text: string): EventData | null => {
  if (!text.startsWith("###EVENT_TRIGGERED###")) return null;
  try {
    return JSON.parse(text.replace("###EVENT_TRIGGERED###", ""));
  } catch (e) {
    return null;
  }
};

export const EventCard = ({ event }: { event: EventData }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getAppIcon = (app?: string, size = 20) => {
    switch (app?.toLowerCase()) {
      case "github": return <Github size={size} className="text-zinc-100" />;
      case "slack": return <Slack size={size} className="text-[#E01E5A]" />;
      case "gmail": return <Mail size={size} className="text-[#EA4335]" />;
      default: return <Activity size={size} className="text-primary" />;
    }
  };

  return (
    <div className="not-prose my-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-all hover:bg-white/[0.05]">
      <div 
        className="flex cursor-pointer items-center gap-4 p-4 select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40 shadow-inner group-hover:bg-black/60">
          {getAppIcon(event.app, 20)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-0.5">
            <h4 className="font-bold text-sm tracking-tight text-white/90">
              {event.summary || event.slug}
            </h4>
            <Badge variant="outline" className="w-fit text-[9px] px-1.5 py-0 rounded-md border-white/10 bg-white/5 text-white/60 font-medium tracking-wide font-mono">
              EVENT
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-medium">
            <span className="flex items-center gap-1">
              <Clock size={12} className="opacity-50" />
              {event.timestamp || "Just now"}
            </span>
            <span className="size-1 rounded-full bg-zinc-700" />
            <span className="capitalize">{event.app || "App"} Integration</span>
          </div>
        </div>

        <div className={cn(
          "flex size-7 items-center justify-center rounded-full bg-white/5 text-zinc-500 transition-all",
          isExpanded && "bg-primary/20 text-primary rotate-180"
        )}>
          <ChevronDown size={14} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t border-white/5 bg-black/60"
          >
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500 flex items-center gap-1.5">
                  <Info size={12} />
                  Payload Inspection
                </h5>
                <Badge variant="outline" className="text-[9px] h-5 px-2 bg-white/5 hover:bg-white/10 text-zinc-400 gap-1 opacity-60">
                  <Activity size={10} />
                  Live Data
                </Badge>
              </div>
              <div className="relative rounded-xl border border-white/5 bg-[#080808] p-4 font-mono text-[11px] text-zinc-300 overflow-x-auto shadow-inner custom-scrollbar">
                <pre>{JSON.stringify(event.payload, null, 2)}</pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
