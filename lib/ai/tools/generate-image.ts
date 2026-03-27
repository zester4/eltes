import { google } from "@ai-sdk/google";
import { generateImage, tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { ChatMessage } from "@/lib/types";

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
      dataStream.write({
        type: "data-imageDelta",
        data: "",
        transient: true,
      });

      const { image } = await generateImage({
        model: google.image("gemini-2.5-flash-image"),
        prompt,
        aspectRatio: aspectRatio as any,
      });

      dataStream.write({
        type: "data-imageDelta",
        data: image.base64,
        transient: true,
      });

      return {
        image: image.base64,
        prompt,
      };
    },
  });
