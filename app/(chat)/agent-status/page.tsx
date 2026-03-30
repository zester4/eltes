import { auth } from "@/app/(auth)/auth";
import { getAgentStatus } from "@/lib/db/queries/agent-status";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  Calendar,
  Clock,
  History,
  LayoutDashboard,
  ListTodo,
  Zap,
} from "lucide-react";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { AgentStatusActions } from "@/components/agent-status-actions";
import { cn } from "@/lib/utils";

export default async function AgentStatusPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const status = await getAgentStatus();

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 bg-background">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col space-y-1 sm:space-y-2">
          <div className="flex items-center gap-2">
            <SidebarToggle />
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Agent Dashboard</h1>
          </div>
          <p className="text-muted-foreground text-[10px] sm:text-xs md:text-sm">
            Monitor Etles's proactive activities, automation schedules, and intelligence briefs.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <AgentStatusActions status={status.heartbeat.status} />
          
          <div className="flex items-center gap-2 sm:gap-3 bg-muted/50 p-1.5 sm:p-2 rounded-lg px-3 sm:px-4 border w-fit">
            <div className={cn(
               "h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full",
               status.heartbeat.status === "active" ? "bg-green-500 animate-pulse" : 
               status.heartbeat.status === "paused" ? "bg-amber-500" : "bg-red-500"
            )} />
            <span className="text-[9px] sm:text-xs font-semibold uppercase tracking-wider">{status.heartbeat.status}</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[300px] sm:max-w-[400px] h-8 sm:h-10">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm">
            <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="automations" className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm">
            <ListTodo className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Automations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {/* Heartbeat Status Card */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
                <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground">Signal Monitoring</CardTitle>
                <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                <div className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1">Hourly Checks</div>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                  Scanning calendar, email, and tasks for urgent matters.
                </p>
                {status.heartbeat.nextRun && (
                  <div className="mt-3 sm:mt-4 flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] text-primary bg-primary/5 p-1 sm:p-1.5 px-2 sm:px-3 rounded-full w-fit">
                    <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    Next: {new Date(status.heartbeat.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Integration Summary */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
                <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground">Connected Apps</CardTitle>
                <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                <div className="text-lg sm:text-2xl font-bold mb-2 sm:mb-3">{status.integrations.length} Active</div>
                <div className="flex flex-wrap gap-1 sm:gap-1.5">
                  {status.integrations.length > 0 ? (
                    status.integrations.map((i) => (
                      <Badge key={i.platform} variant="secondary" className="capitalize text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0 h-4 sm:h-5">
                        {i.platform}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[10px] sm:text-sm text-muted-foreground">None</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Next Scheduled Action */}
            <Card className="shadow-sm border-primary/20 bg-primary/[0.02] sm:col-span-2 lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
                <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground text-primary">Strategic Synthesis</CardTitle>
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                <div className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1">Weekly Report</div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {status.synthesis.savedAt 
                    ? `Last: ${new Date(status.synthesis.savedAt).toLocaleDateString()}`
                    : "Every Monday at 8 AM UTC"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="border-b bg-muted/30 p-3 sm:p-4 md:p-6">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Latest Intelligence Brief
              </CardTitle>
              <CardDescription className="text-[10px] sm:text-xs">
                A high-level synthesis of your digital signals from the last 7 days.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 max-h-[400px] sm:max-h-[600px] overflow-y-auto">
              {status.synthesis.lastBrief ? (
                <div className="prose prose-xs sm:prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-[11px] sm:text-sm leading-relaxed">
                  {status.synthesis.lastBrief}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center">
                  <History className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/20 mb-3 sm:mb-4" />
                  <p className="text-muted-foreground text-[11px] sm:text-sm font-medium">No synthesis available yet.</p>
                  <p className="text-[9px] sm:text-[11px] text-muted-foreground/60 max-w-[200px] sm:max-w-[250px] mt-1">
                    Your first strategic synthesis will be ready after a week of activity.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automations" className="space-y-4">
          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="pb-2 sm:pb-3 border-b mb-2 sm:mb-4 p-3 sm:p-6">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                  <ListTodo className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  Active Recurring Jobs
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">Automations currently managed by Etles.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 p-0 sm:p-0">
                <div className="space-y-0">
                  {status.cronJobs.some(j => j.cron) ? (
                    status.cronJobs.filter(j => j.cron).map((job) => (
                      <div key={job.id} className="group px-4 sm:px-6 py-3 sm:py-4 hover:bg-muted/50 transition-colors border-b last:border-0">
                        <div className="flex items-start justify-between mb-1.5 sm:mb-2">
                          <div className="space-y-0.5 sm:space-y-1">
                            <h4 className="text-xs sm:text-sm font-bold leading-none group-hover:text-primary transition-colors truncate max-w-[150px] sm:max-w-[250px]">
                              {job.task}
                            </h4>
                            <p className="text-[9px] sm:text-[11px] text-muted-foreground bg-muted p-0.5 sm:p-1 px-1.5 sm:px-2 rounded font-mono w-fit">
                              {job.cron}
                            </p>
                          </div>
                          <Badge className="text-[8px] sm:text-[9px] h-3.5 sm:h-4 px-1 sm:px-1.5 font-bold uppercase tracking-wider">
                            {job.status}
                          </Badge>
                        </div>
                        {job.nextRun && (
                          <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[11px] text-primary font-semibold mt-2 sm:mt-3">
                            <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            Next: {new Date(job.nextRun).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 sm:py-20 text-muted-foreground flex flex-col items-center">
                      <ListTodo className="h-6 w-6 sm:h-8 sm:w-8 opacity-10 mb-2" />
                      <p className="text-[10px] sm:text-xs">No active recurring jobs found.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2 sm:pb-3 border-b mb-2 sm:mb-4 p-3 sm:p-6">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2 text-muted-foreground">
                  <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Recent History
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">Last 5 autonomous agent activities.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 p-0 sm:p-0">
                <div className="space-y-0">
                  {status.cronJobs.some(j => !j.cron) ? (
                    status.cronJobs.filter(j => !j.cron).map((job) => (
                      <div key={job.id} className="px-4 sm:px-6 py-2.5 sm:py-3 border-b last:border-0 flex items-center justify-between gap-3 sm:gap-4">
                        <div className="space-y-0.5 sm:space-y-1 flex-1 min-w-0">
                          <p className="text-[11px] sm:text-xs font-medium truncate">
                            {job.task}
                          </p>
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                            {new Date(job.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[8px] sm:text-[9px] h-3.5 sm:h-4 px-1 sm:px-1.5 capitalize text-muted-foreground shrink-0">
                          {job.status}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 sm:py-20 text-muted-foreground flex flex-col items-center">
                      <History className="h-6 w-6 sm:h-8 sm:w-8 opacity-10 mb-2" />
                      <p className="text-[10px] sm:text-xs">No execution history recorded.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
