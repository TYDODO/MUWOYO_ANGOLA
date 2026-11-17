import { createClient } from "npm:@supabase/supabase-js@2";
import { synthesizeFishSpeech, toBase64 } from "../_shared/fish-audio.ts";
import { getMp3DurationSeconds } from "../../../src/lib/mp3-duration.ts";
import { parseVoiceTuning } from "../../../src/lib/voice-tuning.ts";
import { extractEvolutionMessageId } from "../../../src/lib/message-identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_URL = (Deno.env.get("EVOLUTION_API_URL") || "https://api.muwoyo.com").replace(/\/+$/, "");
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const INTERNAL_SECRET = Deno.env.get("N8N_CALLBACK_SECRET") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!INTERNAL_SECRET) return json({ error: "voice_delivery_not_configured" }, 503);
  let audioDelivered = false;
  try {
    const body = await req.json();
    if (body.secret !== INTERNAL_SECRET) return json({ error: "unauthorized" }, 401);
    const userId = String(body.user_id || "");
    const instanceName = String(body.instance_name || "");
    const remoteJid = String(body.remote_jid || "");
    const modelId = String(body.voice_model_id || "");
    const text = String(body.text || "").trim();
    const queueId = typeof body.queue_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.queue_id)
      ? body.queue_id
      : null;
    const phoneNumber = remoteJid.split("@")[0].replace(/\D/g, "");
    if (!userId || !instanceName || !modelId || !text || text.length > 4000
        || !remoteJid.endsWith("@s.whatsapp.net") || !/^[1-9][0-9]{7,14}$/.test(phoneNumber)) {
      return json({ error: "invalid_input", text_fallback: true }, 400);
    }
    const { data: instance, error: instanceError } = await admin.from("instances")
      .select("id").eq("user_id", userId).eq("instance_name", instanceName).maybeSingle();
    if (instanceError) throw new Error("instance_lookup_failed");
    if (!instance) return json({ error: "instance_not_found", text_fallback: true }, 404);
    const { data: balance, error: balanceError } = await admin.rpc("get_audio_balance", { p_user_id: userId });
    if (balanceError) throw new Error("audio_balance_lookup_failed");
    if (!balance?.eligible || (balance.total_seconds_available !== null && Number(balance.total_seconds_available) <= 0)) {
      return json({ ok: false, text_fallback: true, reason: "audio_balance_unavailable", balance });
    }
    const { data: voiceSettings, error: settingsError } = await admin.from("audio_voice_settings")
      .select("active_voice_reference_id,voice_source,voice_tuning")
      .eq("user_id", userId).maybeSingle();
    if (settingsError) throw new Error("voice_settings_lookup_failed");
    if (voiceSettings?.active_voice_reference_id !== modelId || !voiceSettings.voice_source) {
      return json({ ok: false, text_fallback: true, reason: "voice_not_selected" });
    }
    let activeVoice: { model_id: string } | null = null;
    let voiceError: { message: string } | null = null;
    if (voiceSettings.voice_source === "cloned") {
      const result = await admin.from("audio_voice_models")
        .select("model_id").eq("user_id", userId).eq("model_id", modelId).eq("is_active", true).maybeSingle();
      activeVoice = result.data;
      voiceError = result.error;
    }
    if (voiceError) throw new Error("voice_lookup_failed");
    if (voiceSettings.voice_source === "cloned" && !activeVoice) {
      return json({ ok: false, text_fallback: true, reason: "voice_not_active" });
    }

    const audio = await synthesizeFishSpeech(text, modelId, parseVoiceTuning(voiceSettings.voice_tuning));
    const duration = getMp3DurationSeconds(audio);
    const { data: reservation, error: reservationError } = await admin.rpc("reserve_audio_seconds", {
      p_user_id: userId,
      p_seconds: duration,
      p_voice_model_id: modelId,
    });
    if (reservationError) throw new Error("audio_reservation_failed");
    if (!reservation?.ok) return json({ ok: false, text_fallback: true, reason: reservation?.reason || "audio_balance_unavailable" });

    if (!EVOLUTION_KEY) {
      await admin.rpc("finalize_audio_reservation", { p_reservation_id: reservation.reservation_id, p_sent: false });
      return json({ error: "evolution_api_not_configured", text_fallback: true }, 503);
    }
    let sent: Response;
    try {
      sent = await fetch(`${EVOLUTION_URL}/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
        body: JSON.stringify({ number: phoneNumber, audio: toBase64(audio), ptt: true, mimetype: "audio/mpeg" }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      await admin.rpc("finalize_audio_reservation", { p_reservation_id: reservation.reservation_id, p_sent: false });
      console.error("Evolution audio request failed", error instanceof Error ? error.message : "network_error");
      return json({ error: "evolution_send_failed", text_fallback: true }, 502);
    }
    const responseBody = await sent.text();
    if (!sent.ok) {
      await admin.rpc("finalize_audio_reservation", { p_reservation_id: reservation.reservation_id, p_sent: false });
      console.error(JSON.stringify({ event: "evolution_voice_send_failed", instanceName, status: sent.status }));
      return json({ error: "evolution_send_failed", status: sent.status, text_fallback: true }, 502);
    }
    audioDelivered = true;
    const { error: finalizeError } = await admin.rpc("finalize_audio_reservation", {
      p_reservation_id: reservation.reservation_id,
      p_sent: true,
    });
    if (finalizeError) console.error("Audio reservation finalization failed", finalizeError.message);

    const sendResult = (() => {
      try { return JSON.parse(responseBody); } catch { return {}; }
    })();
    const externalId = extractEvolutionMessageId(sendResult);
    const storagePath = `${userId}/inbox/ai-audio/${crypto.randomUUID()}.mp3`;
    const audioUpload = await admin.storage.from("store-assets").upload(storagePath, audio, {
      contentType: "audio/mpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    const mediaUrl = audioUpload.error
      ? null
      : admin.storage.from("store-assets").getPublicUrl(storagePath).data.publicUrl;
    if (audioUpload.error) console.error("Sent audio archive upload failed", audioUpload.error.message);

    const sentAt = new Date().toISOString();
    const { data: existingContact, error: existingContactError } = await admin.from("whatsapp_contacts")
      .select("id")
      .eq("user_id", userId)
      .eq("instance_name", instanceName)
      .eq("phone_number", phoneNumber)
      .maybeSingle();
    let contact = existingContact;
    let contactWasCreated = false;
    if (existingContactError) {
      console.error("Sent audio contact lookup failed", existingContactError.message);
    } else if (!existingContact) {
      const { data: insertedContact, error: contactInsertError } = await admin.from("whatsapp_contacts").insert({
        user_id: userId,
        instance_name: instanceName,
        remote_jid: remoteJid,
        phone_number: phoneNumber,
        is_group: false,
      }).select("id").maybeSingle();
      if (contactInsertError?.code === "23505") {
        const { data: racedContact, error: racedLookupError } = await admin.from("whatsapp_contacts")
          .select("id")
          .eq("user_id", userId)
          .eq("instance_name", instanceName)
          .eq("phone_number", phoneNumber)
          .maybeSingle();
        contact = racedContact;
        if (racedLookupError) console.error("Sent audio contact retry lookup failed", racedLookupError.message);
      } else {
        contact = insertedContact;
        contactWasCreated = Boolean(insertedContact?.id);
        if (contactInsertError) console.error("Sent audio contact creation failed", contactInsertError.message);
      }
    }

    if (contact?.id) {
      const { error: conversationError } = await admin.from("inbox_conversations").upsert({
        user_id: userId,
        instance_name: instanceName,
        contact_id: contact.id,
        last_message_at: sentAt,
        last_message_preview: text.slice(0, 180),
        last_message_direction: "outbound",
        last_message_kind: "audio",
        ...(contactWasCreated ? { unread_count: 0 } : {}),
      }, { onConflict: "user_id,instance_name,contact_id" });
      if (conversationError) console.error("Sent audio conversation sync failed", conversationError.message);
    }

    const messagePayload = {
      user_id: userId,
      phone_number: phoneNumber,
      message_text: text.slice(0, 4000),
      direction: "outbound",
      kind: "audio",
      media_url: mediaUrl,
      storage_path: audioUpload.error ? null : storagePath,
      whatsapp_instance_id: instanceName,
      external_id: externalId || null,
      remote_jid: remoteJid,
      mime_type: "audio/mpeg",
      is_voice_note: true,
      ai_responded: true,
      delivery_status: "sent",
      from_me: true,
      sender_type: "ai",
      sent_at: sentAt,
      media_metadata: { duration_seconds: duration, source: "ai_voice" },
    };
    const { error: messageError } = externalId
      ? await admin.from("messages").upsert(messagePayload, {
        onConflict: "user_id,whatsapp_instance_id,external_id",
      })
      : await admin.from("messages").insert(messagePayload);
    if (messageError) console.error("Sent audio message history insert failed", messageError.message);
    const { error: historyError } = await admin.from("n8n_chat_histories").insert({
      user_id: userId,
      phone_number: phoneNumber,
      session_id: `${userId}_${phoneNumber}`,
      message: { type: "assistant", data: {
        content: text,
        kind: "audio",
        media_url: mediaUrl,
        message_id: externalId || null,
        external_id: externalId || null,
        external_message_id: externalId || null,
        remote_jid: remoteJid,
        message_key: { id: externalId || null, remoteJid, fromMe: true },
      } },
    });
    if (historyError) console.error("Sent audio chat history insert failed", historyError.message);
    if (queueId) {
      await admin.from("message_queue").update({
        status: "delivered",
        external_message_id: externalId || null,
      }).eq("id", queueId).eq("user_id", userId);
    }
    return json({
      ok: true,
      handled_audio_accounting: true,
      duration_seconds: duration,
      reservation_id: reservation.reservation_id,
      external_message_id: externalId || null,
      remaining_audio_seconds: balance.total_seconds_available === null
        ? null
        : Math.max(0, Number(balance.total_seconds_available) - duration),
    });
  } catch (error) {
    console.error("send-voice failed", error instanceof Error ? error.message : "unknown_error");
    if (audioDelivered) {
      return json({ ok: true, handled_audio_accounting: true, delivery_recording_failed: true });
    }
    return json({ error: error instanceof Error ? error.message : "internal_error", text_fallback: true }, 500);
  }
});
