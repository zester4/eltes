"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, User as UserIcon, Mail, Shield, Calendar, Activity } from "lucide-react";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { guestRegex } from "@/lib/constants";
import { BotIntegrationsPanel } from "@/components/bot-integrations-panel";

export default function ProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();

  const user = session?.user;
  const isGuest = guestRegex.test(user?.email ?? "");

  return (
    <div className="flex flex-col gap-8 p-4 md:p-8 max-w-4xl mx-auto w-full min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-primary/30">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <SidebarToggle />
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors">
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">Profile Overview</h1>
          </div>
          <p className="text-zinc-400/80 ml-16 text-sm font-medium">
            Manage your personal settings and account security.
          </p>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative z-10"
      >
        <Card className="border-white/5 bg-white/[0.02] backdrop-blur-3xl overflow-hidden relative shadow-2xl rounded-[2rem]">
          <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent pointer-events-none" />
          
          <CardHeader className="relative pt-12 pb-0 flex flex-col md:flex-row gap-6 items-center md:items-center px-8">
             <div className="relative size-28 rounded-3xl bg-black/60 border border-white/10 shadow-2xl overflow-hidden shrink-0 flex items-center justify-center">
               {user?.email && !isGuest ? (
                 <Image
                   src={`https://avatar.vercel.sh/${user.email}?size=128`}
                   alt="Avatar"
                   fill
                   className="object-cover"
                 />
               ) : (
                 <UserIcon className="size-10 text-zinc-500" />
               )}
             </div>
             <div className="flex-1 text-center md:text-left space-y-2 pb-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <h2 className="text-3xl font-extrabold text-zinc-100">{isGuest ? "Guest User" : user?.name || user?.email?.split('@')[0] || "User"}</h2>
                  <Badge variant="secondary" className={`w-fit mx-auto md:mx-0 px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px] rounded-md border-none ${isGuest ? 'bg-zinc-800 text-zinc-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {isGuest ? "Temporary Account" : "Registered Member"}
                  </Badge>
                </div>
                <p className="text-zinc-400 font-medium flex items-center justify-center md:justify-start gap-2">
                  <Mail className="size-4" />
                  {user?.email || "No email provided"}
                </p>
             </div>
          </CardHeader>

          <CardContent className="p-6 md:p-8 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Account Details Box */}
              <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-5 shadow-inner">
                <div className="flex items-center gap-2 text-zinc-200 font-bold mb-4">
                  <Shield className="size-5 text-primary" />
                  <h3>Account Security</h3>
                </div>
                
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">User ID</p>
                  <p className="font-mono text-[13px] bg-[#0a0a0a] p-2.5 rounded-lg border border-white/5 truncate text-zinc-300">
                    {user?.id || "N/A"}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Authentication Method</p>
                  <p className="text-sm font-medium text-zinc-300">
                    {isGuest ? "Anonymous Storage" : "Credentials / Magic Link"}
                  </p>
                </div>
              </div>

              {/* Activity Stats Box */}
              <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-5 shadow-inner">
                <div className="flex items-center gap-2 text-zinc-200 font-bold mb-4">
                  <Activity className="size-5 text-primary" />
                  <h3>Account Activity</h3>
                </div>
                
                <div className="flex items-center justify-between p-3.5 bg-[#0a0a0a] rounded-xl border border-white/5">
                   <div className="flex items-center gap-3">
                     <Calendar className="size-4 text-zinc-500" />
                     <span className="text-sm font-medium text-zinc-400">Member Since</span>
                   </div>
                   <span className="text-sm font-bold text-zinc-300">Today</span>
                </div>

                 <div className="flex items-center justify-between p-3.5 bg-[#0a0a0a] rounded-xl border border-white/5">
                   <div className="flex items-center gap-3">
                     <Activity className="size-4 text-zinc-500" />
                     <span className="text-sm font-medium text-zinc-400">Status</span>
                   </div>
                   <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-none font-bold uppercase text-[10px] tracking-wider rounded-md">Online</Badge>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <BotIntegrationsPanel />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
