export type AppRole = "admin" | "sub_admin" | "attendant" | "delivery_person" | "client" | null;

export function resolveAppRole(roles: string[] = []): Exclude<AppRole, null> {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("sub_admin")) return "sub_admin";
  if (roles.includes("attendant")) return "attendant";
  if (roles.includes("delivery_person")) return "delivery_person";
  return "client";
}
