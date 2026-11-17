import { describe, expect, it } from "vitest";
import { getMp3DurationSeconds } from "@/lib/mp3-duration";

function makeMp3Frames(count: number) {
  const header = 0xffe00000 | (0b11 << 19) | (0b01 << 17) | (9 << 12);
  const frameLength = Math.floor((144 * 128000) / 44100);
  const audio = new Uint8Array(count * frameLength);
  for (let frame = 0; frame < count; frame += 1) {
    const offset = frame * frameLength;
    audio[offset] = (header >>> 24) & 0xff;
    audio[offset + 1] = (header >>> 16) & 0xff;
    audio[offset + 2] = (header >>> 8) & 0xff;
    audio[offset + 3] = header & 0xff;
  }
  return audio;
}

describe("getMp3DurationSeconds", () => {
  it("calculates duration from MPEG audio frames", () => {
    expect(getMp3DurationSeconds(makeMp3Frames(10))).toBe(0.27);
  });

  it("skips an ID3 tag before the audio frames", () => {
    const frames = makeMp3Frames(10);
    const tagged = new Uint8Array(10 + frames.length);
    tagged.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
    tagged.set(frames, 10);
    expect(getMp3DurationSeconds(tagged)).toBe(0.27);
  });

  it("rejects data without valid MP3 frames", () => {
    expect(() => getMp3DurationSeconds(new Uint8Array(44))).toThrow("invalid_mp3_duration");
  });
});
