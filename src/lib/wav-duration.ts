export function getWavDurationSeconds(audio: Uint8Array): number {
  if (
    audio.length < 44
    || new TextDecoder().decode(audio.subarray(0, 4)) !== "RIFF"
    || new TextDecoder().decode(audio.subarray(8, 12)) !== "WAVE"
  ) {
    throw new Error("invalid_wav");
  }
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  let byteRate = 0;
  for (let offset = 12; offset + 8 <= audio.length;) {
    const chunk = new TextDecoder().decode(audio.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (chunk === "fmt " && size >= 12 && offset + 16 <= audio.length) {
      byteRate = view.getUint32(offset + 16, true);
    } else if (chunk === "data") {
      if (!byteRate || size <= 0 || offset + 8 + size > audio.length) throw new Error("invalid_wav");
      const duration = size / byteRate;
      if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new Error("invalid_wav_duration");
      return Math.ceil(duration * 100) / 100;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("missing_wav_audio_data");
}
