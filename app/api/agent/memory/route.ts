import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { Index } from "@upstash/vector";

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ns = index.namespace(`memory-${session.user.id}`);
    
    // List memories by querying with an empty string or using range/list if supported.
    // For universal compatibility across Upstash versions, we'll use a wide query.
    // Or we can try the 'list' method which is standard in recent SDKs.
    const results = await ns.query({
      data: " ", 
      topK: 100,
      includeMetadata: true,
    });

    const memories = results.map((r) => ({
      id: r.id,
      key: (r.metadata as any)?.key || r.id,
      content: (r.metadata as any)?.content || "",
      savedAt: (r.metadata as any)?.savedAt || (r.metadata as any)?.updatedAt,
      tags: (r.metadata as any)?.tags || [],
    }));

    return NextResponse.json({ memories });
  } catch (error: any) {
    console.error("[Memory API] GET failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Missing memory key" }, { status: 400 });
    }

    const ns = index.namespace(`memory-${session.user.id}`);
    await ns.delete(key);

    return NextResponse.json({ ok: true, message: `Memory "${key}" deleted` });
  } catch (error: any) {
    console.error("[Memory API] DELETE failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
