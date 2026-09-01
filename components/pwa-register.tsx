"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker?.register("/sw.js").catch(() => undefined);

    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (!standalone && isIos && !sessionStorage.getItem("etles-pwa-dismissed")) {
      setShowIosHint(true);
    }
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  if (dismissed || (!installEvent && !showIosHint)) return null;

  const dismiss = () => {
    sessionStorage.setItem("etles-pwa-dismissed", "1");
    setDismissed(true);
  };

  return (
    <aside className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border/80 bg-card/95 p-3 shadow-xl backdrop-blur-xl" aria-label="Install Etles">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        {installEvent ? <Download className="size-5" aria-hidden="true" /> : <Share className="size-5" aria-hidden="true" />}
      </div>
      <p className="min-w-0 flex-1 text-sm leading-5">
        {installEvent ? "Install Etles for a faster app-like experience." : "Add Etles to your Home Screen: tap Share, then Add to Home Screen."}
      </p>
      {installEvent && <Button className="min-h-11 shrink-0" onClick={async () => { await installEvent.prompt(); dismiss(); }}>Install</Button>}
      <Button variant="ghost" className="min-h-11 min-w-11 shrink-0 px-2" onClick={dismiss} aria-label="Dismiss install prompt">×</Button>
    </aside>
  );
}
