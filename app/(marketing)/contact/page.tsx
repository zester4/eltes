import Link from 'next/link';
import { Mail, MessageSquare, Twitter, Github } from 'lucide-react';
import { BlurText } from '@/components/blur-text';

export default function ContactPage() {
  return (
    <div className="w-full bg-black min-h-screen pt-24 md:pt-40 px-6">
      <div className="max-w-4xl mx-auto">
        <BlurText 
          text="Get in Touch."
          className="text-4xl sm:text-6xl md:text-8xl font-heading italic text-white leading-tight tracking-[-1px] md:tracking-[-4px] mb-6 md:mb-8"
        />
        <p className="font-body font-light text-white/50 text-base md:text-xl max-w-2xl leading-relaxed mb-10 md:mb-16">
          Whether you're looking to scale your agent infrastructure or just want to say hello, we're here to help.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-16 md:mb-24">
          <div className="liquid-glass p-6 md:p-8 rounded-2xl md:rounded-3xl border border-white/5 group hover:bg-white/5 transition-colors">
            <Mail className="w-5 h-5 text-white/40 mb-4 md:mb-6 group-hover:text-white transition-colors" />
            <h3 className="text-lg md:text-xl font-heading italic text-white mb-2">Email us</h3>
            <p className="text-white/40 font-body mb-4 md:mb-6 text-xs md:text-sm">Our team typically responds within 24 hours.</p>
            <a href="mailto:hello@etles.ai" className="text-white text-sm md:text-base font-medium hover:underline">hello@etles.ai</a>
          </div>
          
          <div className="liquid-glass p-6 md:p-8 rounded-2xl md:rounded-3xl border border-white/5 group hover:bg-white/5 transition-colors">
            <Twitter className="w-5 h-5 text-white/40 mb-4 md:mb-6 group-hover:text-white transition-colors" />
            <h3 className="text-lg md:text-xl font-heading italic text-white mb-2">Follow us</h3>
            <p className="text-white/40 font-body mb-4 md:mb-6 text-xs md:text-sm">Stay updated with the latest agent features.</p>
            <a href="https://twitter.com/etlesai" className="text-white text-sm md:text-base font-medium hover:underline">@etlesai</a>
          </div>
        </div>

        <div className="liquid-glass p-8 md:p-12 rounded-[32px] md:rounded-[48px] border border-white/10 bg-white/[0.02]">
           <h2 className="text-2xl md:text-3xl font-heading italic text-white mb-6 md:mb-8">Send a message</h2>
           <form className="space-y-4 md:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                 <div className="space-y-1 md:space-y-2">
                    <label className="text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-widest pl-1">Name</label>
                    <input type="text" className="w-full h-12 md:h-14 bg-white/5 border border-white/10 rounded-xl md:rounded-2xl px-5 md:px-6 text-sm md:text-white outline-none focus:ring-2 focus:ring-white/20 transition-all text-white" />
                 </div>
                 <div className="space-y-1 md:space-y-2">
                    <label className="text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-widest pl-1">Email</label>
                    <input type="email" className="w-full h-12 md:h-14 bg-white/5 border border-white/10 rounded-xl md:rounded-2xl px-5 md:px-6 text-sm md:text-white outline-none focus:ring-2 focus:ring-white/20 transition-all text-white" />
                 </div>
              </div>
              <div className="space-y-1 md:space-y-2">
                    <label className="text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-widest pl-1">Message</label>
                    <textarea className="w-full min-h-[120px] md:min-h-[160px] bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-5 md:p-6 text-sm md:text-white outline-none focus:ring-2 focus:ring-white/20 transition-all text-white" />
              </div>
              <button disabled className="w-full h-12 md:h-14 bg-white text-black text-xs md:text-sm font-bold uppercase tracking-widest rounded-xl md:rounded-2xl hover:bg-white/90 transition-colors opacity-50 cursor-not-allowed">
                 Coming Soon
              </button>
           </form>
        </div>
      </div>
      <div className="h-40" />
    </div>
  );
}
