import { describe, expect, it } from "vitest";
import {
  extractEvolutionMediaBase64,
  normalizeEvolutionMediaBase64,
} from "../../supabase/functions/_shared/evolution-media";

describe("Evolution media payloads", () => {
  it("normalizes base64 values and data URLs", () => {
    expect(normalizeEvolutionMediaBase64(" data:image/jpeg;base64, YWJj\n")).toBe("YWJj");
    expect(normalizeEvolutionMediaBase64("")).toBeNull();
    expect(normalizeEvolutionMediaBase64(null)).toBeNull();
  });

  it("supports both top-level and nested Evolution API responses", () => {
    expect(extractEvolutionMediaBase64({ base64: "YWJj" })).toBe("YWJj");
    expect(extractEvolutionMediaBase64({ data: { base64: "data:audio/ogg;base64,YWJj" } })).toBe("YWJj");
    expect(extractEvolutionMediaBase64({ data: {} })).toBeNull();
  });
});
