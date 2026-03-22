import Link from 'next/link';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark relative flex flex-col min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-zinc-800">
      {/* Subtle modern elegant background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-64 bg-primary/10 blur-[100px] pointer-events-none rounded-full" />
      
      <header className="px-6 h-16 flex items-center justify-between border-b border-white/5 shrink-0 z-10 w-full max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Link href="/" className="font-semibold text-lg tracking-tight text-white hover:opacity-80 transition-opacity">Etles</Link>
        </div>
        <nav className="flex items-center gap-6">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Log in</Link>
          <Link href="/register" className="text-sm bg-white text-zinc-950 px-4 py-2 rounded-full font-medium hover:bg-zinc-200 transition-colors">Sign up</Link>
        </nav>
      </header>
      
      <main className="flex-1 flex flex-col z-10 w-full">
        {children}
      </main>
      
      <footer className="py-8 text-center text-sm text-zinc-500 border-t border-white/5 shrink-0 z-10 w-full">
        <p>© 2026 Etles. All rights reserved.</p>
      </footer>
    </div>
  );
}
