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

const renderMessage = (template: string, values: Record<string, string>) =>
  template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => values[key] ?? "");

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
    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaignId || "");

    if (!campaignId) return json({ error: "campaign_id_required" }, 400);

    const { data: campaign } = await admin
      .from("campaigns")
      .select("id,name,message_text,status")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!campaign) return json({ error: "campaign_not_found" }, 404);
    if (campaign.status === "scheduled" && campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now()) {
      return json({ error: "campaign_not_due", scheduledAt: campaign.scheduled_at }, 409);
    }

    const { data: queue } = await admin
      .from("campaign_contacts")
      .select("contact_id")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .eq("status", "pending");

    if (!queue?.length) {
      await admin.from("campaigns").update({ status: "completed" }).eq("id", campaignId);
      return json({ ok: true, sent: 0, total: 0 });
    }

    const { data: contacts } = await admin
      .from("whatsapp_contacts")
      .select("id,name,phone_number")
      .eq("user_id", userId)
      .in("id", queue.map((item: { contact_id: string }) => item.contact_id));

    const { data: blocked } = await admin
      .from("blocked_contacts")
      .select("phone_number")
      .eq("user_id", userId)
      .eq("is_active", true);

    const blockedPhones = new Set((blocked || []).map((item: { phone_number: string }) => item.phone_number.replace(/\D/g, "")));
    const contactById = new Map((contacts || []).map((contact: { id: string; name: string | null; phone_number: string }) => [contact.id, contact]));
    const contactIds = (contacts || []).map((contact: { id: string }) => contact.id);
    const [{ data: metadata }, { data: tags }] = await Promise.all([
      admin.from("crm_contact_metadata").select("contact_id,stage_id").eq("user_id", userId).in("contact_id", contactIds),
      admin.from("crm_contact_tags").select("contact_id,tag_id,crm_tags(name)").eq("user_id", userId).in("contact_id", contactIds),
    ]);
    const stageIds = (metadata || []).map((item: { stage_id: string | null }) => item.stage_id).filter(Boolean);
    const { data: stages } = stageIds.length
      ? await admin.from("crm_stages").select("id,name").eq("user_id", userId).in("id", stageIds)
      : { data: [] };
    const stageById = new Map((stages || []).map((stage: { id: string; name: string }) => [stage.id, stage.name]));
    const metadataByContact = new Map((metadata || []).map((item: { contact_id: string; stage_id: string | null }) => [item.contact_id, item]));
    const tagsByContact = new Map<string, string[]>();
    for (const item of tags || []) {
      const tagName = (item as any).crm_tags?.name;
      if (tagName) tagsByContact.set(item.contact_id, [...(tagsByContact.get(item.contact_id) || []), tagName]);
    }

    const { data: instanceRow } = await admin.from("instances").select("instance_name").eq("user_id", userId).maybeSingle();
    const instanceName = instanceRow?.instance_name as string | undefined;
    if (!instanceName) return json({ error: "whatsapp_instance_not_connected" }, 400);

    await admin.from("campaigns").update({ status: "sending" }).eq("id", campaignId);

    const wait30s = () => new Promise((resolve) => setTimeout(resolve, 30000));
    let sentCount = 0;
    for (const item of queue) {
      const contact = contactById.get(item.contact_id);
      const targetPhone = contact?.phone_number;
      if (!targetPhone) {
        await admin.from("campaign_contacts").update({ status: "failed" }).eq("campaign_id", campaignId).eq("contact_id", item.contact_id);
        continue;
      }
      const clean = targetPhone.replace(/\D/g, "");
      if (blockedPhones.has(clean)) {
        await admin.from("campaign_contacts").update({ status: "failed" }).eq("campaign_id", campaignId).eq("contact_id", item.contact_id);
        continue;
      }

      const contactMetadata = metadataByContact.get(item.contact_id);
      const messageText = renderMessage(campaign.message_text, {
        name: contact.name || "",
        nome: contact.name || "",
        phone: clean,
        telefone: clean,
        stage: contactMetadata?.stage_id ? stageById.get(contactMetadata.stage_id) || "" : "",
        etapa: contactMetadata?.stage_id ? stageById.get(contactMetadata.stage_id) || "" : "",
        tags: (tagsByContact.get(item.contact_id) || []).join(", "),
      });
      const sent = await evoFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        body: JSON.stringify({ number: clean, text: messageText }),
      });

      await admin.from("campaign_contacts").update({
        status: sent.ok ? "sent" : "failed",
        sent_at: sent.ok ? new Date().toISOString() : null,
      }).eq("campaign_id", campaignId).eq("contact_id", item.contact_id);

      if (sent.ok) {
        sentCount += 1;
        await admin.from("messages").insert({
          user_id: userId,
          phone_number: clean,
          message_text: messageText,
          direction: "outbound",
          kind: "text",
          whatsapp_instance_id: instanceName,
          external_id: sent.data?.key?.id || null,
        });
      }

      if (item !== queue[queue.length - 1]) {
        await wait30s();
      }
    }

    const { count: remaining } = await admin.from("campaign_contacts").select("contact_id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "pending");
    await admin.from("campaigns").update({ status: remaining ? "sending" : "completed" }).eq("id", campaignId);
    return json({ ok: true, sent: sentCount, total: queue.length });
  } catch (e: any) {
    console.error("campaign-send error", e);
    return json({ error: e?.message || "internal" }, 500);
  }
});
