import { auth } from "@/app/(auth)/auth";
import { deleteUserSkill, getUserSkillBySlug } from "@/lib/db/queries";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const WIKI_ROOT = path.join(process.cwd(), ".wiki");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  try {
    // 1. Try DB first
    const userSkill = await getUserSkillBySlug(session.user.id, slug);
    if (userSkill) {
      return NextResponse.json(userSkill);
    }

    // 2. Try default wiki files
    const filePath = path.join(WIKI_ROOT, `${slug}.md`);
    const content = await fs.readFile(filePath, "utf-8");
    const titleMatch = content.match(/^#\s+(.*)/);
    const title = titleMatch ? titleMatch[1] : slug;
    const descriptionMatch = content.match(/\*(.*?)\*/);
    const description = descriptionMatch ? descriptionMatch[1] : "";

    return NextResponse.json({
      title,
      slug,
      content,
      description,
      isDefault: true,
    });
  } catch (error) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  try {
    const result = await deleteUserSkill(session.user.id, slug);
    if (result.length === 0) {
      return NextResponse.json({ error: "Skill not found or not owned by you" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
  }
}
