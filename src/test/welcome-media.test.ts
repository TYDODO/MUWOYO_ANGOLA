import { describe, expect, it } from "vitest";
import { isSafeWelcomeMediaUrl } from "../lib/welcome-media";

describe("welcome media URL validation", () => {
  it("allows public HTTP(S) URLs without embedded credentials", () => {
    expect(isSafeWelcomeMediaUrl("https://cdn.example.org/welcome.ogg")).toBe(true);
    expect(isSafeWelcomeMediaUrl("http://8.8.8.8/image.jpg")).toBe(true);
  });

  it("rejects malformed, non-web, credentialed, and private-network URLs", () => {
    expect(isSafeWelcomeMediaUrl("not a URL")).toBe(false);
    expect(isSafeWelcomeMediaUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeWelcomeMediaUrl("https://user:pass@example.org/audio.ogg")).toBe(false);
    expect(isSafeWelcomeMediaUrl("http://localhost/private")).toBe(false);
    expect(isSafeWelcomeMediaUrl("http://192.168.1.1/image.jpg")).toBe(false);
    expect(isSafeWelcomeMediaUrl("http://[::1]/image.jpg")).toBe(false);
  });
});
