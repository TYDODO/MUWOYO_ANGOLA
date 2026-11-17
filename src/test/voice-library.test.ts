import { describe, expect, it } from "vitest";
import { describeVoiceInPortuguese, translateVoiceGender, translateVoiceLanguages } from "@/lib/voice-library";

describe("voice library Portuguese descriptions", () => {
  it("translates supported language labels", () => {
    expect(translateVoiceLanguages(["Portuguese", "en", "unknown"])).toEqual(["Português", "Inglês"]);
  });

  it("translates gender and known style tags", () => {
    const gender = translateVoiceGender(null, ["female", "warm", "narration"]);
    expect(gender).toBe("Feminina");
    expect(describeVoiceInPortuguese(["pt"], gender, ["warm", "narration"])).toBe(
      "Voz feminina · Idioma: Português · Estilo: acolhedor, narração",
    );
  });

  it("uses a Portuguese fallback rather than showing unknown upstream descriptions", () => {
    expect(describeVoiceInPortuguese([], null, ["unknown-tag"])).toBe(
      "Voz pronta para atendimento e conteúdos em áudio.",
    );
  });
});
