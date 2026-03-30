"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { useState } from "react";
import { useSidebar } from "@/components/ui/sidebar";

export function PwaUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const sidebar = null; // Removed since this is outside SidebarProvider
  const isMobile = false; // We can't rely on useSidebar if we are outside

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if the app is installed (running in standalone mode)
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    setIsStandalone(mediaQuery.matches || (navigator as any).standalone === true);

    mediaQuery.addEventListener("change", (e) => {
      setIsStandalone(e.matches);
    });

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      import("@serwist/window").then(({ Serwist }) => {
        const serwist = new Serwist("/sw.js", {
          scope: "/",
          type: "classic",
        });

        serwist.addEventListener("waiting", () => {
          setUpdateAvailable(true);
        });

        // Expose serwist instance globally so we can trigger the update
        (window as any).__serwist = serwist;

        serwist.register().catch((err) => {
          console.error("Serwist service worker registration failed", err);
        });
      });
    }
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    const serwist = (window as any).__serwist;
    
    // Fallback: forcefully reload the window after 2 seconds no matter what,
    // to prevent infinite "Updating..." state if the controllerchange event fails
    // or if the service worker is stuck.
    const fallbackTimeout = setTimeout(() => {
      window.location.reload();
    }, 2000);

    if (serwist) {
      serwist.messageSW({ type: "SKIP_WAITING" });
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          clearTimeout(fallbackTimeout);
          window.location.reload();
        });
      }
    }
  };

  // Only display if there's an update AND the user has installed the app
  if (!updateAvailable || !isStandalone) return null;

  return (
    <div className="px-2 mt-4 mb-2">
      <button
        onClick={handleUpdate}
        disabled={isUpdating}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-800 dark:bg-zinc-800/50 border border-zinc-700/50 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700/80 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 text-emerald-400 ${isUpdating ? "animate-spin" : ""}`} />
        {isUpdating ? "Updating..." : "Update Available"}
      </button>
    </div>
  );
}
