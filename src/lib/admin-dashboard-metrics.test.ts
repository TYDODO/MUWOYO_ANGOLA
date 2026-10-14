import { describe, expect, it } from "vitest";
import { buildAdminDashboardMetrics } from "./admin-dashboard-metrics";

describe("buildAdminDashboardMetrics", () => {
  it("aggregates real user, payment and WhatsApp metrics from the stored records", () => {
    const profiles = [
      {
        user_id: "u1",
        created_at: "2026-09-01T00:00:00.000Z",
        onboarding_completed: true,
        account_status: "active",
        is_suspended: false,
        message_limit: 50,
        messages_received: 45,
        status: "active",
      },
      {
        user_id: "u2",
        created_at: "2026-09-08T00:00:00.000Z",
        onboarding_completed: true,
        account_status: "trial",
        is_suspended: false,
        message_limit: 100,
        messages_received: 10,
        status: "active",
        trial_started_at: "2026-09-09T00:00:00.000Z",
      },
      {
        user_id: "u3",
        created_at: "2026-09-12T00:00:00.000Z",
        onboarding_completed: false,
        account_status: "inactive",
        is_suspended: false,
        message_limit: 0,
        messages_received: 0,
        status: "inactive",
      },
      {
        user_id: "u4",
        created_at: "2026-09-20T00:00:00.000Z",
        onboarding_completed: true,
        account_status: "active",
        is_suspended: true,
        message_limit: 30,
        messages_received: 30,
        status: "suspended",
      },
    ];

    const subscriptions = [
      { user_id: "u1", status: "active", confirmed_at: "2026-09-05T00:00:00.000Z", amount_kz: 15000 },
      { user_id: "u1", status: "active", confirmed_at: "2026-09-20T00:00:00.000Z", amount_kz: 21000 },
      { user_id: "u2", status: "pending", confirmed_at: null, amount_kz: 20000 },
      { user_id: "u4", status: "active", confirmed_at: "2026-09-21T00:00:00.000Z", amount_kz: 32000 },
    ];

    const instances = [
      { user_id: "u1", status: "connected", automation_paused: false, connection_state: "connected" },
      { user_id: "u2", status: "connected", automation_paused: true, connection_state: "connected" },
      { user_id: "u3", status: "disconnected", automation_paused: true, connection_state: "disconnected" },
    ];

    const result = buildAdminDashboardMetrics({
      profiles,
      subscriptions,
      instances,
      range: "90d",
      now: new Date("2026-10-15T00:00:00.000Z"),
    });

    expect(result.totalUsers).toBe(4);
    expect(result.newUsers).toBe(4);
    expect(result.activeUsers).toBe(2);
    expect(result.inactiveUsers).toBe(2);
    expect(result.onboardingCompleted).toBe(3);
    expect(result.connectedWhatsApp).toBe(2);
    expect(result.automationOperational).toBe(1);
    expect(result.trialUsers).toBe(1);
    expect(result.paidCustomers).toBe(2);
    expect(result.recentPayingCustomers).toBe(2);
    expect(result.repeatBuyers).toBe(1);
    expect(result.creditDepleted).toBe(2);
    expect(result.totalConfirmedRevenue).toBe(68000);
  });
});
