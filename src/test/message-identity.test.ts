import { describe, expect, it } from "vitest";
import {
  advanceDeliveryStatus,
  getScopedMessageKey,
  normalizeWhatsAppPhone,
  resolveDeliveryStatus,
  resolveMessageDirection,
  shouldMarkAsUnread,
} from "../lib/message-identity";

describe("message identity and delivery rules", () => {
  it("treats fromMe as outbound and keeps inbound as unread only when historical is false", () => {
    expect(resolveMessageDirection(true)).toBe("outbound");
    expect(resolveMessageDirection(false)).toBe("inbound");
    expect(shouldMarkAsUnread("inbound", false)).toBe(true);
    expect(shouldMarkAsUnread("inbound", true)).toBe(false);
    expect(shouldMarkAsUnread("outbound", false)).toBe(false);
  });

  it("uses instance-scoped identity keys and normalizes real delivery states", () => {
    expect(getScopedMessageKey({ userId: "user-1", whatsappInstanceId: "instance-a", externalId: "external-42" })).toBe("user-1|instance-a|external-42");
    expect(resolveDeliveryStatus("read")).toBe("read");
    expect(resolveDeliveryStatus("message_status_delivered")).toBe("delivered");
    expect(resolveDeliveryStatus(3)).toBe("delivered");
    expect(resolveDeliveryStatus("4")).toBe("read");
    expect(resolveDeliveryStatus(0)).toBe("failed");
    expect(resolveDeliveryStatus(5)).toBe("read");
    expect(resolveDeliveryStatus("sent")).toBe("sent");
    expect(resolveDeliveryStatus("failed")).toBe("failed");
    expect(resolveDeliveryStatus(undefined)).toBeNull();
  });

  it("keeps delivery and read states monotonic for delayed and out-of-order events", () => {
    expect(advanceDeliveryStatus("read", resolveDeliveryStatus("delivered"))).toBe("read");
    expect(advanceDeliveryStatus("read", resolveDeliveryStatus("sent"))).toBe("read");
    expect(advanceDeliveryStatus("delivered", resolveDeliveryStatus("sent"))).toBe("delivered");
    expect(advanceDeliveryStatus("received", resolveDeliveryStatus("read"))).toBe("read");
    expect(resolveDeliveryStatus("received")).toBe("received");
  });

  it("normalizes phone numbers for new conversations without creating invalid duplicates", () => {
    expect(normalizeWhatsAppPhone("(244) 923 451 234")).toBe("244923451234");
    expect(normalizeWhatsAppPhone("923451234", "+244")).toBe("923451234");
    expect(normalizeWhatsAppPhone("000923451234")).toBe("923451234");
    expect(normalizeWhatsAppPhone(" ")).toBe("");
  });
});
