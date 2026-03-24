"use client";

import { useState, useMemo } from 'react';
import { Search, Globe, Shield, Zap, ExternalLink, ArrowUpRight } from 'lucide-react';
import * as motion from 'framer-motion/client';
import { BlurText } from '@/components/blur-text';
import Image from 'next/image';
import Link from 'next/link';

// Mock toolkit data inspired by the internal connections page
const ALL_TOOLKITS = [
  { name: 'Slack', slug: 'slack', category: 'Communication', logo: '/logos/vercel.svg' },
  { name: 'GitHub', slug: 'github', category: 'Development', logo: '/logos/vercel.svg' },
  { name: 'Linear', slug: 'linear', category: 'Project Management', logo: '/logos/linear.svg' },
  { name: 'Stripe', slug: 'stripe', category: 'Finance', logo: '/logos/stripe.svg' },
  { name: 'Notion', slug: 'notion', category: 'Docs', logo: '/logos/notion.svg' },
  { name: 'Figma', slug: 'figma', category: 'Design', logo: '/logos/figma.svg' },
  { name: 'Gmail', slug: 'gmail', category: 'Communication', logo: '/logos/vercel.svg' },
  { name: 'Discord', slug: 'discord', category: 'Communication', logo: '/logos/vercel.svg' },
  { name: 'Salesforce', slug: 'salesforce', category: 'CRM', logo: '/logos/vercel.svg' },
  { name: 'Jira', slug: 'jira', category: 'Devops', logo: '/logos/vercel.svg' },
  { name: 'Airtable', slug: 'airtable', category: 'Database', logo: '/logos/vercel.svg' },
  { name: 'Asana', slug: 'asana', category: 'Project Management', logo: '/logos/vercel.svg' },
  { name: 'Zoom', slug: 'zoom', category: 'Communication', logo: '/logos/vercel.svg' },
  { name: 'Shopify', slug: 'shopify', category: 'E-commerce', logo: '/logos/vercel.svg' },
  { name: 'PostgreSQL', slug: 'postgres', category: 'Database', logo: '/logos/vercel.svg' },
];

export default function IntegrationsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredToolkits = useMemo(() => {
    return ALL_TOOLKITS.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

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
            text="The Connectivity Layer for AI."
            className="text-3xl sm:text-5xl md:text-8xl font-heading italic text-white leading-tight tracking-[-1px] md:tracking-[-4px] mb-6 md:mb-8"
          />
          <p className="font-body font-light text-white/60 text-base md:text-xl max-w-2xl mx-auto leading-relaxed mb-8 md:mb-12">
            Etles leverages Composio's massive toolkit library to give your agent hands-on access to the world's most popular software.
          </p>

          {/* Search Bar inspired by connections/page.tsx */}
          <div className="relative max-w-xl mx-auto w-full group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-white/30 group-focus-within:text-white transition-colors" />
            <input 
              type="text" 
              placeholder="Search across 500+ toolkits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 md:h-16 pl-12 md:pl-14 pr-6 bg-transparent border border-white/10 rounded-xl md:rounded-2xl text-sm md:text-base text-white font-body focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-white/20"
            />
          </div>
        </div>
      </section>

      {/* CATALOG SECTION */}
      <section className="py-16 md:py-24 px-6 md:px-16 lg:px-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
          {filteredToolkits.map((app) => (
            <div 
              key={app.slug} 
              className="liquid-glass group relative overflow-hidden aspect-square rounded-[24px] md:rounded-[32px] p-4 md:p-8 border border-white/5 flex flex-col items-center justify-center text-center hover:border-primary/20 transition-all cursor-pointer"
            >
              <div className="absolute inset-0 bg-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="relative size-10 md:size-16 mb-3 md:mb-6 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                <div className="absolute inset-0 bg-white/5 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <Image 
                  src={app.logo} 
                  alt={app.name} 
                  fill 
                  className="object-contain brightness-0 invert opacity-60 group-hover:opacity-100 transition-opacity" 
                />
              </div>

              <span className="relative z-10 text-white font-body text-sm md:text-lg font-medium tracking-tight truncate w-full px-1 group-hover:text-primary transition-colors">{app.name}</span>
              <span className="relative z-10 text-white/20 font-body text-[8px] md:text-[10px] uppercase tracking-[0.2em] mt-1 md:mt-2 group-hover:text-white/40 transition-colors">{app.category}</span>
              
              <div className="absolute bottom-4 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 hidden md:block">
                 <Zap className="w-4 h-4 text-white/40" />
              </div>
            </div>
          ))}
        </div>

        {filteredToolkits.length === 0 && (
          <div className="py-32 text-center">
             <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/5 border border-white/10 mb-6">
                <Search className="w-8 h-8 text-white/20" />
             </div>
             <h3 className="text-2xl font-heading italic text-white mb-2">No matching toolkits</h3>
             <p className="text-white/40 font-body">Try searching for broader categories or different names.</p>
          </div>
        )}

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
