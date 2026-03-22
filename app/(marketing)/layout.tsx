import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark bg-black text-foreground font-body min-h-screen selection:bg-white/20 selection:text-white">

      {/* SECTION 1 — NAVBAR (fixed) */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 py-4 w-full pointer-events-none">
        <div className="liquid-glass rounded-full h-14 px-2 pr-2 pl-4 flex items-center justify-between w-full max-w-5xl pointer-events-auto">
          {/* Left: Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/" className="flex items-center gap-3 active:scale-95 transition-transform" aria-label="Etles Home">
              <div className="h-9 w-9 rounded-xl overflow-hidden border border-white/10 shadow-2xl relative">
                <Image src="/logo.png" alt="Etles" fill priority className="object-cover" />
              </div>
              <span className="font-heading italic text-2xl tracking-tighter text-white">Etles</span>
            </Link>
          </div>

          {/* Center: Links */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className="text-sm font-medium text-white/90 hover:text-white transition-colors">Home</Link>
            <Link href="/features" className="text-sm font-medium text-white/90 hover:text-white transition-colors">Features</Link>
            <Link href="/integrations" className="text-sm font-medium text-white/90 hover:text-white transition-colors">Integrations</Link>
            <Link href="/process" className="text-sm font-medium text-white/90 hover:text-white transition-colors">Process</Link>
            <Link href="/pricing" className="text-sm font-medium text-white/90 hover:text-white transition-colors">Pricing</Link>
          </nav>

          {/* Right: CTA */}
          <div className="flex items-center gap-2 shrink-0">
             <Link href="/login" className="text-sm font-medium text-white/90 hover:text-white transition-colors px-4 hidden sm:block">Log in</Link>
             <Link 
              href="/chat" 
              className="h-10 px-4 inline-flex items-center justify-center rounded-full bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors gap-1.5"
             >
              Get Started
              <ArrowUpRight className="w-4 h-4" />
             </Link>
          </div>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col w-full">
        {children}
      </main>
      
      <footer className="py-24 border-t border-white/5 bg-black relative z-10 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12 mb-20">
          <div className="col-span-2 md:col-span-1">
             <Link href="/" className="flex items-center gap-3 mb-6">
                <Image src="/logo.png" alt="Etles" width={32} height={32} />
                <span className="font-heading italic text-xl text-white">Etles</span>
             </Link>
             <p className="text-white/40 font-body text-sm leading-relaxed max-w-[200px]">
               The autonomous agent orchestration layer for modern teams.
             </p>
          </div>
          
          <div className="flex flex-col gap-4">
             <h4 className="text-white font-body font-bold text-xs uppercase tracking-widest mb-2">Product</h4>
             <Link href="/features" className="text-white/40 hover:text-white transition-colors text-sm font-body">Features</Link>
             <Link href="/integrations" className="text-white/40 hover:text-white transition-colors text-sm font-body">Integrations</Link>
             <Link href="/pricing" className="text-white/40 hover:text-white transition-colors text-sm font-body">Pricing</Link>
          </div>

          <div className="flex flex-col gap-4">
             <h4 className="text-white font-body font-bold text-xs uppercase tracking-widest mb-2">Company</h4>
             <Link href="/process" className="text-white/40 hover:text-white transition-colors text-sm font-body">Process</Link>
             <Link href="/contact" className="text-white/40 hover:text-white transition-colors text-sm font-body">Contact</Link>
             <Link href="https://twitter.com/etlesai" target="_blank" className="text-white/40 hover:text-white transition-colors text-sm font-body">Twitter</Link>
          </div>

          <div className="flex flex-col gap-4">
             <h4 className="text-white font-body font-bold text-xs uppercase tracking-widest mb-2">Legal</h4>
             <Link href="/privacy" className="text-white/40 hover:text-white transition-colors text-sm font-body">Privacy</Link>
             <Link href="/terms" className="text-white/40 hover:text-white transition-colors text-sm font-body">Terms</Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="font-light text-white/30 text-xs">© 2026 Etles. All rights reserved.</p>
          <div className="flex items-center gap-6">
             <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
             <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Systems Operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
