import { auth } from "@/app/(auth)/auth";
import { getUserSkillsByUserId, saveUserSkill } from "@/lib/db/queries";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const WIKI_ROOT = path.join(process.cwd(), ".wiki");

async function listDefaultPages() {
  try {
    const entries = await fs.readdir(WIKI_ROOT, { withFileTypes: true });
    const pages = entries
      .filter(
        (e) =>
          e.isFile() &&
          e.name.endsWith(".md") &&
          e.name !== "index.md" &&
          e.name !== "instructions.md",
      )
      .map((e) => e.name.replace(".md", ""));
    
    return await Promise.all(pages.map(async (slug) => {
      const content = await fs.readFile(path.join(WIKI_ROOT, `${slug}.md`), "utf-8");
      const titleMatch = content.match(/^#\s+(.*)/);
      const title = titleMatch ? titleMatch[1] : slug;
      const descriptionMatch = content.match(/\*(.*?)\*/); // First italicized block as description
      const description = descriptionMatch ? descriptionMatch[1] : "";
      
      return {
        id: `default-${slug}`,
        slug,
        title,
        description,
        isDefault: true,
      };
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [defaultPages, userSkills] = await Promise.all([
      listDefaultPages(),
      getUserSkillsByUserId(session.user.id),
    ]);

    const formattedUserSkills = userSkills.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      description: s.description,
      isDefault: false,
      updatedAt: s.updatedAt,
    }));

    return NextResponse.json([...defaultPages, ...formattedUserSkills]);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, slug, content, description } = await req.json();

    if (!title || !slug || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await saveUserSkill({
      userId: session.user.id,
      title,
      slug,
      content,
      description,
    });

    return NextResponse.json(result[0]);
  } catch (error) {
    return NextResponse.json({ error: "Failed to save skill" }, { status: 500 });
  }
}
