import { auth } from "@/app/(auth)/auth";
import { redirect } from "next/navigation";
import { SUBAGENT_DEFINITIONS } from "@/lib/agent/subagent-definitions";
import { SubAgentHub } from "@/components/subagent-hub";
import { guestRegex } from "@/lib/constants";

export default async function SubagentsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isGuest = guestRegex.test(session.user.email ?? "");

  if (isGuest) {
    // Guests are not allowed to operate subagents directly
    redirect("/chat");
  }

  // We pass the raw definitions, the client component will render the UI
  // Note: functions inside definitions (like systemPrompt functions) might need special handling 
  // if they are complex, but checking subagent-definitions.ts, they are static strings or simple objects for the metadata we need.
  // Wait, some toolkits might not be easily serializable if they are actual Tool objects, but looking at agent.toolkit it is an array of strings (tool names).
  // Let's sanitize to ensure it can cross the Server Component boundary easily.
  
  const safeAgents = SUBAGENT_DEFINITIONS.map(agent => ({
    name: agent.name,
    slug: agent.slug,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    toolkits: typeof agent.toolkits === 'function' ? [] : agent.toolkits,
  }));

  return (
    <div className="flex w-full h-[calc(100vh-3.5rem)] md:h-screen flex-row relative overflow-hidden text-sm">
       <SubAgentHub agents={safeAgents} />
    </div>
  );
}
