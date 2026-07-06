import { streamObject } from "ai";
import { z } from "zod";
import { sheetPrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { getArtifactModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

export const sheetDocumentHandler = createDocumentHandler<"sheet">({
  kind: "sheet",
  onCreateDocument: async ({ title, dataStream, modelId }) => {
    let draftContent = "";

    const { fullStream } = streamObject({
      model: getArtifactModel(modelId),
      system: sheetPrompt,
      prompt: title,
      schema: z.object({
        title: z.string().describe("The main title of the spreadsheet"),
        sheets: z.array(
          z.object({
            name: z.string().describe("Sheet name"),
            csv: z.string().describe("CSV data"),
            styles: z
              .record(
                z.object({
                  backgroundColor: z.string().optional(),
                  color: z.string().optional(),
                  bold: z.boolean().optional(),
                  textAlign: z.enum(["left", "center", "right"]).optional(),
                })
              )
              .optional()
              .describe("Cell styles mapped by coordinate like A1, B2"),
          })
        ),
      }),
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === "object") {
        const { object } = delta;
        const content = JSON.stringify(object, null, 2);

        dataStream.write({
          type: "data-sheetDelta",
          data: content,
          transient: true,
        });

        draftContent = content;
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, modelId }) => {
    let draftContent = "";

    const { fullStream } = streamObject({
      model: getArtifactModel(modelId),
      system: updateDocumentPrompt(document.content, "sheet"),
      prompt: description,
      schema: z.object({
        title: z.string().describe("The main title of the spreadsheet"),
        sheets: z.array(
          z.object({
            name: z.string().describe("Sheet name"),
            csv: z.string().describe("CSV data"),
            styles: z
              .record(
                z.object({
                  backgroundColor: z.string().optional(),
                  color: z.string().optional(),
                  bold: z.boolean().optional(),
                  textAlign: z.enum(["left", "center", "right"]).optional(),
                })
              )
              .optional()
              .describe("Cell styles mapped by coordinate like A1, B2"),
          })
        ),
      }),
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === "object") {
        const { object } = delta;
        const content = JSON.stringify(object, null, 2);

        dataStream.write({
          type: "data-sheetDelta",
          data: content,
          transient: true,
        });

        draftContent = content;
      }
    }

    return draftContent;
  },
});
