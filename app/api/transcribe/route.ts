// app/api/transcribe/route.ts
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({});

// Detects repeated phrases and returns only the first clean segment
function removeLoops(text: string): string {
  const words = text.trim().split(/\s+/);
  
  // Try increasing window sizes to find a repeated pattern
  for (let windowSize = 3; windowSize <= Math.floor(words.length / 2); windowSize++) {
    const pattern = words.slice(0, windowSize).join(" ");
    const rest = words.slice(windowSize).join(" ");
    
    if (rest.startsWith(pattern)) {
      // Loop detected — return just the first occurrence
      return pattern;
    }
  }

  // No loop found — return as-is
  return text;
}

export async function POST(req: Request) {
  try {
    const { audioData, mimeType } = await req.json();

    if (!audioData) {
      return NextResponse.json(
        { error: "No audio data provided" },
        { status: 400 }
      );
    }

    const prompt = `Transcribe ONLY the exact words spoken in this audio clip.
Output ONLY the transcribed words. Do NOT repeat yourself. Stop after one transcription.
If there is no intelligible speech, output exactly: SILENCE_DETECTED`;

    // Ensure the mime type is compatible with Gemini (clean without codecs if it's webm/mp4/etc)
    let cleanMimeType = mimeType || "audio/webm";
    if (cleanMimeType.includes(";")) {
      cleanMimeType = cleanMimeType.split(";")[0];
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: audioData,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 500,           // ✅ short clips don't need more
        stopSequences: ["\n\n", "---"], // ✅ cuts off if model starts padding
      },
    });

    let text = response.text?.trim() ?? "";

    if (!text || text.includes("SILENCE_DETECTED")) {
      return NextResponse.json({ text: "" });
    }

    // ✅ Kill any looping repetition
    text = removeLoops(text);

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}