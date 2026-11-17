const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES = [44100, 48000, 32000];

export function getMp3DurationSeconds(audio: Uint8Array): number {
  let offset = 0;
  if (audio.length >= 10 && new TextDecoder().decode(audio.subarray(0, 3)) === "ID3") {
    const tagSize = (audio[6] << 21) | (audio[7] << 14) | (audio[8] << 7) | audio[9];
    if (audio.subarray(6, 10).some((byte) => byte & 0x80)) throw new Error("invalid_mp3_id3_size");
    offset = 10 + tagSize + ((audio[5] & 0x10) ? 10 : 0);
    if (offset > audio.length) throw new Error("invalid_mp3_id3_size");
  }

  let duration = 0;
  let frameCount = 0;
  while (offset + 4 <= audio.length) {
    const header = (audio[offset] << 24) | (audio[offset + 1] << 16) | (audio[offset + 2] << 8) | audio[offset + 3];
    const version = (header >>> 19) & 0b11;
    const layer = (header >>> 17) & 0b11;
    const bitrateIndex = (header >>> 12) & 0b1111;
    const sampleRateIndex = (header >>> 10) & 0b11;
    if (
      ((header >>> 21) & 0x7ff) !== 0x7ff
      || version === 0b01
      || layer !== 0b01
      || bitrateIndex === 0
      || bitrateIndex === 0b1111
      || sampleRateIndex === 0b11
    ) {
      offset += 1;
      continue;
    }

    const baseSampleRate = SAMPLE_RATES[sampleRateIndex];
    const sampleRate = version === 0b11 ? baseSampleRate : version === 0b10 ? baseSampleRate / 2 : baseSampleRate / 4;
    const bitrates = version === 0b11 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES;
    const bitrate = bitrates[bitrateIndex] * 1000;
    const padding = (header >>> 9) & 1;
    const frameLength = Math.floor((version === 0b11 ? 144 : 72) * bitrate / sampleRate) + padding;
    if (offset + frameLength > audio.length) {
      offset += 1;
      continue;
    }

    duration += (version === 0b11 ? 1152 : 576) / sampleRate;
    frameCount += 1;
    offset += frameLength;
  }

  if (!frameCount || !Number.isFinite(duration) || duration <= 0 || duration > 3600) {
    throw new Error("invalid_mp3_duration");
  }
  return Math.ceil(duration * 100) / 100;
}
