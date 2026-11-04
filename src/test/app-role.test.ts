import { describe, expect, it } from "vitest";
import { resolveAppRole } from "@/lib/app-role";

describe("resolveAppRole", () => {
  it("distinguishes attendants and delivery people from client accounts", () => {
    expect(resolveAppRole(["client", "attendant"])).toBe("attendant");
    expect(resolveAppRole(["client", "delivery_person"])).toBe("delivery_person");
  });

  it("preserves administrative role precedence", () => {
    expect(resolveAppRole(["attendant", "admin"])).toBe("admin");
    expect(resolveAppRole(["delivery_person", "sub_admin"])).toBe("sub_admin");
  });

  it("defaults ordinary accounts to client", () => {
    expect(resolveAppRole(["client"])).toBe("client");
    expect(resolveAppRole([])).toBe("client");
  });
});
