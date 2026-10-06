import { createClient } from "npm:@supabase/supabase-js@2";
import { getScopedMessageKey, resolveDeliveryStatus, resolveMessageDirection } from "../../../src/lib/message-identity.ts";

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

async function fetchAudioBase64(instance: string, messageKey: any): Promise<string | null> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY || !messageKey) return null;
  try {
    const r = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
      body: JSON.stringify({ message: { key: messageKey } }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.base64 || null;
  } catch {
    return null;
  }
}

async function persistMedia(instance: string, messageKey: any, userId: string, kind: string) {
  if (!EVOLUTION_URL || !EVOLUTION_KEY || !messageKey || !["image", "audio", "video", "document"].includes(kind)) return null;
  try {
    const response = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
      body: JSON.stringify({ message: { key: messageKey }, convertToMp4: kind === "video" }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const base64 = String(payload?.base64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!base64) return null;
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const extension = kind === "image" ? "jpg" : kind === "audio" ? "ogg" : kind === "video" ? "mp4" : "bin";
    const path = `${userId}/inbox/${messageKey.id}-${Date.now()}.${extension}`;
    const contentType = kind === "image" ? "image/jpeg" : kind === "audio" ? "audio/ogg" : kind === "video" ? "video/mp4" : "application/octet-stream";
    const upload = await admin.storage.from("store-assets").upload(path, bytes, { contentType, upsert: true });
    if (upload.error) return null;
    return admin.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

async function saveHistory(userId: string, phoneNumber: string, role: "user" | "assistant", content: string, metadata: Record<string, unknown> = {}) {
  if (!content) return;
  await admin.from("n8n_chat_histories").insert({
    user_id: userId,
    phone_number: phoneNumber,
    session_id: `${userId}_${phoneNumber}`,
    message: { type: role, data: { content, ...metadata } },
  });
}

async function dispatchToN8n(payload: any) {
  if (!N8N_URL) {
    console.warn("N8N_WEBHOOK_URL not configured");
    return false;
  }
  try {
    const res = await fetch(N8N_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (e) {
    console.error("n8n dispatch error", e);
    return false;
  }
}

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
        const externalId = result?.key?.id || result?.data?.key?.id || null;
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
    const body = await req.json().catch(() => ({}));
    const event = (body?.event || "").toString().toLowerCase().replace(/[._-]/g, "");
    const instanceName = body?.instance || body?.instanceName || body?.data?.instanceName;
    if (!instanceName) return ok({ ok: true, ignored: true });

    const { data: inst } = await admin
      .from("instances")
      .select("user_id, phone, automation_paused, automation_paused_until")
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (!inst) return ok({ ok: true, no_instance: true });
    const userId = inst.user_id as string;
    // Auto-resume if pause timer expired
    if (inst.automation_paused && inst.automation_paused_until && new Date(inst.automation_paused_until).getTime() <= Date.now()) {
      await admin.from("instances").update({ automation_paused: false, automation_paused_until: null }).eq("instance_name", instanceName);
      inst.automation_paused = false;
    }

    if (event === "connectionupdate") {
      const state = body?.data?.state || body?.state;
      const mapped = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
      const updates: any = { connection_state: mapped, evolution_state: state, status: mapped };
      const wuid = body?.data?.wuid || body?.data?.ownerJid;
      if (wuid) {
        const phoneNum = normalizePhone(wuid);
        updates.phone = phoneNum;
        updates.phone_number = phoneNum;
      }
      if (mapped === "connected") updates.last_connected_at = new Date().toISOString();
      await admin.from("instances").update(updates).eq("instance_name", instanceName);
      if (mapped === "connected") await sendQueuedInboxMessages(instanceName);
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
        const fromMe = m?.key?.fromMe === true || m?.fromMe === true;
        const incomingStatus = resolveDeliveryStatus(String(m?.status ?? ""));
        const initialStatus = incomingStatus || (fromMe ? "sent" : "received");
        const pushName = fromMe ? null : m?.pushName || m?.verifiedBizName || null;
        const { kind, text } = detectKind(m?.message);
        if (!isGroup && !isIndividualJid(remote)) continue;
        const mediaUrl = await persistMedia(instanceName, m?.key, userId, kind);
        const messageDirection = resolveMessageDirection(fromMe);

        const { data: existingContact } = await admin
          .from("whatsapp_contacts")
          .select("id,name")
          .eq("user_id", userId)
          .eq("instance_name", instanceName)
          .eq("phone_number", phoneNumber)
          .maybeSingle();
        if (existingContact) {
          await admin.from("whatsapp_contacts").update({
            ...(pushName ? { name: pushName } : {}),
            last_message_at: new Date().toISOString(),
          }).eq("id", existingContact.id);
        } else {
          await admin.from("whatsapp_contacts").insert({
            user_id: userId,
            instance_name: instanceName,
            remote_jid: remote,
            is_group: false,
            phone_number: phoneNumber,
            name: pushName,
            last_message_at: new Date().toISOString(),
          });
        }

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
        const { data: existingMessage } = await admin.from("messages").select("id").eq("user_id", userId).eq("whatsapp_instance_id", instanceName).eq("external_id", m?.key?.id || "").maybeSingle();
        let insertedMessage = false;
        if (!existingMessage && m?.key?.id) {
          const { error: insertError } = await admin.from("messages").insert(messagePayload);
          insertedMessage = !insertError;
          if (insertError && insertError.code !== "23505") throw insertError;
        }
        if (insertedMessage && event !== "messagesset" && m?.key?.id) {
          await saveHistory(userId, phoneNumber, fromMe ? "assistant" : "user", text || `[${kind}]`, { kind, media_url: mediaUrl, external_id: m?.key?.id || null, is_group: false, scoped_message_key: scopedKey });
        }

        // Messages sent directly from the connected phone belong to the Inbox,
        // but must never trigger another AI response.
        if (!insertedMessage || fromMe || event !== "messagesupsert") continue;

        if (inst.automation_paused === true) continue;

        const { data: blocked } = await admin
          .from("blocked_contacts")
          .select("id")
          .eq("user_id", userId)
          .eq("phone_number", phoneNumber)
          .eq("is_active", true)
          .maybeSingle();
        if (blocked) continue;

        const { data: contact } = await admin
          .from("whatsapp_contacts")
          .select("id,should_respond")
          .eq("user_id", userId)
          .eq("phone_number", phoneNumber)
          .maybeSingle();
        if (contact?.should_respond === false) continue;
        const { data: conversation } = await admin
          .from("inbox_conversations")
          .select("status,response_mode")
          .eq("user_id", userId)
          .eq("contact_id", contact?.id || "")
          .maybeSingle();
        if (conversation?.response_mode === "human" || conversation?.status === "human") continue;

        // Check credits before dispatching to n8n
        const { data: profile } = await admin
          .from("profiles")
          .select("messages_received, message_limit, business_name, business_description, ai_name, ai_rules")
          .eq("user_id", userId)
          .maybeSingle();
        const limit = Number(profile?.message_limit || 0);
        const used = Number(profile?.messages_received || 0);
        if (limit - used <= 0) {
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
        const audioBase64 = kind === "audio" ? await fetchAudioBase64(instanceName, m?.key) : null;

        const systemPrompt = [
          profile?.business_name ? `Empresa: ${profile.business_name}` : "",
          profile?.business_description ? `Sobre: ${profile.business_description}` : "",
          profile?.ai_name ? `Você é ${profile.ai_name}, atendente virtual.` : "",
          profile?.ai_rules ? `Regras:\n${profile.ai_rules}` : "",
        ].filter(Boolean).join("\n\n");

        const payload = {
          metadata: {
            instance_name: instanceName,
            remote_jid: remote,
            customer_name: pushName,
            customer_phone: phoneNumber,
            message_type: kind,
            message_id: m?.key?.id,
            user_id: userId,
            callback_url: `${SUPABASE_URL}/functions/v1/n8n-callback`,
            callback_secret: Deno.env.get("N8N_CALLBACK_SECRET") || "",
          },
          message_data: {
            content: text,
            media_url: mediaUrl,
            media_base64: audioBase64,
          },
          business_logic: {
            system_prompt: systemPrompt,
            messages_remaining: limit - used,
          },
        };

        // Enqueue (for safety) and fire-and-forget to n8n
        const { data: queued } = await admin
          .from("message_queue")
          .insert({
            user_id: userId,
            instance_name: instanceName,
            remote_jid: remote,
            payload,
            status: "processing",
          })
          .select("id")
          .single();

        const sent = await dispatchToN8n({ ...payload, metadata: { ...payload.metadata, queue_id: queued?.id } });
        if (!sent && queued?.id) {
          await admin.from("message_queue").update({ status: "pending", last_error: "dispatch_failed" }).eq("id", queued.id);
        }
      }
    }

    return ok({ ok: true });
  } catch (e: any) {
    console.error("webhook error", e);
    return ok({ error: e?.message || "internal" });
  }
});
