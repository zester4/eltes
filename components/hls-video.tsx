"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";

interface HlsVideoProps {
  className?: string;
  poster?: string;
  src: string;
}

export function HlsVideo({ src, poster, className = "" }: HlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        capLevelToPlayerSize: true,
        maxBufferLength: 30,
        enableWorker: true,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video
          .play()
          .catch((e) => console.error("Video autoplay prevented:", e));
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", () => {
        video
          .play()
          .catch((e) => console.error("Video autoplay prevented:", e));
      });
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [src]);

  return (
    <video
      className={`absolute inset-0 w-full h-full object-cover z-0 ${className}`}
      loop
      muted
      playsInline
      poster={poster}
      ref={videoRef}
    />
  );
}
