import { auth } from "@/app/(auth)/auth";
import { redirect } from "next/navigation";
import { SkillsClient } from "@/components/skills-client";

export default async function SkillsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <SkillsClient />;
}
