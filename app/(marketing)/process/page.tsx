import Link from 'next/link';
import { ArrowUpRight, MessageSquare, ListTodo, CheckCircle2, Repeat, ShieldCheck, Database, GitBranch, Key, Activity } from 'lucide-react';
import * as motion from 'framer-motion/client';
import { BlurText } from '@/components/blur-text';
import Image from 'next/image';

export default function ProcessPage() {
  return (
    <div className="w-full relative overflow-visible bg-black selection:bg-primary/20">
      {/* HERO SECTION */}
      <section className="relative w-full min-h-[400px] md:min-h-[500px] py-20 md:py-40 px-6 flex flex-col items-center justify-center text-center">
        <div className="absolute top-[20%] w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-white/[0.02] rounded-full blur-[80px] md:blur-[120px] z-0" />
        
        <div className="relative z-10 max-w-4xl">
          <h1 className="text-4xl sm:text-6xl md:text-8xl font-heading italic text-white leading-tight tracking-[-2px] md:tracking-[-4px] mb-6 md:mb-8">
            From first message to full autonomy in 4 steps.
          </h1>
          <p className="font-body font-light text-white/60 text-base md:text-xl max-w-2xl mx-auto leading-relaxed">
            The secret to autonomous success isn't just intelligence—it's process. Here's how our agents turn a single sentence into a completed workflow.
          </p>
        </div>
      </section>

      {/* TIMELINE SECTION */}
      <section className="py-12 md:py-24 px-6 md:px-16 lg:px-24">
        <div className="max-w-5xl mx-auto relative">
          {/* Vertical Line */}
          <div className="absolute left-[50%] top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent hidden md:block" />

          <div className="space-y-16 md:space-y-32">
            
            <div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-12 group">
              <div className="flex-1 text-center md:text-right">
                <div className="inline-flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl liquid-glass border border-white/10 mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                  <MessageSquare className="text-white w-5 h-5 md:w-6 md:h-6" />
                </div>
                <h3 className="text-2xl md:text-3xl font-heading italic text-white mb-3 md:mb-4">Step 1: Connect</h3>
                <p className="font-body font-light text-white/50 text-base md:text-lg">
                  Link your tools in one session. Gmail, Slack, Stripe, GitHub, HubSpot — whatever your stack looks like. Etles maps your operational surface area and understands what it has to work with. No migration. No rebuilding. Your stack stays exactly as it is.
                </p>
              </div>
              <div className="w-4 h-4 rounded-full bg-white z-10 shadow-[0_0_20px_rgba(255,255,255,0.5)] hidden md:block" />
              <div className="flex-1" />
            </div>

            <div className="relative flex flex-col md:flex-row-reverse items-center gap-8 md:gap-12 group">
              <div className="flex-1 text-center md:text-left">
                <div className="inline-flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl liquid-glass border border-white/10 mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                  <ListTodo className="text-white w-5 h-5 md:w-6 md:h-6" />
                </div>
                <h3 className="text-2xl md:text-3xl font-heading italic text-white mb-3 md:mb-4">Step 2: Onboard Your Context</h3>
                <p className="font-body font-light text-white/50 text-base md:text-lg">
                  A guided setup session where Etles learns who you are, how you work, your tone of voice, your pricing, your team, your customers, your red lines. This isn't a settings form — it's a conversation. Everything you share becomes persistent memory your agents use on every single action.
                </p>
              </div>
              <div className="w-4 h-4 rounded-full bg-white z-10 shadow-[0_0_20px_rgba(255,255,255,0.5)] hidden md:block" />
              <div className="flex-1" />
            </div>

            <div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-12 group">
              <div className="flex-1 text-center md:text-right">
                <div className="inline-flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl liquid-glass border border-white/10 mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                  <Repeat className="text-white w-5 h-5 md:w-6 md:h-6" />
                </div>
                <h3 className="text-2xl md:text-3xl font-heading italic text-white mb-3 md:mb-4">Step 3: Activate Your Agents</h3>
                <p className="font-body font-light text-white/50 text-base md:text-lg">
                  Choose the agents that match your immediate priorities. Your 24/7 Inbox Operator activates first. Then your SDR. Then your Finance Operator. You can run all 20+ simultaneously or phase them in. Each agent starts with a human-approval loop — you see every action before it fires. As you build trust, you unlock autonomous mode.
                </p>
              </div>
              <div className="w-4 h-4 rounded-full bg-white z-10 shadow-[0_0_20px_rgba(255,255,255,0.5)] hidden md:block" />
              <div className="flex-1" />
            </div>

            <div className="relative flex flex-col md:flex-row-reverse items-center gap-8 md:gap-12 group">
              <div className="flex-1 text-center md:text-left">
                <div className="inline-flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl liquid-glass border border-white/10 mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="text-white w-5 h-5 md:w-6 md:h-6" />
                </div>
                <h3 className="text-2xl md:text-3xl font-heading italic text-white mb-3 md:mb-4">Step 4: Watch It Run</h3>
                <p className="font-body font-light text-white/50 text-base md:text-lg">
                  Etles operates continuously. Every morning, your Chief of Staff delivers a brief of what happened overnight and what's already been handled. Every week, the eval team surfaces what improved and what to tune. Over time, you stop managing operations entirely. You make decisions. Etles executes everything else.
                </p>
              </div>
              <div className="w-4 h-4 rounded-full bg-white z-10 shadow-[0_0_20px_rgba(255,255,255,0.5)] hidden md:block" />
              <div className="flex-1" />
            </div>

          </div>
        </div>
      </section>

      {/* THE SPECTRUM OF TRUST */}
      <section className="py-16 md:py-24 px-6 md:px-16 lg:px-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-heading italic text-white mb-6">The Spectrum of Trust</h2>
            <p className="font-body font-light text-white/50 text-base md:text-xl max-w-2xl mx-auto">
              You don't hand over the keys on day one. Etles is designed to earn your trust incrementally.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connecting line for desktop */}
            <div className="absolute top-[3rem] left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent hidden md:block" />

            {/* Level 1 */}
            <div className="liquid-glass rounded-3xl p-8 relative z-10 border border-white/5">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6 border border-white/20">
                <span className="font-heading italic text-white text-xl">L1</span>
              </div>
              <h3 className="text-xl md:text-2xl font-heading italic text-white mb-3">Supervised</h3>
              <p className="font-body font-light text-white/60 text-sm leading-relaxed mb-6">
                Etles drafts responses, builds lists, and stages changes. Nothing executes without your explicit one-click approval in chat.
              </p>
              <div className="bg-black/50 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                 <span className="text-white/40 text-xs font-mono">Status: Awaiting Approval</span>
                 <CheckCircle2 className="w-4 h-4 text-white/20" />
              </div>
            </div>

            {/* Level 2 */}
            <div className="liquid-glass rounded-3xl p-8 relative z-10 border border-primary/20 shadow-[0_0_30px_rgba(251,191,36,0.1)]">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-6 border border-primary/30">
                <span className="font-heading italic text-primary text-xl">L2</span>
              </div>
              <h3 className="text-xl md:text-2xl font-heading italic text-white mb-3">Guardrailed</h3>
              <p className="font-body font-light text-white/60 text-sm leading-relaxed mb-6">
                Etles runs routines autonomously but stops at predefined boundaries—like budget limits, destructive actions, or highly-sensitive clients.
              </p>
              <div className="bg-black/50 border border-primary/20 rounded-xl p-3 flex items-center justify-between">
                 <span className="text-primary/60 text-xs font-mono">Status: Running in bounds</span>
                 <Activity className="w-4 h-4 text-primary/40" />
              </div>
            </div>

            {/* Level 3 */}
            <div className="liquid-glass rounded-3xl p-8 relative z-10 border border-white/5">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6 border border-white/20">
                <span className="font-heading italic text-white text-xl">L3</span>
              </div>
              <h3 className="text-xl md:text-2xl font-heading italic text-white mb-3">Full Autonomy</h3>
              <p className="font-body font-light text-white/60 text-sm leading-relaxed mb-6">
                Total delegation. Etles monitors, decides, and executes end-to-end workflows in the background. You receive an async receipt.
              </p>
                 <div className="bg-black/50 border border-green-500/20 rounded-xl p-3 flex items-center justify-between">
                 <span className="text-green-500/60 text-xs font-mono">Status: Receipt generated</span>
                 <CheckCircle2 className="w-4 h-4 text-green-500/40" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARCHITECTURE DIAGRAM SECTION */}
      <section className="py-16 md:py-32 px-6 md:px-16 lg:px-24 bg-zinc-950/50 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                 <h2 className="text-3xl md:text-5xl font-heading italic text-white mb-6">The Architecture of Execution.</h2>
                 <p className="font-body font-light text-white/50 text-base md:text-lg mb-8">
                   We built Etles on a localized, multi-agent architecture. It doesn't rely on a single massive prompt; it routes tasks to highly specialized sub-systems that focus on one thing perfectly.
                 </p>

                 <div className="space-y-6">
                    <div className="flex gap-4 items-start">
                       <div className="w-10 h-10 rounded-xl liquid-glass flex items-center justify-center shrink-0">
                          <Database className="w-5 h-5 text-white/70" />
                       </div>
                       <div>
                          <h4 className="text-xl font-heading italic text-white mb-2">Vector Memory Layer</h4>
                          <p className="font-body font-light text-white/40 text-sm">Every interaction is embedded and stored. When an agent spins up, it dynamically pulls the exact context needed for the task, bypassing context-window limitations.</p>
                       </div>
                    </div>
                    
                    <div className="flex gap-4 items-start">
                       <div className="w-10 h-10 rounded-xl liquid-glass flex items-center justify-center shrink-0">
                          <GitBranch className="w-5 h-5 text-white/70" />
                       </div>
                       <div>
                          <h4 className="text-xl font-heading italic text-white mb-2">Composio Action Router</h4>
                          <p className="font-body font-light text-white/40 text-sm">Instead of writing precarious HTTP requests, Etles leverages Composio's SDK to guarantee tool execution, handling pagination, rate limits, and schema validation natively.</p>
                       </div>
                    </div>

                    <div className="flex gap-4 items-start">
                       <div className="w-10 h-10 rounded-xl liquid-glass flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-5 h-5 text-white/70" />
                       </div>
                       <div>
                          <h4 className="text-xl font-heading italic text-white mb-2">The Evaluation Node</h4>
                          <p className="font-body font-light text-white/40 text-sm">Before passing data back to you, an internal supervisor node double-checks the output against your strict organizational rules.</p>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Graphical Representation */}
              <div className="relative aspect-square w-full liquid-glass rounded-[40px] border border-white/5 flex items-center justify-center p-8 overflow-hidden group">
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,0.05),transparent_70%)]" />
                 
                 <div className="relative w-full h-full flex flex-col items-center justify-center gap-6">
                    {/* Top Node */}
                    <div className="liquid-glass border border-white/20 p-4 rounded-2xl w-48 text-center relative z-10 hover:border-primary/50 transition-colors">
                       <h5 className="font-heading italic text-white">Input Decoder</h5>
                    </div>

                    <div className="h-8 w-[1px] bg-white/20" />

                    {/* Middle Nodes */}
                    <div className="flex items-center gap-6 relative z-10 w-full justify-center">
                       <div className="liquid-glass border border-white/10 p-4 rounded-2xl w-32 text-center opacity-80 backdrop-blur-md">
                          <span className="font-body text-xs text-white/60 block mb-1">Sub-agent</span>
                          <Database className="w-5 h-5 text-white/40 mx-auto" />
                       </div>
                       <div className="liquid-glass border border-primary/30 shadow-[0_0_20px_rgba(251,191,36,0.1)] p-4 rounded-2xl w-40 text-center">
                          <span className="font-body text-xs text-primary/80 block mb-1">Execution Node</span>
                          <Key className="w-5 h-5 text-primary/80 mx-auto" />
                       </div>
                       <div className="liquid-glass border border-white/10 p-4 rounded-2xl w-32 text-center opacity-80 backdrop-blur-md">
                          <span className="font-body text-xs text-white/60 block mb-1">Sub-agent</span>
                          <ShieldCheck className="w-5 h-5 text-white/40 mx-auto" />
                       </div>
                    </div>

                    <div className="h-8 w-[1px] bg-white/20" />

                    {/* Bottom Node */}
                    <div className="liquid-glass border border-white/20 p-4 rounded-2xl w-48 text-center relative z-10 hover:border-primary/50 transition-colors">
                       <h5 className="font-heading italic text-white">Synthesizer</h5>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="py-16 md:py-32 px-6 flex flex-col items-center justify-center border-t border-white/10 mt-16 md:mt-32">
        <h2 className="text-4xl md:text-7xl font-heading italic text-white mb-8 md:mb-10 text-center">Process is power.</h2>
        <Link 
          href="/chat" 
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_30px_rgba(251,191,36,0.3)] h-12 md:h-14 px-8 md:px-10 inline-flex items-center justify-center rounded-full font-body text-base md:text-lg font-bold hover:scale-[1.05] transition-all gap-2"
        >
          Build a Workflow
          <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" />
        </Link>
      </section>
    </div>
  );
}
