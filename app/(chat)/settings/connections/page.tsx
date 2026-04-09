//app/(chat)/settings/connections/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoaderIcon } from "@/components/icons";
import { ArrowLeft, CheckCircle2, ExternalLink, Trash2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SidebarToggle } from "@/components/sidebar-toggle";

type Toolkit = {
  slug: string;
  name: string;
  logo?: string;
  isConnected: boolean;
  connectedAccountId?: string;
};

export default function ConnectionsPage() {
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "connected">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 40;
  const router = useRouter();

  async function fetchConnections() {
    try {
      const res = await fetch("/api/connections", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch connections");
      setToolkits(data.toolkits || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load app connections");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchConnections();
  }, []);

  const filteredToolkits = useMemo(() => {
    return toolkits.filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filter === "all" || t.isConnected;
      return matchesSearch && matchesFilter;
    });
  }, [toolkits, searchQuery, filter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filter]);

  const totalPages = Math.ceil(filteredToolkits.length / ITEMS_PER_PAGE);
  const paginatedToolkits = filteredToolkits.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  async function handleConnect(slug: string) {
    setIsActionLoading(slug);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: slug }),
      });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error(data.error || "No redirect URL received");
      }
    } catch (error: any) {
      toast.error(error.message || `Failed to initiate connection for ${slug}`);
      setIsActionLoading(null);
    }
  }

  async function handleDisconnect(slug: string, connectedAccountId: string) {
    setIsActionLoading(slug);
    try {
      const res = await fetch("/api/connections/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectedAccountId }),
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      toast.success(`Disconnected from ${slug}`);
      await fetchConnections();
    } catch (error: any) {
      toast.error(error.message || `Failed to disconnect from ${slug}`);
    } finally {
      setIsActionLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 md:p-6 max-w-7xl mx-auto w-full min-h-screen bg-background text-foreground">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-3 sm:gap-4"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <SidebarToggle />
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="size-7 sm:size-8 rounded-full hover:bg-muted">
              <ArrowLeft className="size-3.5 sm:size-4" />
            </Button>
            <h1 className="text-[15px] sm:text-[18px] md:text-[22px] font-semibold tracking-tight">Toolkits</h1>
          </div>
          
          <div className="flex items-center gap-1.5 bg-muted/30 p-1 rounded-[10px] w-fit">
            <Button
              variant={filter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter("all")}
              className={cn("h-7 sm:h-8 px-3 rounded-[8px] text-[11px] sm:text-[12px] font-medium transition-all", filter === "all" && "shadow-sm bg-background")}
            >
              All
            </Button>
            <Button
              variant={filter === "connected" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter("connected")}
              className={cn("h-7 sm:h-8 px-3 rounded-[8px] text-[11px] sm:text-[12px] font-medium transition-all", filter === "connected" && "shadow-sm bg-background")}
            >
              Connected
            </Button>
          </div>
        </div>

        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search across 1000+ toolkits..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/50 h-9 sm:h-10 text-[12px] sm:text-[13px] rounded-[12px]"
          />
        </div>
      </motion.div>

      {/* Main Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 sm:py-24 gap-3">
          <div className="animate-spin text-primary">
            <LoaderIcon className="size-8 sm:size-10" />
          </div>
          <p className="text-[11px] sm:text-[13px] text-muted-foreground font-medium">Fetching available toolkits...</p>
        </div>
      ) : (
        <div className="w-full flex-1 flex flex-col space-y-4 sm:space-y-6">
          <motion.div 
            layout
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 lg:gap-4"
          >
            <AnimatePresence mode="popLayout">
              {paginatedToolkits.map((t) => (
                <motion.div
                key={t.slug}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ y: -5 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="group relative overflow-hidden border-border/40 bg-card/40 backdrop-blur-md transition-all hover:border-primary/30 hover:shadow-[0_0_30px_-10px_rgba(var(--primary),0.2)] aspect-square flex flex-col items-center justify-center p-3 sm:p-4 border rounded-2xl">
                  {/* Status/Action Badge in Top Right */}
                  <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10">
                    {t.isConnected ? (
                      <div className="group/status relative">
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-1.5 py-0.5 rounded-[6px] gap-1 font-medium text-[8px] sm:text-[9px] uppercase tracking-wider backdrop-blur-sm">
                          <CheckCircle2 className="size-2.5" />
                          Connected
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute inset-0 opacity-0 group-hover/status:opacity-100 transition-opacity bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-[8px] size-full scale-110"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDisconnect(t.slug, t.connectedAccountId!);
                          }}
                          disabled={isActionLoading === t.slug}
                        >
                          {isActionLoading === t.slug ? <div className="animate-spin"><LoaderIcon className="size-3" /></div> : <Trash2 className="size-3 sm:size-3.5" />}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 text-[8px] sm:text-[9px] uppercase font-semibold tracking-wider px-2 bg-foreground/5 hover:bg-foreground/10 border-none rounded-[6px]"
                        onClick={() => handleConnect(t.slug)}
                        disabled={isActionLoading === t.slug}
                      >
                        {isActionLoading === t.slug ? <div className="animate-spin"><LoaderIcon className="size-3" /></div> : "Connect"}
                      </Button>
                    )}
                  </div>

                  {/* Centered Logo */}
                  <div className="relative size-12 sm:size-16 mb-2 sm:mb-3 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    {/* Background glow effect on focus-hover */}
                    <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {t.logo ? (
                      <img src={t.logo} alt={t.name} className="size-full object-contain relative z-10" />
                    ) : (
                      <div className="size-full bg-muted/50 rounded-2xl flex items-center justify-center relative z-10 border border-border/50">
                        <ExternalLink className="size-5 sm:size-6 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  {/* Centered Title */}
                  <div className="text-center z-10">
                    <h3 className="font-semibold text-[13px] sm:text-[14px] tracking-tight group-hover:text-primary transition-colors">{t.name}</h3>
                  </div>

                  {/* Gradient bottom border effect */}
                  <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </Card>
              </motion.div>
            ))}
            </AnimatePresence>
          </motion.div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 sm:gap-4 py-2 sm:py-4 mt-auto">
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentPage(p => Math.max(1, p - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={currentPage === 1}
                className="rounded-[10px] h-8 sm:h-9 text-[11px] sm:text-[12px] font-medium px-4 transition-all active:scale-[1]"
              >
                Previous
              </Button>
              <div className="w-24 sm:w-32 text-center text-[11px] sm:text-[12px] font-medium text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentPage(p => Math.min(totalPages, p + 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={currentPage === totalPages}
                className="rounded-[10px] h-8 sm:h-9 text-[11px] sm:text-[12px] font-medium px-4 transition-all active:scale-[1]"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredToolkits.length === 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 sm:py-24 text-center gap-4 sm:gap-5"
        >
          <div className="size-14 sm:size-16 rounded-2xl bg-muted/20 flex items-center justify-center border border-border/50">
            <Search className="size-6 sm:size-8 text-muted-foreground/40" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-[16px] sm:text-[18px] font-semibold tracking-tight">No toolkits found</h3>
            <p className="text-[12px] sm:text-[13px] text-muted-foreground max-w-sm mx-auto">
              {searchQuery 
                ? `We couldn't find any results matching "${searchQuery}".`
                : "Your toolkits collection is empty at the moment."}
            </p>
          </div>
          {searchQuery && (
            <Button variant="outline" onClick={() => setSearchQuery("")} className="rounded-[10px] h-8 sm:h-9 px-6 text-[12px] font-medium transition-all active:scale-[1]">
              Clear Search
            </Button>
          )}
        </motion.div>
      )}
    </div>
  );
}

function Badge({ children, variant, className }: { children: React.ReactNode, variant?: string, className?: string }) {
  return (
    <div className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      className
    )}>
      {children}
    </div>
  )
}
