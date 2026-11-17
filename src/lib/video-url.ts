export function normalizeVideoUrl(value: string) {
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
  } catch {
    return value;
  }
  return value;
}

export function isVideoFile(value: string) {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(value);
}
