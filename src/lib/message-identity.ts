export type MessageDirection = "inbound" | "outbound";
export type MessageDeliveryStatus = "pending" | "received" | "sent" | "delivered" | "read" | "failed";

export function resolveMessageDirection(fromMe?: boolean | null): MessageDirection {
  return fromMe ? "outbound" : "inbound";
}

export function resolveDeliveryStatus(rawValue?: string | number | null): MessageDeliveryStatus | null {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "");

  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    const acknowledgements: Record<string, MessageDeliveryStatus> = {
      "0": "failed",
      "1": "pending",
      "2": "sent",
      "3": "delivered",
      "4": "read",
      "5": "read",
    };
    return acknowledgements[normalized] ?? null;
  }
  if (normalized.includes("read")) return "read";
  if (normalized.includes("deliver")) return "delivered";
  if (normalized.includes("receiv")) return "received";
  if (normalized.includes("sent")) return "sent";
  if (normalized.includes("fail") || normalized.includes("error")) return "failed";
  if (normalized.includes("pend")) return "pending";
  return null;
}

export function advanceDeliveryStatus(
  current: MessageDeliveryStatus | null | undefined,
  incoming: MessageDeliveryStatus | null | undefined,
): MessageDeliveryStatus | null {
  if (!incoming) return current ?? null;
  if (!current) return incoming;
  const rank: Record<MessageDeliveryStatus, number> = {
    pending: 0,
    received: 1,
    failed: 1,
    sent: 2,
    delivered: 3,
    read: 4,
  };
  if (current === "read" || incoming === "failed" && rank[current] >= rank.sent) return current;
  return rank[incoming] >= rank[current] ? incoming : current;
}

export function getScopedMessageKey({
  userId,
  whatsappInstanceId,
  externalId,
  phoneNumber,
}: {
  userId: string;
  whatsappInstanceId?: string | null;
  externalId?: string | null;
  phoneNumber?: string | null;
}): string {
  return `${userId}|${whatsappInstanceId ?? "global"}|${externalId ?? phoneNumber ?? "unknown"}`;
}

export function shouldMarkAsUnread(direction: MessageDirection, isHistorical = false): boolean {
  return direction === "inbound" && !isHistorical;
}

export function normalizeWhatsAppPhone(rawPhone?: string | null, countryCode = "244"): string {
  const digits = String(rawPhone ?? "")
    .replace(/\D/g, "")
    .replace(/^00/, "")
    .replace(/^0+/, "");

  if (!digits) return "";
  if (digits.startsWith(countryCode.replace(/\D/g, ""))) return digits;
  if (digits.length >= 9) return digits;
  return `${countryCode.replace(/\D/g, "")}${digits}`;
}
