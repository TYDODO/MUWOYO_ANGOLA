export type WelcomeSequenceConfig = {
  audio_url?: string | null;
  audio_mimetype?: string | null;
  image_url?: string | null;
  image_mimetype?: string | null;
  video_url?: string | null;
  video_mimetype?: string | null;
  text_message?: string | null;
  send_order?: string[] | null;
};

export type WelcomeSequenceItem =
  | { kind: "audio" | "image" | "video"; url: string; mimetype: string | null }
  | { kind: "text"; text: string };

export function buildWelcomeSequenceItems(config: WelcomeSequenceConfig): WelcomeSequenceItem[] {
  const items = new Map<string, WelcomeSequenceItem>();
  if (config.audio_url?.trim()) items.set("audio", { kind: "audio", url: config.audio_url.trim(), mimetype: config.audio_mimetype || null });
  if (config.image_url?.trim()) items.set("image", { kind: "image", url: config.image_url.trim(), mimetype: config.image_mimetype || null });
  if (config.video_url?.trim()) items.set("video", { kind: "video", url: config.video_url.trim(), mimetype: config.video_mimetype || null });
  if (config.text_message?.trim()) items.set("text", { kind: "text", text: config.text_message.trim() });
  const requestedOrder = [...new Set([...(config.send_order || []), "audio", "image", "video", "text"])];
  return requestedOrder.flatMap((kind) => {
    const item = items.get(kind);
    return item ? [item] : [];
  });
}
