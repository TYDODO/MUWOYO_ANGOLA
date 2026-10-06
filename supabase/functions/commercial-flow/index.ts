import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function actor(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const { data: roles, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  if (roleError) throw new Error(`role_lookup_failed: ${roleError.message}`);
  const role = roles?.some((row) => row.role === "admin")
    ? "admin"
    : roles?.some((row) => row.role === "sub_admin")
      ? "sub_admin"
      : null;
  return role && { admin, user: data.user, role };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const current = await actor(req);
    if (!current || !["admin", "sub_admin"].includes(current.role)) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "listPendingActivations") {
      let query = current.admin.from("top_up_requests")
        .select("id,user_id,amount_kz,status,created_at,confirmed_at,payment_reference")
        .eq("request_type", "setup").in("status", ["pending", "confirmed"]).order("created_at", { ascending: true });
      const { data: requests, error } = await query;
      if (error) return json({ error: error.message }, 500);
      const ids = (requests || []).map((item) => item.user_id);
      let profilesQuery = current.admin.from("profiles").select("user_id,full_name,email,phone,created_at,account_status,setup_paid_at").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      if (current.role === "sub_admin") profilesQuery = profilesQuery.eq("created_by", current.user.id);
      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) return json({ error: profilesError.message }, 500);
      const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
      return json({ requests: (requests || []).filter((item) => profileMap.get(item.user_id)?.account_status !== "active").map((item) => ({ ...item, profile: profileMap.get(item.user_id) })) });
    }

    if (action === "confirmSetupPayment") {
      const requestId = String(body.requestId || "");
      if (!requestId) return json({ error: "invalid_input" }, 400);
      const { data, error } = await current.admin.rpc("confirm_setup_payment", {
        p_request_id: requestId,
        p_actor_id: current.user.id,
        p_payment_reference: typeof body.paymentReference === "string" ? body.paymentReference.slice(0, 120) : null,
      });
      if (error) {
        console.error("confirm_setup_payment RPC failed", error);
        const { data: request, error: requestError } = await current.admin.from("top_up_requests").select("id,user_id,status,request_type,amount_kz").eq("id", requestId).eq("request_type", "setup").maybeSingle();
        if (requestError || !request) return json({ error: requestError?.message || "setup_request_not_found" }, 400);
        if (current.role === "sub_admin") {
          const { data: owned } = await current.admin.from("profiles").select("user_id").eq("user_id", request.user_id).eq("created_by", current.user.id).maybeSingle();
          if (!owned) return json({ error: "not_authorized_for_user" }, 403);
        }
        const now = new Date().toISOString();
        const { error: requestUpdateError } = await current.admin.from("top_up_requests").update({ status: "confirmed", confirmed_at: now, approved_at: now, approved_by: current.user.id }).eq("id", requestId);
        const { error: profileUpdateError } = await current.admin.from("profiles").update({ account_status: "awaiting_activation", setup_paid_at: now, setup_payment_id: requestId }).eq("user_id", request.user_id);
        if (requestUpdateError || profileUpdateError) return json({ error: requestUpdateError?.message || profileUpdateError?.message || "payment_confirmation_failed" }, 500);
        await current.admin.from("notifications").insert({ user_id: request.user_id, title: "Pagamento confirmado", message: "O seu pagamento foi confirmado. A sua conta aguarda ativação.", type: "setup_paid", link: "/dashboard" });
        return json({ ok: true, status: "awaiting_activation", fallback: true });
      }
      if (data?.status === "awaiting_activation") {
        const { data: request } = await current.admin.from("top_up_requests").select("user_id").eq("id", requestId).maybeSingle();
        if (request) {
          const { data: existingNotification } = await current.admin.from("notifications").select("id").eq("user_id", request.user_id).eq("type", "setup_paid").limit(1).maybeSingle();
          if (!existingNotification) await current.admin.from("notifications").insert({ user_id: request.user_id, title: "Pagamento confirmado", message: "O seu pagamento foi confirmado. A sua conta aguarda ativação.", type: "setup_paid", link: "/dashboard" });
        }
      }
      for (const role of ["admin", "sub_admin"]) {
        const { data: managers } = await current.admin.from("user_roles").select("user_id").eq("role", role);
        for (const manager of managers || []) {
          await current.admin.from("notifications").insert({ user_id: manager.user_id, title: "Nova conta aguardando ativação", message: "Um setup foi confirmado e aguarda ativação.", type: "setup_awaiting_activation", link: "/admin" });
        }
      }
      return json(data);
    }

    if (action === "activateAccount") {
      const userId = String(body.userId || "");
      if (!userId) return json({ error: "invalid_input" }, 400);
      const { data, error } = await current.admin.rpc("activate_account", { p_user_id: userId, p_actor_id: current.user.id });
      if (error) {
        console.error("activate_account RPC failed", error);
        const { data: profile, error: profileError } = await current.admin.from("profiles").select("user_id,account_status,created_by,setup_payment_id,message_limit").eq("user_id", userId).maybeSingle();
        if (profileError || !profile) return json({ error: profileError?.message || "profile_not_found" }, 400);
        if (current.role === "sub_admin" && profile.created_by !== current.user.id) return json({ error: "not_authorized_for_user" }, 403);
        if (profile.account_status === "active") return json({ ok: true, status: "active", already_active: true });
        if (!["awaiting_activation", "trial", "inactive"].includes(profile.account_status)) return json({ error: `account_status_invalid:${profile.account_status}` }, 400);
        const { data: existingBonus } = await current.admin.from("credit_ledger").select("id").eq("user_id", userId).eq("credit_type", "activation_bonus").maybeSingle();
        if (!existingBonus) {
          const { error: ledgerError } = await current.admin.from("credit_ledger").insert({ user_id: userId, amount: 200, credit_type: "activation_bonus", reference_id: profile.setup_payment_id, created_by: current.user.id });
          if (ledgerError && !ledgerError.message.toLowerCase().includes("duplicate")) return json({ error: ledgerError.message }, 500);
        }
        const { error: updateError } = await current.admin.from("profiles").update({ account_status: "active", message_limit: Math.max(Number(profile.message_limit || 0), 0) + (existingBonus ? 0 : 200), activated_at: new Date().toISOString(), activated_by: current.user.id }).eq("user_id", userId);
        if (updateError) return json({ error: updateError.message }, 500);
        await current.admin.from("instances").update({ automation_paused: false, automation_paused_until: null }).eq("user_id", userId);
        await current.admin.from("notifications").insert({ user_id: userId, title: "Conta ativada", message: "A sua conta foi ativada e recebeu 200 mensagens.", type: "account_activated", link: "/dashboard" });
        return json({ ok: true, status: "active", bonus_added: !existingBonus, fallback: true });
      }
      return json(data);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("commercial-flow error", error);
    return json({ error: error instanceof Error ? error.message : "internal" }, 500);
  }
});