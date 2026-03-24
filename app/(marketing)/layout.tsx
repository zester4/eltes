import Link from 'next/link';
import Image from 'next/image';
import { Navbar } from '@/components/marketing/navbar';
import { auth } from '../(auth)/auth';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  
  return (
    <div className="bg-background text-foreground font-body min-h-screen selection:bg-primary/20">

      {/* SECTION 1 — NAVBAR (client-side with mobile menu) */}
      <Navbar user={session?.user} />
      
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

        </div>
      </footer>
    </div>
  );
}
