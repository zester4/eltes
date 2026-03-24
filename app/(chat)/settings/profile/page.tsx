"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  User as UserIcon, 
  Mail, 
  Shield, 
  Calendar, 
  Activity, 
  Camera, 
  Hash, 
  ShieldCheck, 
  ChevronRight, 
  Settings 
} from "lucide-react";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
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
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/30">
      {/* Premium Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background z-0 pointer-events-none opacity-60 dark:opacity-40" />
      <div className="absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-primary/10 to-transparent blur-[100px] z-0 pointer-events-none opacity-50 dark:opacity-30 translate-y-[-20%]" />

      <div className="flex flex-col gap-6 p-4 md:p-8 lg:px-12 max-w-4xl mx-auto w-full relative z-10 min-h-screen">
        {/* Header/Nav Section */}
        <motion.header 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 md:p-6 rounded-2xl md:rounded-[2rem] bg-card/60 border border-border pb-6 shadow-2xl backdrop-blur-3xl relative overflow-hidden"
        >
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
          
          <div className="flex items-center gap-3">
            <SidebarToggle />
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => router.push("/chat")} 
              className="size-9 rounded-full shrink-0"
            >
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight bg-gradient-to-br from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
                Profile Settings
              </h1>
              <p className="text-muted-foreground text-[10px] md:text-xs font-medium">
                Manage your identity and account preferences.
              </p>
            </div>
          </div>
        </motion.header>

        <main className="space-y-6 pb-20">
          {/* Profile Hero Card */}
          <Card className="bg-card/60 border-border/50 backdrop-blur-xl rounded-[2rem] overflow-hidden shadow-xl relative">
            <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent pointer-events-none" />
            
            <CardHeader className="p-8 text-center space-y-4 relative z-10">
              <div className="relative mx-auto group">
                <div className="absolute -inset-4 bg-primary/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative size-24 md:size-32 rounded-3xl bg-muted border-4 border-border overflow-hidden shadow-2xl flex items-center justify-center">
                  {user?.email && !isGuest ? (
                    <Image
                      src={`https://avatar.vercel.sh/${user.email}?size=128`}
                      alt="Avatar"
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <UserIcon className="size-12 md:size-16 text-muted-foreground" />
                  )}
                </div>
                <Button size="icon" variant="secondary" className="absolute bottom-0 right-0 size-8 rounded-full border border-border shadow-lg">
                  <Camera className="size-4" />
                </Button>
              </div>
              
              <div className="space-y-2">
                <div className="flex flex-col items-center gap-2">
                  <CardTitle className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-foreground">
                    {isGuest ? "Guest User" : user?.name || user?.email?.split('@')[0] || "User"}
                  </CardTitle>
                  <Badge variant="secondary" className={`px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px] rounded-md border-none ${isGuest ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    {isGuest ? "Temporary Account" : "Registered Member"}
                  </Badge>
                </div>
                <CardDescription className="font-medium flex items-center justify-center gap-2 text-muted-foreground">
                  <Mail className="size-4" />
                  {user?.email || "No email provided"}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="px-6 pb-8 border-t border-border/50 bg-muted/20 relative z-10">
              <div className="grid grid-cols-2 gap-4 py-6">
                <div className="p-4 rounded-2xl bg-card border border-border text-center group hover:border-primary/30 transition-colors">
                   <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-1 group-hover:text-primary transition-colors">Total Signals</p>
                   <p className="text-xl font-black text-foreground">1.2k</p>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border text-center group hover:border-primary/30 transition-colors">
                   <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-1 group-hover:text-primary transition-colors">Agent Tasks</p>
                   <p className="text-xl font-black text-foreground">482</p>
                </div>
              </div>

               <div className="space-y-6 pt-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/60 px-2 flex items-center gap-2">
                  <Settings className="size-3" />
                  Account Details
                </h3>
                
                <div className="grid gap-3">
                  {[
                    { label: "User ID", value: user?.id || "N/A", icon: Hash },
                    { label: "Authentication", value: isGuest ? "Anonymous Storage" : "Credentials / Magic Link", icon: Shield },
                    { label: "Member Since", value: "March 2024", icon: ShieldCheck },
                  ].map((item, idx) => (
                    <motion.div 
                      key={item.label}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border hover:bg-accent/5 transition-all group">
                        <div className="flex items-center gap-4">
                          <div className="size-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                            <item.icon className="size-5" />
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">{item.label}</p>
                            <p className="text-sm font-bold text-foreground">{item.value}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground/30 hover:text-primary">
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="mt-8">
                <BotIntegrationsPanel />
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
