import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-white mb-6">
          The autonomous workforce for modern teams
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-light">
          Delegate complex administrative, sales, and operational tasks to a suite of highly-specialized AI sub-agents. 
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <Link 
            href="/chat" 
            className="h-12 px-8 inline-flex items-center justify-center rounded-full bg-white text-zinc-950 font-medium hover:bg-zinc-200 transition-transform hover:scale-105 active:scale-95 w-full sm:w-auto"
          >
            Start Delegating
          </Link>
          <Link 
            href="#features" 
            className="h-12 px-8 inline-flex items-center justify-center rounded-full border border-zinc-800 bg-transparent text-white font-medium hover:bg-zinc-900 transition-transform hover:scale-105 active:scale-95 w-full sm:w-auto"
          >
            Explore Agents
          </Link>
        </div>
      </div>

      <div id="features" className="w-full max-w-6xl mt-40 grid md:grid-cols-3 gap-6 text-left">
        <div className="p-8 rounded-3xl bg-zinc-900/40 border border-white/5 hover:bg-zinc-900/60 transition-colors">
          <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center mb-6">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          </div>
          <h3 className="text-xl font-medium text-white mb-3">16+ Specialized Agents</h3>
          <p className="text-zinc-400 font-light leading-relaxed">Deploy an SDR to book meetings or a Chief of Staff to organize your day. Purpose-built agents designed for real-world impact.</p>
        </div>
        <div className="p-8 rounded-3xl bg-zinc-900/40 border border-white/5 hover:bg-zinc-900/60 transition-colors">
          <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center mb-6">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </div>
          <h3 className="text-xl font-medium text-white mb-3">Deep Integrations</h3>
          <p className="text-zinc-400 font-light leading-relaxed">Connected directly to your SaaS stack. Our agents seamlessly manage Salesforce, Stripe, Jira, and GitHub automatically.</p>
        </div>
        <div className="p-8 rounded-3xl bg-zinc-900/40 border border-white/5 hover:bg-zinc-900/60 transition-colors">
          <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center mb-6">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <h3 className="text-xl font-medium text-white mb-3">Long-term Memory</h3>
          <p className="text-zinc-400 font-light leading-relaxed">No interaction is forgotten. Powered by semantic vector search, your agents evolve and learn from complete historical context.</p>
        </div>
      </div>
    </div>
  );
}
