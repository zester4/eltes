import type { Metadata } from "next";
import { Suspense } from "react";
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";

export const metadata: Metadata = {
  title: "Browser Live View | Etles",
  description: "Real-time browser automation preview",
};

export default function BrowserLivePage(props: {
  searchParams: Promise<{ liveUrl?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground">
          Loading preview...
        </div>
      }
    >
      <BrowserLiveContent {...props} />
    </Suspense>
  );
}

async function BrowserLiveContent({
  searchParams,
}: {
  searchParams: Promise<{ liveUrl?: string }>;
}) {
  const { liveUrl } = await searchParams;

  if (!liveUrl) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        No live URL provided.
      </p>
    );
  }

  return (
    <div className="w-full h-screen bg-background overflow-hidden flex flex-col p-4">
      <WebPreview
        className="flex-1 shadow-2xl overflow-hidden border-muted-foreground/20"
        defaultUrl={liveUrl}
      >
        <WebPreviewNavigation className="bg-muted/30 backdrop-blur-sm">
          <WebPreviewUrl
            className="bg-background/50 border-muted-foreground/20"
            readOnly
            value={liveUrl}
          />
        </WebPreviewNavigation>
        <WebPreviewBody className="bg-white" />
      </WebPreview>
    </div>
  );
}
