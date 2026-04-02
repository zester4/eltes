"use client";

import { useState } from "react";
import { type SubAgentDefinition } from "@/lib/agent/subagent-definitions";
import { SubAgentChat } from "./subagent-chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Bot, Wrench, Shield, Zap, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SidebarToggle } from "@/components/sidebar-toggle";

interface SubAgentHubProps {
  agents: SubAgentDefinition[];
}

export function SubAgentHub({ agents }: SubAgentHubProps) {
  const [selectedAgent, setSelectedAgent] = useState<SubAgentDefinition | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (agent.toolkits && agent.toolkits.some(tool => tool.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-3.5rem)] md:h-screen w-full overflow-hidden bg-background">
      
      {/* Left Sidebar (Agent List) - Automatically hidden on mobile if an agent is selected */}
      <div 
        className={cn(
           "flex-col w-full md:w-80 lg:w-96 border-r bg-background/60 backdrop-blur-3xl shrink-0 transition-transform duration-300 z-20 absolute md:relative h-full",
           selectedAgent ? "-translate-x-full md:translate-x-0 hidden md:flex" : "flex translate-x-0"
        )}
      >
        <div className="p-4 sm:p-5 flex flex-col gap-4 border-b bg-background/40 sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarToggle />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Command Center</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search or describe a task..."
              className="pl-9 bg-muted/30 border-muted/50 rounded-full h-10 sm:h-11 shadow-sm transition-all focus:ring-primary focus:bg-background/80 text-[13px] sm:text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col gap-2 sm:gap-3">
            {filteredAgents.map((agent) => (
              <button
                key={agent.slug}
                onClick={() => setSelectedAgent(agent)}
                className={cn(
                  "flex flex-col items-start p-3 sm:p-4 rounded-xl sm:rounded-2xl border text-left transition-all duration-300 outline-none w-full group relative overflow-hidden",
                  selectedAgent?.slug === agent.slug
                    ? "bg-primary/[0.03] border-primary/30 ring-1 ring-primary/20 shadow-md"
                    : "bg-surface hover:bg-muted/40 border-border/40 hover:border-border/80 shadow-sm"
                )}
              >
                {selectedAgent?.slug === agent.slug && (
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent opacity-50" />
                )}
                
                <div className="flex items-start justify-between w-full mb-1.5 sm:mb-2 relative z-10">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "p-1.5 sm:p-2 rounded-lg flex items-center justify-center transition-colors",
                      selectedAgent?.slug === agent.slug ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground"
                    )}>
                      {agent.slug.includes('security') || agent.slug.includes('admin') ? <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : 
                       agent.slug.includes('engineer') || agent.slug.includes('developer') ? <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> :
                       <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </div>
                    <span className="font-semibold text-sm sm:text-[15px]">{agent.name}</span>
                  </div>
                </div>
                
                <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3 relative z-10 w-full">
                  {agent.description}
                </p>
                
                <div className="flex flex-wrap gap-1 relative z-10">
                  {agent.toolkits.slice(0, 3).map((tool) => (
                    <Badge 
                      key={tool} 
                      variant="secondary" 
                      className="text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0 h-4 sm:h-4.5 bg-muted/60 text-muted-foreground capitalize font-medium rounded-md"
                    >
                      {tool.replace(/_tool/g, '').replace(/_/g, ' ')}
                    </Badge>
                  ))}
                  {agent.toolkits.length > 3 && (
                    <Badge variant="secondary" className="text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0 h-4 sm:h-4.5 bg-muted/60 text-muted-foreground rounded-md">
                      +{agent.toolkits.length - 3}
                    </Badge>
                  )}
                </div>
              </button>
            ))}

            {filteredAgents.length === 0 && (
              <div className="text-center py-10 sm:py-16 text-muted-foreground space-y-3 px-4">
                <Search className="h-6 w-6 sm:h-8 sm:w-8 opacity-20 mx-auto" />
                <p className="text-xs sm:text-sm">No agents found matching your search.</p>
                <Button 
                   variant="outline" 
                   size="sm" 
                   className="mt-2 text-xs"
                   onClick={() => setSearchQuery("")}
                >
                  Clear search
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content Area (Chat Panel) */}
      <div 
        className={cn(
          "flex-1 relative transition-all duration-300 w-full bg-grid-black/[0.02] dark:bg-grid-white/[0.02]", 
          !selectedAgent ? "hidden md:block" : "block"
        )}
      >
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center -z-10">
           <div className="h-full w-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent blur-3xl opacity-50" />
        </div>
        
        {selectedAgent ? (
          <SubAgentChat 
            agent={selectedAgent} 
            key={selectedAgent.slug}
            onClose={() => setSelectedAgent(null)}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 sm:p-8 animate-in fade-in duration-500">
            <div className="w-16 h-16 sm:w-24 sm:h-24 bg-muted/30 rounded-[2rem] flex items-center justify-center mb-6 sm:mb-8 shadow-inner ring-1 ring-border/50 relative overflow-hidden backdrop-blur-md">
               <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent opacity-50" />
               <Sparkles className="w-6 h-6 sm:w-10 sm:h-10 text-primary/40 relative z-10" />
            </div>
            <h2 className="text-lg sm:text-2xl font-bold bg-gradient-to-br from-foreground to-muted-foreground text-transparent bg-clip-text text-center mb-2">
              Select a Sub-Agent
            </h2>
            <p className="text-xs sm:text-sm max-w-[250px] sm:max-w-md text-center leading-relaxed opacity-80">
              Choose an agent from the sidebar to start a direct session, view its trace logs, and issue autonomous commands.
            </p>
          </div>
        )}
      </div>
      
    </div>
  );
}
