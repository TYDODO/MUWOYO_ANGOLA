import { parseVoiceTuning } from "../../../src/lib/voice-tuning.ts";

export const FISH_API_BASE = "https://api.fish.audio";

export function getFishApiKey(): string {
  const apiKey = Deno.env.get("FISH_AUDIO_API_KEY");
  if (!apiKey || apiKey === "__REPLACE_WITH_FISH_AUDIO_API_KEY__") {
    throw new Error("fish_audio_not_configured");
  }
  return apiKey;
}

export async function synthesizeFishSpeech(
  text: string,
  modelId: string,
  inputTuning?: unknown,
): Promise<Uint8Array> {
  const apiKey = getFishApiKey();
  const tuning = parseVoiceTuning(inputTuning);
  const response = await fetch(`${FISH_API_BASE}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    body: JSON.stringify({
      text,
      reference_id: modelId,
      format: "mp3",
      prosody: tuning.prosody,
      temperature: tuning.temperature,
      top_p: tuning.top_p,
      chunk_length: tuning.chunk_length,
      normalize: tuning.normalize,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    console.error(JSON.stringify({ event: "fish_tts_failed", status: response.status }));
    throw new Error(`fish_tts_failed_${response.status}`);
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (!audio.length || audio.length > 30 * 1024 * 1024) throw new Error("fish_tts_invalid_audio_size");
  return audio;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
