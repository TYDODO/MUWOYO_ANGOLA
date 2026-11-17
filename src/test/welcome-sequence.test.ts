import { describe, expect, it } from "vitest";
import { buildWelcomeSequenceItems } from "../lib/welcome-sequence";

describe("welcome message sequence", () => {
  it("uses audio, image, video, text order and omits empty content", () => {
    const items = buildWelcomeSequenceItems({
      audio_url: " https://cdn.example.org/voice.ogg ",
      image_url: "https://cdn.example.org/image.jpg",
      video_url: "https://cdn.example.org/video.mp4",
      text_message: " Olá! ",
    });

    expect(items.map((item) => item.kind)).toEqual(["audio", "image", "video", "text"]);
    expect(items.at(-1)).toEqual({ kind: "text", text: "Olá!" });
  });

  it("allows partial sequences", () => {
    expect(buildWelcomeSequenceItems({ image_url: "https://cdn.example.org/image.jpg" }))
      .toEqual([{ kind: "image", url: "https://cdn.example.org/image.jpg", mimetype: null }]);
  });

  it("uses the configured order for the available items", () => {
    const items = buildWelcomeSequenceItems({
      audio_url: "https://cdn.example.org/voice.ogg",
      image_url: "https://cdn.example.org/image.jpg",
      text_message: "Olá!",
      send_order: ["text", "audio", "image"],
    });

    expect(items.map((item) => item.kind)).toEqual(["text", "audio", "image"]);
  });
});
