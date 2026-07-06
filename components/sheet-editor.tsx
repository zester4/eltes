"use client";

import { useTheme } from "next-themes";
import { parse, unparse } from "papaparse";
import { memo, useEffect, useMemo, useState } from "react";
import DataGrid, { type Column, textEditor } from "react-data-grid";
import { isSheetData, type SheetData } from "@/lib/ai/tools/sheet-types";
import { cn } from "@/lib/utils";

import "react-data-grid/lib/styles.css";

type SheetEditorProps = {
  content: string;
  saveContent: (content: string, isCurrentVersion: boolean) => void;
  currentVersionIndex: number;
  isCurrentVersion: boolean;
  status: string;
};

const MIN_ROWS = 50;
const MIN_COLS = 26;

type SheetRow = {
  id: number;
  rowNumber: number;
  [key: string]: string | number;
};

function colLettersToIndex(col: string): number {
  let result = 0;
  for (const ch of col.toUpperCase()) {
    result = result * 26 + (ch.charCodeAt(0) - 64);
  }
  return result - 1;
}

function evaluateFormula(
  formula: string,
  getValue: (rowIdx: number, colIdx: number) => number
): number | string {
  const expression = formula.trim().replace(/^=/, "");
  const sumMatch = expression.match(
    /^SUM\(\s*([A-Z]+)(\d+)\s*:\s*([A-Z]+)(\d+)\s*\)$/i
  );
  if (sumMatch) {
    const startCol = colLettersToIndex(sumMatch[1]);
    const startRow = Number(sumMatch[2]) - 1;
    const endCol = colLettersToIndex(sumMatch[3]);
    const endRow = Number(sumMatch[4]) - 1;
    let total = 0;
    for (
      let r = Math.min(startRow, endRow);
      r <= Math.max(startRow, endRow);
      r++
    ) {
      for (
        let c = Math.min(startCol, endCol);
        c <= Math.max(startCol, endCol);
        c++
      ) {
        total += getValue(r, c);
      }
    }
    return total;
  }

  const replaced = expression.replace(/([A-Z]+)(\d+)/gi, (_, col, row) => {
    const colIdx = colLettersToIndex(col);
    const rowIdx = Number(row) - 1;
    return String(getValue(rowIdx, colIdx));
  });
  if (!/^[0-9+\-*/().\s]+$/.test(replaced)) {
    return "#ERR";
  }
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${replaced});`)();
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    return "#ERR";
  } catch {
    return "#ERR";
  }
}

function indexToCoordinate(rowIdx: number, colIdx: number): string {
  const col = String.fromCharCode(65 + colIdx);
  const row = rowIdx + 1;
  return `${col}${row}`;
}

const PureSpreadsheetEditor = ({
  content,
  saveContent,
  status,
}: SheetEditorProps) => {
  const { resolvedTheme } = useTheme();

  // 1. Parse JSON or CSV
  const sheetData = useMemo<SheetData>(() => {
    try {
      const parsed = JSON.parse(content);
      if (isSheetData(parsed)) {
        return parsed;
      }
    } catch {}

    // Fallback for plain CSV or streaming JSON that hasn't closed yet
    if (content.trim().startsWith("{")) {
      try {
        // Simple heuristic for partial JSON
        const matchTitle = content.match(/"title":\s*"([^"]+)"/);
        const matchSheets = content.match(/"sheets":\s*\[/);
        if (matchTitle || matchSheets) {
          return {
            title: matchTitle ? matchTitle[1] : "New Spreadsheet",
            sheets: [{ name: "Sheet1", csv: "" }],
          };
        }
      } catch {}
    }

    return {
      title: "New Spreadsheet",
      sheets: [{ name: "Sheet1", csv: content }],
    };
  }, [content]);

  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  // Reset active sheet if it's out of bounds
  useEffect(() => {
    if (activeSheetIndex >= sheetData.sheets.length) {
      setActiveSheetIndex(0);
    }
  }, [sheetData.sheets.length]);

  const activeSheet = sheetData.sheets[activeSheetIndex];
  const activeCsv = activeSheet?.csv ?? "";
  const activeStyles = activeSheet?.styles ?? {};

  const parseData = useMemo(() => {
    if (!activeCsv) {
      return new Array(MIN_ROWS).fill(new Array(MIN_COLS).fill(""));
    }
    const result = parse<string[]>(activeCsv, { skipEmptyLines: true });

    const paddedData = result.data.map((row) => {
      const paddedRow = [...row];
      while (paddedRow.length < MIN_COLS) {
        paddedRow.push("");
      }
      return paddedRow;
    });

    while (paddedData.length < MIN_ROWS) {
      paddedData.push(new Array(MIN_COLS).fill(""));
    }

    return paddedData;
  }, [activeCsv]);

  const initialRows = useMemo<SheetRow[]>(() => {
    return parseData.map((row, rowIndex) => {
      const rowData: SheetRow = {
        id: rowIndex,
        rowNumber: rowIndex + 1,
      };

      for (let colIndex = 0; colIndex < MIN_COLS; colIndex++) {
        rowData[colIndex.toString()] = row[colIndex] || "";
      }

      return rowData;
    });
  }, [parseData]);

  const [localRows, setLocalRows] = useState<SheetRow[]>(initialRows);

  useEffect(() => {
    setLocalRows(initialRows);
  }, [initialRows]);

  const columns = useMemo<Column<SheetRow>[]>(() => {
    const getNumericCellValue = (rowIdx: number, colIdx: number): number => {
      const row = localRows[rowIdx];
      if (!row) {
        return 0;
      }
      const raw = row[colIdx.toString()];
      if (typeof raw === "number") {
        return raw;
      }
      if (typeof raw !== "string") {
        return 0;
      }
      if (raw.trim().startsWith("=")) {
        const computed = evaluateFormula(raw, getNumericCellValue);
        return typeof computed === "number" ? computed : 0;
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const rowNumberColumn = {
      key: "rowNumber",
      name: "",
      frozen: true,
      width: 50,
      renderCell: ({ rowIdx }: { rowIdx: number }) => rowIdx + 1,
      cellClass:
        "border-t border-r bg-zinc-50 dark:bg-zinc-950 text-zinc-500 text-xs flex items-center justify-center",
      headerCellClass: "border-t border-r bg-zinc-100 dark:bg-zinc-900",
    };

    const dataColumns = Array.from({ length: MIN_COLS }, (_, i) => ({
      key: i.toString(),
      name: String.fromCharCode(65 + i),
      renderEditCell: textEditor,
      renderCell: ({ row, rowIdx }: { row: SheetRow; rowIdx: number }) => {
        const value = row[i.toString()];
        const isHeader = row.rowNumber === 1;
        const coord = indexToCoordinate(rowIdx, i);
        const style = activeStyles[coord];

        const cellContent =
          typeof value === "string" && value.trim().startsWith("=")
            ? String(evaluateFormula(value, getNumericCellValue))
            : value;

        return (
          <div
            className={cn("w-full h-full flex items-center px-2", {
              "font-bold": isHeader || style?.bold,
            })}
            style={{
              backgroundColor: style?.backgroundColor,
              color: style?.color,
              textAlign: style?.textAlign || (isHeader ? "center" : "left"),
              justifyContent:
                style?.textAlign === "center"
                  ? "center"
                  : style?.textAlign === "right"
                    ? "flex-end"
                    : "flex-start",
            }}
          >
            {cellContent}
          </div>
        );
      },
      width: 120,
      cellClass: (row: SheetRow) =>
        cn(
          "border-t border-l border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 p-0",
          {
            "bg-blue-50/50 dark:bg-blue-900/20": row.rowNumber === 1,
          }
        ),
      headerCellClass:
        "border-t border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 font-normal text-xs",
    }));

    return [rowNumberColumn, ...dataColumns];
  }, [localRows, activeStyles]);

  const handleRowsChange = (newRows: SheetRow[]) => {
    setLocalRows(newRows);

    const updatedCsv = unparse(
      newRows.map((row) => {
        return columns
          .slice(1)
          .map((col) => String(row[col.key.toString()] ?? ""));
      })
    );

    const updatedSheetData = { ...sheetData };
    updatedSheetData.sheets[activeSheetIndex].csv = updatedCsv;

    saveContent(JSON.stringify(updatedSheetData, null, 2), true);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 min-h-0">
      {/* Excel-style Title Bar */}
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
            {sheetData.title}
          </h2>
          {status === "streaming" && (
            <p className="text-xs text-blue-500 animate-pulse mt-1">
              Building comprehensive workbook...
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded">
            XLSX Mode
          </span>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 min-h-0">
        <DataGrid
          className={cn(
            resolvedTheme === "dark" ? "rdg-dark" : "rdg-light",
            "h-full border-none text-sm"
          )}
          columns={columns}
          defaultColumnOptions={{
            resizable: true,
            sortable: true,
          }}
          enableVirtualization
          onCellClick={(args) => {
            if (args.column.key !== "rowNumber") {
              args.selectCell(true);
            }
          }}
          onRowsChange={handleRowsChange}
          rows={localRows}
          style={{ height: "100%" }}
        />
      </div>

      {/* Excel-style Tabs */}
      <div className="h-10 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center px-4 gap-1">
        <div className="flex items-center h-full mr-4 border-r border-zinc-200 dark:border-zinc-800 pr-4">
          <button className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-500">
            <svg
              fill="none"
              height="12"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="12"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-500">
            <svg
              fill="none"
              height="12"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="12"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
        {sheetData.sheets.map((sheet, idx) => (
          <button
            className={cn(
              "px-4 h-full flex items-center text-xs font-medium border-t-2 transition-colors",
              activeSheetIndex === idx
                ? "bg-white dark:bg-zinc-950 border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
            key={idx}
            onClick={() => setActiveSheetIndex(idx)}
          >
            {sheet.name}
          </button>
        ))}
        <button className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <svg
            fill="none"
            height="14"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
};

function areEqual(prevProps: SheetEditorProps, nextProps: SheetEditorProps) {
  return (
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === "streaming" && nextProps.status === "streaming") &&
    prevProps.content === nextProps.content &&
    prevProps.saveContent === nextProps.saveContent
  );
}

export const SpreadsheetEditor = memo(PureSpreadsheetEditor, areEqual);
