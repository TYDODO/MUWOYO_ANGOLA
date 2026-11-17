import { createClient } from "npm:@supabase/supabase-js@2";
import { FISH_API_BASE, getFishApiKey } from "../_shared/fish-audio.ts";

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

async function getActor(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const { data: isAdmin, error } = await admin.rpc("is_admin", { _user_id: data.user.id });
  if (error) throw new Error("admin_check_failed");
  return { user: data.user, isAdmin: Boolean(isAdmin) };
}

async function fishRequest(path: string, init?: RequestInit) {
  const key = getFishApiKey();
  const response = await fetch(`${FISH_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...init?.headers },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`fish_api_failed_${response.status}`);
  }
  return response;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const actor = await getActor(req);
    if (!actor) return json({ error: "unauthorized" }, 401);
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) return json({ error: "multipart_form_required" }, 415);
    const form = await req.formData();
    const action = String(form.get("action") || "clone");
    const targetUserId = actor.isAdmin ? String(form.get("user_id") || actor.user.id) : actor.user.id;

    if (action === "delete" || action === "activate" || action === "deactivate") {
      if (action === "delete" && !actor.isAdmin && targetUserId !== actor.user.id) return json({ error: "not_authorized" }, 403);
      if (action !== "delete" && targetUserId !== actor.user.id) return json({ error: "not_authorized" }, 403);
      const modelId = String(form.get("model_id") || "");
      if (!modelId || modelId.length > 200) return json({ error: "invalid_model_id" }, 400);
      const { data: voice, error: voiceError } = await admin
        .from("audio_voice_models").select("id,user_id,model_id,title").eq("user_id", targetUserId).eq("model_id", modelId).maybeSingle();
      if (voiceError) throw new Error("voice_lookup_failed");
      if (!voice) return json({ error: "voice_not_found" }, 404);
      if (action === "delete") {
        const { data: generations, error: generationsError } = await admin
          .from("audio_voice_generations").select("storage_path").eq("user_id", targetUserId).eq("voice_model_id", modelId);
        if (generationsError) throw new Error("voice_generation_lookup_failed");
        const paths = (generations || []).flatMap((generation) => generation.storage_path ? [generation.storage_path] : []);
        if (paths.length) {
          const { error: storageError } = await admin.storage.from("audio-generations").remove(paths);
          if (storageError) throw new Error("voice_generation_storage_delete_failed");
        }
        const deleted = await fishRequest(`/model/${encodeURIComponent(modelId)}`, { method: "DELETE" });
        await deleted.body?.cancel();
        const { error } = await admin.from("audio_voice_models").delete().eq("id", voice.id);
        if (error) throw new Error("voice_record_delete_failed");
        const { error: settingsError } = await admin.from("audio_voice_settings").update({
          active_voice_reference_id: null,
          voice_source: null,
          voice_name: null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", targetUserId).eq("active_voice_reference_id", modelId).eq("voice_source", "cloned");
        if (settingsError) throw new Error("voice_settings_clear_failed");
        return json({ ok: true, deleted: true });
      }
      if (action === "activate") {
        const { error: settingsError } = await admin.rpc("set_audio_voice_configuration", {
          p_user_id: targetUserId,
          p_reference_id: modelId,
          p_source: "cloned",
          p_name: voice.title,
        });
        if (settingsError) return json({ error: settingsError.message }, 409);
      } else {
        const { error } = await admin.rpc("set_audio_voice_active", {
          p_user_id: targetUserId,
          p_model_id: modelId,
          p_active: false,
        });
        if (error) return json({ error: error.message }, 409);
        const { error: settingsError } = await admin.from("audio_voice_settings").update({
          active_voice_reference_id: null,
          voice_source: null,
          voice_name: null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", targetUserId).eq("active_voice_reference_id", modelId).eq("voice_source", "cloned");
        if (settingsError) return json({ error: "voice_settings_clear_failed" }, 500);
      }
      return json({ ok: true, is_active: action === "activate" });
    }

    if (action !== "clone") return json({ error: "unknown_action" }, 400);
    if (targetUserId !== actor.user.id) return json({ error: "not_authorized" }, 403);
    const { data: balance, error: balanceError } = await admin.rpc("get_audio_balance", { p_user_id: targetUserId });
    if (balanceError) throw new Error("audio_balance_lookup_failed");
    if (!balance?.eligible) return json({ error: "audio_plan_required", upgrade_to: "Muwoyo Growth" }, 403);
    const title = String(form.get("title") || "").trim();
    const audio = form.get("audio");
    if (!title || title.length > 120 || !(audio instanceof File)) return json({ error: "title_and_audio_required" }, 400);
    if (!audio.type.startsWith("audio/") || audio.size < 1024 || audio.size > 25 * 1024 * 1024) {
      return json({ error: "invalid_audio_file" }, 400);
    }
    const apiForm = new FormData();
    apiForm.set("title", title);
    apiForm.set("type", "tts");
    apiForm.set("train_mode", "fast");
    apiForm.set("visibility", "private");
    apiForm.set("voices", audio, audio.name || "voice-sample");
    const response = await fishRequest("/model", { method: "POST", body: apiForm });
    const result = await response.json();
    const modelId = String(result?._id || result?.id || result?.model_id || "");
    if (!modelId) return json({ error: "fish_model_id_missing" }, 502);

    const { data: registered, error: registerError } = await admin.rpc("register_audio_voice", {
      p_user_id: targetUserId,
      p_model_id: modelId,
      p_title: title,
    });
    if (registerError) {
      try {
        const rollback = await fishRequest(`/model/${encodeURIComponent(modelId)}`, { method: "DELETE" });
        await rollback.body?.cancel();
      } catch (rollbackError) {
        console.error("Fish Audio voice rollback failed", rollbackError);
      }
      return json({ error: registerError.message }, 409);
    }
    if (registered?.is_active) {
      const { error: settingsError } = await admin.rpc("set_audio_voice_configuration", {
        p_user_id: targetUserId,
        p_reference_id: modelId,
        p_source: "cloned",
        p_name: title,
      });
      if (settingsError) {
        const rollback = await fishRequest(`/model/${encodeURIComponent(modelId)}`, { method: "DELETE" });
        await rollback.body?.cancel();
        await admin.from("audio_voice_models").delete().eq("user_id", targetUserId).eq("model_id", modelId);
        return json({ error: settingsError.message }, 409);
      }
    }
    return json({ ok: true, model_id: modelId, title, is_active: Boolean(registered?.is_active) });
  } catch (error) {
    console.error("clone-voice failed", error instanceof Error ? error.message : "unknown_error");
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
