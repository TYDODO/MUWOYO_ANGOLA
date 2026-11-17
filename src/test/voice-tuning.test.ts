import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_TUNING, parseVoiceTuning } from "@/lib/voice-tuning";

describe("parseVoiceTuning", () => {
  it("uses the documented defaults when no tuning is stored", () => {
    expect(parseVoiceTuning(undefined)).toEqual(DEFAULT_VOICE_TUNING);
  });

  it("preserves valid Fish Audio settings", () => {
    const tuning = { ...DEFAULT_VOICE_TUNING, prosody: { speed: 1.25, volume: -4 }, normalize: false };
    expect(parseVoiceTuning(tuning)).toEqual(tuning);
  });

  it("rejects values outside the Fish Audio controls", () => {
    expect(() => parseVoiceTuning({ ...DEFAULT_VOICE_TUNING, prosody: { speed: 2.1, volume: 0 } })).toThrow("invalid_voice_tuning");
  });
});
