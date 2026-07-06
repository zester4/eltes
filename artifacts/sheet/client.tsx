import { parse, unparse } from "papaparse";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Artifact } from "@/components/create-artifact";
import {
  CopyIcon,
  DownloadIcon,
  LineChartIcon,
  RedoIcon,
  SparklesIcon,
  UndoIcon,
} from "@/components/icons";
import { SpreadsheetEditor } from "@/components/sheet-editor";
import { isSheetData, type SheetData } from "@/lib/ai/tools/sheet-types";

type Metadata = any;

function downloadFile(filename: string, content: BlobPart, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getSheetData(content: string): SheetData {
  try {
    const parsed = JSON.parse(content);
    if (isSheetData(parsed)) {
      return parsed;
    }
  } catch {}
  return {
    title: "Spreadsheet",
    sheets: [{ name: "Sheet1", csv: content }],
  };
}

export const sheetArtifact = new Artifact<"sheet", Metadata>({
  kind: "sheet",
  description: "Useful for working with spreadsheets",
  initialize: () => null,
  onStreamPart: ({ setArtifact, streamPart }) => {
    if (streamPart.type === "data-sheetDelta") {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.data,
        isVisible: true,
        status: "streaming",
      }));
    }
  },
  content: ({ content, currentVersionIndex, onSaveContent, status }) => {
    return (
      <SpreadsheetEditor
        content={content}
        currentVersionIndex={currentVersionIndex}
        isCurrentVersion={true}
        saveContent={onSaveContent}
        status={status}
      />
    );
  },
  actions: [
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
      icon: <CopyIcon />,
      description: "Copy active sheet as CSV",
      onClick: ({ content }) => {
        const data = getSheetData(content);
        const csv = data.sheets[0]?.csv ?? "";
        const parsed = parse<string[]>(csv, { skipEmptyLines: true });

        const nonEmptyRows = parsed.data.filter((row) =>
          row.some((cell) => cell.trim() !== "")
        );

        const cleanedCsv = unparse(nonEmptyRows);

        navigator.clipboard.writeText(cleanedCsv);
        toast.success("Copied csv to clipboard!");
      },
    },
    {
      icon: <DownloadIcon />,
      description: "Download as XLSX",
      onClick: ({ content, currentVersionIndex }) => {
        const data = getSheetData(content);
        const wb = XLSX.utils.book_new();

        data.sheets.forEach((sheet) => {
          const parsed = parse<string[]>(sheet.csv, { skipEmptyLines: true });
          const ws = XLSX.utils.aoa_to_sheet(parsed.data);
          XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
        });

        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        downloadFile(
          `${data.title.replace(/\s+/g, "_")}-v${currentVersionIndex + 1}.xlsx`,
          wbout,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        toast.success("Workbook downloaded as XLSX");
      },
    },
    {
      icon: (
        <svg
          fill="none"
          height="16"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="16"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
      ),
      description: "Download active sheet as CSV",
      onClick: ({ content, currentVersionIndex }) => {
        const data = getSheetData(content);
        const csv = data.sheets[0]?.csv ?? "";
        const parsed = parse<string[]>(csv, { skipEmptyLines: true });
        const nonEmptyRows = parsed.data.filter((row) =>
          row.some((cell) => cell.trim() !== "")
        );
        const cleanedCsv = unparse(nonEmptyRows);

        downloadFile(
          `sheet-v${currentVersionIndex + 1}.csv`,
          cleanedCsv,
          "text/csv;charset=utf-8"
        );
        toast.success("CSV downloaded");
      },
    },
  ],
  toolbar: [
    {
      description: "Format and clean data",
      icon: <SparklesIcon />,
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            { type: "text", text: "Can you please format and clean the data?" },
          ],
        });
      },
    },
    {
      description: "Analyze and visualize data",
      icon: <LineChartIcon />,
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Can you please analyze and visualize the data by creating a new code artifact in python?",
            },
          ],
        });
      },
    },
  ],
});
