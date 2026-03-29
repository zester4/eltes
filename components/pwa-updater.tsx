"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export function PwaUpdater() {
  useEffect(() => {
    // Only run in the browser, if service workers are supported, and in production mode
    // because next.config.ts disables serwist generation in development (causing 404s).
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      // Dynamic import ensures this only runs on the client
      import("@serwist/window").then(({ Serwist }) => {
        const serwist = new Serwist("/sw.js", {
          scope: "/",
          type: "classic",
        });

        // Listen for the "waiting" event, which means a new SW is installed
        // but waiting to take control (because skipWaiting is false).
        serwist.addEventListener("waiting", () => {
          toast(
            <div className="flex w-full flex-col gap-2">
              <span className="font-semibold text-foreground">
                🚀 New Update Available
              </span>
              <span className="text-sm text-muted-foreground">
                We've shipped some fresh improvements. Reload to apply them!
              </span>
            </div>,
            {
              duration: Infinity, // Keep open until acted upon
              onDismiss: () => {},
              action: {
                label: "Reload Now",
                onClick: () => {
                  toast.promise(
                    new Promise<void>((resolve) => {
                      // Post the message to skip waiting phase
                      serwist.messageSW({ type: "SKIP_WAITING" });
                      
                      // Wait specifically for the controlling service worker to change
                      // before reloading, preventing a race condition where the page
                      // reloads before the new worker activates.
                      if (navigator.serviceWorker.controller) {
                        navigator.serviceWorker.addEventListener("controllerchange", () => {
                          window.location.reload();
                          resolve();
                        });
                      } else {
                        // Fallback reload
                        window.location.reload();
                        resolve();
                      }
                    }),
                    {
                      loading: "Applying update...",
                      success: "Update successful!",
                      error: "Failed to update.",
                    }
                  );
                },
              },
              icon: <RefreshCw className="h-5 w-5 text-amber-500 animate-spin-slow" />,
            }
          );
        });

        // Register the service worker
        serwist.register().catch((err) => {
          console.error("Serwist service worker registration failed", err);
        });
      });
    }
  }, []);

  // Doesn't render any DOM footprint initially
  return null;
}
