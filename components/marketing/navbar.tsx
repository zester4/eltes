"use client";

import { ArrowUpRight, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Navbar({ user }: { user?: any }) {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Features", href: "/features" },
    { name: "Integrations", href: "/integrations" },
    { name: "Process", href: "/process" },
    { name: "Pricing", href: "/pricing" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 py-3 md:py-6 w-full pointer-events-none">
      <div className="liquid-glass-strong rounded-full h-12 md:h-16 px-4 md:px-6 flex items-center justify-between w-full max-w-5xl pointer-events-auto shadow-[0_8px_32px_rgba(0,0,0,0.4)] border-white/10">
        {/* Left: Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            aria-label="Etles Home"
            className="flex items-center gap-2 md:gap-3 active:scale-95 transition-transform"
            href="/"
          >
            <div className="h-6 w-6 md:h-9 md:w-9 rounded-lg md:rounded-xl overflow-hidden border border-white/10 shadow-2xl relative">
              <Image
                alt="Etles"
                className="object-cover"
                fill
                priority
                src="/logo.png"
              />
            </div>
            <span className="font-heading italic text-lg md:text-2xl tracking-tighter text-white">
              Etles
            </span>
          </Link>
        </div>

        {/* Center: Desktop Links */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              className="text-sm font-medium text-white/90 hover:text-white transition-colors"
              href={link.href}
              key={link.name}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Right: CTA & Mobile Menu */}
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {user ? (
            <Link
              className="h-7 md:h-10 px-3 md:px-4 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white text-[9px] md:text-sm font-bold md:font-medium hover:bg-white/10 transition-colors gap-1 md:gap-1.5"
              href="/chat"
            >
              Chat
              <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />
            </Link>
          ) : (
            <>
              <Link
                className="text-xs md:text-sm font-medium text-white/90 hover:text-white transition-colors px-3 hidden sm:block"
                href="/login"
              >
                Log in
              </Link>
              <Link
                className="h-7 md:h-10 px-2.5 md:px-4 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] md:text-sm font-bold md:font-medium hover:bg-primary/90 shadow-[0_0_15px_rgba(251,191,36,0.2)] transition-all gap-1 md:gap-1.5 active:scale-95"
                href="/register"
              >
                Get Started
                <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />
              </Link>
            </>
          )}

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <Sheet onOpenChange={setIsOpen} open={isOpen}>
              <SheetTrigger asChild>
                <button className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white active:bg-white/10 transition-colors">
                  <Menu className="w-3.5 h-3.5" />
                </button>
              </SheetTrigger>
              <SheetContent
                className="bg-black/95 border-b border-white/10 pt-20 pb-10 flex flex-col items-center gap-6 backdrop-blur-xl"
                side="top"
              >
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                {navLinks.map((link) => (
                  <Link
                    className="text-2xl font-heading italic text-white hover:text-white/70 transition-colors"
                    href={link.href}
                    key={link.name}
                    onClick={() => setIsOpen(false)}
                  >
                    {link.name}
                  </Link>
                ))}
                {user ? (
                  <Link
                    className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-body font-bold flex items-center justify-center gap-2 mt-4"
                    href="/chat"
                    onClick={() => setIsOpen(false)}
                  >
                    Go to Console
                    <ArrowUpRight className="w-5 h-5" />
                  </Link>
                ) : (
                  <>
                    <Link
                      className="text-lg font-body font-medium text-white/60 hover:text-white transition-colors pt-4 border-t border-white/5 w-full text-center"
                      href="/login"
                      onClick={() => setIsOpen(false)}
                    >
                      Log in
                    </Link>
                    <Link
                      className="w-full h-14 rounded-2xl bg-white text-black font-body font-bold flex items-center justify-center gap-2 mt-4"
                      href="/chat"
                      onClick={() => setIsOpen(false)}
                    >
                      Get Started
                      <ArrowUpRight className="w-5 h-5" />
                    </Link>
                  </>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
