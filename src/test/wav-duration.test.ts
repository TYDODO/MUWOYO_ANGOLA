import { describe, expect, it } from "vitest";
import { getWavDurationSeconds } from "@/lib/wav-duration";

function makeWav(durationSeconds: number) {
  const byteRate = 1000;
  const dataLength = byteRate * durationSeconds;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, byteRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, dataLength, true);
  return bytes;
}

describe("getWavDurationSeconds", () => {
  it("extracts fractional duration from a WAV data chunk", () => {
    expect(getWavDurationSeconds(makeWav(12.34))).toBe(12.34);
  });

  it("rejects malformed or overlong WAV payloads", () => {
    expect(() => getWavDurationSeconds(new Uint8Array(44))).toThrow("invalid_wav");
    expect(() => getWavDurationSeconds(makeWav(3601))).toThrow("invalid_wav_duration");
  });
});
