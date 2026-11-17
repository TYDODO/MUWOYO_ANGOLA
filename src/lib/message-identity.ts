export type MessageDirection = "inbound" | "outbound";
export type MessageDeliveryStatus = "pending" | "received" | "sent" | "delivered" | "read" | "failed";

export function isEvolutionMessageFromMe(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  const nested = [message.data, message.message]
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  const candidates = [message, ...nested].flatMap((entry) => {
    const key = entry.key && typeof entry.key === "object"
      ? entry.key as Record<string, unknown>
      : {};
    return [key.fromMe, entry.fromMe, entry.from_me];
  });
  return candidates.some((candidate) =>
    candidate === true
    || candidate === 1
    || typeof candidate === "string" && ["true", "1"].includes(candidate.trim().toLowerCase()),
  );
}

export function extractEvolutionMessageId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  const data = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : {};
  const message = response.message && typeof response.message === "object" ? response.message as Record<string, unknown> : {};
  const nestedMessage = data.message && typeof data.message === "object" ? data.message as Record<string, unknown> : {};
  const keys = [response.key, data.key, message.key, nestedMessage.key]
    .filter((key): key is Record<string, unknown> => Boolean(key && typeof key === "object"));
  const candidates = [...keys.map((key) => key.id), response.id, data.id];
  const id = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof id === "string" ? id : null;
}

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
