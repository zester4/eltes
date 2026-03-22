import Link from 'next/link';
import { ArrowUpRight, MessageSquare, ListTodo, CheckCircle2, Repeat } from 'lucide-react';
import * as motion from 'framer-motion/client';
import { BlurText } from '@/components/blur-text';
import Image from 'next/image';

export default function ProcessPage() {
  return (
    <div className="w-full relative overflow-visible bg-background selection:bg-primary/20">
      {/* HERO SECTION */}
      <section className="relative w-full min-h-[500px] py-40 px-6 flex flex-col items-center justify-center text-center">
        <div className="absolute top-[20%] w-[600px] h-[600px] bg-white/[0.02] rounded-full blur-[120px] z-0" />
        
        <div className="relative z-10 max-w-4xl">
          <h1 className="text-6xl md:text-8xl font-heading italic text-white leading-tight tracking-[-4px] mb-8">
            How Etles Thinks.
          </h1>
          <p className="font-body font-light text-white/60 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            The secret to autonomous success isn't just intelligence—it's process. Here's how our agents turn a single sentence into a completed workflow.
          </p>
        </div>
      </section>

      {/* TIMELINE SECTION */}
      <section className="py-24 px-6 md:px-16 lg:px-24">
        <div className="max-w-5xl mx-auto relative">
          {/* Vertical Line */}
          <div className="absolute left-[50%] top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent hidden md:block" />

          <div className="space-y-32">
            
            {/* Step 1 */}
            <div className="relative flex flex-col md:flex-row items-center gap-12 group">
              <div className="flex-1 md:text-right">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-6 group-hover:scale-110 transition-transform">
                  <MessageSquare className="text-white w-6 h-6" />
                </div>
                <h3 className="text-3xl font-heading italic text-white mb-4">1. Natural Language Input</h3>
                <p className="font-body font-light text-white/50 text-lg">
                  You give a command like "If a high-prio bug is open for more than 4 hours, notify the lead on Slack."
                </p>
              </div>
              <div className="w-4 h-4 rounded-full bg-white z-10 shadow-[0_0_20px_rgba(255,255,255,0.5)] hidden md:block" />
              <div className="flex-1" />
            </div>

            {/* Step 2 */}
            <div className="relative flex flex-col md:flex-row-reverse items-center gap-12 group">
              <div className="flex-1 text-left">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-6 group-hover:scale-110 transition-transform">
                  <ListTodo className="text-white w-6 h-6" />
                </div>
                <h3 className="text-3xl font-heading italic text-white mb-4">2. Strategic Planning</h3>
                <p className="font-body font-light text-white/50 text-lg">
                  Etles breaks the goal into tool-specific steps: Query Linear API → Check timestamp → Fetch Lead ID → Send Msg.
                </p>
              </div>
              <div className="w-4 h-4 rounded-full bg-white z-10 shadow-[0_0_20px_rgba(255,255,255,0.5)] hidden md:block" />
              <div className="flex-1" />
            </div>

            {/* Step 3 */}
            <div className="relative flex flex-col md:flex-row items-center gap-12 group">
              <div className="flex-1 md:text-right">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-6 group-hover:scale-110 transition-transform">
                  <Repeat className="text-white w-6 h-6" />
                </div>
                <h3 className="text-3xl font-heading italic text-white mb-4">3. Execution & Loop</h3>
                <p className="font-body font-light text-white/50 text-lg">
                  The agent executes each step. If a tool fails or needs clarification, it self-corrects or asks for permission before proceeding.
                </p>
              </div>
              <div className="w-4 h-4 rounded-full bg-white z-10 shadow-[0_0_20px_rgba(255,255,255,0.5)] hidden md:block" />
              <div className="flex-1" />
            </div>

            {/* Step 4 */}
            <div className="relative flex flex-col md:flex-row-reverse items-center gap-12 group">
              <div className="flex-1 text-left">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-6 group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="text-white w-6 h-6" />
                </div>
                <h3 className="text-3xl font-heading italic text-white mb-4">4. Goal Accomplished</h3>
                <p className="font-body font-light text-white/50 text-lg">
                  Task completed. Etles verifies the outcome and provides a summary receipt of every tool call made.
                </p>
              </div>
              <div className="w-4 h-4 rounded-full bg-white z-10 shadow-[0_0_20px_rgba(255,255,255,0.5)] hidden md:block" />
              <div className="flex-1" />
            </div>

          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="py-32 px-6 flex flex-col items-center justify-center border-t border-white/10 mt-32">
        <h2 className="text-5xl md:text-7xl font-heading italic text-white mb-10 text-center">Process is power.</h2>
        <Link 
          href="/chat" 
          className="liquid-glass-strong h-14 px-10 inline-flex items-center justify-center rounded-full text-white font-body text-lg font-medium hover:bg-white/10 transition-colors gap-2"
        >
          Build a Workflow
          <ArrowUpRight className="w-5 h-5" />
        </Link>
      </section>
    </div>
  );
}
