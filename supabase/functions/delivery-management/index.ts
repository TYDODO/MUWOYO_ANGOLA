import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function getOwner(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const { data: member, error: memberError } = await admin.from("business_members")
    .select("id,business_id,role,status").eq("user_id", user.id).maybeSingle();
  if (memberError || member?.role !== "owner" || member.status !== "active") return null;
  return { user, businessId: String(member.business_id) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const owner = await getOwner(req);
    if (!owner) return json({ error: "owner_required" }, 403);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const action = String(body.action || "list");
    if (action === "list") {
      const { data, error } = await admin.from("delivery_people")
        .select("id,user_id,name,email,phone,avatar_url,notes,status,created_at")
        .eq("business_id", owner.businessId).order("created_at", { ascending: false });
      if (error) {
        console.error("delivery_people_list_failed", error.message);
        return json({ error: "delivery_people_list_failed" }, 500);
      }
      return json({ people: data || [] });
    }

    if (action === "create") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";
      const avatarUrl = typeof body.avatar_url === "string" ? body.avatar_url.trim() : "";
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
        return json({ error: "invalid_input" }, 400);
      }

      const { data: business, error: businessError } = await admin.from("businesses")
        .select("owner_id").eq("id", owner.businessId).single();
      if (businessError || !business || business.owner_id !== owner.user.id) return json({ error: "business_not_found" }, 404);

      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { full_name: name, phone, created_by: owner.user.id, account_type: "delivery_person" },
      });
      if (created.error || !created.data.user) {
        console.error("delivery_person_auth_create_failed", created.error?.message || "missing_user");
        const duplicate = /already|registered/i.test(created.error?.message || "");
        return json({ error: duplicate ? "email_already_registered" : "auth_user_create_failed" }, duplicate ? 409 : 400);
      }

      const { data: person, error: insertError } = await admin.from("delivery_people").insert({
        business_id: owner.businessId,
        user_id: created.data.user.id,
        name,
        email,
        phone: phone || null,
        notes: notes || null,
        avatar_url: avatarUrl || null,
      }).select("id,user_id,name,email,phone,avatar_url,notes,status,created_at").single();
      if (insertError || !person) {
        const { error: rollbackError } = await admin.auth.admin.deleteUser(created.data.user.id);
        if (rollbackError) console.error("delivery_person_auth_rollback_failed", rollbackError.message);
        console.error("delivery_person_create_failed", insertError?.message || "missing_row");
        return json({ error: "delivery_person_create_failed" }, 500);
      }
      const { error: auditError } = await admin.from("business_audit_log").insert({
        business_id: owner.businessId,
        actor_user_id: owner.user.id,
        target_user_id: created.data.user.id,
        action: "delivery_person_created",
        metadata: { email },
      });
      if (auditError) console.error("delivery_person_audit_log_failed", auditError.message);
      return json({ person, verification_email_queued: true }, 201);
    }

    const personId = typeof body.person_id === "string" ? body.person_id : "";
    if (!personId) return json({ error: "person_id_required" }, 400);
    const { data: person, error: personError } = await admin.from("delivery_people")
      .select("id,user_id,status").eq("id", personId).eq("business_id", owner.businessId).maybeSingle();
    if (personError || !person) return json({ error: "delivery_person_not_found" }, 404);

    if (action === "update") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 2) return json({ error: "invalid_name" }, 400);
      const { data, error } = await admin.from("delivery_people").update({
        name,
        phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
        avatar_url: typeof body.avatar_url === "string" ? body.avatar_url.trim() || null : null,
      }).eq("id", personId).eq("business_id", owner.businessId)
        .select("id,user_id,name,email,phone,avatar_url,notes,status,created_at").single();
      if (error || !data) return json({ error: "delivery_person_update_failed" }, 500);
      const { error: profileError } = await admin.from("profiles").update({ full_name: name, phone: data.phone }).eq("user_id", person.user_id);
      if (profileError) console.error("delivery_person_profile_update_failed", profileError.message);
      return json({ person: data });
    }

    if (action === "status") {
      const status = String(body.status || "");
      if (status !== "active" && status !== "suspended" && status !== "removed") return json({ error: "invalid_status" }, 400);
      if (status === "active") {
        const { data: authUser } = await admin.auth.admin.getUserById(person.user_id);
        if (!authUser.user?.email_confirmed_at) return json({ error: "email_not_verified" }, 409);
      }
      const { error } = await admin.from("delivery_people").update({ status }).eq("id", personId).eq("business_id", owner.businessId);
      if (error) return json({ error: "delivery_person_status_update_failed" }, 500);
      const { error: authError } = await admin.auth.admin.updateUserById(person.user_id, {
        ban_duration: status === "active" ? "none" : "876000h",
      });
      if (authError) {
        console.error("delivery_person_auth_status_update_failed", authError.message);
        const { error: rollbackError } = await admin.from("delivery_people")
          .update({ status: person.status }).eq("id", personId).eq("business_id", owner.businessId);
        if (rollbackError) console.error("delivery_person_status_rollback_failed", rollbackError.message);
        return json({ error: "auth_status_update_failed" }, 502);
      }
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("delivery_management_unexpected_error", error instanceof Error ? error.message : "unknown_error");
    return json({ error: "delivery_management_unexpected_error" }, 500);
  }
});
