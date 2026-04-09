import Link from 'next/link';
import { ArrowUpRight, Cpu, MemoryStick, Zap, Inbox, Target, ShieldAlert, Activity, Repeat, Terminal, Database } from 'lucide-react';
import * as motion from 'framer-motion/client';
import { BlurText } from '@/components/blur-text';
import Image from 'next/image';

const DEPARTMENTS = [
  {
    icon: <Inbox className="w-6 h-6 text-white" />,
    title: "The 24/7 Inbox Operator",
    description: "Never reads your email without taking action. Classifies every message, responds in your voice, routes what needs you, and follows up on silence.",
  },
  {
    icon: <Target className="w-6 h-6 text-white" />,
    title: "The Autonomous SDR",
    description: "Finds your ideal customers, researches them, writes personalized outreach from scratch, handles objections, and drops booked meetings into your calendar.",
  },
  {
    icon: <ShieldAlert className="w-6 h-6 text-white" />,
    title: "The Dead Man's Switch",
    description: "Three days of silence triggers autonomous mode. Etles monitors for true emergencies, sends alerts, and runs core ops for 30 days.",
  },
  {
    icon: <Activity className="w-6 h-6 text-white" />,
    title: "The Self-Improving Eval System",
    description: "Every 24 hours, an agent team reviews every action Etles took — scoring accuracy, flagging failures, and queuing improvements.",
  },
  {
    icon: <Repeat className="w-6 h-6 text-white" />,
    title: "Long-Running Workflows",
    description: "Built on Upstash. Your agents don't time out. A complex mission that requires 47 sequential steps across 6 tools finishes.",
  },
  {
    icon: <Zap className="w-6 h-6 text-white" />,
    title: "Event-Triggered Response",
    description: "An email arrives → the Inbox Operator fires. A payment fails → the Churn Defense activates. Etles lives at the edge of your business.",
  },
  {
    icon: <Terminal className="w-6 h-6 text-white" />,
    title: "Sandboxed Code Execution",
    description: "Agents can write, run, test, and deploy code inside isolated E2B sandboxes. Your Cloud Cost agent terminates idle resources natively.",
  },
  {
    icon: <Database className="w-6 h-6 text-white" />,
    title: "Persistent Vector Memory",
    description: "Etles remembers everything: preferences, quirks, pricing. Every agent queries this memory before acting.",
  }
];

export default function FeaturesPage() {
  return (
    <div className="w-full relative overflow-visible bg-black">
      {/* HERO SECTION */}
      <section className="relative w-full min-h-[300px] md:min-h-[500px] py-10 md:py-24 px-4 sm:px-6 flex flex-col items-center justify-center text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image 
            src="/etles_hero_bg.png" 
            alt="Features Background" 
            fill 
            className="object-cover opacity-40 mix-blend-screen"
          />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[100px] md:h-[200px] bg-gradient-to-b from-transparent to-black z-[1]" />

        <div className="relative z-10 max-w-4xl mt-12 md:mt-0">
          <BlurText 
            text="These aren't features. These are departments."
            className="text-3xl sm:text-5xl md:text-6xl font-heading italic text-white leading-tight tracking-[-1px] md:tracking-[-2px] mb-4 md:mb-6"
          />
          <p className="font-body font-light text-white/60 text-base md:text-xl max-w-2xl mx-auto leading-relaxed">
            Stop buying software features. Start hiring autonomous systems that execute end-to-end objectives.
          </p>
        </div>
      </section>

      {/* DEPARTMENTS SECTION */}
      <section className="py-8 md:py-20 px-4 sm:px-6 md:px-16 lg:px-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {DEPARTMENTS.map((dept, index) => (
            <div key={index} className="liquid-glass group relative overflow-hidden rounded-2xl md:rounded-3xl p-5 md:p-6 flex flex-col items-start text-left border border-white/5 hover:border-primary/20 transition-all shadow-xl">
              <div className="absolute inset-0 bg-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-white/10 flex items-center justify-center mb-4 md:mb-6 relative z-10">
                {dept.icon}
              </div>
              <h3 className="text-lg md:text-xl font-heading italic text-white mb-2 md:mb-3 relative z-10 leading-tight">{dept.title}</h3>
              <p className="font-body font-light text-white/60 text-xs md:text-sm leading-relaxed relative z-10">
                {dept.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CORE CAPABILITIES CHESS */}
      <section className="py-10 md:py-20 px-4 sm:px-6 md:px-16 lg:px-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 gap-12 md:gap-24">
          
          {/* Row 1: Workflow Automation */}
          <div className="flex flex-col lg:flex-row items-center gap-8 md:gap-16">
            <div className="flex-1 flex flex-col items-start text-left">
              <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-2xl bg-white/10 flex items-center justify-center mb-4 md:mb-8">
                <Zap className="text-white w-4 h-4 md:w-6 md:h-6" />
              </div>
              <h2 className="text-2xl md:text-4xl font-heading italic text-white mb-3 md:mb-6">Autonomous Workflow Execution</h2>
              <p className="font-body font-light text-white/60 text-sm md:text-base leading-relaxed mb-4 md:mb-8">
                Etles plans and executes complex, multi-step tasks across over 1000+ tools. It doesn't just suggest actions; it takes them on your behalf safely and efficiently.
              </p>
              <ul className="space-y-2 md:space-y-4 font-body text-white/70 text-xs md:text-sm">
                <li className="flex items-center gap-2 md:gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white" /> Planning & Execution Loops</li>
                <li className="flex items-center gap-2 md:gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white" /> Safe Tool Tool Access via Composio</li>
                <li className="flex items-center gap-2 md:gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white" /> Self-healing & Error Correction</li>
              </ul>
            </div>
            <div className="flex-1 w-full mt-6 lg:mt-0">
               <div className="liquid-glass rounded-3xl md:rounded-[40px] aspect-video w-full p-1.5 md:p-2 overflow-hidden group">
                <div className="w-full h-full rounded-[22px] md:rounded-[32px] bg-zinc-950 border border-white/5 flex items-center justify-center relative overflow-hidden">
                  <Image 
                    src="/dashboard_mockup.png" 
                    alt="Workflows" 
                    fill 
                    className="object-cover opacity-80 group-hover:scale-105 transition-transform duration-1000" 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Semantic Memory */}
          <div className="flex flex-col lg:flex-row-reverse items-center gap-8 md:gap-16">
            <div className="flex-1 flex flex-col items-start text-left">
              <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-2xl bg-white/10 flex items-center justify-center mb-4 md:mb-8">
                <MemoryStick className="text-white w-4 h-4 md:w-6 md:h-6" />
              </div>
              <h2 className="text-2xl md:text-4xl font-heading italic text-white mb-3 md:mb-6">Long-term Semantic Memory</h2>
              <p className="font-body font-light text-white/60 text-sm md:text-base leading-relaxed mb-4 md:mb-8">
                Powered by a vector memory system, Etles learns your preferences, project context, and past interactions to provide truly personalized assistance.
              </p>
              <ul className="space-y-2 md:space-y-4 font-body text-white/70 text-xs md:text-sm">
                <li className="flex items-center gap-2 md:gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white" /> Persistent Project Context</li>
                <li className="flex items-center gap-2 md:gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white" /> Personalized User Profiles</li>
                <li className="flex items-center gap-2 md:gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white" /> Zero-shot Recognition of Repeated Tasks</li>
              </ul>
            </div>
            <div className="flex-1 w-full mt-6 lg:mt-0">
               <div className="liquid-glass rounded-3xl md:rounded-[40px] aspect-video w-full p-1.5 md:p-2 overflow-hidden group">
                <div className="w-full h-full rounded-[22px] md:rounded-[32px] bg-zinc-950 border border-white/5 flex items-center justify-center relative overflow-hidden">
                  <Image 
                    src="/memory_visual.png" 
                    alt="Memory Visual" 
                    fill 
                    className="object-cover opacity-80 group-hover:scale-105 transition-transform duration-1000" 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Generative UI */}
          <div className="flex flex-col lg:flex-row items-center gap-8 md:gap-16">
            <div className="flex-1 flex flex-col items-start text-left">
              <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-2xl bg-white/10 flex items-center justify-center mb-4 md:mb-8">
                <Cpu className="text-white w-4 h-4 md:w-6 md:h-6" />
              </div>
              <h2 className="text-2xl md:text-4xl font-heading italic text-white mb-3 md:mb-6">Generative UI streaming</h2>
              <p className="font-body font-light text-white/60 text-sm md:text-base leading-relaxed mb-4 md:mb-8">
                The agent's output is not limited to text. Etles can stream full interactive components, charts, and dashboards directly into the chat, making information actionable.
              </p>
              <ul className="space-y-2 md:space-y-4 font-body text-white/70 text-xs md:text-sm">
                <li className="flex items-center gap-2 md:gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white" /> Real-time Interactive Artifacts</li>
                <li className="flex items-center gap-2 md:gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white" /> Dynamic Task Management UI</li>
                <li className="flex items-center gap-2 md:gap-3"><div className="w-1.5 h-1.5 rounded-full bg-white" /> Live Event Monitoring Streams</li>
              </ul>
            </div>
            <div className="flex-1 w-full h-[250px] sm:h-[350px] md:h-[400px] mt-6 lg:mt-0">
               <div className="liquid-glass rounded-[40px] h-full w-full p-2 overflow-hidden group">
                <div className="w-full h-full rounded-[32px] bg-zinc-950 border border-white/5 flex items-center justify-center relative overflow-hidden">
                   <Image 
                     src="/generative_ui.png" 
                     alt="Generative UI Mockup" 
                     fill 
                     className="object-cover opacity-80 group-hover:scale-105 transition-transform duration-1000" 
                   />
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="py-12 md:py-24 px-4 sm:px-6 flex flex-col items-center justify-center border-t border-white/10">
        <h2 className="text-2xl md:text-5xl font-heading italic text-white mb-4 md:mb-8 text-center tracking-tight">Unleash your agent.</h2>
        <Link 
          href="/chat" 
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(251,191,36,0.2)] h-10 md:h-14 px-6 md:px-10 inline-flex items-center justify-center rounded-full font-body text-sm md:text-lg font-bold hover:scale-[1.02] transition-all gap-2"
        >
          Start for free
          <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" />
        </Link>
      </section>
    </div>
  );
}
