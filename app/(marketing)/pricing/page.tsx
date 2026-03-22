import Link from 'next/link';
import { ArrowUpRight, Check, Zap } from 'lucide-react';
import * as motion from 'framer-motion/client';
import { BlurText } from '@/components/blur-text';

export default function PricingPage() {
  return (
    <div className="w-full relative overflow-visible bg-black selection:bg-white/20">
      {/* HERO SECTION */}
      <section className="relative w-full min-h-[500px] py-32 px-6 flex flex-col items-center justify-center text-center overflow-hidden">
        <div className="relative z-10 max-w-4xl">
          <BlurText 
            text="Investment in Efficiency."
            className="text-6xl md:text-8xl font-heading italic text-white leading-tight tracking-[-4px] mb-8"
          />
          <p className="font-body font-light text-white/60 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            Choose the plan that fits your execution needs. From side-projects to enterprise-grade automation loops.
          </p>
        </div>
      </section>

      {/* PRICING GRID */}
      <section className="py-24 px-6 md:px-16 lg:px-24">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* FREE PLAN */}
          <div className="liquid-glass p-10 rounded-[40px] border border-white/5 flex flex-col items-start hover:bg-white/5 transition-colors">
            <span className="text-white/40 font-body text-xs uppercase tracking-widest mb-6">Discovery</span>
            <h3 className="text-3xl font-heading italic text-white mb-2">Individual</h3>
            <div className="flex items-baseline gap-1 mb-8">
               <span className="text-5xl font-heading italic text-white">$0</span>
               <span className="text-white/40 font-body text-sm">/mo</span>
            </div>
            <ul className="space-y-4 mb-12 w-full">
              {['1 Active Agent', '50 Workflow steps/mo', '700+ Integrations', 'Standard Support'].map(f => (
                <li key={f} className="flex items-center gap-3 text-white/60 font-body text-sm">
                   <Check className="w-4 h-4 text-white/20" /> {f}
                </li>
              ))}
            </ul>
            <Link href="/chat" className="w-full h-14 rounded-2xl border border-white/10 flex items-center justify-center text-white font-body font-medium hover:bg-white/5 transition-colors">
              Get Started
            </Link>
          </div>

          {/* PRO PLAN */}
          <div className="liquid-glass-strong p-10 rounded-[48px] border border-white/20 flex flex-col items-start relative overflow-hidden bg-white/5">
            <div className="absolute top-0 right-0 p-4">
               <div className="bg-white text-black text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-2xl">Popular</div>
            </div>
            
            <span className="text-white/60 font-body text-xs uppercase tracking-widest mb-6">Production</span>
            <h3 className="text-3xl font-heading italic text-white mb-2">Pro Agent</h3>
            <div className="flex items-baseline gap-1 mb-8">
               <span className="text-5xl font-heading italic text-white">$24</span>
               <span className="text-white/40 font-body text-sm">/mo</span>
            </div>
            <ul className="space-y-4 mb-12 w-full">
              {['Unlimited Agents', '10,000 Workflow steps/mo', 'Priority Execution', 'Semantic Memory (Vector)', 'Cron Scheduling'].map(f => (
                <li key={f} className="flex items-center gap-3 text-white font-body text-sm">
                   <Zap className="w-4 h-4 text-white/50" /> {f}
                </li>
              ))}
            </ul>
            <Link href="/chat" className="w-full h-14 rounded-2xl bg-white text-black flex items-center justify-center text-sm font-bold hover:bg-white/90 transition-colors">
               Go Professional
            </Link>
          </div>

          {/* ENTERPRISE PLAN */}
          <div className="liquid-glass p-10 rounded-[40px] border border-white/5 flex flex-col items-start hover:bg-white/5 transition-colors">
            <span className="text-white/40 font-body text-xs uppercase tracking-widest mb-6">Scale</span>
            <h3 className="text-3xl font-heading italic text-white mb-2">Enterprise</h3>
            <div className="flex items-baseline gap-1 mb-8">
               <span className="text-5xl font-heading italic text-white">Custom</span>
            </div>
            <p className="text-white/40 font-body text-sm mb-12">Tailored orchestration for teams with complex security and high-volume needs.</p>
            <ul className="space-y-4 mb-12 w-full">
              {['Unlimited Steps', 'Custom Security Guards', 'Dedicated Infrastructure', 'Premium Support', 'SSO/SAML Integration'].map(f => (
                <li key={f} className="flex items-center gap-3 text-white/60 font-body text-sm">
                   <Check className="w-4 h-4 text-white/20" /> {f}
                </li>
              ))}
            </ul>
            <button className="w-full h-14 rounded-2xl border border-white/10 flex items-center justify-center text-white font-body font-medium hover:bg-white/5 transition-colors">
              Contact Sales
            </button>
          </div>

        </div>
      </section>
    </div>
  );
}
