"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Download } from "lucide-react";

export function PwaUpdater() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // 1. Handle Install Prompt (PWA Installation)
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);

      // Show a premium install toast after a short delay (e.g. 10s into the session)
      setTimeout(() => {
        toast(
          <div className="flex w-full flex-col gap-2">
            <span className="font-semibold text-foreground">
              ✨ Etles is App Ready
            </span>
            <span className="text-sm text-muted-foreground">
              Install Etles as a dedicated app for a faster, immersive
              experience.
            </span>
          </div>,
          {
            duration: 15000,
            icon: <Download className="h-5 w-5 text-amber-500" />,
            action: {
              label: "Install App",
              onClick: async () => {
                if (!e) return;
                const promptEvent = e as any;
                // Show the native install prompt
                promptEvent.prompt();
                // Wait for the user to respond to the prompt
                const { outcome } = await promptEvent.userChoice;
                if (outcome === "accepted") {
                  setDeferredPrompt(null);
                }
              },
            },
          }
        );
      }, 10000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 2. Handle Updates (Serwist Service Worker)
    // Only run if service workers are supported, and in production mode
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

        // Listen for the "waiting" event
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
              duration: Infinity,
              icon: (
                <RefreshCw className="h-5 w-5 text-amber-500 animate-spin-slow" />
              ),
              action: {
                label: "Reload Now",
                onClick: () => {
                  toast.promise(
                    new Promise<void>((resolve) => {
                      serwist.messageSW({ type: "SKIP_WAITING" });
                      if (navigator.serviceWorker.controller) {
                        navigator.serviceWorker.addEventListener(
                          "controllerchange",
                          () => {
                            window.location.reload();
                            resolve();
                          }
                        );
                      } else {
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
            }
          );
        });

        serwist.register().catch((err) => {
          console.error("Serwist service worker registration failed", err);
        });
      });
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, []);

  return null;
}
