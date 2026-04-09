import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

// Initialize the Google Gen AI SDK
// It automatically picks up the GEMINI_API_KEY environment variable.
const ai = new GoogleGenAI({});

export async function POST(req: Request) {
  try {
    const { audioData, mimeType } = await req.json();

    if (!audioData) {
      return NextResponse.json(
        { error: "No audio data provided" },
        { status: 400 }
      );
    }

    // Prompt Gemini to transcribe the audio snippet
    const prompt = "Please transcribe exactly what is said in this audio snippet. Output only the transcription, without any extra commentary, quotation marks, or markdown formatting. If there is no speech, return nothing.";

    const contents = [
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType || "audio/webm",
          data: audioData,
        },
      },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents,
    });

    const text = response.text?.trim() || "";

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Error during transcription:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}
