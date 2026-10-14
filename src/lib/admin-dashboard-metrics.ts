export type RangeKey = "today" | "7d" | "30d" | "90d" | "month" | "previousMonth" | "custom";

export type DashboardProfile = {
  user_id?: string | null;
  created_at?: string | null;
  onboarding_completed?: boolean | null;
  account_status?: string | null;
  is_suspended?: boolean | null;
  status?: string | null;
  message_limit?: number | null;
  messages_received?: number | null;
  trial_started_at?: string | null;
};

export type DashboardSubscription = {
  user_id?: string | null;
  status?: string | null;
  confirmed_at?: string | null;
  submitted_at?: string | null;
  amount_kz?: number | null;
};

export type DashboardInstance = {
  user_id?: string | null;
  status?: string | null;
  connection_state?: string | null;
  automation_paused?: boolean | null;
};

export type DashboardMetrics = {
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  onboardingCompleted: number;
  connectedWhatsApp: number;
  automationOperational: number;
  trialUsers: number;
  paidCustomers: number;
  recentPayingCustomers: number;
  repeatBuyers: number;
  creditDepleted: number;
  totalConfirmedRevenue: number;
};

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inRange(value: string | null | undefined, start: Date, end: Date): boolean {
  const date = toDate(value);
  if (!date) return false;
  return date >= start && date <= end;
}

function confirmedPayment(subscription: DashboardSubscription): boolean {
  return Boolean(subscription.status === "active" || subscription.status === "confirmed") && Boolean(subscription.confirmed_at || subscription.submitted_at);
}

function getRangeWindow(range: RangeKey, now: Date = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "today") return { start, end };

  const offsetMap = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
  } as const;

  if (range in offsetMap) {
    const days = offsetMap[range as keyof typeof offsetMap];
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (days - 1));
    return { start: startDate, end };
  }

  if (range === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: monthStart, end };
  }

  if (range === "previousMonth") {
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start: previous, end: previousEnd };
  }

  return { start, end };
}

export function buildAdminDashboardMetrics({
  profiles,
  subscriptions,
  instances,
  range,
  now = new Date(),
}: {
  profiles: DashboardProfile[];
  subscriptions: DashboardSubscription[];
  instances: DashboardInstance[];
  range: RangeKey;
  now?: Date;
}): DashboardMetrics {
  const rangeWindow = getRangeWindow(range, now);

  const totalUsers = profiles.length;
  const newUsers = profiles.filter((profile) => inRange(profile.created_at, rangeWindow.start, rangeWindow.end)).length;
  const activeUsers = profiles.filter((profile) => !profile.is_suspended && profile.status !== "suspended" && profile.account_status !== "inactive").length;
  const inactiveUsers = profiles.filter((profile) => profile.is_suspended || profile.status === "suspended" || profile.account_status === "inactive").length;
  const onboardingCompleted = profiles.filter((profile) => Boolean(profile.onboarding_completed)).length;

  const connectedUserIds = new Set(
    instances
      .filter((instance) => instance.user_id && (instance.status === "connected" || instance.connection_state === "connected" || instance.status === "online"))
      .map((instance) => instance.user_id as string),
  );
  const automationOperational = new Set(
    instances
      .filter((instance) => instance.user_id && (instance.status === "connected" || instance.connection_state === "connected") && !instance.automation_paused)
      .map((instance) => instance.user_id as string),
  ).size;

  const trialUsers = profiles.filter((profile) => profile.account_status === "trial" && Boolean(profile.trial_started_at)).length;

  const confirmedSubscriptions = subscriptions.filter((subscription) => confirmedPayment(subscription));
  const paidCustomerIds = new Set(confirmedSubscriptions.map((subscription) => subscription.user_id).filter(Boolean) as string[]);
  const recentPayingCustomerIds = new Set(
    confirmedSubscriptions
      .filter((subscription) => Boolean(subscription.confirmed_at && inRange(subscription.confirmed_at, rangeWindow.start, rangeWindow.end)))
      .map((subscription) => subscription.user_id)
      .filter(Boolean) as string[],
  );

  const repeatBuyers = new Set(
    Object.entries(
      confirmedSubscriptions.reduce<Record<string, number>>((accumulator, subscription) => {
        if (!subscription.user_id) return accumulator;
        accumulator[subscription.user_id] = (accumulator[subscription.user_id] || 0) + 1;
        return accumulator;
      }, {}),
    )
      .filter(([, count]) => count > 1)
      .map(([userId]) => userId),
  ).size;

  const creditDepleted = profiles.filter((profile) => Number(profile.message_limit || 0) - Number(profile.messages_received || 0) <= 0).length;
  const totalConfirmedRevenue = confirmedSubscriptions.reduce((sum, subscription) => sum + Number(subscription.amount_kz || 0), 0);

  return {
    totalUsers,
    newUsers,
    activeUsers,
    inactiveUsers,
    onboardingCompleted,
    connectedWhatsApp: connectedUserIds.size,
    automationOperational,
    trialUsers,
    paidCustomers: paidCustomerIds.size,
    recentPayingCustomers: recentPayingCustomerIds.size,
    repeatBuyers,
    creditDepleted,
    totalConfirmedRevenue,
  };
}
