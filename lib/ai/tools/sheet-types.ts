export interface SheetStyle {
  [cell: string]: {
    backgroundColor?: string;
    color?: string;
    bold?: boolean;
    textAlign?: "left" | "center" | "right";
  };
}

export interface Sheet {
  csv: string;
  name: string;
  styles?: SheetStyle;
}

export interface SheetData {
  activeSheetIndex?: number;
  sheets: Sheet[];
  title: string;
}

export function isSheetData(content: any): content is SheetData {
  return (
    content &&
    typeof content === "object" &&
    typeof content.title === "string" &&
    Array.isArray(content.sheets)
  );
}
