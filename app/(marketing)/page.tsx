import Link from 'next/link';
import { ArrowUpRight, Play } from 'lucide-react';
import * as motion from 'framer-motion/client';
import { BlurText } from '@/components/blur-text';
import Image from 'next/image';

export default function LandingPage() {
  return (
    <div className="w-full relative overflow-visible bg-black selection:bg-white/20">

      {/* SECTION 2 — HERO */}
      <section className="relative w-full min-h-[800px] md:h-[1000px] overflow-hidden bg-black flex flex-col items-center justify-start pt-[100px] md:pt-[150px]">
        {/* Static Background */}
        <div className="absolute inset-0 z-0">
          <Image 
            src="/etles_hero_bg.png" 
            alt="Etles Background" 
            fill 
            priority
            className="object-cover opacity-60 mix-blend-screen"
          />
        </div>
        
        {/* Overlays */}
        <div className="absolute inset-0 bg-black/5 z-[1]" />
        <div className="absolute bottom-0 left-0 right-0 z-[2] h-[300px] bg-gradient-to-b from-transparent to-black" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-5xl mt-20">
          
           {/* Badge Pill */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="liquid-glass rounded-full px-1.5 py-1.5 inline-flex items-center gap-3 mb-8"
          >
            <span className="bg-white text-black font-body text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider">New</span>
            <span className="text-white/80 font-body text-sm pr-2">Introducing Etles AI Agent — connected to 700+ tools.</span>
          </motion.div>

          <BlurText 
             text="The AI Agent Your Workflow Deserves"
             className="text-4xl md:text-7xl lg:text-[5.5rem] font-heading italic text-white leading-[0.9] tracking-[-2px] md:tracking-[-4px] mb-8"
          />

          <motion.p 
            initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="font-body font-light text-white/60 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10"
          >
            Natural language automation. 700+ tool integrations. Real-time event monitoring that actually works. This is AI agents, wildly reimagined.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.1, duration: 0.5, type: "spring" }}
            className="flex flex-col sm:flex-row items-center gap-4"
          >
            <Link 
              href="/chat" 
              className="liquid-glass-strong h-14 px-8 inline-flex items-center justify-center rounded-full text-white font-body font-medium hover:bg-white/10 transition-colors gap-2"
            >
              Get Started
              <ArrowUpRight className="w-4 h-4" />
            </Link>
            
            <button className="h-14 px-8 inline-flex items-center justify-center rounded-full text-white font-body font-medium hover:text-white/70 transition-colors gap-2">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <Play className="w-3.5 h-3.5 fill-white" />
              </div>
              Watch the Demo
            </button>
          </motion.div>
        </div>

        {/* SECTION 3 — PARTNERS BAR (Absolute at bottom of hero) */}
        <div className="relative z-10 mt-auto pb-12 pt-16 flex flex-col items-center w-full max-w-6xl px-4">
           <div className="liquid-glass rounded-full px-4 py-1.5 mb-8">
             <span className="font-body text-xs text-white/60 uppercase tracking-widest">Trusted by the teams behind</span>
           </div>
           
           <div className="flex flex-wrap items-center justify-center gap-12 md:gap-20 opacity-40 hover:opacity-70 transition-opacity duration-700 mix-blend-screen px-4">
              {[
                { name: 'Stripe', path: '/logos/stripe.svg' },
                { name: 'Vercel', path: '/logos/vercel.svg' },
                { name: 'Linear', path: '/logos/linear.svg' },
                { name: 'Notion', path: '/logos/notion.svg' },
                { name: 'Figma', path: '/logos/figma.svg' }
              ].map((logo) => (
                <div key={logo.name} className="h-8 w-32 relative">
                  <Image 
                    src={logo.path} 
                    alt={logo.name} 
                    fill 
                    className="object-contain brightness-0 invert" 
                  />
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* SECTION 4 — HOW IT WORKS */}
      <section id="process" className="relative w-full min-h-[700px] py-32 px-6 md:px-16 lg:px-24 flex flex-col items-center justify-center">
        {/* We'll use the black background here for now */}
        <div className="absolute top-0 left-0 right-0 h-[200px] bg-gradient-to-b from-black to-transparent z-[1]" />
        <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-black to-transparent z-[1]" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto min-h-[500px] justify-center">
           <div className="liquid-glass rounded-full px-4 py-1.5 mb-8">
             <span className="font-body text-xs text-white uppercase tracking-widest">How It Works</span>
           </div>
           
           <h2 className="text-3xl md:text-5xl lg:text-6xl font-heading italic text-white mb-6 leading-[1.1] md:leading-[0.9] tracking-tight">
             You describe it. We automate it.
           </h2>
           
           <p className="font-body font-light text-white/60 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
             Tell Etles what you need in natural language. Our AI connects 700+ tools, builds workflows, monitors every event, and executes — all in minutes, not months.
           </p>
           
           <Link 
              href="/chat" 
              className="liquid-glass-strong h-14 px-8 inline-flex items-center justify-center rounded-full text-white font-body font-medium hover:bg-white/10 transition-colors gap-2"
            >
              Get Started
              <ArrowUpRight className="w-4 h-4" />
            </Link>
        </div>
      </section>

      {/* SECTION 5 — FEATURES CHESS */}
      <section id="features" className="relative w-full py-32 px-6 md:px-16 lg:px-24 max-w-7xl mx-auto flex flex-col items-center">
        <div className="liquid-glass rounded-full px-4 py-1.5 mb-6 text-center">
          <span className="font-body text-xs text-white uppercase tracking-widest">Capabilities</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-heading italic text-white mb-20 text-center">
          Pro features. Zero complexity.
        </h2>

        {/* Row 1 */}
        <div className="flex flex-col lg:flex-row items-center gap-16 mb-32 w-full">
          <div className="flex-1 flex flex-col items-start text-left">
            <h3 className="text-3xl font-heading italic text-white mb-6">Workflow Automation</h3>
            <p className="font-body font-light text-white/60 text-lg leading-relaxed mb-8">
              Etles doesn't just respond to prompts; it plans and executes multi-step workflows across your entire tech stack autonomously.
            </p>
            <Link href="/chat" className="liquid-glass rounded-full px-6 py-3 font-body text-sm font-medium text-white hover:bg-white/5 transition-colors">
              Explore Workflows
            </Link>
          </div>
          <div className="flex-1 w-full">
            <div className="liquid-glass rounded-3xl aspect-video w-full p-2 bg-white/5 overflow-hidden">
              <div className="w-full h-full rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center relative overflow-hidden">
                <Image 
                  src="/etles_dashboard_mockup_1774154912837.png" 
                  alt="Etles Dashboard Mockup" 
                  fill 
                  className="object-cover opacity-80"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Row 2 */}
        <div className="flex flex-col lg:flex-row-reverse items-center gap-16 w-full mb-16">
          <div className="flex-1 flex flex-col items-start text-left">
            <h3 className="text-3xl font-heading italic text-white mb-6">Real-time Event Monitors</h3>
            <p className="font-body font-light text-white/60 text-lg leading-relaxed mb-8">
              Set it and forget it. Etles listens for triggers across 700+ apps. When a high-priority ticket opens in Linear, your agent handles it instantly.
            </p>
            <Link href="/chat" className="liquid-glass rounded-full px-6 py-3 font-body text-sm font-medium text-white hover:bg-white/5 transition-colors">
              View Triggers
            </Link>
          </div>
          <div className="flex-1 w-full">
            <div className="liquid-glass rounded-3xl aspect-video w-full p-2 bg-white/5 overflow-hidden">
              <div className="w-full h-full rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center relative overflow-hidden">
                <Image 
                  src="/etles_triggers_ui_1774154944442.png" 
                  alt="Etles Triggers UI Mockup" 
                  fill 
                  className="object-cover opacity-80"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6 — FEATURES GRID */}
      <section className="relative w-full py-24 px-6 md:px-16 lg:px-24 bg-black flex flex-col items-center">
         <div className="liquid-glass rounded-full px-4 py-1.5 mb-6 text-center">
          <span className="font-body text-xs text-white uppercase tracking-widest">Why Etles</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-heading italic text-white mb-16 text-center">
          The difference is everything.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto w-full">
          {[
            { title: "700+ Integrations", desc: "Composio native integration puts the internet at your command." },
            { title: "Semantic Memory", desc: "Vector database integration means Etles remembers everything." },
            { title: "Cron Scheduling", desc: "Conversational scheduling via Upstash QStash. No crontab required." },
            { title: "Generative UI", desc: "Agents stream custom interactive components directly to your chat." }
          ].map((feature) => (
            <div key={feature.title} className="liquid-glass p-8 rounded-3xl flex flex-col items-start text-left hover:bg-white/5 transition-colors">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-6">
                <div className="w-4 h-4 rounded-full bg-white" />
              </div>
              <h4 className="text-xl font-body font-medium text-white mb-3 tracking-tight">{feature.title}</h4>
              <p className="text-white/50 font-body font-light text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 7 — STATS */}
      <section className="relative w-full min-h-[500px] py-24 px-6 flex items-center justify-center overflow-hidden my-20">
        <div className="absolute inset-0 bg-black/40 z-[1]" />
        
        <div className="relative z-10 w-full max-w-5xl liquid-glass rounded-[32px] md:rounded-[40px] p-8 md:p-20 grid grid-cols-1 md:grid-cols-3 gap-12 text-center bg-black/20 backdrop-blur-3xl">
          {[
            { stat: "700+", label: "Integrated Tools" },
            { stat: "< 2ms", label: "Event Latency" },
            { stat: "16+", label: "Specialized Agents" }
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center">
              <span className="font-heading italic text-6xl md:text-7xl text-white mb-2">{s.stat}</span>
              <span className="font-body font-light text-white/50 text-sm uppercase tracking-widest">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 8 — TESTIMONIALS */}
      <section className="relative w-full py-32 px-6 flex flex-col items-center bg-black">
         <h2 className="text-4xl md:text-5xl font-heading italic text-white mb-20 text-center">
          Trusted by top teams.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto w-full">
           {[
            { quote: "Etles fully replaced our first-line SDRs. The Composio integration let it directly update our Salesforce pipelines while we slept.", author: "Sarah Jenkins", role: "VP Sales" },
            { quote: "The Generative UI combined with autonomous execution means my developers spend zero time building internal dashboards.", author: "Mark Daoust", role: "CTO" },
            { quote: "Being able to say 'schedule a daily summary of high-severity Jira tickets' and have it actually work flawlessly is magic.", author: "Elena Rostova", role: "Product Ops" }
          ].map((t) => (
            <div key={t.author} className="liquid-glass p-8 rounded-3xl flex flex-col justify-between text-left h-full">
               <p className="font-body font-light text-white/80 text-lg leading-relaxed mb-8">"{t.quote}"</p>
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-white/10 shrink-0" />
                 <div className="flex flex-col">
                   <span className="font-body text-white text-sm font-medium">{t.author}</span>
                   <span className="font-body text-white/40 text-xs">{t.role}</span>
                 </div>
               </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 9 — CTA FOOTER */}
      <section className="relative w-full min-h-[600px] flex items-center justify-center overflow-hidden border-t border-white/10 mt-20">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent z-[1]" />
        
        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl">
           <h2 className="text-4xl md:text-7xl font-heading italic text-white mb-6">
            Ready to delegate?
          </h2>
          <p className="font-body font-light text-white/60 text-lg mb-10">
            Join the teams building the next generation of autonomous workflows.
          </p>
          <Link 
            href="/chat" 
            className="liquid-glass-strong h-14 px-10 inline-flex items-center justify-center rounded-full text-white font-body text-lg font-medium hover:bg-white/10 transition-colors gap-2"
          >
            Start for free
            <ArrowUpRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

    </div>
  );
}
