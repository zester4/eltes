import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { isUserOnboarded } from "@/lib/ai/tools/memory";
import { OnboardingWizard } from "./onboarding-wizard";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f0f0f]" />}>
      <OnboardingGate />
    </Suspense>
  );
}

async function OnboardingGate() {
  const session = await auth();

  if (!session?.user?.id) {
    return redirect("/login");
  }

  const onboarded = await isUserOnboarded(session.user.id);
  if (onboarded) {
    return redirect("/chat");
  }

  return <OnboardingWizard />;
}
