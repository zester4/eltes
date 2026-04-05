"use client";

import { Download, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";

export interface VideoProps {
  url: string;
  className?: string;
  poster?: string;
  aspectRatio?: "video" | "square" | "portrait";
}

export const Video = ({
  url,
  className,
  poster,
  aspectRatio = "video",
}: VideoProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleDownload = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `etles-video-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div 
      className={cn(
        "group relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl transition-all duration-500 hover:ring-1 hover:ring-primary/40",
        aspectRatio === "video" && "aspect-video",
        aspectRatio === "square" && "aspect-square",
        aspectRatio === "portrait" && "aspect-[9/16]",
        className
      )}
    >
      <video
        ref={videoRef}
        src={url}
        poster={poster || `${url}#t=0.1`}
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        controls={isPlaying}
        playsInline
      />

      {!isPlaying && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-all duration-300 group-hover:bg-black/40 cursor-pointer"
          onClick={togglePlay}
        >
          <div className="flex size-16 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-xl ring-1 ring-white/20 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/20 group-hover:text-primary group-hover:ring-primary/40">
            <PlayCircle size={32} fill="currentColor" fillOpacity={0.2} />
          </div>
        </div>
      )}

      {/* Top Badge */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <div className="rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[10px] font-bold text-white shadow-lg ring-1 ring-white/20">
          Veo 3.1 Synthesis
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none">
        <div className="flex justify-end pointer-events-auto">
          <button
            onClick={handleDownload}
            className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md ring-1 ring-white/20 transition-all duration-300 hover:bg-primary/20 hover:text-white hover:ring-primary/40 shadow-lg"
            title="Download Video"
          >
            <Download size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
