import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVOLUTION_URL = (Deno.env.get("EVOLUTION_API_URL") || "https://api.muwoyo.com").replace(/\/+$/, "");
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") || EVOLUTION_KEY;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/webhook?token=${encodeURIComponent(WEBHOOK_SECRET)}`;
const triggerInboxSync = async (userId: string, instanceName: string) => {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/inbox-sync`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, "x-internal-sync": SERVICE_KEY }, body: JSON.stringify({ userId, instanceName }) });
  } catch (error) { console.error("automatic inbox sync failed", error); }
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const evoFetch = async (path: string, init: RequestInit = {}) => {
  try {
    const res = await fetch(`${EVOLUTION_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY, ...(init.headers || {}) },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    console.log(`[evoFetch] ${init.method || "GET"} ${path} -> ${res.status}`);
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "evolution_unreachable";
    console.error("Evolution request failed", path, message);
    return { ok: false, status: 0, data: { error: message } };
  }
};

const extractState = (p: any) => p?.instance?.state || p?.state || p?.connectionStatus || null;
const mapState = (s: string | null | undefined) => (s === "open" ? "open" : s === "connecting" ? "connecting" : "disconnected");
const isRemoteInstanceMissing = (status: number, data: unknown) =>
  status === 404 || /instance.{0,30}(not found|does not exist|not exist)/i.test(JSON.stringify(data || ""));
const extractQrBase64 = (p: any) => p?.qrcode?.base64 || p?.base64 || p?.qr?.base64 || null;
const extractQrText = (p: any) => p?.qrcode?.code || p?.code || p?.qr?.code || null;
const extractPairingCode = (p: any) => p?.pairingCode || p?.code || p?.pairing?.code || null;

// Get existing instance_name from supabase (do NOT auto-create)
const getStoredInstanceName = async (
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestedInstanceName: string | null,
) => {
  if (requestedInstanceName) {
    const { data: requested, error } = await admin
      .from("instances")
      .select("instance_name")
      .eq("user_id", userId)
      .eq("instance_name", requestedInstanceName)
      .maybeSingle();
    if (error) throw error;
    if (requested?.instance_name) return requested.instance_name as string;
    return null;
  }

  const { data: rows, error } = await admin
    .from("instances")
    .select("instance_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return rows?.[0]?.instance_name as string | undefined;
};

const startTrialIfNeeded = async (admin: ReturnType<typeof createClient>, userId: string) => {
  const { error } = await admin.rpc("start_trial_on_whatsapp_connection", { p_user_id: userId });
  if (error) console.error("Could not start WhatsApp trial", error);
};

// Upsert instance row (creates if missing, updates if exists). Used after successful evolution operations.
const saveInstance = async (
  admin: ReturnType<typeof createClient>,
  userId: string,
  instanceName: string,
  patch: Record<string, any>,
) => {
  const { error } = await admin.from("instances").upsert(
    { user_id: userId, instance_name: instanceName, ...patch },
    { onConflict: "user_id,instance_name" },
  );
  if (error) throw error;
};

// CHECK DIRECTLY ON EVOLUTION (do NOT trust supabase)
const checkEvolutionInstanceExists = async (instanceName: string) => {
  const fetched = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
  if (!fetched.ok && fetched.status === 404) {
    return { exists: false, state: null, raw: null };
  }
  if (!fetched.ok) {
    throw new Error(`evolution_instance_status_unavailable:${fetched.status || "network_error"}`);
  }
  const arr: any[] | null = Array.isArray(fetched.data)
    ? fetched.data
    : Array.isArray(fetched.data?.instances)
      ? fetched.data.instances
      : fetched.data && (fetched.data?.name || fetched.data?.instance?.instanceName || fetched.data?.instanceName)
        ? [fetched.data]
        : null;
  if (!arr) throw new Error("evolution_instance_status_invalid_response");
  const found = arr.find((i: any) => {
    const n = i?.name || i?.instance?.instanceName || i?.instanceName;
    return n === instanceName;
  });
  if (found) {
    const state = extractState(found) || found?.connectionStatus || null;
    return { exists: true, state, raw: found };
  }
  return { exists: false, state: null, raw: null };
};

const updateInstanceStateIfChanged = async (
  admin: ReturnType<typeof createClient>,
  userId: string,
  instanceName: string,
  patch: Record<string, unknown>,
) => {
  const { data: current, error: lookupError } = await admin.from("instances")
    .select("id,connection_state,evolution_state,status,automation_paused,automation_paused_until,disconnected_at,phone,phone_number,qr_code")
    .eq("user_id", userId)
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!current) throw new Error("stored_instance_not_found");
  if (patch.status === "disconnected" && current.status === "disconnected") {
    patch.disconnected_at = current.disconnected_at;
  }
  const changed = Object.entries(patch).some(([key, value]) => current[key as keyof typeof current] !== value);
  if (!changed) return false;
  const { error } = await admin.from("instances").update(patch).eq("id", current.id);
  if (error) throw error;
  return true;
};

const reconcileAllInstances = async (admin: ReturnType<typeof createClient>) => {
  const response = await evoFetch("/instance/fetchInstances");
  if (!response.ok) return { error: "evolution_instance_list_unavailable", status: response.status };
  const remoteInstances = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.instances)
      ? response.data.instances
      : null;
  if (!remoteInstances) return { error: "invalid_evolution_instance_list", status: 502 };

  const { data: localInstances, error } = await admin.from("instances")
    .select("id,user_id,instance_name,connection_state,evolution_state,status,automation_paused,automation_paused_until,disconnected_at,phone,phone_number,qr_code");
  if (error) throw error;
  const remoteByName = new Map<string, any>();
  for (const remote of remoteInstances) {
    const name = remote?.name || remote?.instance?.instanceName || remote?.instanceName;
    if (typeof name === "string") remoteByName.set(name, remote);
  }

  let connected = 0;
  let disconnected = 0;
  for (const local of localInstances || []) {
    const remote = remoteByName.get(local.instance_name);
    const state = remote ? extractState(remote) || "close" : "close";
    const mapped = mapState(state);
    const isConnected = mapped === "open";
    const patch = {
      connection_state: mapped,
      evolution_state: state,
      status: isConnected ? "connected" : mapped === "connecting" ? "connecting" : "disconnected",
      ...(isConnected ? { disconnected_at: null } : { disconnected_at: local.disconnected_at || new Date().toISOString() }),
      ...(!isConnected ? { automation_paused: false, automation_paused_until: null } : {}),
      ...(!remote ? { phone: null, phone_number: null, qr_code: null } : {}),
    };
    const changed = Object.entries(patch).some(([key, value]) => local[key as keyof typeof local] !== value);
    if (changed) {
      const { error: updateError } = await admin.from("instances").update(patch).eq("id", local.id);
      if (updateError) throw updateError;
    }
    if (isConnected) connected += 1;
    else disconnected += 1;
  }
  return { ok: true, checked: localInstances?.length || 0, connected, disconnected };
};

const createEvolutionInstance = async (instanceName: string, phone?: string) => {
  return evoFetch(`/instance/create`, {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      ...(phone ? { number: phone } : {}),
      webhook: {
        enabled: true,
        url: WEBHOOK_URL,
        webhookByEvents: false,
        webhookBase64: true,
        events: [
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "MESSAGES_DELETE",
          "SEND_MESSAGE",
          "SEND_MESSAGE_UPDATE",
          "CONTACTS_SET",
          "CONTACTS_UPSERT",
          "CONTACTS_UPDATE",
          "CHATS_SET",
          "CHATS_UPSERT",
          "CHATS_UPDATE",
          "CHATS_DELETE",
          "PRESENCE_UPDATE",
        ],
      },
      syncFullHistory: true,
    }),
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!EVOLUTION_KEY) return json({ error: "missing_evolution_api_key", message: "Configure o secret EVOLUTION_API_KEY no Supabase." }, 503);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const userId = userData.user.id;
    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };
    const phone = body?.phone || body?.phoneNumber || undefined;
    const requestedInstanceName =
      typeof body?.instanceName === "string" && body.instanceName.trim() ? body.instanceName.trim() : null;

    const normalizedAction =
      action === "connect" || action === "getQrCode" ? "createAndConnect"
      : action === "pairing" ? "getPairingCode"
      : action === "status" ? "getStatus"
      : action === "groups" ? "fetchInfo"
      : action;

    if (!normalizedAction) return json({ error: "missing_action" }, 400);

    if (normalizedAction === "reconcileAllInstances") {
      const [{ data: isPrimaryAdmin, error: adminError }, { data: roles, error: rolesError }] = await Promise.all([
        admin.rpc("is_admin", { _user_id: userId }),
        admin.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (adminError || rolesError) return json({ error: "admin_authorization_check_failed" }, 500);
      if (!isPrimaryAdmin && !roles?.some((row: { role: string }) => row.role === "sub_admin")) {
        return json({ error: "admin_required" }, 403);
      }
      const result = await reconcileAllInstances(admin);
      return json(result, "ok" in result && result.ok ? 200 : result.status || 502);
    }

    // The stored instance is authoritative after the first connection.
    const storedInstanceName = await getStoredInstanceName(admin, userId, requestedInstanceName);
    const mayCreateInstance = normalizedAction === "createAndConnect" || normalizedAction === "getPairingCode";
    const instanceName = storedInstanceName || (mayCreateInstance ? requestedInstanceName : null);
    if (!instanceName) {
      if (requestedInstanceName) return json({ error: "whatsapp_instance_not_found" }, 404);
      return json({ error: "instance_name_required", message: "Frontend deve enviar instanceName" }, 400);
    }

    // ============================================================
    // CONNECT FLOW: verify on evolution -> create if missing -> qr
    // ============================================================
    if (normalizedAction === "createAndConnect") {
      console.log(`[connect] start for instance=${instanceName}`);

      // STEP 1: Check directly on Evolution if instance exists
      let check = await checkEvolutionInstanceExists(instanceName);
      console.log(`[connect] step1 evolution exists=${check.exists} state=${check.state}`);
      if (!storedInstanceName && check.exists) return json({ error: "instance_name_already_in_use" }, 409);

      // STEP 2: If not, create it on Evolution
      if (!check.exists) {
        console.log(`[connect] step2 creating instance on evolution`);
        const created = await createEvolutionInstance(instanceName, phone);
        if (!created.ok && created.status !== 201 && created.status !== 200 && created.status !== 403) {
          console.error(`[connect] create failed`, created.status, created.data);
          return json({ error: "create_failed", details: created.data, status: created.status }, 500);
        }

        // STEP 3: Confirm creation by re-checking on Evolution
        let confirmed = false;
        for (let i = 0; i < 6 && !confirmed; i++) {
          await wait(1500);
          check = await checkEvolutionInstanceExists(instanceName);
          confirmed = check.exists;
          console.log(`[connect] step3 confirm attempt=${i + 1} exists=${confirmed}`);
        }
        if (!confirmed) {
          return json({ error: "instance_not_confirmed_on_evolution", instanceName }, 500);
        }

        // QR may already be in the create response
        const initialQrBase64 = extractQrBase64(created.data);
        const initialQrText = extractQrText(created.data);
        if (initialQrBase64 || initialQrText) {
          console.log(`[connect] got QR from create response`);
          await saveInstance(admin, userId, instanceName, {
            connection_state: "connecting",
            evolution_state: "connecting",
            phone: phone || null,
            phone_number: phone || null,
            qr_code: initialQrText || initialQrBase64,
            status: "connecting",
          });
          return json({ instanceName, qrBase64: initialQrBase64, qrCodeText: initialQrText, state: "connecting" });
        }
      }

      // Already connected?
      if (mapState(check.state) === "open") {
        await saveInstance(admin, userId, instanceName, {
          connection_state: "open", evolution_state: "open", status: "connected",
        });
        await startTrialIfNeeded(admin, userId);
        await triggerInboxSync(userId, instanceName);
        return json({ instanceName, connected: true, state: "open" });
      }

      // STEP 4: Instance exists on Evolution -> request QR via /instance/connect
      console.log(`[connect] step4 requesting QR via /instance/connect`);
      let qrBase64: string | null = null;
      let qrCodeText: string | null = null;

      const initial = await evoFetch(`/instance/connect/${instanceName}`);
      qrBase64 = extractQrBase64(initial.data);
      qrCodeText = extractQrText(initial.data);

      // STEP 5: Poll fetchInstances if QR not yet returned
      for (let i = 0; i < 12 && !qrBase64 && !qrCodeText; i++) {
        await wait(2000);
        const poll = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
        const arr = Array.isArray(poll.data) ? poll.data : [poll.data];
        const inst = arr.find((i: any) => (i?.name || i?.instanceName) === instanceName) || arr[0];
        qrBase64 = extractQrBase64(inst) || extractQrBase64(inst?.instance) || extractQrBase64(inst?.qrcode);
        qrCodeText = extractQrText(inst) || extractQrText(inst?.instance) || extractQrText(inst?.qrcode);
        const st = mapState(extractState(inst) || extractState(inst?.instance));
        console.log(`[connect] step5 poll=${i + 1} state=${st} hasQR=${!!(qrBase64 || qrCodeText)}`);
        if (st === "open") {
          await saveInstance(admin, userId, instanceName, {
            connection_state: "open", evolution_state: "open", status: "connected",
          });
          await startTrialIfNeeded(admin, userId);
          await triggerInboxSync(userId, instanceName);
          return json({ instanceName, connected: true, state: "open" });
        }
        if (qrBase64 || qrCodeText) break;
        if (i === 5) {
          console.log(`[connect] retrying /instance/connect mid-poll`);
          const retry = await evoFetch(`/instance/connect/${instanceName}`);
          qrBase64 = extractQrBase64(retry.data) || qrBase64;
          qrCodeText = extractQrText(retry.data) || qrCodeText;
        }
      }

      if (!qrBase64 && !qrCodeText) {
        return json({ error: "qr_unavailable", instanceName }, 500);
      }

      await saveInstance(admin, userId, instanceName, {
        connection_state: "connecting",
        evolution_state: "connecting",
        phone: phone || null,
        phone_number: phone || null,
        qr_code: qrCodeText || qrBase64,
        status: "connecting",
      });

      return json({ instanceName, qrBase64, qrCodeText, state: "connecting" });
    }

    // ============================================================
    // PAIRING CODE FLOW
    // ============================================================
    if (normalizedAction === "getPairingCode") {
      if (!phone) return json({ error: "phone_required" }, 400);

      let check = await checkEvolutionInstanceExists(instanceName);
      if (!storedInstanceName && check.exists) return json({ error: "instance_name_already_in_use" }, 409);
      if (!check.exists) {
        const created = await createEvolutionInstance(instanceName, phone);
        if (!created.ok && created.status !== 201 && created.status !== 200 && created.status !== 403) {
          return json({ error: "create_failed", details: created.data, status: created.status }, 500);
        }
        for (let i = 0; i < 6; i++) {
          await wait(1500);
          check = await checkEvolutionInstanceExists(instanceName);
          if (check.exists) break;
        }
        if (!check.exists) return json({ error: "instance_not_confirmed_on_evolution", instanceName }, 500);
      }

      if (mapState(check.state) === "open") {
        await saveInstance(admin, userId, instanceName, {
          connection_state: "open", evolution_state: "open", status: "connected", phone, phone_number: phone,
        });
        await startTrialIfNeeded(admin, userId);
        await triggerInboxSync(userId, instanceName);
        return json({ instanceName, connected: true, state: "open" });
      }

      let pairingCode: string | null = null;
      for (let i = 0; i < 8 && !pairingCode; i++) {
        const [c, p] = await Promise.all([
          evoFetch(`/instance/connect/${instanceName}?number=${encodeURIComponent(phone)}`),
          evoFetch(`/instance/pairingCode/${instanceName}?number=${encodeURIComponent(phone)}`),
        ]);
        pairingCode = extractPairingCode(c.data) || extractPairingCode(p.data);
        if (pairingCode) break;
        await wait(1500);
      }

      if (!pairingCode) return json({ error: "pairing_unavailable", instanceName }, 500);

      await saveInstance(admin, userId, instanceName, {
        connection_state: "connecting", evolution_state: "connecting",
        phone, phone_number: phone, status: "connecting",
      });

      return json({ instanceName, pairingCode, state: "connecting" });
    }

    // ============================================================
    // STATUS
    // ============================================================
    if (normalizedAction === "getStatus") {
      const check = await checkEvolutionInstanceExists(instanceName);
      if (!check.exists) {
        await updateInstanceStateIfChanged(admin, userId, instanceName, {
          connection_state: "disconnected",
          evolution_state: "close",
          status: "disconnected",
          disconnected_at: new Date().toISOString(),
          automation_paused: false,
          automation_paused_until: null,
          phone: null,
          phone_number: null,
          qr_code: null,
        });
        return json({ instanceName, state: "disconnected", raw: "close", exists: false, deleted: true });
      }
      const raw = check.state || "close";
      const state = mapState(raw);
      const stateChanged = await updateInstanceStateIfChanged(admin, userId, instanceName, {
        connection_state: state, evolution_state: raw,
        status: state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected",
        disconnected_at: state === "open" ? null : new Date().toISOString(),
        ...(state === "open" ? {} : { automation_paused: false, automation_paused_until: null }),
      });
      if (state === "open") {
        await startTrialIfNeeded(admin, userId);
        if (stateChanged) await triggerInboxSync(userId, instanceName);
      }
      return json({ instanceName, state, raw, exists: true });
    }

    // ============================================================
    // FETCH INFO / GROUPS
    // ============================================================
    if (normalizedAction === "fetchInfo" || normalizedAction === "getGroups") {
      const fetched = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
      const inst = Array.isArray(fetched.data) ? fetched.data[0] : fetched.data;
      const phoneNum = inst?.ownerJid?.split("@")[0] || inst?.number || inst?.wuid?.split?.("@")[0] || null;
      let groupCount = 0;
      const groups = await evoFetch(`/group/fetchAllGroups/${instanceName}?getParticipants=false`);
      if (Array.isArray(groups.data)) groupCount = groups.data.length;
      if (phoneNum) {
        await saveInstance(admin, userId, instanceName, { phone: phoneNum, phone_number: phoneNum });
      }
      return json({ phone: phoneNum, groupCount });
    }

    // IMPORT CONTACTS FROM EVOLUTION (skip groups)
    if (normalizedAction === "importContacts") {
      const r = await evoFetch(`/chat/findContacts/${encodeURIComponent(instanceName)}`, { method: "POST", body: JSON.stringify({ where: {} }) });
      if (!r.ok) return json({ error: "whatsapp_contact_fetch_failed", status: r.status }, 502);
      const list: any[] | null = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.contacts) ? r.data.contacts : null);
      if (!list) return json({ error: "invalid_contact_response" }, 502);
      let imported = 0;
      for (const c of list) {
        const jid: string = c?.id || c?.remoteJid || c?.jid || "";
        if (!jid || !jid.endsWith("@s.whatsapp.net")) continue;
        const phone = jid.split("@")[0]?.replace(/\D/g, "");
        if (!phone || !/^[1-9][0-9]{7,14}$/.test(phone)) continue;
        const name = c?.pushName || c?.name || c?.notify || c?.verifiedBizName || null;
        const { error } = await admin.from("whatsapp_contacts").upsert(
          { user_id: userId, instance_name: instanceName, remote_jid: jid, is_group: false, phone_number: phone, ...(name ? { name } : {}) },
          { onConflict: "user_id,instance_name,phone_number" },
        );
        if (error) throw error;
        imported++;
      }
      return json({ ok: true, imported });
    }

    if (normalizedAction === "sendMessage") {
      const targetPhone = String(body?.phoneNumber || "").replace(/\D/g, "");
      const text = typeof body?.messageText === "string" ? body.messageText.trim() : "";
      if (!targetPhone || !text) return json({ error: "phone_and_message_required" }, 400);
      const sent = await evoFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, { method: "POST", body: JSON.stringify({ number: targetPhone, text }) });
      if (!sent.ok) return json({ error: "whatsapp_send_failed", details: sent.data }, 502);
      await admin.from("messages").insert({ user_id: userId, phone_number: targetPhone, message_text: text.slice(0, 4000), direction: "outbound", kind: "text", whatsapp_instance_id: instanceName, external_id: sent.data?.key?.id || null });
      return json({ ok: true, data: sent.data });
    }

    if (normalizedAction === "sendCampaign") {
      const campaignId = String(body?.campaignId || "");
      if (!campaignId) return json({ error: "campaign_id_required" }, 400);
      const { data: canCampaign } = await admin.rpc("has_plan_feature", { p_user_id: userId, p_feature: "campaigns" });
      if (!canCampaign) return json({ error: "campaigns_not_available_for_plan" }, 403);
      const { data: campaign } = await admin.from("campaigns").select("id,name,message_text,status").eq("id", campaignId).eq("user_id", userId).maybeSingle();
      if (!campaign) return json({ error: "campaign_not_found" }, 404);
      const { data: queue } = await admin.from("campaign_contacts").select("contact_id").eq("campaign_id", campaignId).eq("user_id", userId).eq("status", "pending");
      const { data: contacts } = await admin.from("whatsapp_contacts").select("id,phone_number").eq("user_id", userId).in("id", (queue || []).map((item: { contact_id: string }) => item.contact_id));
      const phoneById = new Map((contacts || []).map((contact: { id: string; phone_number: string }) => [contact.id, contact.phone_number]));
      await admin.from("campaigns").update({ status: "sending" }).eq("id", campaignId);
      let sentCount = 0;
      for (const item of queue || []) {
        const targetPhone = phoneById.get(item.contact_id);
        if (!targetPhone) continue;
        const sent = await evoFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, { method: "POST", body: JSON.stringify({ number: targetPhone, text: campaign.message_text }) });
        await admin.from("campaign_contacts").update({ status: sent.ok ? "sent" : "failed", sent_at: sent.ok ? new Date().toISOString() : null }).eq("campaign_id", campaignId).eq("contact_id", item.contact_id);
        if (sent.ok) { sentCount++; await admin.from("messages").insert({ user_id: userId, phone_number: targetPhone, message_text: campaign.message_text, direction: "outbound", kind: "text", whatsapp_instance_id: instanceName, external_id: sent.data?.key?.id || null }); await admin.from("crm_activities").insert({ user_id: userId, contact_id: item.contact_id, activity_type: "campaign_sent", description: campaign.name }); }
      }
      await admin.from("campaigns").update({ status: sentCount === (queue || []).length ? "completed" : "error" }).eq("id", campaignId);
      return json({ ok: true, sent: sentCount, total: (queue || []).length });
    }


    // ============================================================
    // DISCONNECT
    // ============================================================
    if (normalizedAction === "disconnect") {
      const remote = await checkEvolutionInstanceExists(instanceName);
      if (!remote.exists) {
        const { error } = await admin.from("instances").delete()
          .eq("user_id", userId)
          .eq("instance_name", instanceName);
        if (error) throw error;
        return json({ ok: true, remoteAlreadyDeleted: true, exists: false });
      }

      const remoteState = mapState(remote.state);
      if (remoteState === "disconnected") {
        await updateInstanceStateIfChanged(admin, userId, instanceName, {
          connection_state: "disconnected",
          evolution_state: remote.state || "close",
          status: "disconnected",
          disconnected_at: new Date().toISOString(),
          automation_paused: false,
          automation_paused_until: null,
          qr_code: null,
        });
        return json({ ok: true, remoteAlreadyDisconnected: true, exists: true, state: remote.state || "close" });
      }

      const logout = await evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
      const alreadyMissing = !logout.ok && isRemoteInstanceMissing(logout.status, logout.data);
      if (!logout.ok && !alreadyMissing) {
        return json({ error: "whatsapp_disconnect_failed", status: logout.status, details: logout.data }, 502);
      }
      if (alreadyMissing) {
        const { error } = await admin.from("instances").delete()
          .eq("user_id", userId)
          .eq("instance_name", instanceName);
        if (error) throw error;
        return json({ ok: true, remoteAlreadyDeleted: true, exists: false });
      }
      await updateInstanceStateIfChanged(admin, userId, instanceName, {
        connection_state: "disconnected",
        evolution_state: "close",
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
        automation_paused: false,
        automation_paused_until: null,
        qr_code: null,
      });
      return json({ ok: true, exists: true, state: "close" });
    }

    // ============================================================
    // DELETE INSTANCE
    // ============================================================
    if (normalizedAction === "deleteInstance") {
      const logout = await evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
      if (!logout.ok && logout.status !== 404) return json({ error: "whatsapp_disconnect_failed", details: logout.data }, 502);
      const removed = await evoFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
      if (!removed.ok && removed.status !== 404) return json({ error: "whatsapp_delete_failed", details: removed.data }, 502);
      await saveInstance(admin, userId, instanceName, {
        connection_state: "disconnected", evolution_state: "close", status: "disconnected",
        disconnected_at: new Date().toISOString(),
        automation_paused: false, automation_paused_until: null,
        phone: null, phone_number: null, qr_code: null,
      });
      return json({ ok: true, remoteAlreadyDeleted: removed.status === 404 });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e: any) {
    console.error("evolution-api error", e);
    return json({ error: e?.message || "internal" }, 500);
  }
});
