import { BlurText } from '@/components/blur-text';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="w-full bg-black min-h-screen pt-10 md:pt-20 px-4 md:px-6 pb-20 md:pb-40 relative">
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
          text="Privacy Policy."
          className="text-3xl sm:text-5xl md:text-8xl font-heading italic text-white leading-tight tracking-[-1px] md:tracking-[-4px] mb-6 md:mb-12"
        />
        <div className="font-body font-light text-white/50 text-base md:text-lg leading-relaxed space-y-6 md:space-y-12">
          <div className="space-y-3 md:space-y-4">
             <p className="text-sm uppercase tracking-widest text-white/30 font-bold">Effective Date: March 22, 2026</p>
             <p>This Privacy Policy describes how Etles ("we," "us," or "our") collects, uses, and shares your personal information when you use our autonomous agent platform and related services (the "Services").</p>
          </div>
          
          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">1. Information We Collect</h2>
            <div className="space-y-4">
               <h3 className="text-xl font-heading text-white/80">A. Personal Information You Provide</h3>
               <div className="space-y-4">
                  We collect information that you provide directly to us, including:
                 <ul className="list-disc pl-6 mt-4 space-y-2">
                    <li>Account Registration: Name, email address, password, and profile information.</li>
                    <li>Communication: Information provided when you contact support or interact with our sales team.</li>
                    <li>Feedback: Survey responses and comments provided about our Services.</li>
                 </ul>
               </div>
               
               <h3 className="text-xl font-heading text-white/80">B. Information Collected Automatically</h3>
               <div className="space-y-4">
                  When you access the Services, we automatically collect certain technical information:
                 <ul className="list-disc pl-6 mt-4 space-y-2">
                    <li>Log Data: IP address, browser type, operating system, and access times.</li>
                    <li>Usage Information: Pages viewed, features used, and interaction with AI agents.</li>
                    <li>Device Data: Hardware model and unique device identifiers.</li>
                 </ul>
               </div>

               <h3 className="text-xl font-heading text-white/80">C. Agent-Specific Context</h3>
               <div className="space-y-4">
                  To provide personalized automation, our agents process:
                 <ul className="list-disc pl-6 mt-4 space-y-2">
                    <li>Workflow metadata: Structure of requested tasks.</li>
                    <li>Semantic Memory: Vectorized context of past interactions for task continuity.</li>
                    <li>Tool integration status: Connection status of third-party toolkits.</li>
                 </ul>
               </div>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">2. How We Use Your Information</h2>
            <div className="space-y-4">
               We use the collected information for purposes including:
              <ul className="list-disc pl-6 mt-4 space-y-2">
                 <li>Providing and maintaining the Services.</li>
                 <li>Personalizing your AI agent's behavior and performance.</li>
                 <li>Facilitating secure connections with external toolkits via Composio.</li>
                 <li>Developing new features and improving system reliability.</li>
                 <li>Communicating important service updates and security alerts.</li>
                 <li>Preventing fraudulent or illegal activities.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">3. Data Sharing and Disclosure</h2>
            <div className="space-y-4">
               We do not sell your personal information. We may share information under the following circumstances:
              <ul className="list-disc pl-6 mt-4 space-y-2">
                 <li>With third-party service providers (e.g., cloud hosting, LLM providers) under strict confidentiality agreements.</li>
                 <li>To comply with legal obligations or protect our rights and property.</li>
                 <li>As part of a business transition (e.g., merger or acquisition).</li>
                 <li>With your explicit consent or at your direction.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">4. Data Security</h2>
            <div className="space-y-4">
               We implement industry-standard security measures to protect your data:
              <ul className="list-disc pl-6 mt-4 space-y-2">
                 <li>Local Processing: Sensitive toolkit credentials (tokens) are managed locally and encrypted with AES-256-GCM.</li>
                 <li>Encryption: All data in transit is protected via TLS.</li>
                 <li>Access Controls: We restrict access to personal data to employees and contractors who need it to fulfill their duties.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">5. Your Choices and Rights</h2>
            <div className="space-y-4">
               Depending on your location, you may have rights under GDPR, CCPA, or similar laws:
              <ul className="list-disc pl-6 mt-4 space-y-2">
                 <li>Access and Correction: Request access to or correction of your personal data.</li>
                 <li>Erasure: Request deletion of your account and all associated semantic memory.</li>
                 <li>Portability: Request a copy of your personal data in a machine-readable format.</li>
                 <li>Revocation: Withdraw consent for specific tool integrations at any time.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">6. Changes to this Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Effective Date."</p>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-heading italic text-white">7. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us at privacy@etles.ai.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
