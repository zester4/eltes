import Link from 'next/link';
import { Mail, MessageSquare, Twitter, Github } from 'lucide-react';
import { BlurText } from '@/components/blur-text';

export default function ContactPage() {
  return (
    <div className="w-full bg-black min-h-screen pt-40 px-6">
      <div className="max-w-4xl mx-auto">
        <BlurText 
          text="Get in Touch."
          className="text-6xl md:text-8xl font-heading italic text-white leading-tight tracking-[-4px] mb-8"
        />
        <p className="font-body font-light text-white/50 text-xl max-w-2xl leading-relaxed mb-16">
          Whether you're looking to scale your agent infrastructure or just want to say hello, we're here to help.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
          <div className="liquid-glass p-8 rounded-3xl border border-white/5 group hover:bg-white/5 transition-colors">
            <Mail className="text-white/40 mb-6 group-hover:text-white transition-colors" />
            <h3 className="text-xl font-heading italic text-white mb-2">Email us</h3>
            <p className="text-white/40 font-body mb-6 text-sm">Our team typically responds within 24 hours.</p>
            <a href="mailto:hello@etles.ai" className="text-white font-medium hover:underline">hello@etles.ai</a>
          </div>
          
          <div className="liquid-glass p-8 rounded-3xl border border-white/5 group hover:bg-white/5 transition-colors">
            <Twitter className="text-white/40 mb-6 group-hover:text-white transition-colors" />
            <h3 className="text-xl font-heading italic text-white mb-2">Follow us</h3>
            <p className="text-white/40 font-body mb-6 text-sm">Stay updated with the latest agent features.</p>
            <a href="https://twitter.com/etlesai" className="text-white font-medium hover:underline">@etlesai</a>
          </div>
        </div>

        <div className="liquid-glass p-12 rounded-[48px] border border-white/10 bg-white/[0.02]">
           <h2 className="text-3xl font-heading italic text-white mb-8">Send a message</h2>
           <form className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest pl-1">Name</label>
                    <input type="text" className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-6 text-white outline-none focus:ring-2 focus:ring-white/20 transition-all" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest pl-1">Email</label>
                    <input type="email" className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-6 text-white outline-none focus:ring-2 focus:ring-white/20 transition-all" />
                 </div>
              </div>
              <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest pl-1">Message</label>
                    <textarea className="w-full min-h-[160px] bg-white/5 border border-white/10 rounded-2xl p-6 text-white outline-none focus:ring-2 focus:ring-white/20 transition-all" />
              </div>
              <button disabled className="w-full h-14 bg-white text-black font-bold uppercase tracking-widest rounded-2xl hover:bg-white/90 transition-colors opacity-50 cursor-not-allowed">
                 Coming Soon
              </button>
           </form>
        </div>
      </div>
      <div className="h-40" />
    </div>
  );
}
