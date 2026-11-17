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

  let claimedCampaignId = "";
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const isScheduler = authHeader === `Bearer ${SERVICE_KEY}`;
    let actorUserId = "";
    let dataUserId = "";
    let manageScope = "all";
    if (!isScheduler) {
      const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

      actorUserId = userData.user.id;
      dataUserId = actorUserId;
      const { data: member } = await admin
        .from("business_members")
        .select("id,business_id,role,status")
        .eq("user_id", actorUserId)
        .maybeSingle();
      if (member?.role === "attendant") {
        if (member.status !== "active") return json({ error: "attendant_not_active" }, 403);
        const { data: managePermission } = await admin
          .from("business_member_permissions")
          .select("id,data_scope")
          .eq("member_id", member.id)
          .eq("permission", "campaigns.manage")
          .eq("enabled", true)
          .maybeSingle();
        if (!managePermission) return json({ error: "campaign_permission_required" }, 403);
        manageScope = managePermission.data_scope === "own" ? "own" : "all";
        const { data: business, error: businessError } = await admin
          .from("businesses")
          .select("owner_id")
          .eq("id", member.business_id)
          .maybeSingle();
        if (businessError || !business?.owner_id) return json({ error: "business_not_found" }, 404);
        dataUserId = business.owner_id;
      } else if (member && (member.role !== "owner" || member.status !== "active")) {
        return json({ error: "business_membership_not_active" }, 403);
      }
    }
    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaignId || "");

    if (!campaignId) return json({ error: "campaign_id_required" }, 400);

    let campaignQuery = admin
      .from("campaigns")
      .select("id,name,message_text,status,scheduled_at,created_by,user_id,whatsapp_instance_id");
    campaignQuery = campaignQuery.eq("id", campaignId);
    if (!isScheduler) campaignQuery = campaignQuery.eq("user_id", dataUserId);
    const { data: campaign, error: campaignError } = await campaignQuery.maybeSingle();

    if (campaignError) throw campaignError;
    if (!campaign) return json({ error: "campaign_not_found" }, 404);
    dataUserId = campaign.user_id;
    if (!isScheduler && manageScope === "own" && campaign.created_by !== actorUserId) {
      return json({ error: "campaign_not_accessible" }, 403);
    }
    if (campaign.status === "scheduled" && campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now()) {
      return json({ error: "campaign_not_due", scheduledAt: campaign.scheduled_at }, 409);
    }
    if (isScheduler && !["scheduled", "sending", "processing"].includes(campaign.status)) {
      return json({ error: "campaign_not_schedulable" }, 409);
    }

    const { data: claimed, error: claimError } = await admin.rpc("claim_campaign_dispatch", {
      p_campaign_id: campaignId,
      p_allow_draft: !isScheduler,
    });
    if (claimError) throw claimError;
    if (!claimed) return json({ error: "campaign_already_processing" }, 409);
    claimedCampaignId = campaignId;

    const { data: queue, error: queueError } = await admin
      .from("campaign_contacts")
      .select("contact_id")
      .eq("campaign_id", campaignId)
      .eq("user_id", dataUserId)
      .eq("status", "pending")
      .order("contact_id")
      .limit(3);
    if (queueError) throw queueError;

    if (!queue?.length) {
      const { error } = await admin.from("campaigns")
        .update({ status: "completed", dispatch_claimed_until: null })
        .eq("id", campaignId);
      if (error) throw error;
      claimedCampaignId = "";
      return json({ ok: true, sent: 0, total: 0 });
    }

    const { data: contacts } = await admin
      .from("whatsapp_contacts")
      .select("id,name,phone_number")
      .eq("user_id", dataUserId)
      .in("id", queue.map((item: { contact_id: string }) => item.contact_id));

    const { data: blocked } = await admin
      .from("blocked_contacts")
      .select("phone_number")
      .eq("user_id", dataUserId)
      .eq("is_active", true);

    const blockedPhones = new Set((blocked || []).map((item: { phone_number: string }) => item.phone_number.replace(/\D/g, "")));
    const contactById = new Map((contacts || []).map((contact: { id: string; name: string | null; phone_number: string }) => [contact.id, contact]));
    const contactIds = (contacts || []).map((contact: { id: string }) => contact.id);
    const [{ data: metadata }, { data: tags }] = await Promise.all([
      admin.from("crm_contact_metadata").select("contact_id,stage_id").eq("user_id", dataUserId).in("contact_id", contactIds),
      admin.from("crm_contact_tags").select("contact_id,tag_id,crm_tags(name)").eq("user_id", dataUserId).in("contact_id", contactIds),
    ]);
    const stageIds = (metadata || []).map((item: { stage_id: string | null }) => item.stage_id).filter(Boolean);
    const { data: stages } = stageIds.length
      ? await admin.from("crm_stages").select("id,name").eq("user_id", dataUserId).in("id", stageIds)
      : { data: [] };
    const stageById = new Map((stages || []).map((stage: { id: string; name: string }) => [stage.id, stage.name]));
    const metadataByContact = new Map((metadata || []).map((item: { contact_id: string; stage_id: string | null }) => [item.contact_id, item]));
    const tagsByContact = new Map<string, string[]>();
    for (const item of tags || []) {
      const tagName = (item as any).crm_tags?.name;
      if (tagName) tagsByContact.set(item.contact_id, [...(tagsByContact.get(item.contact_id) || []), tagName]);
    }

    const instanceQuery = admin.from("instances")
      .select("instance_name")
      .eq("user_id", dataUserId)
      .eq("status", "connected");
    const { data: instanceRow, error: instanceError } = campaign.whatsapp_instance_id
      ? await instanceQuery.eq("id", campaign.whatsapp_instance_id).maybeSingle()
      : await instanceQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (instanceError) throw instanceError;
    const instanceName = instanceRow?.instance_name as string | undefined;
    if (!instanceName) throw new Error("whatsapp_instance_not_connected");

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
          user_id: dataUserId,
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
    const { error: finishError } = await admin.from("campaigns")
      .update({ status: remaining ? "sending" : "completed", dispatch_claimed_until: null })
      .eq("id", campaignId);
    if (finishError) throw finishError;
    claimedCampaignId = "";
    return json({ ok: true, sent: sentCount, total: queue.length, remaining: remaining || 0 });
  } catch (e: any) {
    if (claimedCampaignId) {
      const { error: releaseError } = await admin.from("campaigns")
        .update({ dispatch_claimed_until: null })
        .eq("id", claimedCampaignId);
      if (releaseError) console.error("campaign-send claim release failed", releaseError.message);
    }
    console.error("campaign-send error", e);
    return json({ error: e?.message || "internal" }, 500);
  }
});
