"use client";

import { useTheme } from "next-themes";
import { parse, unparse } from "papaparse";
import { memo, useEffect, useMemo, useState } from "react";
import DataGrid, { type Column, textEditor } from "react-data-grid";
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
  getValue: (rowIdx: number, colIdx: number) => number,
): number | string {
  const expression = formula.trim().replace(/^=/, "");
  const sumMatch = expression.match(
    /^SUM\(\s*([A-Z]+)(\d+)\s*:\s*([A-Z]+)(\d+)\s*\)$/i,
  );
  if (sumMatch) {
    const startCol = colLettersToIndex(sumMatch[1]);
    const startRow = Number(sumMatch[2]) - 1;
    const endCol = colLettersToIndex(sumMatch[3]);
    const endRow = Number(sumMatch[4]) - 1;
    let total = 0;
    for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
      for (let c = Math.min(startCol, endCol); c <= Math.max(startCol, endCol); c++) {
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
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return "#ERR";
  } catch {
    return "#ERR";
  }
}

const PureSpreadsheetEditor = ({ content, saveContent }: SheetEditorProps) => {
  const { resolvedTheme } = useTheme();

  const parseData = useMemo(() => {
    if (!content) {
      return new Array(MIN_ROWS).fill(new Array(MIN_COLS).fill(""));
    }
    const result = parse<string[]>(content, { skipEmptyLines: true });

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
  }, [content]);

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
      if (!row) return 0;
      const raw = row[colIdx.toString()];
      if (typeof raw === "number") return raw;
      if (typeof raw !== "string") return 0;
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
      cellClass: "border-t border-r dark:bg-zinc-950 dark:text-zinc-50",
      headerCellClass: "border-t border-r dark:bg-zinc-900 dark:text-zinc-50",
    };

    const dataColumns = Array.from({ length: MIN_COLS }, (_, i) => ({
      key: i.toString(),
      name: String.fromCharCode(65 + i),
      renderEditCell: textEditor,
      renderCell: ({ row }: { row: SheetRow }) => {
        const value = row[i.toString()];
        if (typeof value === "string" && value.trim().startsWith("=")) {
          return String(evaluateFormula(value, getNumericCellValue));
        }
        return value;
      },
      width: 120,
      cellClass: cn("border-t dark:bg-zinc-950 dark:text-zinc-50", {
        "border-l": i !== 0,
      }),
      headerCellClass: cn("border-t dark:bg-zinc-900 dark:text-zinc-50", {
        "border-l": i !== 0,
      }),
    }));

    return [rowNumberColumn, ...dataColumns];
  }, [localRows]);

  const generateCsv = (data: string[][]) => {
    return unparse(data);
  };

  const handleRowsChange = (newRows: SheetRow[]) => {
    setLocalRows(newRows);

    const updatedData = newRows.map((row) => {
      return columns
        .slice(1)
        .map((col) => String(row[col.key.toString()] ?? ""));
    });

    const newCsvContent = generateCsv(updatedData);
    saveContent(newCsvContent, true);
  };

  return (
    <DataGrid
      className={resolvedTheme === "dark" ? "rdg-dark" : "rdg-light"}
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
