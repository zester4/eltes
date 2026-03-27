import { google } from "@ai-sdk/google";
import { generateImage } from "ai";
import { createDocumentHandler } from "@/lib/artifacts/server";

export const imageDocumentHandler = createDocumentHandler<"image">({
  kind: "image",
  onCreateDocument: async ({ title, dataStream }) => {
    dataStream.write({
      type: "data-imageDelta",
      data: "",
      transient: true,
    });

    const { image } = await generateImage({
      model: google.image("gemini-2.5-flash-image"),
      prompt: title,
      aspectRatio: "1:1",
    });

    dataStream.write({
      type: "data-imageDelta",
      data: image.base64,
      transient: true,
    });

    return image.base64;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    dataStream.write({
      type: "data-imageDelta",
      data: "",
      transient: true,
    });

    const sourceImage = Buffer.from(document.content ?? "", "base64");

    const { image } = await generateImage({
      model: google.image("gemini-2.5-flash-image"),
      prompt: {
        text: description,
        images: [sourceImage],
      },
      aspectRatio: "1:1",
    });

    dataStream.write({
      type: "data-imageDelta",
      data: image.base64,
      transient: true,
    });

    return image.base64;
  },
});
