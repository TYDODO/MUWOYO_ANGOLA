import { createClient } from "npm:@supabase/supabase-js@2";
import { extractEvolutionMessageId, getScopedMessageKey, isEvolutionMessageFromMe, resolveDeliveryStatus, resolveMessageDirection } from "../../../src/lib/message-identity.ts";
import { extractEvolutionMediaBase64 } from "../_shared/evolution-media.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const N8N_URL = Deno.env.get("N8N_WEBHOOK_URL") || "";
const EVOLUTION_URL = (Deno.env.get("EVOLUTION_API_URL") || "https://api.muwoyo.com").replace(/\/+$/, "");
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") || EVOLUTION_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const ok = (data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalizePhone = (jid = "") => jid.split("@")[0]?.replace(/\D/g, "") || "unknown";
const isGroupJid = (jid = "") => jid.endsWith("@g.us");
const isIndividualJid = (jid = "") => jid.endsWith("@s.whatsapp.net") && /^[1-9][0-9]{7,14}$/.test(normalizePhone(jid));

function isValidWebhookSecret(req: Request): boolean {
  if (!WEBHOOK_SECRET) return false;
  const authorization = req.headers.get("authorization") || "";
  const suppliedHeaders = [
    req.headers.get("x-webhook-secret"),
    req.headers.get("x-api-key"),
    req.headers.get("apikey"),
    authorization.startsWith("Bearer ") ? authorization.slice(7) : null,
  ].filter((value): value is string => Boolean(value));
  const suppliedUrlToken = new URL(req.url).searchParams.get("token");
  const candidates = [...suppliedHeaders, ...(suppliedUrlToken ? [suppliedUrlToken] : [])];
  return candidates.some((supplied) => {
    if (supplied.length !== WEBHOOK_SECRET.length) return false;
    let difference = 0;
    for (let index = 0; index < supplied.length; index += 1) {
      difference |= supplied.charCodeAt(index) ^ WEBHOOK_SECRET.charCodeAt(index);
    }
    return difference === 0;
  });
}

function detectKind(message: any): { kind: string; text: string } {
  if (!message) return { kind: "text", text: "" };
  const text =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    "";
  if (message.audioMessage) return { kind: "audio", text };
  if (message.imageMessage) return { kind: "image", text };
  if (message.videoMessage) return { kind: "video", text };
  if (message.documentMessage) return { kind: "document", text };
  if (message.stickerMessage) return { kind: "sticker", text: "" };
  if (message.locationMessage) return { kind: "location", text: "[Localização]" };
  if (message.contactMessage) return { kind: "contact", text: "[Contato]" };
  return { kind: "text", text };
}

async function fetchMediaBase64(instance: string, messageKey: any, kind: string, message: any): Promise<string | null> {
  const mediaMessage = message?.[`${kind}Message`];
  const embeddedBase64 = extractEvolutionMediaBase64(mediaMessage) || extractEvolutionMediaBase64(message);
  if (embeddedBase64) return embeddedBase64;
  if (!messageKey) return null;
  if (!EVOLUTION_URL || !EVOLUTION_KEY) {
    console.error(JSON.stringify({ event: "webhook_media_fetch_failed", instance, kind, reason: "missing_configuration" }));
    return null;
  }
  try {
    const r = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
      body: JSON.stringify({ message: { key: messageKey }, convertToMp4: kind === "video" }),
    });
    if (!r.ok) {
      console.error(JSON.stringify({ event: "webhook_media_fetch_failed", instance, kind, status: r.status }));
      return null;
    }
    return extractEvolutionMediaBase64(await r.json());
  } catch {
    console.error(JSON.stringify({ event: "webhook_media_fetch_failed", instance, kind, reason: "network_or_invalid_response" }));
    return null;
  }
}

async function persistMedia(instance: string, messageKey: any, userId: string, kind: string, message: any) {
  if (!messageKey || !["image", "audio", "video", "document"].includes(kind)) return null;
  try {
    const embedded = extractEvolutionMediaBase64(message?.[`${kind}Message`]) || extractEvolutionMediaBase64(message);
    let base64 = embedded;
    if (!base64) {
      if (!EVOLUTION_URL || !EVOLUTION_KEY) {
        console.error(JSON.stringify({ event: "webhook_media_persist_failed", instance, kind, reason: "missing_configuration" }));
        return null;
      }
      const response = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
        body: JSON.stringify({ message: { key: messageKey }, convertToMp4: kind === "video" }),
      });
      if (!response.ok) {
        console.error(JSON.stringify({ event: "webhook_media_persist_failed", instance, kind, status: response.status }));
        return null;
      }
      base64 = extractEvolutionMediaBase64(await response.json());
    }
    if (!base64) {
      console.error(JSON.stringify({ event: "webhook_media_persist_failed", instance, kind, reason: "empty_media_payload" }));
      return null;
    }
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const extension = kind === "image" ? "jpg" : kind === "audio" ? "ogg" : kind === "video" ? "mp4" : "bin";
    const path = `${userId}/inbox/${messageKey.id || crypto.randomUUID()}-${Date.now()}.${extension}`;
    const contentType = kind === "image" ? "image/jpeg" : kind === "audio" ? "audio/ogg" : kind === "video" ? "video/mp4" : "application/octet-stream";
    const upload = await admin.storage.from("store-assets").upload(path, bytes, { contentType, upsert: true });
    if (upload.error) {
      console.error(JSON.stringify({ event: "webhook_media_storage_failed", instance, kind, code: upload.error.name }));
      return null;
    }
    return admin.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
  } catch {
    console.error(JSON.stringify({ event: "webhook_media_persist_failed", instance, kind, reason: "invalid_media_or_storage_error" }));
    return null;
  }
}

async function saveHistory(userId: string, phoneNumber: string, role: "user" | "assistant", content: string, metadata: Record<string, unknown> = {}) {
  if (!content) return;
  const { error } = await admin.from("n8n_chat_histories").insert({
    user_id: userId,
    phone_number: phoneNumber,
    session_id: `${userId}_${phoneNumber}`,
    message: { type: role, data: { content, ...metadata } },
  });
  if (error) throw error;
}

async function dispatchToN8n(payload: any) {
  if (!N8N_URL) {
    console.error("N8N_WEBHOOK_URL is not configured");
    return false;
  }
  try {
    const res = await fetch(N8N_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    console.log(JSON.stringify({ event: "n8n_dispatch", host: new URL(N8N_URL).host, status: res.status, ok: res.ok }));
    await res.body?.cancel();
    return res.ok;
  } catch (e) {
    console.error("n8n dispatch failed", e instanceof Error ? e.message : "unknown_error");
    return false;
  }
}

const logMessageSkip = (instanceName: string, messageId: string | null, reason: string) => {
  console.info(JSON.stringify({ event: "customer_message_skipped", instanceName, messageId, reason }));
};

async function sendQueuedInboxMessages(instanceName: string) {
  const { data: pendingRows, error } = await admin
    .from("message_queue")
    .select("id,user_id,remote_jid,payload,attempts")
    .eq("instance_name", instanceName)
    .eq("status", "pending")
    .eq("payload->>source", "inbox")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(10);
  if (error) {
    console.error("Could not load pending Inbox messages", instanceName, error.message);
    return;
  }

  for (const queued of pendingRows || []) {
    const { data: claimed, error: claimError } = await admin
      .from("message_queue")
      .update({ status: "processing", attempts: Number(queued.attempts || 0) + 1 })
      .eq("id", queued.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) continue;

    const payload = queued.payload as Record<string, any>;
    const kind = String(payload.kind || "text");
    const number = String(payload.phone_number || normalizePhone(queued.remote_jid));
    const base = { number };
    let path = "";
    let requestBody: Record<string, unknown> = {};
    if (kind === "text") {
      path = `/message/sendText/${encodeURIComponent(instanceName)}`;
      requestBody = { ...base, text: String(payload.message_text || "") };
    } else if (kind === "audio") {
      path = `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`;
      requestBody = { ...base, audio: String(payload.media_url || ""), caption: String(payload.caption || "") };
    } else if (kind === "sticker") {
      path = `/message/sendSticker/${encodeURIComponent(instanceName)}`;
      requestBody = { ...base, sticker: String(payload.media_url || "") };
    } else {
      path = `/message/sendMedia/${encodeURIComponent(instanceName)}`;
      requestBody = {
        ...base,
        media: String(payload.media_url || ""),
        mediatype: kind,
        type: kind,
        fileName: String(payload.file_name || "media"),
        mimetype: String(payload.mimetype || "application/octet-stream"),
        ...(payload.caption ? { caption: String(payload.caption) } : {}),
      };
    }

    try {
      const response = await fetch(`${EVOLUTION_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(12000),
      });
      const responseText = await response.text();
      let result: any = null;
      try { result = responseText ? JSON.parse(responseText) : null; } catch { result = { raw: responseText }; }

      if (response.ok) {
        const externalId = extractEvolutionMessageId(result);
        await admin.from("messages").update({
          delivery_status: "sent",
          external_id: externalId,
          sent_at: new Date().toISOString(),
        }).eq("id", payload.message_id).eq("user_id", queued.user_id);
        await admin.from("message_queue").update({ status: "delivered", external_message_id: externalId, last_error: null }).eq("id", queued.id);
        continue;
      }

      const attempts = Number(queued.attempts || 0) + 1;
      const permanentFailure = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
      const nextStatus = permanentFailure ? "failed" : "pending";
      await admin.from("message_queue").update({
        status: nextStatus,
        last_error: JSON.stringify(result || { status: response.status }).slice(0, 2000),
        scheduled_for: new Date(Date.now() + Math.min(60, 2 ** Math.min(attempts, 6)) * 60_000).toISOString(),
      }).eq("id", queued.id);
      if (permanentFailure) {
        await admin.from("messages").update({ delivery_status: "failed", failed_at: new Date().toISOString(), failure_reason: `Evolution ${response.status}` }).eq("id", payload.message_id).eq("user_id", queued.user_id);
      }
    } catch (sendError) {
      const attempts = Number(queued.attempts || 0) + 1;
      await admin.from("message_queue").update({
        status: "pending",
        last_error: String(sendError).slice(0, 2000),
        scheduled_for: new Date(Date.now() + Math.min(60, 2 ** Math.min(attempts, 6)) * 60_000).toISOString(),
      }).eq("id", queued.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isValidWebhookSecret(req)) return new Response("Unauthorized webhook", { status: WEBHOOK_SECRET ? 401 : 503 });
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const event = (body?.event || "").toString().toLowerCase().replace(/[._-]/g, "");
    const instanceName = body?.instance || body?.instanceName || body?.data?.instanceName;
    if (!instanceName) return ok({ ok: true, ignored: true });
    console.info(JSON.stringify({ event: "evolution_webhook_received", evolutionEvent: event, instanceName }));

    const { data: inst, error: instanceError } = await admin
      .from("instances")
      .select("id,user_id,phone,automation_paused,automation_paused_until")
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (instanceError) throw instanceError;
    if (!inst) return ok({ ok: true, no_instance: true });
    const userId = inst.user_id as string;
    // Auto-resume if pause timer expired
    if (inst.automation_paused && inst.automation_paused_until && new Date(inst.automation_paused_until).getTime() <= Date.now()) {
      const { error } = await admin.from("instances").update({ automation_paused: false, automation_paused_until: null }).eq("instance_name", instanceName);
      if (error) throw error;
      inst.automation_paused = false;
    }

    if (event === "connectionupdate") {
      const state = body?.data?.state || body?.data?.instance?.state || body?.state;
      const mapped = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
      const updates: any = {
        connection_state: mapped,
        evolution_state: state,
        status: mapped,
        ...(mapped === "connected"
          ? { disconnected_at: null }
          : { disconnected_at: new Date().toISOString(), automation_paused: false, automation_paused_until: null }),
      };
      const wuid = body?.data?.wuid || body?.data?.ownerJid;
      if (wuid) {
        const phoneNum = normalizePhone(wuid);
        updates.phone = phoneNum;
        updates.phone_number = phoneNum;
      }
      if (mapped === "connected") updates.last_connected_at = new Date().toISOString();
      const { error } = await admin.from("instances").update(updates).eq("instance_name", instanceName);
      if (error) throw error;
      if (mapped === "connected") await sendQueuedInboxMessages(instanceName);
    }

    if (event === "instancedelete" || event === "instancedeleted") {
      const { error } = await admin.from("instances").update({
        connection_state: "disconnected",
        evolution_state: "close",
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
        automation_paused: false,
        automation_paused_until: null,
        phone: null,
        phone_number: null,
        qr_code: null,
      }).eq("id", inst.id);
      if (error) throw error;
    }

    if (event === "presenceupdate") {
      const presence = body?.data?.presences?.[0] || body?.data;
      const phoneNumber = normalizePhone(presence?.id || presence?.remoteJid || presence?.jid || "");
      const rawState = String(presence?.lastKnownPresence || presence?.presence || presence?.state || "offline").toLowerCase();
      const state = rawState.includes("record") ? "recording" : rawState.includes("compos") ? "typing" : rawState === "available" || rawState === "online" ? "online" : "offline";
      if (phoneNumber) await admin.from("inbox_contact_presence").upsert({ user_id: userId, phone_number: phoneNumber, state, updated_at: new Date().toISOString() });
    }

    if (event === "messagesupdate" || event === "sendmessageupdate" || event === "messagereaction" || event === "message_reaction") {
      const eventData = body?.data?.data ?? body?.data;
      const updates = Array.isArray(eventData) ? eventData : Array.isArray(eventData?.messages) ? eventData.messages : [eventData];
      for (const update of updates) {
        const externalId = update?.key?.id || update?.id || update?.messageId || update?.message_id;
        const rawStatus = String(update?.update?.status ?? update?.status ?? update?.ack ?? update?.update?.ack ?? update?.messageStatus ?? "");
        const deliveryStatus = resolveDeliveryStatus(rawStatus);
        const instanceNameForUpdate = String(update?.instanceName || update?.instance || instanceName || "");
        const remoteJid = String(update?.key?.remoteJid || update?.remoteJid || update?.jid || "");
        const phoneNumber = normalizePhone(remoteJid);
        const updatedAt = new Date().toISOString();

        if (event === "messagereaction" || event === "message_reaction") {
          const reactionValue = String(update?.reaction || update?.emoji || body?.reaction || "");
          const reactionMessageId = String(update?.messageId || update?.key?.id || update?.id || "");
          if (reactionMessageId && reactionValue) {
            const { data: targetMessage } = await admin
              .from("messages")
              .select("id")
              .eq("user_id", userId)
              .eq("whatsapp_instance_id", instanceNameForUpdate || instanceName)
              .eq("external_id", reactionMessageId)
              .maybeSingle();

            if (targetMessage?.id) {
              await admin.from("message_reactions").upsert({
                user_id: userId,
                whatsapp_instance_id: instanceNameForUpdate || instanceName,
                message_id: targetMessage.id,
                emoji: reactionValue,
                user_phone: phoneNumber || "",
                created_at: updatedAt,
              }, { onConflict: "user_id,whatsapp_instance_id,message_id,user_phone" });
            }
          }
          continue;
        }

        if (!externalId || !deliveryStatus) continue;

        const statusPatch: Record<string, unknown> = { delivery_status: deliveryStatus };
        if (deliveryStatus === "sent") statusPatch.sent_at = updatedAt;
        if (deliveryStatus === "delivered") statusPatch.delivered_at = updatedAt;
        if (deliveryStatus === "read") statusPatch.read_at = updatedAt;
        if (deliveryStatus === "failed") {
          statusPatch.failed_at = updatedAt;
          const errorDetails = update?.update?.error || update?.error || update?.update?.failure;
          if (errorDetails) {
            statusPatch.failure_reason = String(errorDetails?.message || errorDetails?.reason || errorDetails).slice(0, 1000);
            statusPatch.failure_details = errorDetails;
          }
        }
        const query = admin.from("messages").update(statusPatch)
          .eq("user_id", userId)
          .eq("external_id", externalId);

        if (instanceNameForUpdate) query.eq("whatsapp_instance_id", instanceNameForUpdate);
        if (phoneNumber) query.eq("phone_number", phoneNumber);

        await query;
      }
    }

    if (event === "messagesset") {
      const progress = body?.data?.progress ?? body?.progress ?? null;
      const isLatest = body?.data?.isLatest === true || body?.isLatest === true;
      const now = new Date().toISOString();
      await admin.from("instances").update({
        history_sync_status: isLatest ? "completed" : "syncing",
        history_sync_progress: isLatest ? 100 : Math.max(0, Math.min(100, Number(progress || 0))),
        history_sync_started_at: isLatest ? null : now,
        history_sync_completed_at: isLatest ? now : null,
        last_sync_at: isLatest ? now : null,
      }).eq("instance_name", instanceName);
      console.log(JSON.stringify({ event: "MESSAGES_SET", instanceName, progress, isLatest }));
      return ok({ ok: true, historyProgress: progress, isLatest });
    }

    if (event === "messagesupsert" || event === "messagesset" || event === "sendmessage") {
      const messages = body?.data?.messages || (Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : []);
      const arr = Array.isArray(messages) ? messages : [messages];
      for (const m of arr) {
        if (!m) continue;
        const remote = m?.key?.remoteJid || "";
        const isGroup = isGroupJid(remote);
        if (isGroup) continue;
        const phoneNumber = normalizePhone(remote);
        const fromMe = event === "sendmessage" || isEvolutionMessageFromMe(m);
        const incomingStatus = resolveDeliveryStatus(String(m?.status ?? ""));
        const initialStatus = incomingStatus || (fromMe ? "sent" : "received");
        const pushName = fromMe ? null : m?.pushName || m?.verifiedBizName || null;
        const { kind, text } = detectKind(m?.message);
        if (!isGroup && !isIndividualJid(remote)) continue;
        const mediaUrl = await persistMedia(instanceName, m?.key, userId, kind, m?.message);
        const messageDirection = resolveMessageDirection(fromMe);

        const { data: contact, error: contactError } = await admin
          .from("whatsapp_contacts")
          .upsert({
            user_id: userId,
            instance_name: instanceName,
            whatsapp_instance_id: inst.id,
            remote_jid: remote,
            canonical_remote_jid: remote,
            identity_type: "phone",
            identity_status: "resolved",
            is_group: false,
            phone_number: phoneNumber,
            ...(pushName ? { name: pushName } : {}),
            last_message_at: new Date().toISOString(),
          }, { onConflict: "user_id,instance_name,phone_number" })
          .select("id,should_respond")
          .single();
        if (contactError) throw contactError;
        if (!contact?.id) throw new Error("contact_upsert_returned_no_id");

        // Save inbound message immediately (for history regardless of automation)
        const messagePayload = {
          user_id: userId,
          phone_number: phoneNumber,
          message_text: text.substring(0, 4000),
          direction: messageDirection,
          kind,
          media_url: mediaUrl,
          whatsapp_instance_id: instanceName,
          external_id: m?.key?.id || null,
          remote_jid: remote,
          mime_type: m?.message?.audioMessage?.mimetype || m?.message?.imageMessage?.mimetype || m?.message?.videoMessage?.mimetype || m?.message?.documentMessage?.mimetype || null,
          file_name: m?.message?.documentMessage?.fileName || null,
          is_voice_note: kind === "audio" && Boolean(m?.message?.audioMessage?.ptt),
          media_metadata: { remote_jid: remote, message_id: m?.key?.id || null, push_name: pushName },
          from_me: fromMe,
          is_historical: false,
          delivery_status: initialStatus,
          sent_at: initialStatus === "sent" ? new Date().toISOString() : null,
          delivered_at: initialStatus === "delivered" ? new Date().toISOString() : null,
          read_at: initialStatus === "read" ? new Date().toISOString() : null,
          failed_at: initialStatus === "failed" ? new Date().toISOString() : null,
        };
        const scopedKey = getScopedMessageKey({ userId, whatsappInstanceId: instanceName, externalId: m?.key?.id || null, phoneNumber });
        const { data: existingMessage, error: existingMessageError } = await admin.from("messages").select("id").eq("user_id", userId).eq("whatsapp_instance_id", instanceName).eq("external_id", m?.key?.id || "").maybeSingle();
        if (existingMessageError) throw existingMessageError;
        let insertedMessage = false;
        let databaseMessageId = existingMessage?.id || null;
        if (!existingMessage && m?.key?.id) {
          const { data: insertedRow, error: insertError } = await admin.from("messages").insert(messagePayload).select("id").maybeSingle();
          insertedMessage = !insertError && Boolean(insertedRow?.id);
          databaseMessageId = insertedRow?.id || null;
          if (insertError && insertError.code !== "23505") throw insertError;
          if (insertError?.code === "23505") {
            const { data: racedRow } = await admin.from("messages").select("id").eq("user_id", userId).eq("whatsapp_instance_id", instanceName).eq("external_id", m.key.id).maybeSingle();
            databaseMessageId = racedRow?.id || null;
          }
        }
        if (insertedMessage && event !== "messagesset" && m?.key?.id) {
          await saveHistory(userId, phoneNumber, fromMe ? "assistant" : "user", text || `[${kind}]`, {
            kind,
            media_url: mediaUrl,
            message_id: m?.key?.id || null,
            external_id: m?.key?.id || null,
            external_message_id: m?.key?.id || null,
            database_message_id: databaseMessageId,
            remote_jid: remote,
            message_key: { id: m?.key?.id || null, remoteJid: remote, fromMe },
            is_group: false,
            scoped_message_key: scopedKey,
          });
        }

        // Messages sent directly from the connected phone belong to the Inbox,
        // but must never trigger another AI response.
        if (!insertedMessage || fromMe || event !== "messagesupsert") continue;

        if (inst.automation_paused === true) {
          logMessageSkip(instanceName, m?.key?.id || null, "automation_paused");
          continue;
        }

        const { data: blocked, error: blockedError } = await admin
          .from("blocked_contacts")
          .select("id")
          .eq("user_id", userId)
          .eq("phone_number", phoneNumber)
          .eq("is_active", true)
          .maybeSingle();
        if (blockedError) throw blockedError;
        if (blocked) {
          logMessageSkip(instanceName, m?.key?.id || null, "contact_blocked");
          continue;
        }

        if (contact?.should_respond === false) {
          logMessageSkip(instanceName, m?.key?.id || null, "contact_response_disabled");
          continue;
        }
        const { data: conversation, error: conversationError } = await admin
          .from("inbox_conversations")
          .select("status,response_mode")
          .eq("user_id", userId)
          .eq("instance_name", instanceName)
          .eq("contact_id", contact.id)
          .maybeSingle();
        if (conversationError) throw conversationError;
        if (conversation?.response_mode === "human") {
          logMessageSkip(instanceName, m?.key?.id || null, "human_takeover");
          continue;
        }

        // Check credits before dispatching to n8n
        const { data: profile, error: profileError } = await admin
          .from("profiles")
          .select("messages_received, message_limit, business_name, business_description, ai_name, ai_rules, business_hours, accepts_appointments, appointment_duration_minutes")
          .eq("user_id", userId)
          .maybeSingle();
        if (profileError) throw profileError;
        const limit = Number(profile?.message_limit || 0);
        const used = Number(profile?.messages_received || 0);
        if (limit - used <= 0) {
          logMessageSkip(instanceName, m?.key?.id || null, "credits_exhausted");
          await admin.from("instances").update({ automation_paused: true }).eq("instance_name", instanceName);
          await admin.from("notifications").insert({
            user_id: userId,
            title: "Mensagens esgotadas",
            message: "A automação foi pausada. Recarregue para reativar.",
            type: "credits_empty",
            link: "/recargas",
          });
          continue;
        }

        // Build n8n payload
        const systemPrompt = [
          profile?.business_name ? `Empresa: ${profile.business_name}` : "",
          profile?.business_description ? `Sobre: ${profile.business_description}` : "",
          profile?.ai_name ? `Você é ${profile.ai_name}, atendente virtual.` : "",
          profile?.ai_rules ? `Regras:\n${profile.ai_rules}` : "",
          "Provas sociais: consulte match_social_proofs com o contexto e o produto exato identificados na conversa. Nunca apresente um testemunho de produto como avaliação de outro produto, nem um testemunho de produto como avaliação de um serviço. Use apenas resultados ativos e relevantes; testemunhos de serviço são evidências gerais da empresa ou dos serviços prestados.",
        ].filter(Boolean).join("\n\n");

        const payload = {
          metadata: {
            instance_name: instanceName,
            remote_jid: remote,
            customer_name: pushName,
            customer_phone: phoneNumber,
            message_type: kind,
            message_id: m?.key?.id,
            database_message_id: databaseMessageId,
            external_message_id: m?.key?.id,
            whatsapp_message_id: m?.key?.id,
            message_key: {
              id: m?.key?.id,
              remoteJid: remote,
              fromMe,
            },
            user_id: userId,
            callback_url: `${SUPABASE_URL}/functions/v1/n8n-callback`,
            callback_secret: Deno.env.get("N8N_CALLBACK_SECRET") || "",
            social_proof_retrieval: {
              rpc: "match_social_proofs",
              user_id: userId,
              argument_contract: {
                _user_id: "metadata.user_id",
                _query: "customer_message_and_relevant_conversation_context",
                _context: { allowed_values: ["product", "service", "company"] },
                _product_id: "exact_catalog_product_id_or_null",
                _limit: 5,
              },
              product_lookup: "Resolve an explicitly mentioned catalog product to its exact ID; do not infer a different product.",
              filters: ["user_id", "is_active", "proof_type", "exact_product_id_when_context_is_product"],
              result_fields: ["proof_type", "product_id", "title", "description", "media_url", "relevance"],
              rules: [
                "For a product conversation, retrieve exact-product proofs first; service proofs may be used only as general company/service evidence.",
                "Never use a product proof for a different product or describe it as an evaluation of another product.",
                "For a service conversation, retrieve only relevant service proofs.",
                "For general company trust, use relevant service proofs; do not present product proofs as service or company testimonials.",
                "Do not invent or imply customer experiences beyond the retrieved testimony.",
              ],
            },
          },
          message_data: {
            content: text,
            media_url: mediaUrl,
            media_base64: null,
            media_kind: kind,
            media_mimetype: messagePayload.mime_type,
          },
          business_logic: {
            system_prompt: systemPrompt,
            messages_remaining: limit - used,
            business_hours: profile?.business_hours || null,
            accepts_appointments: profile?.accepts_appointments ?? true,
            appointment_duration_minutes: profile?.appointment_duration_minutes ?? 30,
          },
        };

        // Persist first; dispatch in the background so Evolution is not blocked by n8n.
        const { data: queued, error: queueError } = await admin
          .from("message_queue")
          .insert({
            user_id: userId,
            instance_name: instanceName,
            remote_jid: remote,
            payload,
            status: "pending",
          })
          .select("id")
          .single();
        if (queueError || !queued?.id) {
          console.error(JSON.stringify({ event: "customer_message_queue_failed", instanceName, databaseMessageId, error: queueError?.message || "queue_id_missing" }));
          continue;
        }

        const queuedPayload = {
          ...payload,
          metadata: { ...payload.metadata, queue_id: queued.id },
        };
        EdgeRuntime.waitUntil((async () => {
          await admin.from("message_queue").update({ status: "processing", payload: queuedPayload }).eq("id", queued.id);
          if (["image", "audio", "video", "document"].includes(kind)) {
            const mediaBase64 = await fetchMediaBase64(instanceName, m?.key, kind, m?.message);
            if (mediaBase64) {
              queuedPayload.message_data.media_base64 = mediaBase64;
              await admin.from("message_queue").update({ payload: queuedPayload }).eq("id", queued.id);
            }
          }
          const sent = await dispatchToN8n(queuedPayload);
          console.log(JSON.stringify({ event: "customer_message_dispatch", instanceName, databaseMessageId, externalMessageId: m?.key?.id || null, queueId: queued.id, kind, delivered: sent }));
          if (!sent) {
            await admin.from("message_queue").update({ status: "pending", last_error: "dispatch_failed" }).eq("id", queued.id);
          }
        })());
      }
    }

    return ok({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({
      event: "webhook_processing_failed",
      error: error instanceof Error ? error.message.slice(0, 1000) : "unknown_error",
    }));
    return new Response(JSON.stringify({ error: "webhook_processing_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
