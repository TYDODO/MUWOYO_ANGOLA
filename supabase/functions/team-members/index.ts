import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SEND_VERIFICATION_URL = `${SUPABASE_URL}/functions/v1/send-verification-code`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const permissions = ["inbox.view", "inbox.send", "inbox.assign", "inbox.view_unassigned", "contacts.view", "contacts.edit", "crm.view", "crm.edit", "orders.view", "orders.create", "orders.edit", "agenda.view", "agenda.create", "agenda.edit", "products.view", "products.edit"];

async function sendAttendantVerification(email: string) {
  const response = await fetch(SEND_VERIFICATION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => null);
  return { ok: response.ok && result?.success === true, error: result?.error || null };
}

async function actor(req: Request) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: header } } });
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const { data: member } = await admin.from("business_members").select("id,business_id,role,status").eq("user_id", data.user.id).maybeSingle();
  return member?.role === "owner" && member.status === "active" ? { user: data.user, member } : null;
}

async function maxAttendants(businessId: string) {
  const { data: business } = await admin.from("businesses").select("owner_id").eq("id", businessId).single();
  if (!business) return 0;
  const { data: profile } = await admin.from("profiles").select("plan_id").eq("user_id", business.owner_id).maybeSingle();
  const { data: plan } = profile?.plan_id ? await admin.from("subscription_plans").select("name,features").eq("id", profile.plan_id).maybeSingle() : { data: null };
  const features = Array.isArray(plan?.features) ? plan.features.map(String) : [];
  const usersFeature = features.find((feature) => /utilizadores?|usuários?/i.test(feature));
  if (/ilimitad/i.test(usersFeature || "")) return Number.MAX_SAFE_INTEGER;
  const configuredLimit = usersFeature?.match(/\d+/)?.[0];
  return configuredLimit ? Number(configuredLimit) : 1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const current = await actor(req);
    if (!current) return json({ error: "owner_required" }, 403);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");
    const businessId = current.member.business_id as string;

    if (action === "list") {
      const { data, error } = await admin.from("business_members").select("id,user_id,role,status,name,email,created_at,business_member_permissions(permission,enabled)").eq("business_id", businessId).order("created_at");
      if (error) return json({ error: error.message }, 500);
      return json({ members: data || [] });
    }

    if (action === "create") {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name || !email || password.length < 8) return json({ error: "invalid_input" }, 400);
      const limit = await maxAttendants(businessId);
      const { count } = await admin.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("role", "attendant").neq("status", "removed");
      if ((count || 0) >= limit) return json({ error: "attendant_limit_reached", limit }, 409);
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: false, user_metadata: { full_name: name } });
      if (created.error || !created.data.user) return json({ error: created.error?.message || "auth_create_failed" }, 400);
      const user = created.data.user;
      const { data: member, error: memberError } = await admin.from("business_members").insert({ business_id: businessId, user_id: user.id, role: "attendant", status: "pending", name, email }).select("id").single();
      if (memberError) { await admin.auth.admin.deleteUser(user.id); return json({ error: memberError.message }, 400); }
      const selected = Array.isArray(body.permissions) ? body.permissions.filter((item: unknown) => permissions.includes(String(item))) : ["inbox.view", "inbox.send"];
      await admin.from("business_member_permissions").insert(selected.map((permission: string) => ({ business_id: businessId, member_id: member.id, permission, enabled: true })));
      await admin.from("business_audit_log").insert({ business_id: businessId, actor_user_id: current.user.id, target_user_id: user.id, action: "member_created", metadata: { email, permissions: selected } });
      const verification = await sendAttendantVerification(email).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : "temporary_error" }));
      return json({ ok: true, member_id: member.id, user_id: user.id, status: "pending", verification_sent: verification.ok, verification_error: verification.ok ? null : verification.error });
    }

    const memberId = String(body.member_id || "");
    const { data: target } = await admin.from("business_members").select("id,user_id,role,status,email").eq("id", memberId).eq("business_id", businessId).single();
    if (!target || target.role !== "attendant") return json({ error: "member_not_found" }, 404);
    if (action === "resend_confirmation") {
      if (target.status !== "pending") return json({ error: "attendant_not_pending" }, 409);
      const verification = await sendAttendantVerification(target.email).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : "temporary_error" }));
      return verification.ok ? json({ ok: true }) : json({ error: verification.error || "verification_email_failed" }, 502);
    }
    if (action === "permissions") {
      const selected = Array.isArray(body.permissions) ? body.permissions.map(String).filter((item: string) => permissions.includes(item)) : [];
      await admin.from("business_member_permissions").delete().eq("member_id", memberId);
      if (selected.length) await admin.from("business_member_permissions").insert(selected.map((permission: string) => ({ business_id: businessId, member_id: memberId, permission, enabled: true })));
      await admin.from("business_audit_log").insert({ business_id: businessId, actor_user_id: current.user.id, target_user_id: target.user_id, action: "member_permissions_updated", metadata: { permissions: selected } });
      return json({ ok: true });
    }
    if (action === "status") {
      const status = ["pending", "active", "suspended", "removed"].includes(String(body.status)) ? String(body.status) : "active";
      await admin.from("business_members").update({ status }).eq("id", memberId);
      if (status === "suspended" || status === "removed") await admin.auth.admin.updateUserById(target.user_id, { ban_duration: "876000h" });
      if (status === "active") await admin.auth.admin.updateUserById(target.user_id, { ban_duration: "none" });
      await admin.from("business_audit_log").insert({ business_id: businessId, actor_user_id: current.user.id, target_user_id: target.user_id, action: `member_${status}`, metadata: {} });
      return json({ ok: true });
    }
    if (action === "update_name") {
      await admin.from("business_members").update({ name: String(body.name || "").trim() }).eq("id", memberId);
      await admin.from("profiles").update({ full_name: String(body.name || "").trim() }).eq("user_id", target.user_id);
      return json({ ok: true });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("team-members error", error);
    return json({ error: error instanceof Error ? error.message : "internal" }, 500);
  }
});
