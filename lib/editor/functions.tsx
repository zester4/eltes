"use client";

import { marked } from "marked";
import {
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";
import { DOMParser, type Node } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

import { documentSchema } from "./config";
import { createSuggestionWidget, type UISuggestion } from "./suggestions";

// Custom serializer for tables and charts
const customSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    table(state, node) {
      node.forEach((row, _, i) => {
        state.render(row, node, i);
        if (i === 0) {
          state.write("| ");
          row.forEach((_, __, j) => {
            if (j > 0) state.write(" | ");
            state.write("---");
          });
          state.write(" |\n");
        }
      });
      state.write("\n");
    },
    table_row(state, node) {
      state.write("| ");
      node.forEach((cell, _, i) => {
        if (i > 0) state.write(" | ");
        state.render(cell, node, i);
      });
      state.write(" |\n");
    },
    table_cell(state, node) {
      state.renderInline(node);
    },
    table_header(state, node) {
      state.renderInline(node);
    },
    chart(state, node) {
      state.write("```chart\n");
      state.text(node.attrs.data);
      state.write("\n```\n");
    },
  },
  defaultMarkdownSerializer.marks
);

export const buildDocumentFromContent = (content: string) => {
  const parser = DOMParser.fromSchema(documentSchema);

  // Pre-process markdown to handle chart code blocks for DOMParser
  const processedContent = content.replace(
    /```chart\n([\s\S]*?)\n```/g,
    (_, data) => `<chart data-chart="${data.replace(/"/g, "&quot;")}"></chart>`
  );

  const htmlString = marked.parse(processedContent, { async: false }) as string;
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = htmlString;
  return parser.parse(tempContainer);
};

export const buildContentFromDocument = (document: Node) => {
  return customSerializer.serialize(document);
};

export const createDecorations = (
  suggestions: UISuggestion[],
  view: EditorView
) => {
  const decorations: Decoration[] = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: "suggestion-highlight",
        },
        {
          suggestionId: suggestion.id,
          type: "highlight",
        }
      )
    );

    decorations.push(
      Decoration.widget(
        suggestion.selectionStart,
        (currentView) => {
          const { dom } = createSuggestionWidget(suggestion, currentView);
          return dom;
        },
        {
          suggestionId: suggestion.id,
          type: "widget",
        }
      )
    );
  }

  return DecorationSet.create(view.state.doc, decorations);
};
