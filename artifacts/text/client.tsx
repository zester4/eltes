import { toast } from "sonner";
import { Artifact } from "@/components/create-artifact";
import { DiffView } from "@/components/diffview";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  ChevronDownIcon,
  ClockRewind,
  CopyIcon,
  DownloadIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
} from "@/components/icons";
import { Editor } from "@/components/text-editor";
import type { Suggestion } from "@/lib/db/schema";
import { getSuggestions } from "../actions";

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^\*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^\*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdownToHTML(markdown: string): string {
  let html = markdown
    .split("\n")
    .map((line) => {
      // Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        return `<h${level}>${headingMatch[2]}</h${level}>`;
      }

      // Ordered lists
      if (/^\d+\.\s+/.test(line)) {
        return `<li>${line.replace(/^\d+\.\s+/, "")}</li>`;
      }

      // Unordered lists
      if (/^[\*\-]\s+/.test(line)) {
        return `<li>${line.replace(/^[\*\-]\s+/, "")}</li>`;
      }

      // Bold
      let processed = line
        .replace(/\*\*([^\*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>");

      // Italic
      processed = processed
        .replace(/\*([^\*]+)\*/g, "<em>$1</em>")
        .replace(/_([^_]+)_/g, "<em>$1</em>");

      // Inline code
      processed = processed.replace(/`([^`]+)`/g, "<code>$1</code>");

      // Links
      processed = processed.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2">$1</a>'
      );

      // Empty line = paragraph break
      if (line.trim() === "") {
        return "";
      }

      return `<p>${processed}</p>`;
    })
    .join("\n");

  // Wrap consecutive list items
  html = html.replace(
    /(<li>.*?<\/li>)\n(?=<li>)/g,
    "$1\n"
  );
  html = html.replace(
    /(?<=<li>.*<\/li>\n)(<li>)/,
    "<ul>\n$1"
  );
  html = html.replace(
    /(<\/li>)\n(?!<li>)/g,
    "$1\n</ul>"
  );

  return html;
}

type TextArtifactMetadata = {
  suggestions: Suggestion[];
};

export const textArtifact = new Artifact<"text", TextArtifactMetadata>({
  kind: "text",
  description: "Useful for text content, like drafting essays and emails.",
  initialize: async ({ documentId, setMetadata }) => {
    const suggestions = await getSuggestions({ documentId });

    setMetadata({
      suggestions,
    });
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === "data-suggestion") {
      setMetadata((metadata) => {
        return {
          suggestions: [...metadata.suggestions, streamPart.data],
        };
      });
    }

    if (streamPart.type === "data-textDelta") {
      setArtifact((draftArtifact) => {
        return {
          ...draftArtifact,
          content: draftArtifact.content + streamPart.data,
          isVisible:
            draftArtifact.status === "streaming" &&
            draftArtifact.content.length > 400 &&
            draftArtifact.content.length < 450
              ? true
              : draftArtifact.isVisible,
          status: "streaming",
        };
      });
    }
  },
  content: ({
    mode,
    status,
    content,
    isCurrentVersion,
    currentVersionIndex,
    onSaveContent,
    getDocumentContentById,
    isLoading,
    metadata,
  }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    if (mode === "diff") {
      const oldContent = getDocumentContentById(currentVersionIndex - 1);
      const newContent = getDocumentContentById(currentVersionIndex);

      return <DiffView newContent={newContent} oldContent={oldContent} />;
    }

    return (
      <div className="flex flex-row px-4 py-8 md:p-20">
        <Editor
          content={content}
          currentVersionIndex={currentVersionIndex}
          isCurrentVersion={isCurrentVersion}
          onSaveContent={onSaveContent}
          status={status}
          suggestions={metadata ? metadata.suggestions : []}
        />

        {metadata?.suggestions && metadata.suggestions.length > 0 ? (
          <div className="h-dvh w-12 shrink-0 md:hidden" />
        ) : null}
      </div>
    );
  },
  actions: [
    {
      icon: <ClockRewind size={18} />,
      description: "View changes",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("toggle");
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: "View Previous version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: "View Next version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: "Copy to clipboard",
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success("Copied to clipboard!");
      },
    },
    {
      icon: (
        <div className="flex items-center gap-1">
          <DownloadIcon size={18} />
          <ChevronDownIcon size={14} />
        </div>
      ),
      description: "Download",
      onClick: () => {},
      menuItems: [
        {
          label: "Markdown (.md)",
          onClick: ({ content, currentVersionIndex }) => {
            downloadFile(
              `artifact-v${currentVersionIndex + 1}.md`,
              content,
              "text/markdown;charset=utf-8"
            );
            toast.success("Markdown downloaded");
          },
        },
        {
          label: "Plain text (.txt)",
          onClick: ({ content, currentVersionIndex }) => {
            downloadFile(
              `artifact-v${currentVersionIndex + 1}.txt`,
              markdownToPlainText(content),
              "text/plain;charset=utf-8"
            );
            toast.success("Text downloaded");
          },
        },
        {
          label: "PDF (print)",
          onClick: ({ content }) => {
            const html = markdownToHTML(content);
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Artifact PDF</title>
  <style>
    * { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
      padding: 40px;
      line-height: 1.6;
      color: #1a1a1a;
      background: white;
    }
    h1 { font-size: 28px; font-weight: 700; margin: 24px 0 16px 0; }
    h2 { font-size: 24px; font-weight: 700; margin: 20px 0 12px 0; }
    h3 { font-size: 20px; font-weight: 700; margin: 16px 0 10px 0; }
    h4, h5, h6 { font-size: 16px; font-weight: 700; margin: 12px 0 8px 0; }
    p { margin: 12px 0; }
    code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 14px;
    }
    ul, ol {
      margin: 12px 0 12px 24px;
    }
    li {
      margin: 6px 0;
    }
    strong { font-weight: 600; }
    em { font-style: italic; }
    a {
      color: #0066cc;
      text-decoration: none;
    }
    a:hover { text-decoration: underline; }
    @media print {
      body { padding: 20px; }
      h1 { page-break-after: avoid; }
      h2 { page-break-after: avoid; }
      h3 { page-break-after: avoid; }
    }
  </style>
</head>
<body>${html}</body>
</html>`;

            try {
              const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const popup = window.open(url, "_blank", "noopener,noreferrer");
              
              if (!popup) {
                toast.error("Could not open print window.");
                URL.revokeObjectURL(url);
                return;
              }
              
              // Give the popup time to load before printing
              setTimeout(() => {
                popup.focus();
                popup.print();
                toast.success("Print dialog opened for PDF export");
              }, 500);
            } catch (error) {
              toast.error("Failed to open print dialog");
              console.error(error);
            }
          },
        },
      ],
    },
  ],
  toolbar: [
    {
      icon: <PenIcon />,
      description: "Add final polish",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.",
            },
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: "Request suggestions",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please add suggestions you have that could improve the writing.",
            },
          ],
        });
      },
    },
  ],
});
