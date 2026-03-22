//components/bot-integrations-panel.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bot, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const PLATFORMS = [
  { id: "slack", label: "Slack" },
  { id: "discord", label: "Discord" },
  { id: "teams", label: "Microsoft Teams" },
  { id: "gchat", label: "Google Chat" },
  { id: "telegram", label: "Telegram" },
  { id: "github", label: "GitHub" },
  { id: "linear", label: "Linear" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "resend", label: "Resend (Email)" }
];

const PLATFORM_CONFIGS: Record<string, {
  tokenLabel: string;
  tokenPlaceholder: string;
  secretLabel?: string;
  secretPlaceholder?: string;
  extraFields?: { id: string; label: string; placeholder: string }[];
}> = {
  slack: { tokenLabel: "Bot Token", tokenPlaceholder: "xoxb-...", secretLabel: "Signing Secret", secretPlaceholder: "..." },
  discord: { tokenLabel: "Bot Token", tokenPlaceholder: "MT...", secretLabel: "Public Key", secretPlaceholder: "For webhook signature verification" },
  teams: { tokenLabel: "App ID", tokenPlaceholder: "uuid...", secretLabel: "App Password", secretPlaceholder: "Client secret" },
  gchat: { tokenLabel: "Service Account JSON", tokenPlaceholder: '{"type": "service_account", ...}', secretLabel: undefined }, 
  telegram: { tokenLabel: "Bot Token", tokenPlaceholder: "123456:ABC-DEF...", secretLabel: undefined },
  github: { tokenLabel: "App ID", tokenPlaceholder: "12345", secretLabel: "Private Key", secretPlaceholder: "-----BEGIN RSA PRIVATE KEY-----", extraFields: [{ id: "webhookSecret", label: "Webhook Secret", placeholder: "e.g. my-secret" }] },
  linear: { tokenLabel: "API Key", tokenPlaceholder: "lin_api_...", secretLabel: "Webhook Secret", secretPlaceholder: "..." },
  whatsapp: { tokenLabel: "System Access Token", tokenPlaceholder: "EAA...", secretLabel: "Verify Token", secretPlaceholder: "Custom webhook token", extraFields: [{ id: "phoneNumberId", label: "Phone Number ID", placeholder: "123456789" }] },
  resend: { tokenLabel: "API Key", tokenPlaceholder: "re_...", secretLabel: "Webhook Secret", secretPlaceholder: "whsec_...", extraFields: [{ id: "fromAddress", label: "From Address", placeholder: "bot@domain.com" }, { id: "fromName", label: "From Name", placeholder: "Etles AI" }] }
};

function getWebhookUrl(originUrl: string, platform: string, userId: string) {
  // Telegram uses our direct handler — not the Chat SDK webhook router
  if (platform === "telegram") {
    return `${originUrl}/api/telegram/${userId}`;
  }
  return `${originUrl}/api/webhooks/${platform}/${userId}`;
}

export function BotIntegrationsPanel() {
  const { data: session } = useSession();
  const userId = session?.user?.id || "your-user-id";
  
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);

  const [botToken, setBotToken] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/bot-integrations")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setIntegrations(data);
      })
      .catch(() => {});
  }, []);

  const openConfig = (platform: string) => {
    setActivePlatform(platform);
    const existing = integrations.find(i => i.platform === platform);
    setBotToken(existing ? existing.botToken : "");
    setSigningSecret(existing ? existing.signingSecret || "" : "");
    
    // Initialize extra config
    const configData = existing?.extraConfig || {};
    
    // Apply defaults for specific apps if they are completely new
    if (platform === "resend" && !existing) {
       configData.fromAddress = "bot@yourdomain.com";
       configData.fromName = "Etles AI";
    }

    setExtraConfig(configData);
  };

  const handleExtraUpdate = (id: string, value: string) => {
    setExtraConfig(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    if (!activePlatform || !botToken) {
      toast.error("Primary Key/Token is strictly required.");
      return;
    }
    
    // Prevent saving obfuscated dots explicitly
    if (botToken.includes("••••••••") || signingSecret.includes("••••••••") || Object.values(extraConfig).some(val => typeof val === "string" && val.includes("••••••••"))) {
      toast.error("Please insert a completely unmasked secret value before saving.");
      return;
    }

    const payload: any = { platform: activePlatform, botToken, signingSecret, extraConfig };

    const res = await fetch("/api/bot-integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      toast.success(`${activePlatform} live integration bound successfully!`);

      // ─── ADD THIS ───────────────────────────────────────────────────────────
      if (activePlatform === "telegram") {
        // The server already auto-registered the webhook — just confirm
        toast.success("✅ Telegram webhook registered automatically!", {
          description: `Bot is live at /api/telegram/${userId}`,
        });
      }
      // ─── END ADD ────────────────────────────────────────────────────────────

      const updated = await fetch("/api/bot-integrations").then(r => r.json());
      setIntegrations(updated);
      setActivePlatform(null); // Fold the UI
    } else {
      const { error } = await res.json();
      toast.error(error || "Failed to finalize integration.");
    }
  };

  const originUrl = typeof window !== "undefined" ? window.location.origin : "https://etles.app";
  const mapConfig = activePlatform ? PLATFORM_CONFIGS[activePlatform] : null;

  return (
    <div className="rounded-3xl bg-[#030303] border border-white/5 shadow-2xl p-4 sm:p-6 md:p-8 md:col-span-2">
      <div className="flex items-center gap-2 text-zinc-100 font-extrabold mb-6">
        <Bot className="size-5 text-primary" />
        <h3>My Custom Bots</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        {PLATFORMS.map(p => {
          const isConfigured = integrations.some(i => i.platform === p.id);
          return (
            <div 
              key={p.id}
              onClick={() => openConfig(p.id)}
              className={`p-4 rounded-2xl border cursor-pointer hover:bg-white/5 transition-all outline-none ${activePlatform === p.id ? "border-primary/50 bg-primary/10 ring-2 ring-primary/20 shadow-lg" : "border-white/10 bg-[#0a0a0a]"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-300 text-sm tracking-wide">{p.label}</span>
                {isConfigured && <Check className="size-4 text-emerald-500 shrink-0" />}
              </div>
            </div>
          );
        })}
      </div>

      {activePlatform && mapConfig && (
        <div className="p-5 sm:p-6 border border-white/10 rounded-2xl bg-[#0a0a0a] space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-2">
             <h4 className="font-extrabold text-white text-lg tracking-tight capitalize">{activePlatform} Configuration</h4>
          </div>
          
          <div className="space-y-4">
             <div className="space-y-2">
               <Label className="text-zinc-400 font-medium text-xs uppercase tracking-wider">Webhook Target URL</Label>
               <Input
                 readOnly
                 value={getWebhookUrl(originUrl, activePlatform, userId)}
                 className="bg-black/50 font-mono text-xs sm:text-sm text-primary border-primary/20 selection:bg-primary/30"
               />
               <p className="text-[11px] text-zinc-500">
                 {activePlatform === "telegram"
                   ? "This URL is auto-registered with Telegram when you save. No manual setup needed."
                   : `Paste this URL directly into your ${activePlatform} developer configuration dashboard.`}
               </p>
             </div>

             <div className="space-y-2 pt-2 border-t border-white/5">
               <Label className="text-zinc-400 font-medium text-xs uppercase tracking-wider">{mapConfig.tokenLabel}</Label>
               <Input 
                 type="password"
                 value={botToken} 
                 onChange={e => setBotToken(e.target.value)} 
                 placeholder={mapConfig.tokenPlaceholder}
                 className="bg-black/50 text-white" 
               />
             </div>

             {mapConfig.secretLabel && (
                <div className="space-y-2">
                  <Label className="text-zinc-400 font-medium text-xs uppercase tracking-wider">{mapConfig.secretLabel}</Label>
                  <Input 
                    type="password"
                    value={signingSecret} 
                    onChange={e => setSigningSecret(e.target.value)} 
                    placeholder={mapConfig.secretPlaceholder}
                    className="bg-black/50 text-white" 
                  />
                </div>
             )}

             {mapConfig.extraFields && mapConfig.extraFields.length > 0 && (
               <div className={`grid grid-cols-1 ${mapConfig.extraFields.length > 1 ? "sm:grid-cols-2" : ""} gap-4 pt-2 border-t border-white/5`}>
                 {mapConfig.extraFields.map(field => (
                   <div key={field.id} className="space-y-2">
                     <Label className="text-zinc-400 font-medium text-xs uppercase tracking-wider">{field.label}</Label>
                     <Input 
                       value={extraConfig[field.id] || ""} 
                       onChange={e => handleExtraUpdate(field.id, e.target.value)} 
                       className="bg-black/50 text-white"
                       placeholder={field.placeholder} 
                     />
                   </div>
                 ))}
               </div>
             )}

             <Button onClick={handleSave} className="w-full mt-4 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg gap-2 transition-all">
               <Save className="size-4" /> Save Configuration
             </Button>
          </div>
        </div>
      )}
    </div>
  );
}
