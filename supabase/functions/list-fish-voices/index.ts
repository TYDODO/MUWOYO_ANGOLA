import { createClient } from "npm:@supabase/supabase-js@2";
import { FISH_API_BASE, getFishApiKey } from "../_shared/fish-audio.ts";
import { DEFAULT_VOICE_TUNING, parseVoiceTuning } from "../../../src/lib/voice-tuning.ts";
import { describeVoiceInPortuguese, translateVoiceGender } from "../../../src/lib/voice-library.ts";

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
  const { data: { user } } = await client.auth.getUser();
  return user || null;
}

async function fishRequest(path: string) {
  const response = await fetch(`${FISH_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getFishApiKey()}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`fish_api_failed_${response.status}`);
  }
  return await response.json();
}

function getModelList(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (!result || typeof result !== "object") return [];
  const record = result as Record<string, unknown>;
  const models = record.items || record.models || record.data || record.results;
  return Array.isArray(models) ? models.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function getModelPage(result: unknown) {
  const record = result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : {};
  const total = Number(record.total);
  return {
    models: getModelList(result),
    total: Number.isFinite(total) ? total : null,
    hasMore: typeof record.has_more === "boolean" ? record.has_more : null,
    windowLimited: record.window_limited === true,
    accessibleUpperBound: typeof record.accessible_upper_bound === "number" ? record.accessible_upper_bound : null,
  };
}

function getModelId(model: Record<string, unknown>) {
  const value = model._id || model.id || model.model_id;
  return typeof value === "string" ? value : "";
}

function getPreviewUrl(model: Record<string, unknown>): string | null {
  const samples = model.samples || model.sample || model.audios;
  const sample = Array.isArray(samples) ? samples[0] : samples;
  const candidate = typeof sample === "string"
    ? sample
    : sample && typeof sample === "object"
      ? (sample as Record<string, unknown>).url || (sample as Record<string, unknown>).audio || (sample as Record<string, unknown>).audio_url
      : null;
  if (typeof candidate !== "string") return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getLanguages(model: Record<string, unknown>) {
  const values = model.languages || model.language;
  if (Array.isArray(values)) return values.filter((value): value is string => typeof value === "string").slice(0, 10);
  return typeof values === "string" ? [values] : [];
}

function getTags(model: Record<string, unknown>) {
  return Array.isArray(model.tags) ? model.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20) : [];
}

function getPublicModel(model: Record<string, unknown>, referenceId: string) {
  if (String(model.visibility || "").toLowerCase() !== "public") return false;
  if (model.is_public === false || model.public === false) return false;
  return getModelId(model) === referenceId;
}

function getPublicVoice(model: Record<string, unknown>) {
  const referenceId = getModelId(model);
  const languages = getLanguages(model);
  const tags = getTags(model);
  const gender = translateVoiceGender(typeof model.gender === "string" ? model.gender : null, tags);
  const authorRecord = model.author && typeof model.author === "object" ? model.author as Record<string, unknown> : null;
  return {
    reference_id: referenceId,
    name: String(model.title || model.name || "Voz pronta").slice(0, 120),
    description: String(model.description || tags.join(", ")).slice(0, 2000),
    description_pt: describeVoiceInPortuguese(languages, gender, tags),
    languages,
    author: typeof model.author === "string"
      ? model.author
      : typeof authorRecord?.name === "string"
        ? authorRecord.name
        : typeof authorRecord?.nickname === "string"
          ? authorRecord.nickname
          : typeof authorRecord?.username === "string" ? authorRecord.username : null,
    task_count: Number.isFinite(Number(model.task_count)) ? Number(model.task_count) : 0,
    like_count: Number.isFinite(Number(model.like_count)) ? Number(model.like_count) : 0,
    gender,
    country: typeof model.country === "string"
      ? model.country
      : typeof model.country_code === "string"
        ? model.country_code
        : typeof model.region === "string" ? model.region : null,
    language: languages[0] || "",
    preview_url: getPreviewUrl(model),
    sample_audio_url: getPreviewUrl(model),
  };
}

function parseCachedVoice(value: unknown): ReturnType<typeof getPublicVoice> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const model = value as Record<string, unknown>;
  if (typeof model.reference_id !== "string" || typeof model.name !== "string"
      || typeof model.description_pt !== "string" || !Array.isArray(model.languages)
      || model.languages.some((language) => typeof language !== "string")) {
    return null;
  }
  return {
    reference_id: model.reference_id,
    name: model.name,
    description: typeof model.description === "string" ? model.description : "",
    description_pt: model.description_pt,
    languages: model.languages,
    author: typeof model.author === "string" ? model.author : null,
    task_count: Number.isFinite(Number(model.task_count)) ? Number(model.task_count) : 0,
    like_count: Number.isFinite(Number(model.like_count)) ? Number(model.like_count) : 0,
    gender: typeof model.gender === "string" ? model.gender : null,
    country: typeof model.country === "string" ? model.country : null,
    language: typeof model.language === "string" ? model.language : "",
    preview_url: typeof model.preview_url === "string" ? model.preview_url : null,
    sample_audio_url: typeof model.sample_audio_url === "string" ? model.sample_audio_url : null,
  };
}

function isValidReferenceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value.trim());
}

async function isAdmin(userId: string) {
  const { data, error } = await admin.from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("admin_role_lookup_failed");
  return Boolean(data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const user = await getActor(req);
    if (!user) return json({ error: "unauthorized" }, 401);
    const body = await req.json();
    const action = String(body.action || "list");
    const userIsAdmin = action === "favorite_list" ? false : await isAdmin(user.id);

    if (action === "settings") {
      const { data, error } = await admin.from("audio_voice_settings").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw new Error("voice_settings_lookup_failed");
      return json({
        settings: {
          active_voice_reference_id: data?.active_voice_reference_id || null,
          voice_source: data?.voice_source || null,
          voice_name: data?.voice_name || null,
          voice_tuning: parseVoiceTuning(data?.voice_tuning),
          favorite_voice_ids: Array.isArray(data?.favorite_voice_ids) ? data.favorite_voice_ids : [],
        },
      });
    }

    if (action === "curated_admin_list" || action === "curated_add" || action === "curated_update" || action === "curated_delete") {
      if (!userIsAdmin) return json({ error: "admin_required" }, 403);
      if (action === "curated_admin_list") {
        const { data, error } = await admin.from("curated_voices").select("*").order("sort_order").order("display_name");
        if (error) throw new Error("curated_voice_list_failed");
        return json({ items: data || [] });
      }
      if (action === "curated_add") {
        const referenceId = String(body.reference_id || "").trim();
        if (!isValidReferenceId(referenceId)) return json({ error: "invalid_voice_reference_id" }, 400);
        const result = await fishRequest(`/model/${encodeURIComponent(referenceId)}`);
        const model = result as Record<string, unknown>;
        if (!model || typeof model !== "object" || !getPublicModel(model, referenceId)) return json({ error: "public_voice_not_found" }, 404);
        const voice = getPublicVoice(model);
        const { data, error } = await admin.from("curated_voices").insert({
          fish_reference_id: referenceId,
          display_name: String(body.display_name || voice.name).trim().slice(0, 120),
          description: String(body.description ?? voice.description_pt).trim().slice(0, 2000),
          gender: voice.gender,
          language: voice.language,
          sample_audio_url: voice.sample_audio_url,
          is_active: true,
          sort_order: 0,
        }).select("*").single();
        if (error) return json({ error: error.code === "23505" ? "voice_already_curated" : "curated_voice_save_failed" }, error.code === "23505" ? 409 : 500);
        return json({ item: data });
      }
      const id = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "invalid_curated_voice_id" }, 400);
      if (action === "curated_delete") {
        const { error } = await admin.from("curated_voices").delete().eq("id", id);
        if (error) throw new Error("curated_voice_delete_failed");
        return json({ ok: true });
      }
      const updates: Record<string, unknown> = {};
      if (typeof body.display_name === "string") updates.display_name = body.display_name.trim().slice(0, 120);
      if (typeof body.description === "string") updates.description = body.description.trim().slice(0, 2000);
      if (body.gender === null || typeof body.gender === "string") updates.gender = body.gender?.slice(0, 40) || null;
      if (body.language === null || typeof body.language === "string") updates.language = body.language?.slice(0, 32) || null;
      if (body.sample_audio_url === null || typeof body.sample_audio_url === "string") {
        if (typeof body.sample_audio_url === "string") {
          try {
            if (new URL(body.sample_audio_url).protocol !== "https:") return json({ error: "invalid_sample_audio_url" }, 400);
          } catch {
            return json({ error: "invalid_sample_audio_url" }, 400);
          }
        }
        updates.sample_audio_url = body.sample_audio_url;
      }
      if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
      if (Number.isInteger(body.sort_order)) updates.sort_order = body.sort_order;
      if (!Object.keys(updates).length) return json({ error: "no_curated_voice_changes" }, 400);
      const { data, error } = await admin.from("curated_voices").update(updates).eq("id", id).select("*").maybeSingle();
      if (error) throw new Error("curated_voice_update_failed");
      if (!data) return json({ error: "curated_voice_not_found" }, 404);
      return json({ item: data });
    }

    if (action === "favorite_list") {
      const { data: settings, error } = await admin.from("audio_voice_settings")
        .select("favorite_voice_ids,favorite_voice_models").eq("user_id", user.id).maybeSingle();
      if (error) throw new Error("voice_settings_lookup_failed");
      const favoriteIds = Array.isArray(settings?.favorite_voice_ids)
        ? settings.favorite_voice_ids.filter((id: unknown): id is string => typeof id === "string")
        : [];
      const cachedModels = Array.isArray(settings?.favorite_voice_models)
        ? settings.favorite_voice_models
          .map(parseCachedVoice)
          .filter((model): model is ReturnType<typeof getPublicVoice> => Boolean(model))
        : [];
      const modelsById = new Map(
        cachedModels.map((model) => [model.reference_id, model]),
      );
      const unavailableReferenceIds: string[] = [];
      const uncachedIds = favoriteIds.filter((referenceId) => !modelsById.has(referenceId));
      for (let offset = 0; offset < uncachedIds.length; offset += 5) {
        await Promise.all(uncachedIds.slice(offset, offset + 5).map(async (referenceId) => {
          try {
            const model = await fishRequest(`/model/${encodeURIComponent(referenceId)}`);
            if (!model || typeof model !== "object" || !getPublicModel(model as Record<string, unknown>, referenceId)) {
              unavailableReferenceIds.push(referenceId);
              return;
            }
            const voice = getPublicVoice(model as Record<string, unknown>);
            modelsById.set(referenceId, voice);
            const { error: cacheError } = await admin.rpc("set_audio_voice_favorite_cached", {
              p_user_id: user.id,
              p_reference_id: referenceId,
              p_favorite: true,
              p_voice: voice,
            });
            if (cacheError) console.warn("favorite_voice_cache_migration_failed", cacheError.message);
          } catch (error) {
            unavailableReferenceIds.push(referenceId);
            console.warn("favorite_voice_lookup_unavailable", JSON.stringify({
              referenceId,
              reason: error instanceof Error ? error.message : "unknown_error",
            }));
          }
        }));
      }
      const models = favoriteIds
        .map((referenceId) => modelsById.get(referenceId))
        .filter((model): model is ReturnType<typeof getPublicVoice> => Boolean(model));
      return json({ models, favorite_voice_ids: favoriteIds, unavailable_reference_ids: unavailableReferenceIds });
    }

    if (action === "list" || action === "lookup" || action === "curated_list" || action === "select" || action === "favorite" || action === "save_tuning") {
      const { data: balance, error: balanceError } = await admin.rpc("get_audio_balance", { p_user_id: user.id });
      if (balanceError) throw new Error("audio_balance_lookup_failed");
      if (!balance?.eligible && !userIsAdmin) return json({ error: "audio_plan_required", upgrade_to: "Muwoyo Growth" }, 403);

    if (action === "list") {
      const pageSize = Math.min(100, Math.max(1, Number(body.page_size) || 20));
      const pageNumber = Math.max(1, Number(body.page_number) || 1);
      const title = String(body.title || "").trim().slice(0, 120);
      const language = String(body.language || "pt").toLowerCase();
      if (!["all", "pt", "en", "es", "fr"].includes(language)) return json({ error: "unsupported_language" }, 400);
      const sortBy = String(body.sort_by || "task_count");
      if (!["task_count", "like_count"].includes(sortBy)) return json({ error: "unsupported_sort_order" }, 400);
      const params = new URLSearchParams({
        page_size: String(pageSize),
        page_number: String(pageNumber),
        self: "false",
        sort_by: sortBy,
      });
      if (title) params.set("title", title);
      if (language !== "all") params.set("language", language);
      const page = getModelPage(await fishRequest(`/model?${params.toString()}`));
      const models = page.models
        .filter((model) => String(model.visibility || "").toLowerCase() === "public")
        .filter((model) => model.is_public !== false && model.public !== false)
        .filter((model) => model.dmca_taken_down !== true && (!model.state || model.state === "trained"))
        .filter((model) => !model.type || model.type === "tts")
        .map(getPublicVoice)
        .filter((model) => model.reference_id);
      const hasMore = page.hasMore ?? (page.total !== null ? pageNumber * pageSize < page.total : page.models.length === pageSize);
      return json({
        items: models.map((model) => ({
          id: model.reference_id,
          title: model.name,
          description: model.description,
          languages: model.languages,
          author: model.author,
          task_count: model.task_count,
          like_count: model.like_count,
          sample_audio_url: model.sample_audio_url,
        })),
        models,
        page_number: pageNumber,
        page_size: pageSize,
        total: page.total,
        has_more: hasMore,
        window_limited: page.windowLimited,
        accessible_upper_bound: page.accessibleUpperBound,
      });
    }

    if (action === "lookup") {
      const referenceId = String(body.reference_id || "").trim();
      if (!isValidReferenceId(referenceId)) return json({ error: "invalid_voice_reference_id" }, 400);
      const model = await fishRequest(`/model/${encodeURIComponent(referenceId)}`);
      if (!model || typeof model !== "object" || !getPublicModel(model as Record<string, unknown>, referenceId)) {
        return json({ error: "public_voice_not_found" }, 404);
      }
      return json({ item: getPublicVoice(model as Record<string, unknown>) });
    }

    if (action === "curated_list") {
      const { data, error } = await admin.from("curated_voices")
        .select("id,fish_reference_id,display_name,description,gender,language,sample_audio_url,sort_order")
        .eq("is_active", true).order("sort_order").order("display_name");
      if (error) throw new Error("curated_voice_list_failed");
      return json({
        items: (data || []).map((voice) => ({
          reference_id: voice.fish_reference_id,
          name: voice.display_name,
          description_pt: voice.description,
          languages: voice.language ? [voice.language] : [],
          gender: voice.gender,
          preview_url: voice.sample_audio_url,
        })),
      });
    }

    if (action === "select") {
      const referenceId = String(body.reference_id || "").trim();
      const source = String(body.source || "");
      if (!isValidReferenceId(referenceId) || !["cloned", "library"].includes(source)) {
        return json({ error: "invalid_voice_selection" }, 400);
      }
      let name = String(body.name || "").trim().slice(0, 120);
      if (source === "cloned") {
        const { data: voice, error } = await admin.from("audio_voice_models")
          .select("title").eq("user_id", user.id).eq("model_id", referenceId).maybeSingle();
        if (error) throw new Error("voice_lookup_failed");
        if (!voice) return json({ error: "voice_not_found" }, 404);
        name = voice.title;
      } else {
        const model = await fishRequest(`/model/${encodeURIComponent(referenceId)}`);
        if (!model || typeof model !== "object" || !getPublicModel(model as Record<string, unknown>, referenceId)) {
          return json({ error: "public_voice_not_found" }, 404);
        }
        const { data: curatedVoice, error: curatedError } = await admin.from("curated_voices")
          .select("display_name").eq("fish_reference_id", referenceId).eq("is_active", true).maybeSingle();
        if (curatedError) throw new Error("curated_voice_lookup_failed");
        name = String(curatedVoice?.display_name || (model as Record<string, unknown>).title || (model as Record<string, unknown>).name || name || "Voz pronta").slice(0, 120);
      }
      const { error } = await admin.rpc("set_audio_voice_configuration", {
        p_user_id: user.id,
        p_reference_id: referenceId,
        p_source: source,
        p_name: name,
      });
      if (error) return json({ error: error.message }, error.message.includes("audio_ineligible") ? 403 : 409);
      return json({ ok: true, active_voice_reference_id: referenceId, voice_source: source, voice_name: name });
    }

    if (action === "favorite") {
      const referenceId = String(body.reference_id || "").trim();
      const favorite = body.favorite;
      if (!isValidReferenceId(referenceId) || typeof favorite !== "boolean") {
        return json({ error: "invalid_voice_favorite" }, 400);
      }
      let voice: ReturnType<typeof getPublicVoice> | null = null;
      if (favorite) {
        const model = await fishRequest(`/model/${encodeURIComponent(referenceId)}`);
        if (!model || typeof model !== "object" || !getPublicModel(model as Record<string, unknown>, referenceId)) {
          return json({ error: "public_voice_not_found" }, 404);
        }
        voice = getPublicVoice(model as Record<string, unknown>);
      }
      const { data: favorites, error } = await admin.rpc("set_audio_voice_favorite_cached", {
        p_user_id: user.id,
        p_reference_id: referenceId,
        p_favorite: favorite,
        p_voice: voice,
      });
      if (error) throw new Error("voice_favorite_save_failed");
      return json({ ok: true, favorite_voice_ids: favorites || [] });
    }

    if (action === "save_tuning") {
      const voiceTuning = parseVoiceTuning(body.voice_tuning);
      const { error } = await admin.from("audio_voice_settings").upsert({
        user_id: user.id,
        voice_tuning: voiceTuning,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error("voice_tuning_save_failed");
      return json({ ok: true, voice_tuning: voiceTuning });
    }

    return json({ error: "unknown_action" }, 400);
    }
    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    console.error("list-fish-voices failed", message);
    if (message === "fish_audio_not_configured") return json({ error: message }, 503);
    if (message.includes("fish_api_failed_")) return json({ error: "fish_api_unavailable" }, 502);
    if (message === "invalid_voice_tuning") return json({ error: message }, 400);
    return json({ error: message }, 500);
  }
});
