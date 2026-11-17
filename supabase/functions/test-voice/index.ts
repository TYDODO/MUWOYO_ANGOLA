import { createClient } from "npm:@supabase/supabase-js@2";
import { FISH_API_BASE, getFishApiKey, synthesizeFishSpeech, toBase64 } from "../_shared/fish-audio.ts";
import { getMp3DurationSeconds } from "../../../src/lib/mp3-duration.ts";
import { parseVoiceTuning } from "../../../src/lib/voice-tuning.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function errorStatus(message: string) {
  if (message.includes("invalid_voice_tuning")) return 400;
  if (message.includes("generation_limit_reached")) return 409;
  if (message.includes("audio_ineligible")) return 403;
  if (message.includes("voice_not_found")) return 404;
  if (message.includes("fish_audio_not_configured")) return 503;
  if (message.includes("fish_tts_failed_402")) return 502;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let userId = "";
  let generationId = "";
  let storagePath = "";
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    userId = user.id;

    const body = await req.json();
    if (body.preview === true) {
      const referenceId = String(body.reference_id || "");
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(referenceId)) return json({ error: "invalid_voice_reference_id" }, 400);
      const { data: balance, error: balanceError } = await admin.rpc("get_audio_balance", { p_user_id: user.id });
      if (balanceError) throw new Error("audio_balance_lookup_failed");
      if (!balance?.eligible) return json({ error: "audio_plan_required" }, 403);
      const modelResponse = await fetch(`${FISH_API_BASE}/model/${encodeURIComponent(referenceId)}`, {
        headers: { Authorization: `Bearer ${getFishApiKey()}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!modelResponse.ok) {
        await modelResponse.body?.cancel();
        return json({ error: modelResponse.status === 404 ? "public_voice_not_found" : "voice_lookup_failed" }, modelResponse.status === 404 ? 404 : 502);
      }
      const model = await modelResponse.json();
      if (!model || typeof model !== "object"
        || String(model._id || model.id || model.model_id || "") !== referenceId
        || String(model.visibility || "").toLowerCase() !== "public"
        || model.is_public === false || model.public === false) {
        return json({ error: "public_voice_not_found" }, 404);
      }
      const audio = await synthesizeFishSpeech("Olá! Esta é uma pré-visualização da voz selecionada.", referenceId, body.voice_tuning);
      if (audio.length > 5 * 1024 * 1024) throw new Error("preview_audio_too_large");
      return json({ ok: true, audio_base64: toBase64(audio), content_type: "audio/mpeg" });
    }

    const modelId = String(body.model_id || "");
    const text = String(body.text || "").trim();
    if (!modelId || !text || text.length > 500) return json({ error: "model_id_and_text_required_max_500" }, 400);
    const tuning = parseVoiceTuning(body.voice_tuning);

    const { data: reservation, error: reserveError } = await admin.rpc("reserve_audio_voice_generation", {
      p_user_id: user.id,
      p_model_id: modelId,
      p_text_input: text,
    });
    if (reserveError) {
      const message = reserveError.message || "generation_reservation_failed";
      return json({ error: message }, errorStatus(message));
    }
    generationId = String(reservation?.id || "");
    const generationNumber = Number(reservation?.generation_number || 0);
    if (!generationId || generationNumber < 1 || generationNumber > 3) throw new Error("invalid_generation_reservation");

    const audio = await synthesizeFishSpeech(text, modelId, tuning);
    const durationSeconds = getMp3DurationSeconds(audio);
    storagePath = `${user.id}/${modelId}/${generationId}.mp3`;
    const { error: uploadError } = await admin.storage.from("audio-generations").upload(
      storagePath,
      audio,
      { contentType: "audio/mpeg", upsert: false },
    );
    if (uploadError) {
      console.error(JSON.stringify({
        event: "test_voice_storage_upload_failed",
        message: uploadError.message,
        statusCode: uploadError.statusCode,
      }));
      throw new Error("generation_audio_storage_failed");
    }

    const { error: finalizeError } = await admin.rpc("finalize_audio_voice_generation", {
      p_user_id: user.id,
      p_generation_id: generationId,
      p_storage_path: storagePath,
      p_duration_seconds: durationSeconds,
      p_success: true,
    });
    if (finalizeError) throw new Error("generation_history_save_failed");

    return json({
      ok: true,
      id: generationId,
      generation_number: generationNumber,
      duration_seconds: durationSeconds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    if (generationId && userId) {
      if (storagePath) {
        const { error: cleanupError } = await admin.storage.from("audio-generations").remove([storagePath]);
        if (cleanupError) console.error("test-voice storage cleanup failed", cleanupError.message);
      }
      const { error: finalizeError } = await admin.rpc("finalize_audio_voice_generation", {
        p_user_id: userId,
        p_generation_id: generationId,
        p_success: false,
      });
      if (finalizeError) console.error("test-voice reservation cleanup failed", finalizeError.message);
    }
    console.error("test-voice failed", message);
    return json({ error: message }, errorStatus(message));
  }
});
