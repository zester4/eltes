"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { motion } from "framer-motion";
import {
  Bell,
  FolderKanban,
  MessageCircleMore,
  NotebookPen,
} from "lucide-react";
import { memo } from "react";
import type { ChatMessage } from "@/lib/types";
import { Suggestion } from "./elements/suggestion";
import type { VisibilityType } from "./visibility-selector";

type SuggestedActionsProps = {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  selectedVisibilityType: VisibilityType;
};

function PureSuggestedActions({ chatId, sendMessage }: SuggestedActionsProps) {
  const suggestedActions = [
    {
      icon: MessageCircleMore,
      text: "What have we discussed about my project so far?",
    },
    {
      icon: Bell,
      text: "Remind me in 2 hours to check my Gmail",
    },
    {
      icon: FolderKanban,
      text: "Create a new task in my Notion for the project sync",
    },
    {
      icon: NotebookPen,
      text: "Remember that I prefer using TypeScript for my projects",
    },
  ];

  return (
    <div
      className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2"
      data-testid="suggested-actions"
    >
      {suggestedActions.map(({ icon: Icon, text }, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          initial={{ opacity: 0, y: 20 }}
          key={text}
          transition={{ delay: 0.05 * index }}
        >
          <Suggestion
            className="h-full min-h-[68px] w-full items-start justify-start gap-2 whitespace-normal rounded-xl border-border/70 bg-card/75 p-3 text-left text-[11px] leading-4 shadow-xs backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-md sm:text-xs"
            onClick={(suggestion) => {
              window.history.pushState({}, "", `/chat/${chatId}`);
              sendMessage({
                role: "user",
                parts: [{ type: "text", text: suggestion }],
              });
            }}
            suggestion={text}
          >
            <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{text}</span>
          </Suggestion>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }

    return true;
  }
);
