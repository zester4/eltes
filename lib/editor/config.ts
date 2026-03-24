import { tableNodes } from "prosemirror-tables";
import { textblockTypeInputRule } from "prosemirror-inputrules";
import { Schema } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { MutableRefObject } from "react";

import { buildContentFromDocument } from "./functions";

export const documentSchema = new Schema({
  nodes: addListNodes(
    schema.spec.nodes.append(
      tableNodes({
        tableGroup: "block",
        cellContent: "block+",
        cellAttributes: {
          background: {
            default: null,
            getFromDOM(dom) {
              return (dom as HTMLElement).style.backgroundColor || null;
            },
            setDOMAttr(value, attrs) {
              if (value) attrs.style = (attrs.style || "") + `background-color: ${value};`;
            },
          },
        },
      })
    ).append({
      chart: {
        group: "block",
        content: "text*",
        marks: "",
        code: true,
        defining: true,
        attrs: {
          data: { default: "" },
        },
        parseDOM: [{ tag: "chart", getAttrs: (dom: string | HTMLElement) => ({ data: (dom as HTMLElement).dataset.chart || "" }) }],
        toDOM(node: any) {
          return ["chart", { "data-chart": node.attrs.data }, 0];
        },
      },
    }),
    "paragraph block*",
    "block"
  ),
  marks: schema.spec.marks,
});

export function headingRule(level: number) {
  return textblockTypeInputRule(
    new RegExp(`^(#{1,${level}})\\s$`),
    documentSchema.nodes.heading,
    () => ({ level })
  );
}

export const handleTransaction = ({
  transaction,
  editorRef,
  onSaveContent,
}: {
  transaction: Transaction;
  editorRef: MutableRefObject<EditorView | null>;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
}) => {
  if (!editorRef || !editorRef.current) {
    return;
  }

  const newState = editorRef.current.state.apply(transaction);
  editorRef.current.updateState(newState);

  if (transaction.docChanged && !transaction.getMeta("no-save")) {
    const updatedContent = buildContentFromDocument(newState.doc);

    if (transaction.getMeta("no-debounce")) {
      onSaveContent(updatedContent, false);
    } else {
      onSaveContent(updatedContent, true);
    }
  }
};
