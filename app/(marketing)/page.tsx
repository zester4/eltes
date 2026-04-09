import Link from 'next/link';
import { ArrowUpRight, Play } from 'lucide-react';
import * as motion from 'framer-motion/client';
import { BlurText } from '@/components/blur-text';
import Image from 'next/image';

export default function LandingPage() {
  return (
    <div className="w-full relative overflow-visible bg-black selection:bg-white/20">

      {/* SECTION 2 — HERO */}
      <section className="relative w-full min-h-[600px] md:min-h-[800px] lg:h-[1000px] overflow-hidden bg-black flex flex-col items-center justify-start pt-[80px] md:pt-[150px]">
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
            className="liquid-glass rounded-full px-1 py-1 md:px-1.5 md:py-1.5 inline-flex items-center gap-2 md:gap-3 mb-6 md:mb-8 max-w-full overflow-hidden"
          >
            <span className="bg-white text-black font-body text-[8px] md:text-xs font-bold md:font-semibold px-2 md:px-2.5 py-0.5 md:py-1 rounded-full uppercase tracking-wider shrink-0">New</span>
            <span className="text-white/80 font-body text-[10px] md:text-sm pr-2 truncate">Introducing Etles — connected to 1000+ tools.</span>
          </motion.div>

          <BlurText 
             text="The AI Agent Your Workflow Deserves"
             className="text-3xl sm:text-5xl md:text-7xl lg:text-[5.5rem] font-heading italic text-white leading-[1] md:leading-[0.9] tracking-[-1px] md:tracking-[-4px] mb-6 md:mb-8"
          />

          <motion.p 
            initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="font-body font-light text-white/60 text-base md:text-xl max-w-2xl mx-auto leading-relaxed mb-8 md:mb-10"
          >
            Natural language automation. 1000+ tool integrations. Real-time event monitoring that actually works. This is AI agents, wildly reimagined.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.1, duration: 0.5, type: "spring" }}
            className="flex flex-col sm:flex-row items-center gap-4"
          >
            <Link 
              href="/chat" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_25px_rgba(251,191,36,0.3)] h-10 md:h-14 px-8 inline-flex items-center justify-center rounded-full font-body text-xs md:text-base font-bold hover:scale-[1.02] transition-all gap-2 w-full sm:w-auto"
            >
              Get Started
              <ArrowUpRight className="w-4 h-4" />
            </Link>
            
            <button className="h-10 md:h-14 px-6 md:px-8 inline-flex items-center justify-center rounded-full text-white font-body text-xs md:text-base font-medium hover:text-white/70 transition-colors gap-2 w-auto">
              <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <Play className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 fill-white" />
              </div>
              Watch the Demo
            </button>
          </motion.div>
        </div>

        {/* SECTION 3 — PARTNERS BAR (Absolute at bottom of hero) */}
        <div className="relative z-10 mt-auto pb-10 md:pb-12 pt-12 md:pt-16 flex flex-col items-center w-full max-w-6xl px-4">
           <div className="liquid-glass rounded-full px-4 py-1.5 mb-6 md:mb-8">
             <span className="font-body text-[10px] md:text-xs text-white/60 uppercase tracking-widest text-center">Trusted by the teams behind</span>
           </div>
           
           <div className="flex flex-wrap items-center justify-center gap-8 md:gap-20 opacity-40 hover:opacity-70 transition-opacity duration-700 mix-blend-screen px-4">
              {[
                { name: 'Stripe', path: '/logos/stripe.svg' },
                { name: 'Vercel', path: '/logos/vercel.svg' },
                { name: 'Linear', path: '/logos/linear.svg' },
                { name: 'Notion', path: '/logos/notion.svg' },
                { name: 'Figma', path: '/logos/figma.svg' }
              ].map((logo) => (
               <div key={logo.name} className="h-6 md:h-8 w-24 md:w-32 relative">
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
      <section id="process" className="relative w-full py-16 md:py-32 px-6 md:px-16 lg:px-24 flex flex-col items-center justify-center">
        {/* We'll use the black background here for now */}
        <div className="absolute top-0 left-0 right-0 h-[200px] bg-gradient-to-b from-black to-transparent z-[1]" />
        <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-black to-transparent z-[1]" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto min-h-[500px] justify-center">
           <div className="liquid-glass rounded-full px-4 py-1.5 mb-6 md:mb-8">
             <span className="font-body text-[10px] md:text-xs text-white uppercase tracking-widest">How It Works</span>
           </div>
           
           <h2 className="text-2xl md:text-5xl lg:text-6xl font-heading italic text-white mb-4 md:mb-6 leading-[1.2] md:leading-[0.9] tracking-tight">
             You describe it. We automate it.
           </h2>
           
           <p className="font-body font-light text-white/60 text-base md:text-xl max-w-2xl mx-auto leading-relaxed mb-8 md:mb-10">
             Tell Etles what you need in natural language. Our AI connects 1000+ tools, builds workflows, monitors every event, and executes — all in minutes, not months.
           </p>
           
           <Link 
              href="/chat" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(251,191,36,0.2)] h-12 md:h-14 px-8 inline-flex items-center justify-center rounded-full font-body text-sm md:text-base font-bold hover:scale-[1.02] transition-all gap-2"
            >
              Get Started
              <ArrowUpRight className="w-4 h-4" />
            </Link>
        </div>
      </section>

      {/* SECTION 5 — FEATURES CHESS */}
      <section id="features" className="relative w-full py-16 md:py-32 px-6 md:px-16 lg:px-24 max-w-7xl mx-auto flex flex-col items-center">
        <div className="liquid-glass rounded-full px-4 py-1.5 mb-6 text-center">
          <span className="font-body text-[10px] md:text-xs text-white uppercase tracking-widest">Capabilities</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-heading italic text-white mb-12 md:mb-20 text-center">
          Pro features. Zero complexity.
        </h2>

        {/* Row 1 */}
          <div className="flex flex-col lg:flex-row items-center gap-10 md:gap-16 mb-20 md:mb-32 w-full">
          <div className="flex-1 flex flex-col items-start text-left">
            <h3 className="text-2xl md:text-3xl font-heading italic text-white mb-4 md:mb-6">Workflow Automation</h3>
            <p className="font-body font-light text-white/60 text-base md:text-lg leading-relaxed mb-6 md:mb-8">
              Etles doesn't just respond to prompts; it plans and executes multi-step workflows across your entire tech stack autonomously.
            </p>
            <Link href="/chat" className="liquid-glass rounded-full px-5 md:px-6 py-2.5 md:py-3 font-body text-xs md:text-sm font-medium text-white hover:bg-white/5 transition-colors">
              Explore Workflows
            </Link>
          </div>
          <div className="flex-1 w-full">
            <div className="liquid-glass rounded-3xl aspect-video w-full p-2 overflow-hidden">
              <div className="w-full h-full rounded-2xl bg-zinc-950 border border-white/5 flex items-center justify-center relative overflow-hidden group">
                <Image 
                  src="/etles_dashboard_mockup_1774154912837.png" 
                  alt="Etles Dashboard Mockup" 
                  fill 
                  className="object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Row 2 */}
        <div className="flex flex-col lg:flex-row-reverse items-center gap-10 md:gap-16 w-full mb-12 md:mb-16">
          <div className="flex-1 flex flex-col items-start text-left">
            <h3 className="text-2xl md:text-3xl font-heading italic text-white mb-4 md:mb-6">Real-time Event Monitors</h3>
            <p className="font-body font-light text-white/60 text-base md:text-lg leading-relaxed mb-6 md:mb-8">
              Set it and forget it. Etles listens for triggers across 1000+ apps. When a high-priority ticket opens in Linear, your agent handles it instantly.
            </p>
            <Link href="/chat" className="liquid-glass rounded-full px-5 md:px-6 py-2.5 md:py-3 font-body text-xs md:text-sm font-medium text-white hover:bg-white/5 transition-colors">
              View Triggers
            </Link>
          </div>
          <div className="flex-1 w-full">
            <div className="liquid-glass rounded-3xl aspect-video w-full p-2 overflow-hidden">
              <div className="w-full h-full rounded-2xl bg-zinc-950 border border-white/5 flex items-center justify-center relative overflow-hidden group">
                <Image 
                  src="/etles_triggers_ui_1774154944442.png" 
                  alt="Etles Triggers UI Mockup" 
                  fill 
                  className="object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6 — FEATURES GRID */}
      <section className="relative w-full py-16 md:py-24 px-6 md:px-16 lg:px-24 bg-black flex flex-col items-center">
         <div className="liquid-glass rounded-full px-4 py-1.5 mb-6 text-center">
          <span className="font-body text-[10px] md:text-xs text-white uppercase tracking-widest">Why Etles</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-heading italic text-white mb-12 md:mb-16 text-center">
          The difference is everything.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 max-w-7xl mx-auto w-full">
          {[
            { title: "1000+ Integrations", desc: "Composio native integration puts the internet at your command." },
            { title: "Semantic Memory", desc: "Vector database integration means Etles remembers everything." },
            { title: "Cron Scheduling", desc: "Conversational scheduling via Upstash QStash. No crontab required." },
            { title: "Generative UI", desc: "Agents stream custom interactive components directly to your chat." }
          ].map((feature) => (
            <div key={feature.title} className="liquid-glass p-6 md:p-8 rounded-2xl md:rounded-3xl flex flex-col items-start text-left hover:bg-white/5 hover:border-primary/20 transition-all group">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 flex items-center justify-center mb-4 md:mb-6 group-hover:bg-primary/20 transition-colors">
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-white group-hover:bg-primary transition-colors" />
              </div>
              <h4 className="text-lg md:text-xl font-body font-medium text-white mb-2 md:mb-3 tracking-tight group-hover:text-primary transition-colors">{feature.title}</h4>
              <p className="text-white/50 font-body font-light text-xs md:text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 7 — STATS */}
      <section className="relative w-full min-h-[400px] md:min-h-[500px] py-16 md:py-24 px-4 md:px-6 flex items-center justify-center overflow-hidden my-10 md:my-20">
        <div className="absolute inset-0 bg-black/40 z-[1]" />
        
        <div className="relative z-10 w-full max-w-5xl liquid-glass rounded-[24px] md:rounded-[40px] p-8 md:p-20 grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12 text-center">
          {[
            { stat: "1000+", label: "Integrated Tools", color: "from-amber-400 to-amber-600" },
            { stat: "< 2ms", label: "Event Latency", color: "from-blue-400 to-blue-600" },
            { stat: "16+", label: "Specialized Agents", color: "from-emerald-400 to-emerald-600" }
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center group">
              <span className={`font-heading italic text-5xl md:text-7xl mb-1 md:mb-2 bg-gradient-to-r ${s.color} bg-clip-text text-transparent transition-all duration-500 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]`}>{s.stat}</span>
              <span className="font-body font-light text-white/50 text-[10px] md:text-sm uppercase tracking-widest group-hover:text-white/80 transition-colors">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 8 — TESTIMONIALS */}
      <section className="relative w-full py-16 md:py-32 px-6 flex flex-col items-center bg-black">
         <h2 className="text-3xl md:text-5xl font-heading italic text-white mb-12 md:mb-20 text-center">
          Trusted by top teams.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto w-full">
           {[
            { quote: "Etles fully replaced our first-line SDRs. The Composio integration let it directly update our Salesforce pipelines while we slept.", author: "Sarah Jenkins", role: "VP Sales" },
            { quote: "The Generative UI combined with autonomous execution means my developers spend zero time building internal dashboards.", author: "Mark Daoust", role: "CTO" },
            { quote: "Being able to say 'schedule a daily summary of high-severity Jira tickets' and have it actually work flawlessly is magic.", author: "Elena Rostova", role: "Product Ops" }
          ].map((t) => (
            <div key={t.author} className="liquid-glass p-6 md:p-8 rounded-2xl md:rounded-3xl flex flex-col justify-between text-left h-full group hover:border-white/20 transition-all border border-white/5">
               <p className="font-body font-light text-white/80 text-base md:text-lg leading-relaxed mb-6 md:mb-8 transition-colors group-hover:text-white">"{t.quote}"</p>
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 shrink-0 group-hover:bg-primary/20 transition-colors" />
                 <div className="flex flex-col">
                   <span className="font-body text-white text-xs md:text-sm font-medium group-hover:text-primary transition-colors">{t.author}</span>
                   <span className="font-body text-white/40 text-[10px] md:text-xs">{t.role}</span>
                 </div>
               </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 9 — CTA FOOTER */}
      <section className="relative w-full min-h-[400px] md:min-h-[600px] flex items-center justify-center overflow-hidden border-t border-white/10 mt-10 md:mt-20">
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent z-[1]" />
        
        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl">
           <h2 className="text-3xl md:text-7xl font-heading italic text-white mb-6">
            Ready to delegate?
          </h2>
          <p className="font-body font-light text-white/60 text-base md:text-lg mb-8 md:mb-10">
            Join the teams building the next generation of autonomous workflows.
          </p>
          <Link 
            href="/chat" 
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_30px_rgba(251,191,36,0.3)] h-12 md:h-14 px-8 md:px-10 inline-flex items-center justify-center rounded-full font-body text-base md:text-lg font-bold hover:scale-[1.05] transition-all gap-2"
          >
            Start for free
            <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" />
          </Link>
        </div>
      </section>

    </div>
  );
}
