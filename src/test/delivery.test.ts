import { describe, expect, it } from "vitest";
import {
  calculateDistanceFee,
  calculateOrderTotal,
  deliveryStatusTransitions,
} from "@/lib/delivery";

describe("delivery order rules", () => {
  it("uses configured distance tiers without fabricating a distance or price", () => {
    const rules = [{ max_km: 10, fee: 2000 }, { max_km: 5, fee: 1000 }];
    expect(calculateDistanceFee(rules, 3)).toBe(1000);
    expect(calculateDistanceFee(rules, 7)).toBe(2000);
    expect(calculateDistanceFee(rules, 11)).toBeNull();
    expect(calculateDistanceFee(rules, Number.NaN)).toBeNull();
    expect(calculateDistanceFee([], 3)).toBeNull();
  });

  it("calculates subtotal plus delivery fee minus discount exactly once", () => {
    expect(calculateOrderTotal(5000, 1000, 500)).toBe(5500);
    expect(calculateOrderTotal(5000, 0, 0)).toBe(5000);
    expect(calculateOrderTotal(100, 0, 101)).toBeNull();
  });

  it("allows only the specified courier status transitions", () => {
    expect(deliveryStatusTransitions.ready_for_delivery).toEqual(["in_delivery", "cancelled"]);
    expect(deliveryStatusTransitions.in_delivery).toContain("delivered");
    expect(deliveryStatusTransitions.delivered).toEqual([]);
  });
});
