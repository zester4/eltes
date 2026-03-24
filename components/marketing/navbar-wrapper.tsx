import { auth } from "@/app/(auth)/auth";
import { Navbar } from "./navbar";

export async function NavbarWrapper() {
  const session = await auth();
  return <Navbar user={session?.user} />;
}
