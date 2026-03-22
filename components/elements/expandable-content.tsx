"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableContentProps {
  children: React.ReactNode;
  maxLines?: number;
  className?: string;
}

export function ExpandableContent({
  children,
  maxLines = 5,
  className,
}: ExpandableContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldTruncate, setShouldTruncate] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkTruncation = () => {
      if (contentRef.current) {
        // Estimate line height (approx 1.5rem or 24px)
        const lineHeight = 24;
        const maxHeight = maxLines * lineHeight;
        if (contentRef.current.scrollHeight > maxHeight + 10) {
          setShouldTruncate(true);
        } else {
          setShouldTruncate(false);
        }
      }
    };

    checkTruncation();
    // Re-check on window resize
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [children, maxLines]);

  return (
    <div className={cn("relative flex flex-col gap-2", className)}>
      <div
        ref={contentRef}
        className={cn("relative transition-all duration-300 ease-in-out", {
          "overflow-hidden": !isExpanded && shouldTruncate,
        })}
        style={{
          maxHeight: !isExpanded && shouldTruncate ? `${maxLines * 1.5}rem` : "none",
        }}
      >
        {children}
        
        {!isExpanded && shouldTruncate && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background/90 via-background/40 to-transparent pointer-events-none" />
        )}
      </div>

      {shouldTruncate && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1 group"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="size-3 group-hover:-translate-y-0.5 transition-transform" />
              <span>Show less</span>
            </>
          ) : (
            <>
              <ChevronDown className="size-3 group-hover:translate-y-0.5 transition-transform" />
              <span>See more</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
