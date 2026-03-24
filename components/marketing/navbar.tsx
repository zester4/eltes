"use client";

import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

export function Navbar({ user }: { user?: any }) {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Features', href: '/features' },
    { name: 'Integrations', href: '/integrations' },
    { name: 'Process', href: '/process' },
    { name: 'Pricing', href: '/pricing' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 py-3 md:py-4 w-full pointer-events-none">
      <div className="liquid-glass rounded-full h-11 md:h-14 px-1.5 md:px-2 pr-1.5 md:pr-2 pl-3 md:pl-4 flex items-center justify-between w-full max-w-5xl pointer-events-auto">
        {/* Left: Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/" className="flex items-center gap-2 md:gap-3 active:scale-95 transition-transform" aria-label="Etles Home">
            <div className="h-6 w-6 md:h-9 md:w-9 rounded-lg md:rounded-xl overflow-hidden border border-white/10 shadow-2xl relative">
              <Image src="/logo.png" alt="Etles" fill priority className="object-cover" />
            </div>
            <span className="font-heading italic text-lg md:text-2xl tracking-tighter text-white">Etles</span>
          </Link>
        </div>

        {/* Center: Desktop Links */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link 
              key={link.name} 
              href={link.href} 
              className="text-sm font-medium text-white/90 hover:text-white transition-colors"
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Right: CTA & Mobile Menu */}
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {!user ? (
            <>
              <Link href="/login" className="text-xs md:text-sm font-medium text-white/90 hover:text-white transition-colors px-3 hidden sm:block">Log in</Link>
              <Link 
                href="/chat" 
                className="h-7 md:h-10 px-2.5 md:px-4 inline-flex items-center justify-center rounded-full bg-white text-black text-[9px] md:text-sm font-bold md:font-medium hover:bg-zinc-200 transition-colors gap-1 md:gap-1.5"
              >
                Get Started
                <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />
              </Link>
            </>
          ) : (
            <Link 
              href="/chat" 
              className="h-7 md:h-10 px-3 md:px-4 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white text-[9px] md:text-sm font-bold md:font-medium hover:bg-white/10 transition-colors gap-1 md:gap-1.5"
            >
              Chat
              <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />
            </Link>
          )}

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <button className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white active:bg-white/10 transition-colors">
                  <Menu className="w-3.5 h-3.5" />
                </button>
              </SheetTrigger>
              <SheetContent side="top" className="bg-black/95 border-b border-white/10 pt-20 pb-10 flex flex-col items-center gap-6 backdrop-blur-xl">
                 <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                 {navLinks.map((link) => (
                   <Link 
                     key={link.name} 
                     href={link.href} 
                     onClick={() => setIsOpen(false)}
                     className="text-2xl font-heading italic text-white hover:text-white/70 transition-colors"
                   >
                     {link.name}
                   </Link>
                 ))}
                 {!user ? (
                   <>
                     <Link 
                       href="/login" 
                       onClick={() => setIsOpen(false)}
                       className="text-lg font-body font-medium text-white/60 hover:text-white transition-colors pt-4 border-t border-white/5 w-full text-center"
                     >
                       Log in
                     </Link>
                     <Link 
                       href="/chat" 
                       onClick={() => setIsOpen(false)}
                       className="w-full h-14 rounded-2xl bg-white text-black font-body font-bold flex items-center justify-center gap-2 mt-4"
                     >
                       Get Started
                       <ArrowUpRight className="w-5 h-5" />
                     </Link>
                   </>
                 ) : (
                   <Link 
                     href="/chat" 
                     onClick={() => setIsOpen(false)}
                     className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-body font-bold flex items-center justify-center gap-2 mt-4"
                   >
                     Go to Console
                     <ArrowUpRight className="w-5 h-5" />
                   </Link>
                 )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
