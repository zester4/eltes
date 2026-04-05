"use client";

import type { Experimental_GeneratedImage } from "ai";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

export type ImageProps = Experimental_GeneratedImage & {
  className?: string;
  alt?: string;
};

export const Image = ({
  base64,
  uint8Array,
  mediaType,
  ...props
}: ImageProps) => {
  const imageUrl = `data:${mediaType};base64,${base64}`;

  return (
    <div className="group relative w-fit overflow-hidden rounded-xl border border-white/10 shadow-2xl transition-all duration-300 hover:ring-1 hover:ring-primary/40">
      {/* biome-ignore lint/performance/noImgElement: base64 data URLs require native img */}
      <img
        {...props}
        alt={props.alt}
        className={cn(
          "h-auto max-w-full overflow-hidden object-cover transition-transform duration-500 group-hover:scale-105",
          props.className
        )}
        src={imageUrl}
      />
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      
      <a
        href={imageUrl}
        download={`etles-gen-${Date.now()}.png`}
        className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-white/80 opacity-0 transition-all duration-300 hover:bg-primary/20 hover:text-white group-hover:opacity-100 ring-1 ring-white/10 shadow-lg"
        title="Download Image"
      >
        <Download size={14} />
      </a>
    </div>
  );
};
