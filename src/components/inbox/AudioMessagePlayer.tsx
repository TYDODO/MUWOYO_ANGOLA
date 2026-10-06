import { useRef, useState } from "react";
import { LoaderCircle, Pause, Play, RotateCcw } from "lucide-react";

type AudioMessagePlayerProps = {
  src: string;
  voiceNote?: boolean;
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
};

function getWaveform(src: string) {
  let seed = 0;
  for (const character of src) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  return Array.from({ length: 36 }, (_, index) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return 7 + ((seed >>> 16) % 19) + (index % 5 === 0 ? 4 : 0);
  });
}

export default function AudioMessagePlayer({ src, voiceNote = false }: AudioMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [waveform] = useState(() => getWaveform(src));
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(false);
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
        setError(true);
        setLoading(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (clientX: number, element: HTMLElement) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const bounds = element.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    audio.currentTime = fraction * duration;
    setCurrentTime(audio.currentTime);
  };

  const retry = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(false);
    setLoading(true);
    audio.load();
  };

  return (
    <div className="mb-1 w-full min-w-[210px] max-w-[300px] rounded-xl border border-[#d9dfd4] bg-[#f6f9f5] p-2.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadStart={() => { setLoading(true); setError(false); }}
        onLoadedMetadata={(event) => {
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
          setLoading(false);
        }}
        onCanPlay={() => setLoading(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(duration); }}
        onError={() => { setLoading(false); setPlaying(false); setError(true); }}
        className="hidden"
      />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          disabled={error}
          onClick={() => void togglePlayback()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#167b69] text-white transition hover:bg-[#116657] disabled:opacity-50"
          aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
        </button>
        <div className="min-w-0 flex-1">
          <div
            role="slider"
            aria-label="Progresso do áudio"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
            tabIndex={error || !duration ? -1 : 0}
            onClick={(event) => seek(event.clientX, event.currentTarget)}
            onKeyDown={(event) => {
              if (!audioRef.current || !duration) return;
              if (event.key === "ArrowRight") audioRef.current.currentTime = Math.min(duration, currentTime + 5);
              else if (event.key === "ArrowLeft") audioRef.current.currentTime = Math.max(0, currentTime - 5);
              else return;
              event.preventDefault();
            }}
            className={`flex h-9 cursor-pointer items-center gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#167b69] ${error ? "opacity-40" : ""}`}
          >
            {waveform.map((height, index) => {
              const barProgress = progress * waveform.length - index;
              return (
                <span
                  key={index}
                  className="block min-w-[2px] flex-1 rounded-full"
                  style={{
                    height: `${height}px`,
                    background: barProgress >= 1
                      ? "#167b69"
                      : barProgress > 0
                        ? `linear-gradient(to right, #167b69 ${barProgress * 100}%, #b7c0b5 ${barProgress * 100}%)`
                        : "#b7c0b5",
                  }}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] font-medium text-[#55635d]">
            <span>{error ? "Áudio indisponível" : voiceNote ? "Nota de voz" : "Áudio"}</span>
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
        </div>
        {error && (
          <button type="button" onClick={retry} aria-label="Tentar carregar áudio novamente" className="rounded p-1 text-[#55635d] hover:bg-[#e4ebe2]">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}