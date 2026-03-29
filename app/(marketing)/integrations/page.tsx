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
      <section className="relative w-full min-h-[400px] md:min-h-[500px] py-20 md:py-32 px-6 flex flex-col items-center justify-center text-center overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0 opacity-20">
           <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_70%)]" />
        </div>
        
        <div className="relative z-10 max-w-4xl">
          <div className="liquid-glass rounded-full px-4 py-1.5 mb-6 md:mb-8 inline-block">
             <span className="font-body text-[10px] md:text-xs text-white uppercase tracking-widest flex items-center gap-2">
                <Globe className="w-3 h-3" /> 500+ Toolkits Available
             </span>
          </div>
          <BlurText 
            text="Etles lives where your business already lives."
            className="text-3xl sm:text-5xl md:text-7xl font-heading italic text-white leading-tight tracking-[-1px] md:tracking-[-3px] mb-6 md:mb-8"
          />
          <p className="font-body font-light text-white/60 text-base md:text-xl max-w-2xl mx-auto leading-relaxed mb-8 md:mb-12">
            1,000+ integrations via Composio. Your agents don't need you to migrate to a new tool — they come to yours.
          </p>
        </div>
      </section>

      {/* CATALOG SECTION */}
      <section className="py-16 md:py-24 px-6 md:px-16 lg:px-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-24">
          {DOMAINS.map((domain) => (
            <div key={domain.category} className="liquid-glass rounded-[32px] p-8 border border-white/5 shadow-2xl">
              <h3 className="text-xl md:text-2xl font-heading italic text-white mb-6 tracking-tight">{domain.category}</h3>
              <ul className="flex flex-col gap-3">
                {domain.tools.map((tool) => (
                  <li key={tool} className="text-white/60 font-body text-base flex items-center gap-3">
                     <Globe className="w-4 h-4 text-white/20" /> {tool}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* UNIVERSAL CONNECTOR CALLOUT */}
        <div className="mt-16 text-center max-w-3xl mx-auto liquid-glass p-12 rounded-[40px] border border-white/5">
           <h3 className="text-2xl md:text-4xl font-heading italic text-white mb-6">Don't see your tool?</h3>
           <p className="font-body text-white/60 mb-8 text-lg">
              Etles uses Composio's universal connector layer. If it has an API, your agents can use it.
           </p>
           <Link 
             href="mailto:request@etles.com" 
             className="text-primary hover:text-white transition-colors font-body font-bold border-b border-primary hover:border-white pb-1"
           >
             Request an integration →
           </Link>
        </div>

        {/* SECURITY REASSURANCE */}
        <div className="mt-32 p-12 lg:p-16 rounded-[48px] border border-white/5 relative overflow-hidden">
           <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                 <h2 className="text-4xl md:text-5xl font-heading italic text-white mb-6">Managed OAuth 2.0 Security</h2>
                 <p className="font-body font-light text-white/50 text-lg leading-relaxed mb-8">
                   Every connection is isolated and secured. We handle the complex handshake, refreshing, and token storage so you can focus on building intelligence.
                 </p>
                 <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                       <Shield className="w-5 h-5 text-white/40" />
                       <span className="text-sm text-white/60 font-medium">Enterprise Grade</span>
                    </div>
                    <div className="flex items-center gap-3">
                       <Zap className="w-5 h-5 text-white/40" />
                       <span className="text-sm text-white/60 font-medium">Token Refreshing</span>
                    </div>
                 </div>
              </div>
              <div className="flex justify-center lg:justify-end">
                 <div className="liquid-glass p-8 rounded-3xl border border-white/10 max-w-sm w-full">
                    <pre className="text-[10px] font-mono text-white/40 overflow-hidden">
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
      <section className="py-20 md:py-32 px-6 flex flex-col items-center justify-center border-t border-white/10 mt-20 md:mt-32">
        <p className="text-lg md:text-2xl font-body font-light text-white/60 mb-10 text-center max-w-3xl">
          Etles doesn't replace your stack. It becomes the intelligence layer that sits above it and operates it on your behalf.
        </p>
        <h2 className="text-3xl md:text-7xl font-heading italic text-white mb-8 md:mb-10 text-center uppercase tracking-tighter">Hook it up.</h2>
        <Link 
          href="/chat" 
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_30px_rgba(251,191,36,0.3)] h-12 md:h-14 px-8 md:px-10 inline-flex items-center justify-center rounded-full font-body text-base md:text-lg font-bold hover:scale-[1.05] transition-all gap-2"
        >
          Explore the Full Catalog
          <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" />
        </Link>
      </section>
    </div>
  );
}
