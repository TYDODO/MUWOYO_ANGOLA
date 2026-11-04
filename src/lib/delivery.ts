export type DeliveryStatus =
  | "awaiting_pickup"
  | "preparing"
  | "ready_for_delivery"
  | "in_delivery"
  | "delivered"
  | "failed_delivery"
  | "cancelled";

export type DistanceFeeRule = { max_km: number; fee: number };
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export const deliveryStatusTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  awaiting_pickup: ["preparing", "ready_for_delivery", "cancelled"],
  preparing: ["ready_for_delivery", "cancelled"],
  ready_for_delivery: ["in_delivery", "cancelled"],
  in_delivery: ["delivered", "failed_delivery"],
  delivered: [],
  failed_delivery: ["ready_for_delivery", "in_delivery"],
  cancelled: [],
};

export function calculateDistanceFee(rules: unknown, distanceKm: number): number | null {
  if (!Array.isArray(rules) || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  const validRules = rules.flatMap((rule): DistanceFeeRule[] => {
    if (!isRecord(rule)) return [];
    const maxKm = Number(rule.max_km);
    const fee = Number(rule.fee);
    return Number.isFinite(maxKm) && maxKm > 0 && Number.isFinite(fee) && fee >= 0
      ? [{ max_km: maxKm, fee }]
      : [];
  }).sort((left, right) => left.max_km - right.max_km);
  return validRules.find((rule) => distanceKm <= rule.max_km)?.fee ?? null;
}

export function calculateOrderTotal(subtotal: number, deliveryFee: number, discount: number) {
  if (![subtotal, deliveryFee, discount].every(Number.isFinite) || subtotal < 0 || deliveryFee < 0 || discount < 0 || discount > subtotal + deliveryFee) return null;
  return subtotal + deliveryFee - discount;
}
