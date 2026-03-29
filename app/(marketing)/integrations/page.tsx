"use client";

import { Globe, Shield, Zap, ExternalLink, ArrowUpRight } from 'lucide-react';
import * as motion from 'framer-motion/client';
import { BlurText } from '@/components/blur-text';
import Image from 'next/image';
import Link from 'next/link';

const DOMAINS = [
  { category: "Communication", tools: ["Gmail", "Outlook", "Slack", "WhatsApp", "Telegram", "Discord", "Teams"] },
  { category: "Sales & CRM", tools: ["HubSpot", "Salesforce", "Pipedrive", "Apollo", "LinkedIn", "Calendly"] },
  { category: "Finance", tools: ["Stripe", "Wise", "PayPal", "QuickBooks", "Xero", "FreshBooks"] },
  { category: "Project & Code", tools: ["GitHub", "GitLab", "Jira", "Linear", "Asana", "ClickUp", "Notion"] },
  { category: "Product & Analytics", tools: ["Amplitude", "Mixpanel", "Segment", "PostHog"] },
  { category: "Cloud & Infrastructure", tools: ["AWS", "GCP", "Azure", "Vercel", "Netlify", "Cloudflare", "Datadog", "Sentry"] },
  { category: "Marketing & Content", tools: ["Mailchimp", "ConvertKit", "Klaviyo", "Twitter/X", "LinkedIn"] },
  { category: "Legal & Contracts", tools: ["DocuSign", "PandaDoc"] },
  { category: "Scheduling & Automation", tools: ["QStash", "Upstash Workflow", "Calendly"] },
  { category: "Sandboxes", tools: ["E2B", "Daytona (Live Code Execution)"] }
];

export default function IntegrationsPage() {

  return (
    <div className="w-full relative overflow-visible bg-black selection:bg-primary/20">
      {/* HERO SECTION */}
      <section className="relative w-full min-h-[300px] md:min-h-[500px] py-12 md:py-32 px-4 sm:px-6 flex flex-col items-center justify-center text-center overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0 opacity-20">
           <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_70%)]" />
        </div>
        
        <div className="relative z-10 max-w-4xl mt-6 lg:mt-0">
          <div className="liquid-glass rounded-full px-3 py-1 mb-4 md:mb-6 inline-block">
             <span className="font-body text-[10px] text-white uppercase tracking-widest flex items-center gap-1.5 md:gap-2">
                <Globe className="w-3 h-3" /> 500+ Toolkits
             </span>
          </div>
          <BlurText 
            text="Etles lives where your business already lives."
            className="text-2xl sm:text-4xl md:text-6xl font-heading italic text-white leading-tight tracking-tight md:tracking-[-2px] mb-4 md:mb-6"
          />
          <p className="font-body font-light text-white/60 text-sm md:text-lg max-w-xl mx-auto leading-relaxed mb-6 md:mb-10 px-2">
            1,000+ integrations via Composio. Your agents don't need you to migrate to a new tool — they come to yours.
          </p>
        </div>
      </section>

      {/* CATALOG SECTION */}
      <section className="py-10 md:py-20 px-4 sm:px-6 md:px-16 lg:px-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-16 md:mb-24">
          {DOMAINS.map((domain) => (
            <div key={domain.category} className="liquid-glass rounded-2xl md:rounded-[32px] p-5 md:p-8 border border-white/5 shadow-xl md:shadow-2xl">
              <h3 className="text-lg md:text-xl font-heading italic text-white mb-4 md:mb-6 tracking-tight">{domain.category}</h3>
              <ul className="flex flex-col gap-2 md:gap-3">
                {domain.tools.map((tool) => (
                  <li key={tool} className="text-white/60 font-body text-xs md:text-sm flex items-center gap-2.5">
                     <Globe className="w-3 h-3 md:w-4 md:h-4 text-white/20" /> {tool}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* UNIVERSAL CONNECTOR CALLOUT */}
        <div className="mt-10 md:mt-16 text-center max-w-3xl mx-auto liquid-glass p-8 md:p-12 rounded-3xl md:rounded-[40px] border border-white/5">
           <h3 className="text-xl md:text-3xl font-heading italic text-white mb-3 md:mb-6">Don't see your tool?</h3>
           <p className="font-body text-white/60 mb-6 md:mb-8 text-sm md:text-base">
              Etles uses Composio's universal connector layer. If it has an API, your agents can use it.
           </p>
           <Link 
             href="mailto:request@etles.com" 
             className="text-primary hover:text-white transition-colors font-body font-bold text-sm border-b border-primary hover:border-white pb-1"
           >
             Request an integration →
           </Link>
        </div>

        {/* SECURITY REASSURANCE */}
        <div className="mt-16 md:mt-32 p-6 md:p-12 lg:p-16 rounded-[32px] lg:rounded-[48px] border border-white/5 relative overflow-hidden">
           <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div>
                 <h2 className="text-2xl md:text-4xl font-heading italic text-white mb-4 md:mb-6">Managed OAuth 2.0 Security</h2>
                 <p className="font-body font-light text-white/50 text-sm md:text-base leading-relaxed mb-6 md:mb-8">
                   Every connection is isolated and secured. We handle the complex handshake, refreshing, and token storage so you can focus on building intelligence.
                 </p>
                 <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-2 md:gap-3">
                       <Shield className="w-4 h-4 md:w-5 md:h-5 text-white/40" />
                       <span className="text-xs md:text-sm text-white/60 font-medium">Enterprise Grade</span>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                       <Zap className="w-4 h-4 md:w-5 md:h-5 text-white/40" />
                       <span className="text-xs md:text-sm text-white/60 font-medium">Token Refreshing</span>
                    </div>
                 </div>
              </div>
              <div className="flex justify-center lg:justify-end mt-4 lg:mt-0">
                 <div className="liquid-glass p-5 md:p-8 rounded-2xl md:rounded-3xl border border-white/10 max-w-sm w-full">
                    <pre className="text-[10px] md:text-xs font-mono text-white/40 overflow-hidden">
{`{
  "status": "ready",
  "connected": true,
  "toolkit": "github",
  "scope": ["repo", "user"],
  "security": "AES-256-GCM"
}`}
                    </pre>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="py-12 md:py-24 px-4 sm:px-6 flex flex-col items-center justify-center border-t border-white/10 mt-12 md:mt-24">
        <p className="text-sm md:text-xl font-body font-light text-white/60 mb-6 md:mb-10 text-center max-w-2xl">
          Etles doesn't replace your stack. It becomes the intelligence layer that sits above it and operates it on your behalf.
        </p>
        <h2 className="text-2xl md:text-5xl font-heading italic text-white mb-6 md:mb-8 text-center uppercase tracking-tight">Hook it up.</h2>
        <Link 
          href="/chat" 
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(251,191,36,0.2)] h-10 md:h-14 px-6 md:px-10 inline-flex items-center justify-center rounded-full font-body text-sm md:text-lg font-bold hover:scale-[1.02] transition-all gap-2"
        >
          Explore the Full Catalog
          <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" />
        </Link>
      </section>
    </div>
  );
}
