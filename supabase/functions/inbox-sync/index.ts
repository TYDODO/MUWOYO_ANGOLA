import { createClient } from "npm:@supabase/supabase-js@2";
import { isEvolutionMessageFromMe, resolveDeliveryStatus, resolveMessageDirection } from "../../../src/lib/message-identity.ts";
import { syncWhatsAppLabels } from "../_shared/whatsapp-labels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const EVOLUTION_URL = (Deno.env.get("EVOLUTION_API_URL") || "https://api.muwoyo.com").replace(/\/+$/, "");
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") || EVOLUTION_KEY;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/webhook?token=${encodeURIComponent(WEBHOOK_SECRET)}`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const MAX_PROFILE_PICTURE_REFRESHES_PER_SYNC = 20;
const MAX_CHAT_HISTORIES_PER_SYNC = 25;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalizePhone = (value = "") => value.split("@")[0]?.replace(/\D/g, "") || "";
const isValidIndividualPhone = (value = "") => /^[1-9][0-9]{7,14}$/.test(value) && !value.includes("-");
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const asString = (value: unknown) => typeof value === "string" ? value : "";
const remoteJid = (value: unknown) => {
  const item = asRecord(value);
  const key = asRecord(item?.key);
  const candidates = [item?.remoteJid, item?.jid, key?.remoteJid, item?.id];
  return candidates.find((candidate): candidate is string => typeof candidate === "string") || "";
};
const valueArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  for (const key of ["chats", "contacts", "messages", "records", "items", "data"]) {
    const result = valueArray(record[key]);
    if (result.length) return result;
  }
  return [];
};

const fetchProfilePicture = async (instance: string, phone: string) => {
  try {
    const response = await evolution(`/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, { number: phone });
    return response.data?.profilePictureUrl || response.data?.profilePicUrl || null;
  } catch {
    return null;
  }
};

const evolution = async (path: string, body: Record<string, unknown>) => {
  try {
    const response = await fetch(`${EVOLUTION_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { error: error instanceof Error ? error.message : "evolution_unavailable" } };
  }
};

const persistHistoricalMedia = async (instance: string, key: any, userId: string, kind: string) => {
  if (!key || !["image", "audio", "video", "document", "sticker"].includes(kind)) return null;
  try {
    const response = await evolution(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, { message: { key }, convertToMp4: kind === "video" });
    const base64 = String(response.data?.base64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!response.ok || !base64) return null;
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const extension = kind === "audio" ? "ogg" : kind === "video" ? "mp4" : kind === "sticker" ? "webp" : "jpg";
    const contentType = kind === "audio" ? "audio/ogg" : kind === "video" ? "video/mp4" : kind === "sticker" ? "image/webp" : "image/jpeg";
    const path = `${userId}/inbox/history/${key.id}.${extension}`;
    const upload = await admin.storage.from("store-assets").upload(path, bytes, { contentType, upsert: true });
    return upload.error ? null : { url: admin.storage.from("store-assets").getPublicUrl(path).data.publicUrl, path };
  } catch { return null; }
};

const detectMessage = (message: any) => {
  const content = message?.message || message;
  const text = content?.conversation || content?.extendedTextMessage?.text || content?.imageMessage?.caption || content?.videoMessage?.caption || "";
  if (content?.audioMessage) return { kind: "audio", text };
  if (content?.imageMessage) return { kind: "image", text };
  if (content?.videoMessage) return { kind: "video", text };
  if (content?.documentMessage) return { kind: "document", text };
  if (content?.stickerMessage) return { kind: "sticker", text: "" };
  return { kind: "text", text };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!EVOLUTION_KEY || !ANON_KEY) return json({ error: "inbox_sync_not_configured" }, 503);
    const authorization = req.headers.get("Authorization");
    const requestBody = await req.clone().json().catch(() => ({}));
    const internal = req.headers.get("x-internal-sync") === SERVICE_KEY && authorization === `Bearer ${SERVICE_KEY}`;
    if (!internal && !authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization || "" } } });
    const { data: auth, error: authError } = internal ? { data: { user: { id: String(requestBody?.userId || "") } }, error: null } : await userClient.auth.getUser();
    if (authError || !auth.user?.id) return json({ error: "Unauthorized" }, 401);

    const actorUserId = auth.user.id;
    const { data: member, error: memberError } = await admin.from("business_members").select("business_id,role,status").eq("user_id", actorUserId).maybeSingle();
    if (memberError) {
      console.error("inbox_sync_membership_lookup_failed", memberError.message);
      return json({ error: "membership_lookup_failed" }, 500);
    }
    if (member && member.status !== "active") return json({ error: "member_inactive" }, 403);
    const { data: owner, error: ownerError } = member?.role === "attendant"
      ? await admin.from("business_members").select("user_id").eq("business_id", member.business_id).eq("role", "owner").eq("status", "active").maybeSingle()
      : { data: null };
    if (ownerError || (member?.role === "attendant" && !owner?.user_id)) {
      console.error("inbox_sync_owner_lookup_failed", ownerError?.message || "owner_missing");
      return json({ error: "business_owner_not_found" }, 404);
    }
    const userId = owner?.user_id || actorUserId;
    const requestedInstance = String(requestBody?.instanceName || "");
    const chatOffset = Math.max(0, Number.isInteger(Number(requestBody?.chatOffset)) ? Number(requestBody.chatOffset) : 0);
    let instanceQuery = admin.from("instances").select("instance_name").eq("user_id", userId);
    if (requestedInstance) instanceQuery = instanceQuery.eq("instance_name", requestedInstance);
    const { data: instance, error: instanceError } = await instanceQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (instanceError) {
      console.error("inbox_sync_instance_lookup_failed", instanceError.message);
      return json({ error: "instance_lookup_failed" }, 500);
    }
    const instanceName = instance?.instance_name as string | undefined;
    if (!instanceName) return json({ error: requestedInstance ? "whatsapp_instance_not_found" : "whatsapp_instance_not_connected" }, 409);

    const webhook = await evolution(`/webhook/set/${encodeURIComponent(instanceName)}`, {
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
    });
    if (!webhook.ok) console.error("inbox_sync_webhook_registration_failed", JSON.stringify({ instanceName, status: webhook.status ?? 0 }));

    const [chatsResponse, contactsResponse] = await Promise.all([
      evolution(`/chat/findChats/${encodeURIComponent(instanceName)}`, { where: {} }),
      evolution(`/chat/findContacts/${encodeURIComponent(instanceName)}`, { where: {} }),
    ]);
    if (chatsResponse.ok) {
      try {
        await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "connection.update", instance: instanceName, data: { state: "open" } }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (error) {
        console.warn("Could not trigger pending Inbox delivery retry", String(error));
      }
    }
    if (!chatsResponse.ok && !contactsResponse.ok) {
      console.warn("Evolution is unavailable; returning cached inbox state", instanceName);
      return json({ ok: true, partial: true, cached: true, webhookConfigured: webhook.ok, conversations: 0, messages: 0 });
    }

    const { data: knownMessages, error: knownMessagesError } = await admin
      .from("messages")
      .select("phone_number,created_at")
      .eq("user_id", userId)
      .eq("whatsapp_instance_id", instanceName)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (knownMessagesError) throw knownMessagesError;
    const latestMessageByPhone = new Map<string, number>();
    for (const message of knownMessages || []) {
      if (!latestMessageByPhone.has(message.phone_number)) {
        latestMessageByPhone.set(message.phone_number, new Date(message.created_at).getTime());
      }
    }

    const contactsByPhone = new Map<string, Record<string, unknown>>();
    for (const rawItem of valueArray(contactsResponse.data)) {
      const item = asRecord(rawItem);
      if (!item) continue;
      const phone = normalizePhone(remoteJid(item));
      if (phone) contactsByPhone.set(phone, item);
    }

    let conversations = 0;
    let messages = 0;
    let profilePictureRefreshes = 0;
    let historiesSynced = 0;
    let historyPending = 0;
    const allChats = valueArray(chatsResponse.data);
    const chatsPage = allChats.slice(chatOffset, chatOffset + MAX_CHAT_HISTORIES_PER_SYNC);
    for (const rawChat of chatsPage) {
      const chat = asRecord(rawChat);
      if (!chat) continue;
      const jid = remoteJid(chat);
      const isGroup = jid.endsWith("@g.us");
      if (isGroup || jid.includes("@broadcast")) continue;
      const phone = normalizePhone(jid);
      if (!phone || !jid.endsWith("@s.whatsapp.net") || !isValidIndividualPhone(phone)) continue;
      const profile = contactsByPhone.get(phone);
      const incomingName = [profile?.pushName, profile?.name, profile?.notify, profile?.verifiedBizName]
        .find((value): value is string => typeof value === "string" && value.trim().length > 0) || null;
      const conversationTimestamp = Number(chat.conversationTimestamp);
      const lastMessageAt = chat.conversationTimestamp && Number.isFinite(conversationTimestamp)
        ? new Date(conversationTimestamp * 1000).toISOString()
        : asString(chat.updatedAt) || new Date().toISOString();
      const { data: existingContact, error: existingContactError } = await admin
        .from("whatsapp_contacts")
        .select("id,name,profile_picture_url,profile_picture_updated_at")
        .eq("user_id", userId)
        .eq("instance_name", instanceName)
        .eq("phone_number", phone)
        .maybeSingle();
      if (existingContactError) throw existingContactError;
      const providerPictureUrl = asString(chat.profilePictureUrl)
        || asString(chat.profilePicUrl)
        || asString(profile?.profilePictureUrl)
        || asString(profile?.profilePicUrl)
        || null;
      const profilePictureExpired = !existingContact?.profile_picture_updated_at
        || Date.now() - new Date(existingContact.profile_picture_updated_at).getTime() > 7 * 24 * 60 * 60 * 1000;
      const canRefreshPicture = profilePictureExpired && profilePictureRefreshes < MAX_PROFILE_PICTURE_REFRESHES_PER_SYNC;
      if (canRefreshPicture) profilePictureRefreshes += 1;
      const refreshedPictureUrl = providerPictureUrl || (canRefreshPicture ? await fetchProfilePicture(instanceName, phone) : null);
      const profilePictureUrl = refreshedPictureUrl || existingContact?.profile_picture_url || null;
      const profilePictureUpdatedAt = providerPictureUrl || profilePictureExpired
        ? new Date().toISOString()
        : existingContact?.profile_picture_updated_at || null;
      const name = incomingName || existingContact?.name || null;
      const { data: contact, error: contactError } = await admin.from("whatsapp_contacts").upsert({ user_id: userId, instance_name: instanceName, remote_jid: jid, is_group: isGroup, phone_number: phone, name, profile_picture_url: profilePictureUrl, profile_picture_updated_at: profilePictureUpdatedAt, last_message_at: lastMessageAt }, { onConflict: "user_id,instance_name,phone_number" }).select("id").single();
      if (contactError) throw contactError;
      if (!contact?.id) throw new Error("contact_upsert_returned_no_id");
      await syncWhatsAppLabels(admin, userId, contact.id, profile?.labels);
      const { error: conversationError } = await admin.from("inbox_conversations").upsert({ user_id: userId, instance_name: instanceName, contact_id: contact.id, last_message_at: lastMessageAt }, { onConflict: "user_id,instance_name,contact_id", ignoreDuplicates: false });
      if (conversationError) throw conversationError;
      conversations += 1;

      const latestStoredAt = latestMessageByPhone.get(phone) || 0;
      const remoteLatestAt = new Date(lastMessageAt).getTime();
      if (latestStoredAt && remoteLatestAt <= latestStoredAt + 1000) continue;
      historiesSynced += 1;

      const history = await evolution(`/chat/findMessages/${encodeURIComponent(instanceName)}`, { where: { key: { remoteJid: jid } }, page: 1, offset: 100 });
      if (!history.ok) {
        historyPending += 1;
        console.error("inbox_sync_history_fetch_failed", JSON.stringify({ instanceName, phone, status: history.status ?? 0 }));
        continue;
      }
      const messageRows: Record<string, unknown>[] = [];
      const historyRows: Record<string, unknown>[] = [];
      for (const rawItem of valueArray(history.data)) {
        const item = asRecord(rawItem);
        if (!item) continue;
        const messageKey = asRecord(item.key);
        const messageId = asString(messageKey?.id) || asString(item.id);
        if (!messageId) continue;
        const messageTimestamp = Number(item.messageTimestamp);
        const timestamp = item.messageTimestamp && Number.isFinite(messageTimestamp)
          ? new Date(messageTimestamp * 1000).toISOString()
          : new Date().toISOString();
        if (new Date(timestamp).getTime() <= latestStoredAt) continue;
        const detected = detectMessage(item);
        const storedMedia = await persistHistoricalMedia(instanceName, messageKey, userId, detected.kind);
        const fromMe = isEvolutionMessageFromMe(item);
        const direction = resolveMessageDirection(fromMe);
        const deliveryStatus = resolveDeliveryStatus(String(item.status ?? (fromMe ? "sent" : "delivered"))) ?? (fromMe ? "sent" : "delivered");
        messageRows.push({
          user_id: userId,
          phone_number: phone,
          direction,
          kind: detected.kind,
          message_text: detected.text || null,
          media_url: storedMedia?.url || null,
          storage_path: storedMedia?.path || null,
          external_id: messageId,
          whatsapp_instance_id: instanceName,
          delivery_status: deliveryStatus,
          created_at: timestamp,
          from_me: fromMe,
          is_historical: true,
          sent_at: fromMe ? timestamp : null,
          delivered_at: fromMe ? null : timestamp,
          read_at: deliveryStatus === "read" ? timestamp : null,
          media_metadata: { external_id: messageId, is_group: isGroup },
        });
        historyRows.push({ user_id: userId, phone_number: phone, session_id: `${userId}_${phone}`, message: { type: fromMe ? "human" : "user", data: {
          content: detected.text || "",
          kind: detected.kind,
          message_id: messageId,
          external_id: messageId,
          external_message_id: messageId,
          remote_jid: jid,
          message_key: { id: messageId, remoteJid: jid, fromMe },
        } }, created_at: timestamp });
      }
      if (messageRows.length) {
        const { error: upsertError } = await admin.from("messages").upsert(messageRows, { onConflict: "user_id,whatsapp_instance_id,external_id" });
        if (upsertError) throw upsertError;
        const { error: historyInsertError } = await admin.from("n8n_chat_histories").insert(historyRows);
        if (historyInsertError) throw historyInsertError;
        messages += messageRows.length;
        const newest = Math.max(...messageRows.map((row) => new Date(String(row.created_at)).getTime()));
        latestMessageByPhone.set(phone, newest);
      }
    }
    const nextChatOffset = chatOffset + chatsPage.length;
    const hasMoreChats = nextChatOffset < allChats.length;
    return json({
      ok: true,
      partial: !webhook.ok || !chatsResponse.ok || !contactsResponse.ok || historyPending > 0 || hasMoreChats,
      webhookConfigured: webhook.ok,
      historyPending,
      conversations,
      messages,
      hasMoreChats,
      nextChatOffset: hasMoreChats ? nextChatOffset : null,
      totalChats: allChats.length,
    });
  } catch (error) {
    console.error("inbox-sync error", error);
    return json({ error: error instanceof Error ? error.message : "internal" }, 500);
  }
});
