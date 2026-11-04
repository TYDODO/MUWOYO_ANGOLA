import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_URL = (Deno.env.get("EVOLUTION_API_URL") || "https://api.muwoyo.com").replace(/\/+$/, "");
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
type JsonRecord = Record<string, unknown>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const evoFetch = async (path: string, init: RequestInit = {}) => {
  try {
    const res = await fetch(`${EVOLUTION_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY, ...(init.headers || {}) },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { error: error instanceof Error ? error.message : "evolution_unavailable" } };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!EVOLUTION_KEY || !ANON_KEY) return json({ error: "whatsapp_import_not_configured" }, 503);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const requestBody = await req.json().catch(() => ({}));
    const requestedInstance = typeof requestBody?.instanceName === "string" ? requestBody.instanceName.trim() : "";
    const actorUserId = userData.user.id;
    const { data: member, error: memberError } = await admin.from("business_members")
      .select("business_id,role,status").eq("user_id", actorUserId).maybeSingle();
    if (memberError) {
      console.error("whatsapp_import_membership_lookup_failed", memberError.message);
      return json({ error: "membership_lookup_failed" }, 500);
    }
    if (member && member.status !== "active") return json({ error: "member_inactive" }, 403);
    let userId = actorUserId;
    if (member?.role === "attendant") {
      const { data: owner, error: ownerError } = await admin.from("business_members")
        .select("user_id").eq("business_id", member.business_id).eq("role", "owner").eq("status", "active").maybeSingle();
      if (ownerError || !owner?.user_id) {
        console.error("whatsapp_import_owner_lookup_failed", ownerError?.message || "owner_missing");
        return json({ error: "business_owner_not_found" }, 404);
      }
      userId = owner.user_id;
    } else if (member && member.role !== "owner") {
      return json({ error: "owner_or_attendant_required" }, 403);
    }

    let instanceQuery = admin.from("instances").select("id,instance_name").eq("user_id", userId);
    if (requestedInstance) instanceQuery = instanceQuery.eq("instance_name", requestedInstance);
    const { data: instanceRow, error: instanceError } = await instanceQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (instanceError) {
      console.error("whatsapp_import_instance_lookup_failed", instanceError.message);
      return json({ error: "instance_lookup_failed" }, 500);
    }
    if (!instanceRow) return json({ error: requestedInstance ? "whatsapp_instance_not_found" : "whatsapp_instance_not_connected" }, 404);

    const instanceName = instanceRow.instance_name;
    const r = await evoFetch(`/chat/findContacts/${encodeURIComponent(instanceName)}`, { method: "POST", body: JSON.stringify({ where: {} }) });
    if (!r.ok) {
      console.error("whatsapp_import_provider_failed", JSON.stringify({ status: r.status, instanceName }));
      return json({ error: r.status ? "whatsapp_contact_fetch_failed" : "whatsapp_provider_unavailable", status: r.status }, 502);
    }
    const responseData = isRecord(r.data) ? r.data : null;
    const list = Array.isArray(r.data) ? r.data : Array.isArray(responseData?.contacts) ? responseData.contacts : null;
    if (!list) {
      console.error("whatsapp_import_invalid_provider_response", JSON.stringify({ instanceName, responseType: typeof r.data }));
      return json({ error: "invalid_contact_response" }, 502);
    }
    let imported = 0;

    for (const item of list) {
      const contact = isRecord(item) ? item : {};
      const jid = [contact.id, contact.remoteJid, contact.jid].find((value): value is string => typeof value === "string") || "";
      if (!jid || !jid.endsWith("@s.whatsapp.net")) continue;
      const phone = jid.split("@")[0]?.replace(/\D/g, "");
      if (!phone || !/^[1-9][0-9]{7,14}$/.test(phone)) continue;
      const name = [contact.pushName, contact.name, contact.notify, contact.verifiedBizName]
        .find((value): value is string => typeof value === "string" && value.length > 0) || null;
      const { error: upsertError } = await admin.from("whatsapp_contacts").upsert(
        {
          user_id: userId,
          instance_name: instanceName,
          whatsapp_instance_id: instanceRow.id,
          remote_jid: jid,
          canonical_remote_jid: jid,
          identity_type: "phone",
          identity_status: "resolved",
          is_group: false,
          phone_number: phone,
          ...(name ? { name: String(name) } : {}),
        },
        { onConflict: "user_id,instance_name,phone_number" },
      );
      if (upsertError) {
        console.error("whatsapp_import_contact_save_failed", JSON.stringify({ instanceName, code: upsertError.code, message: upsertError.message }));
        return json({ error: "whatsapp_contact_save_failed", imported }, 500);
      }
      imported += 1;
    }

    return json({ ok: true, imported, instanceName });
  } catch (error) {
    console.error("whatsapp_import_unexpected_error", error instanceof Error ? error.message : "unknown_error");
    return json({ error: "whatsapp_import_unexpected_error" }, 500);
  }
});
