export type PlanName = "Muwoyo Start" | "Muwoyo Growth" | "Muwoyo Big" | "Enterprise";
export type PlanEntitlements = { crm: boolean; campaigns: boolean; followUp: boolean; inbox: boolean; sharedInbox: boolean; maxUsers: number; maxProducts: number; aiCredits: number | null };
export const planEntitlements: Record<PlanName, PlanEntitlements> = {
  "Muwoyo Start": { crm: true, campaigns: false, followUp: false, inbox: true, sharedInbox: false, maxUsers: 1, maxProducts: 50, aiCredits: 500 },
  "Muwoyo Growth": { crm: true, campaigns: true, followUp: true, inbox: true, sharedInbox: true, maxUsers: 3, maxProducts: 150, aiCredits: 1000 },
  "Muwoyo Big": { crm: true, campaigns: true, followUp: true, inbox: true, sharedInbox: true, maxUsers: 10, maxProducts: 500, aiCredits: 2500 },
  Enterprise: { crm: true, campaigns: true, followUp: true, inbox: true, sharedInbox: true, maxUsers: Number.POSITIVE_INFINITY, maxProducts: Number.POSITIVE_INFINITY, aiCredits: null },
};
export const getPlanEntitlements = (name?: string | null) => planEntitlements[(name as PlanName) || "Muwoyo Start"] || planEntitlements["Muwoyo Start"];
