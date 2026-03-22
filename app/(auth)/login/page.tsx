"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { type LoginActionState, login } from "../actions";
import Image from "next/image";
import { BlurText } from "@/components/blur-text";
import { ArrowLeft } from "lucide-react";

export default function Page() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    {
      status: "idle",
    }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "failed") {
      toast({
        type: "error",
        description: "Invalid credentials!",
      });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "Failed validating your submission!",
      });
    } else if (state.status === "success") {
      setIsSuccessful(true);
      updateSession();
      router.refresh();
    }
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-black relative overflow-hidden">
      {/* Back button */}
      <Link 
        href="/" 
        className="absolute top-8 left-8 z-20 flex items-center gap-2 text-white/40 hover:text-white transition-colors group"
      >
        <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white/5 transition-all">
          <ArrowLeft size={16} />
        </div>
        <span className="text-[10px] uppercase tracking-widest font-bold">Back to Home</span>
      </Link>

      {/* Background decoration */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px]" />

      <div className="relative z-10 w-full max-w-md px-6 py-12 flex flex-col items-center">
          <Link href="/" className="mb-12 group transition-transform hover:scale-105">
            <Image src="/logo.png" alt="Etles" width={64} height={64} className="drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]" />
          </Link>
          
          <div className="text-center space-y-3 mb-12 w-full">
            <BlurText 
              text="Sign In" 
              className="text-4xl font-heading italic text-white tracking-tight" 
            />
            <p className="text-white/40 font-body text-sm">
              Continue your journey with Etles agents
            </p>
          </div>

          <div className="w-full">
            <AuthForm action={handleSubmit} defaultEmail={email}>
              <SubmitButton isSuccessful={isSuccessful}>Sign In</SubmitButton>
              
              <div className="mt-8 text-center space-y-4">
                <p className="text-white/30 text-xs font-body uppercase tracking-widest font-bold">
                  New to Etles?
                </p>
                <Link
                  className="inline-block liquid-glass-strong px-8 py-3 rounded-full text-white font-body text-sm font-medium hover:bg-white/10 transition-all border border-white/10"
                  href="/register"
                >
                  Create an account
                </Link>
              </div>
            </AuthForm>
          </div>
        
        <p className="mt-8 text-center text-white/20 text-[10px] uppercase tracking-[0.2em] font-bold">
          Secure Agent Orchestration Layer
        </p>
      </div>
    </div>
  );
}
