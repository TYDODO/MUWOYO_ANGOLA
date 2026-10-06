import { describe, expect, it } from "vitest";
import { getPlanEntitlements } from "./plan-entitlements";

describe("plan entitlements", () => {
  it("keeps campaigns and follow-up unavailable on Start", () => {
    const plan = getPlanEntitlements("Muwoyo Start");
    expect(plan.campaigns).toBe(false);
    expect(plan.followUp).toBe(false);
    expect(plan.maxProducts).toBe(50);
  });

  it("gives Enterprise unlimited access", () => {
    const plan = getPlanEntitlements("Enterprise");
    expect(plan.campaigns).toBe(true);
    expect(plan.sharedInbox).toBe(true);
    expect(plan.maxUsers).toBe(Number.POSITIVE_INFINITY);
  });
});