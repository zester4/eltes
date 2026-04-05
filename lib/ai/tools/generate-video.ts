import { GoogleGenAI } from "@google/genai";
import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";
import { put } from "@vercel/blob";
import { generateUUID } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 60; // 10 minutes max before giving up

// ---------------------------------------------------------------------------
// Helper — polls a video operation until done or timed out
// ---------------------------------------------------------------------------
async function pollUntilDone(
  ai: GoogleGenAI,
  operation: any,
  onProgress?: (attempt: number) => void
) {
  let current = operation;
  let attempts = 0;

  while (!current.done) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      throw new Error(
        `Video generation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s.`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    onProgress?.(++attempts);

    current = await ai.operations.getVideosOperation({ operation: current });
  }

  return current;
}

// ---------------------------------------------------------------------------
// Helper — converts a base64 string + mime type into the inlineData shape
// Veo expects for image inputs
// ---------------------------------------------------------------------------
function toImagePayload(base64: string, mimeType: string) {
  return {
    imageBytes: base64,
    mimeType,
  };
}

// ---------------------------------------------------------------------------
// Main tool
// ---------------------------------------------------------------------------
export const generateVideoTool = () =>
  tool({
    description: `Generate an 8-second video using Google Veo 3.1.

Modes:
- Text-to-video: provide only a prompt.
- Image-to-video: provide a startFrameBase64 to animate from a specific first frame.
- First + last frame: provide both startFrameBase64 and endFrameBase64 to guide start and end.
- Reference images: provide up to 3 referenceImages to lock in a subject's appearance (person, product, character).
- Video extension: provide videoToExtendUri (a previously generated Veo video URI) to extend it.

Resolution note: 4k is not available for Veo 3.1 Lite. Video extension is limited to 720p.`,

    inputSchema: z.object({
      prompt: z
        .string()
        .describe(
          "Detailed cinematic description of the video. Include camera movement, lighting, audio cues, and style."
        ),

      // ── Output controls ──────────────────────────────────────────────────
      aspectRatio: z
        .enum(["16:9", "9:16"])
        .optional()
        .default("16:9")
        .describe("16:9 for landscape (default), 9:16 for portrait."),

      resolution: z
        .enum(["720p", "1080p", "4k"])
        .optional()
        .default("720p")
        .describe(
          "Output resolution. Higher = slower + more expensive. 4k not available for Lite model."
        ),

      model: z
        .enum(["veo-3.1-generate-preview", "veo-3.1-lite-generate-preview"])
        .optional()
        .default("veo-3.1-generate-preview")
        .describe(
          "Which Veo variant to use. Lite is faster and cheaper but no 4k."
        ),

      // ── Image-to-video / first frame ─────────────────────────────────────
      startFrameBase64: z
        .string()
        .optional()
        .describe(
          "Base64-encoded image to use as the first frame of the video."
        ),
      startFrameMimeType: z
        .enum(["image/png", "image/jpeg", "image/webp"])
        .optional()
        .default("image/png")
        .describe("MIME type of startFrameBase64."),

      // ── Last frame ───────────────────────────────────────────────────────
      endFrameBase64: z
        .string()
        .optional()
        .describe(
          "Base64-encoded image to use as the last frame. Requires startFrameBase64 to also be set."
        ),
      endFrameMimeType: z
        .enum(["image/png", "image/jpeg", "image/webp"])
        .optional()
        .default("image/png")
        .describe("MIME type of endFrameBase64."),

      // ── Reference images (up to 3) ───────────────────────────────────────
      referenceImages: z
        .array(
          z.object({
            base64: z.string().describe("Base64-encoded reference image."),
            mimeType: z
              .enum(["image/png", "image/jpeg", "image/webp"])
              .default("image/png"),
          })
        )
        .max(3)
        .optional()
        .describe(
          "Up to 3 reference images to lock in the appearance of a person, character, or product. Veo 3.1 full model only."
        ),

      // ── Video extension ──────────────────────────────────────────────────
      videoToExtendUri: z
        .string()
        .optional()
        .describe(
          "URI of a previously generated Veo video to extend. Only works at 720p."
        ),
    }),

    execute: async ({
      prompt,
      aspectRatio,
      resolution,
      model,
      startFrameBase64,
      startFrameMimeType,
      endFrameBase64,
      endFrameMimeType,
      referenceImages,
      videoToExtendUri,
    }) => {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        });

        // ── Build the generateVideos payload ────────────────────────────────
        const payload: any = {
          model,
          prompt,
          config: {
            aspectRatio,
            resolution,
          },
        };

        // First frame (image-to-video)
        if (startFrameBase64) {
          payload.image = toImagePayload(startFrameBase64, startFrameMimeType ?? "image/png");
        }

        // Last frame — only meaningful when a first frame is also set
        if (endFrameBase64) {
          if (!startFrameBase64) {
            return {
              error: "endFrameBase64 requires startFrameBase64 to also be provided.",
            };
          }
          payload.lastFrame = toImagePayload(endFrameBase64, endFrameMimeType ?? "image/png");
        }

        // Reference images — up to 3, Veo 3.1 full only
        if (referenceImages && referenceImages.length > 0) {
          payload.config.referenceImages = referenceImages.map((ref) => ({
            image: toImagePayload(ref.base64, ref.mimeType),
            referenceType: "asset",
          }));
        }

        // Video extension
        if (videoToExtendUri) {
          payload.video = { uri: videoToExtendUri };
          // Extension is limited to 720p
          if (resolution !== "720p") {
            payload.config.resolution = "720p";
          }
        }

        // ── Submit the job ──────────────────────────────────────────────────
        let operation = await ai.models.generateVideos(payload);

        // ── Poll until done ────────────────────────────────────────────────
        operation = await pollUntilDone(ai, operation);

        // ── Extract the result ──────────────────────────────────────────────
        const generatedVideos = operation.response?.generatedVideos;

        if (!generatedVideos || generatedVideos.length === 0) {
          throw new Error("No videos found in Veo response.");
        }

        // Collect all generated video URIs (Veo can return multiple)
        const rawVideoUris: string[] = generatedVideos.map(
          (v: any) => v.video?.uri ?? v.video?.url
        ).filter(Boolean);

        if (rawVideoUris.length === 0) {
          throw new Error("Generated videos contained no accessible URIs.");
        }

        // Upload each video to Vercel Blob for persistence
        const videoUris: string[] = [];
        
        for (let i = 0; i < rawVideoUris.length; i++) {
          const rawUri = rawVideoUris[i];
          
          const videoRes = await fetch(rawUri);
          if (!videoRes.ok) continue;

          const videoBuffer = await videoRes.arrayBuffer();
          const contentType = videoRes.headers.get("content-type") || "video/mp4";
          const extension = contentType.split("/")[1] || "mp4";
          
          const filename = `gemini-videos/${generateUUID()}.${extension}`;
          const blobData = await put(filename, Buffer.from(videoBuffer), {
            access: "public",
            contentType,
          });

          videoUris.push(blobData.url);
        }

        if (videoUris.length === 0) {
          throw new Error("Failed to persist any generated videos to Blob storage.");
        }

        // ── Return persistent metadata to the model ──────────────────────────────
        return {
          status: "SUCCESS",
          url: videoUris[0], // Primary URL
          videoUris, // All URLs
          prompt,
          model,
          aspectRatio,
          resolution: payload.config.resolution ?? resolution,
          videoCount: videoUris.length,
          ...(startFrameBase64 && { mode: endFrameBase64 ? "first-and-last-frame" : "image-to-video" }),
          ...(referenceImages && { referenceImageCount: referenceImages.length }),
          ...(videoToExtendUri && { mode: "video-extension" }),
          ...(!startFrameBase64 && !videoToExtendUri && { mode: "text-to-video" }),
          markdown: videoUris.map(uri => `![Video](${uri})`).join("\n\n")
        };
      } catch (error) {
        console.error("Video generation failed:", error);

        return {
          error: "Failed to generate video.",
          details: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
