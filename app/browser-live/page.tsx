import { Metadata } from 'next';
import { 
  WebPreview, 
  WebPreviewNavigation, 
  WebPreviewUrl, 
  WebPreviewBody 
} from "@/components/ai-elements/web-preview";

export const metadata: Metadata = {
  title: 'Browser Live View | Etles',
  description: 'Real-time browser automation preview',
};

export default async function BrowserLivePage({
  searchParams,
}: {
  searchParams: Promise<{ liveUrl?: string }>;
}) {
  const { liveUrl } = await searchParams;
  
  if (!liveUrl) return <p className="p-8 text-center text-muted-foreground">No live URL provided.</p>;

  return (
    <div className="w-full h-screen bg-background overflow-hidden flex flex-col p-4">
      <WebPreview defaultUrl={liveUrl} className="flex-1 shadow-2xl overflow-hidden border-muted-foreground/20">
        <WebPreviewNavigation className="bg-muted/30 backdrop-blur-sm">
          <WebPreviewUrl readOnly value={liveUrl} className="bg-background/50 border-muted-foreground/20" />
        </WebPreviewNavigation>
        <WebPreviewBody className="bg-white" />
      </WebPreview>
    </div>
  );
}
