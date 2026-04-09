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
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 space-y-4 sm:space-y-8 bg-background">
      <div className="flex flex-col gap-4 sm:gap-6 max-w-4xl mx-auto w-full">
        {/* Header/Nav Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <SidebarToggle />
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => router.push("/chat")} 
              className="size-8 rounded-full shrink-0"
            >
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight">
                Profile Settings
              </h1>
              <p className="text-muted-foreground text-[10px] sm:text-xs font-medium">
                Manage your identity and account preferences.
              </p>
            </div>
          </div>
        </header>

        <main className="space-y-6">
          {/* Profile Hero Card */}
          <Card className="shadow-sm border-border overflow-hidden relative">
            <CardHeader className="p-4 sm:p-8 text-center space-y-3 sm:space-y-4 relative z-10">
              <div className="relative mx-auto group">
                <div className="relative size-20 sm:size-24 md:size-32 rounded-2xl sm:rounded-3xl bg-muted border border-border overflow-hidden shadow-sm flex items-center justify-center">
                  {user?.email && !isGuest ? (
                    <Image
                      src={`https://avatar.vercel.sh/${user.email}?size=128`}
                      alt="Avatar"
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <UserIcon className="size-10 sm:size-12 md:size-16 text-muted-foreground" />
                  )}
                </div>
                <Button size="icon" variant="secondary" className="absolute bottom-0 right-0 size-7 sm:size-8 rounded-full border border-border shadow-lg">
                  <Camera className="size-3.5 sm:size-4" />
                </Button>
              </div>
              
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex flex-col items-center gap-1 sm:gap-2">
                  <CardTitle className="text-xl sm:text-2xl md:text-3xl font-bold uppercase tracking-tight text-foreground">
                    {isGuest ? "Guest User" : user?.name || user?.email?.split('@')[0] || "User"}
                  </CardTitle>
                  <Badge variant="secondary" className={`px-2 py-0.5 font-bold uppercase tracking-wider text-[8px] sm:text-[10px] rounded-md border-none ${isGuest ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    {isGuest ? "Temporary Account" : "Registered Member"}
                  </Badge>
                </div>
                <CardDescription className="font-medium flex items-center justify-center gap-1.5 sm:gap-2 text-muted-foreground text-[11px] sm:text-sm">
                  <Mail className="size-3 sm:size-4" />
                  {user?.email || "No email provided"}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="px-3 sm:px-6 pb-6 sm:pb-8 border-t border-border bg-muted/30 relative z-10">
              <div className="grid grid-cols-2 gap-3 py-4 sm:py-5">
                <div className="p-3 sm:p-3.5 rounded-[14px] bg-card border border-border text-center group transition-colors">
                   <p className="text-[8.5px] uppercase tracking-wider font-bold text-muted-foreground mb-0.5 group-hover:text-primary transition-colors">Total Signals</p>
                   <p className="text-lg font-bold text-foreground">1.2k</p>
                </div>
                <div className="p-3 sm:p-3.5 rounded-[14px] bg-card border border-border text-center group transition-colors">
                   <p className="text-[8.5px] uppercase tracking-wider font-bold text-muted-foreground mb-0.5 group-hover:text-primary transition-colors">Agent Tasks</p>
                   <p className="text-lg font-bold text-foreground">482</p>
                </div>
              </div>

               <div className="space-y-4 pt-2 sm:pt-4">
                <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground/60 px-1 flex items-center gap-2">
                  <Settings className="size-3" />
                  Account Details
                </h3>
                
                <div className="grid gap-2 sm:gap-3">
                  {[
                    { label: "User ID", value: user?.id || "N/A", icon: Hash },
                    { label: "Authentication", value: isGuest ? "Anonymous Storage" : "Credentials / Magic Link", icon: Shield },
                    { label: "Member Since", value: "March 2024", icon: ShieldCheck },
                  ].map((item, idx) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between p-3 rounded-[14px] bg-card border border-border hover:bg-muted/50 transition-all group">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-[10px] bg-muted/50 border border-border flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                            <item.icon className="size-4" />
                          </div>
                          <div>
                            <p className="text-[8.5px] uppercase tracking-wider font-bold text-muted-foreground">{item.label}</p>
                            <p className="text-[13px] font-bold text-foreground">{item.value}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="size-7 rounded-lg text-muted-foreground/30 hover:text-primary">
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                    </div>
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
