import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

type TutorialVideo = { id: string; title: string; subtitle: string | null; description: string | null; video_url: string; cover_url: string | null; position: number };

export default function Tutorial() {
  const [videos, setVideos] = useState<TutorialVideo[]>([]);
  const [playing, setPlaying] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    supabase.from("tutorial_videos").select("id,title,subtitle,description,video_url,cover_url,position").eq("is_published", true).order("position").then(({ data }) => setVideos((data || []) as TutorialVideo[]));
  }, []);
  return (
    <DashboardShell title="Tutorial" description="Aprenda a usar a Muwoyo passo a passo.">
      <div className="grid gap-6 lg:grid-cols-2">
        {videos.map((video) => (
          <Card key={video.id} className="overflow-hidden rounded-lg border-border/70 bg-card shadow-sm">
            <VideoFrame video={video} playing={Boolean(playing[video.id])} onPlay={() => setPlaying((current) => ({ ...current, [video.id]: true }))} />
            <CardHeader className="space-y-1 px-4 py-3">
              <CardTitle className="line-clamp-2 text-sm font-medium leading-5">{video.title}</CardTitle>
              {video.subtitle && <p className="line-clamp-1 text-xs text-muted-foreground">{video.subtitle}</p>}
              {video.description && (
                <>
                  <p className={`text-xs leading-5 text-muted-foreground ${expanded[video.id] ? "whitespace-pre-line" : "line-clamp-2"}`}>
                    {video.description}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8 w-fit px-3 text-xs text-primary"
                    onClick={() => setExpanded((current) => ({ ...current, [video.id]: !current[video.id] }))}
                  >
                    {expanded[video.id] ? "Ocultar descrição" : "Ver descrição completa"}
                    {expanded[video.id] ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
                  </Button>
                </>
              )}
              <a href={video.video_url} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                Abrir link original <ExternalLink className="h-3 w-3" />
              </a>
            </CardHeader>
          </Card>
        ))}
        {!videos.length && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Os tutoriais serão adicionados em breve.</CardContent></Card>}
      </div>
    </DashboardShell>
  );
}

function VideoFrame({ video, playing, onPlay }: { video: TutorialVideo; playing: boolean; onPlay: () => void }) {
  const source = normalizeVideoUrl(video.video_url);
  const isFile = /\.(mp4|webm|ogg)(\?.*)?$/i.test(source);
  if (isFile) return <div className="relative aspect-video bg-black"><video className="h-full w-full" controls controlsList="nodownload" poster={video.cover_url || undefined} src={source} /></div>;
  if (video.cover_url && !playing) return <button type="button" onClick={onPlay} className="group relative aspect-video w-full overflow-hidden bg-black text-left"><img src={video.cover_url} alt={`Capa de ${video.title}`} className="h-full w-full object-cover transition group-hover:scale-[1.02]" /><span className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm font-semibold text-white">Reproduzir vídeo</span></button>;
  return <div className="aspect-video bg-black"><iframe className="h-full w-full" src={source} title={video.title} referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>;
}

function normalizeVideoUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") {
      const videoId = url.pathname.slice(1).split("/")[0];
      return `https://www.youtube.com/embed/${videoId}?${new URLSearchParams({ autoplay: "1", rel: "0", origin: window.location.origin })}`;
    }
    if (url.hostname.endsWith("youtube.com")) {
      const videoId = url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|live|embed)\/([^/?]+)/)?.[1];
      if (videoId) return `https://www.youtube.com/embed/${videoId}?${new URLSearchParams({ autoplay: "1", rel: "0", origin: window.location.origin })}`;
    }
    if (url.hostname.endsWith("vimeo.com")) {
      const videoId = url.pathname.split("/").filter(Boolean).pop();
      if (videoId) return `https://player.vimeo.com/video/${videoId}?autoplay=1`;
    }
  } catch { /* keep direct/embed URL */ }
  return value;
}
