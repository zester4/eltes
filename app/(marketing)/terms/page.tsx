import { BlurText } from '@/components/blur-text';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="w-full bg-black min-h-screen pt-20 px-6 pb-40 relative">
      <div className="max-w-4xl mx-auto">
        <div className="mb-20">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors group"
          >
            <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white/5 transition-all">
              <ArrowLeft size={16} />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold">Back to Home</span>
          </Link>
        </div>
        <BlurText 
          text="Terms of Service."
          className="text-6xl md:text-8xl font-heading italic text-white leading-tight tracking-[-4px] mb-8"
        />
        <div className="font-body font-light text-white/50 text-lg leading-relaxed space-y-12">
          <div className="space-y-4">
             <p className="text-sm uppercase tracking-widest text-white/30 font-bold">Last Updated: March 22, 2026</p>
             <p>Welcome to Etles. These Terms of Service ("Terms") govern your access to and use of the Etles platform, website, and agent orchestration services (the "Services"). By using our Services, you agree to be bound by these Terms.</p>
          </div>
          
          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">1. Eligibility</h2>
            <p>You must be at least 18 years old or the legal age of majority in your jurisdiction to use our Services. By agreeing to these Terms, you represent and warrant that you are eligible.</p>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">2. User Accounts</h2>
            <p>To access certain features, you must create an account. You represent and warrant that all information you provide is accurate and complete. You are responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account.</p>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">3. Use of AI Agents</h2>
            <div className="space-y-4">
               <h3 className="text-xl font-heading text-white/80">A. Responsibility for Instructions</h3>
               <p>Etles provides autonomous agent technology. You are solely responsible for the instructions, commands, and prompts you provide to your AI agent. We are not responsible for the outcomes of agent actions taken based on your input.</p>
               
               <h3 className="text-xl font-heading text-white/80">B. Tool Integrations</h3>
               <p>Our Services allow integration with third-party software ("Toolkits") via Composio. By connecting a toolkit, you authorize Etles to interact with that software on your behalf. You are responsible for ensuring your use of such toolkits complies with their respective terms of service.</p>

               <h3 className="text-xl font-heading text-white/80">C. Prohibited Conduct</h3>
               <div className="space-y-4">
                  You agree not to use the Services for:
                 <ul className="list-disc pl-6 mt-4 space-y-2">
                    <li>Generating or distributing harmful, illegal, or offensive content.</li>
                    <li>Interfering with or disrupting the integrity or performance of the Services.</li>
                    <li>Attempting to gain unauthorized access to any portion of the Services or related systems.</li>
                    <li>Reverse engineering or attempting to extract the source code of our agent orchestration layer.</li>
                 </ul>
               </div>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">4. Intellectual Property</h2>
            <p>The Services, including all software, design, and proprietary technology, are owned by Etles or its licensors and are protected by intellectual property laws. We grant you a limited, non-exclusive, non-transferable license to use the Services for your personal or internal business purposes under these Terms.</p>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">5. Fees and Payment</h2>
            <p>Certain portions of our Services are offered on a subscription basis. You agree to pay all fees associated with your selected plan. We reserve the right to change our pricing upon notice to you.</p>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">6. Termination</h2>
            <p>We reserve the right to terminate or suspend your access to the Services at our sole discretion, without notice, for conduct that we believe violates these Terms or is harmful to other users or ourselves.</p>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">7. Limitation of Liability</h2>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, ETLES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM (I) YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE SERVICES; (II) ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE SERVICES.</p>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">8. Governing Law</h2>
            <p>These Terms shall be governed by the laws of the Jurisdiction in which Etles is registered, without regard to its conflict of law provisions.</p>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">9. Contact</h2>
            <p>For any questions regarding these Terms, please contact legal@etles.ai.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
