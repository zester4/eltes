//lib/ai/tools/generate-image.ts
import { GoogleGenAI } from "@google/genai";
import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";
import { put } from "@vercel/blob";
import { generateUUID } from "@/lib/utils";

export const generateImageTool = (
  dataStream: UIMessageStreamWriter<ChatMessage>
) =>
  tool({
    description: "Generate an image based on a prompt.",
    inputSchema: z.object({
      prompt: z.string().describe("The prompt to generate the image from."),
      aspectRatio: z
        .enum([
          "1:1",
          "2:3",
          "3:2",
          "3:4",
          "4:3",
          "4:5",
          "5:4",
          "9:16",
          "16:9",
          "21:9",
        ])
        .optional()
        .default("1:1")
        .describe("The aspect ratio of the generated image."),
    }),
    execute: async ({ prompt, aspectRatio }) => {
      // Stream an empty initial state so UI knows image is coming
      dataStream.write({
        type: "data-imageDelta",
        data: "",
        transient: true,
      });

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-image-preview",
          contents: prompt,
          config: {
            responseModalities: ["IMAGE"],
            // Note: Currently typing for imageConfig might differ slightly in newer versions, 
            // passing it generally via any if needed, but it usually accepts aspectRatio natively.
            imageConfig: { aspectRatio },
          } as any,
        });

        let base64Image = "";

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData && part.inlineData.data) {
            base64Image = part.inlineData.data as string;
            break;
          }
        }

        if (!base64Image) {
          throw new Error("No image data found in response");
        }

        // Send the raw base64 data to our UI client stream 
        dataStream.write({
          type: "data-imageDelta",
          data: `data:image/png;base64,${base64Image}`,
          transient: true,
        });

        // Upload to Vercel string
        const buffer = Buffer.from(base64Image, "base64");
        const filename = `gemini-images/${generateUUID()}.png`;
        const blobData = await put(filename, buffer, {
          access: "public",
          contentType: "image/png",
        });

        // ONLY Return metadata to the model. Do NOT return the base64 string because
        // doing so bloats the AI message token limit severely and slows down the conversation.
        return {
          status: "SUCCESS",
          url: blobData.url,
          originalPrompt: prompt,
          aspectRatioGenerated: aspectRatio,
        };

      } catch (error) {
        console.error("Image generation failed:", error);
        
        return {
          error: "Failed to generate image.",
          details: error instanceof Error ? error.message : String(error)
        };
      }
    },
  });