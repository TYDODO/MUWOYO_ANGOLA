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

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const evoFetch = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${EVOLUTION_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY, ...(init.headers || {}) },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const userId = userData.user.id;
    const { data: instanceRow } = await admin.from("instances").select("instance_name").eq("user_id", userId).maybeSingle();
    const instanceName = instanceRow?.instance_name as string | undefined;
    if (!instanceName) return json({ error: "whatsapp_instance_not_connected" }, 400);

    const r = await evoFetch(`/chat/findContacts/${instanceName}`, { method: "POST", body: JSON.stringify({ where: {} }) });
    const list: any[] = Array.isArray(r.data) ? r.data : (r.data?.contacts || []);
    let imported = 0;

    for (const c of list) {
      const jid: string = c?.id || c?.remoteJid || c?.jid || "";
      if (!jid || !jid.endsWith("@s.whatsapp.net")) continue;
      const phone = jid.split("@")[0]?.replace(/\D/g, "");
      if (!phone || !/^[1-9][0-9]{7,14}$/.test(phone) || phone.includes("-")) continue;
      const name = c?.pushName || c?.name || c?.notify || c?.verifiedBizName || null;
      await admin.from("whatsapp_contacts").upsert(
        { user_id: userId, instance_name: instanceName, phone_number: phone, name },
        { onConflict: "user_id,instance_name,phone_number" },
      );
      imported += 1;
    }

    return json({ ok: true, imported });
  } catch (e: any) {
    console.error("whatsapp-import error", e);
    return json({ error: e?.message || "internal" }, 500);
  }
});
