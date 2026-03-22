import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: chatId } = await context.params;
  const chat = await getChatById({ id: chatId });

  if (!chat) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (chat.visibility === "private") {
    if (!session.user || session.user.id !== chat.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const rows = await getMessagesByChatId({ id: chatId });
  const messages = convertToUIMessages(rows);

  return NextResponse.json({ messages });
}
