import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_URL = (Deno.env.get("EVOLUTION_API_URL") || "https://api.muwoyo.com").replace(/\/+$/, "");
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const PROFILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAGE_SIZE = 30;
const PROFILE_LOOKUP_CONCURRENCY = 5;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalizePhone = (value: string) => value.split("@")[0]?.replace(/\D/g, "") || "";
const pickName = (contact: Record<string, unknown> | undefined) =>
  [contact?.pushName, contact?.name, contact?.notify, contact?.verifiedBizName]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0) || null;
const pickPicture = (contact: Record<string, unknown> | undefined) =>
  [contact?.profilePictureUrl, contact?.profilePicUrl, contact?.profilePicture, contact?.picture]
    .find((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value)) || null;

async function fetchEvolution(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${EVOLUTION_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: response.ok, status: response.status, data };
}

async function fetchProfilePicture(instanceName: string, phone: string) {
  try {
    const response = await fetchEvolution(
      `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
      { number: phone },
    );
    if (!response.ok) {
      return { url: null, notFound: response.status === 404, error: response.status === 404 ? null : `evolution_${response.status || "unavailable"}` };
    }
    const data = response.data && typeof response.data === "object"
      ? response.data as Record<string, unknown>
      : {};
    const url = pickPicture(data);
    return { url, notFound: !url, error: null };
  } catch (error) {
    return { url: null, notFound: false, error: error instanceof Error ? error.message : "evolution_unavailable" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!EVOLUTION_KEY) return json({ error: "missing_evolution_api_key" }, 503);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "unauthorized" }, 401);

    const actorUserId = authData.user.id;
    const body = await req.json().catch(() => ({}));
    const requestedInstance = typeof body?.instanceName === "string" ? body.instanceName.trim() : "";
    const cursor = typeof body?.cursor === "string" ? body.cursor : "";
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(body?.pageSize) || MAX_PAGE_SIZE));

    const { data: member, error: memberError } = await admin
      .from("business_members")
      .select("business_id,role,status")
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (memberError) throw memberError;
    if (member && member.status !== "active") return json({ error: "member_inactive" }, 403);

    let ownerUserId = actorUserId;
    if (member && member.role !== "owner") {
      const { data: canViewInbox, error: permissionError } = await userClient.rpc("has_business_permission", {
        p_permission: "inbox.view",
        p_business_id: member.business_id,
      });
      if (permissionError) throw permissionError;
      if (!canViewInbox) return json({ error: "inbox_access_required" }, 403);
      const { data: owner, error: ownerError } = await admin
        .from("business_members")
        .select("user_id")
        .eq("business_id", member.business_id)
        .eq("role", "owner")
        .eq("status", "active")
        .maybeSingle();
      if (ownerError || !owner?.user_id) return json({ error: "business_owner_not_found" }, 404);
      ownerUserId = owner.user_id;
    }

    let instanceQuery = admin
      .from("instances")
      .select("instance_name")
      .eq("user_id", ownerUserId);
    if (requestedInstance) instanceQuery = instanceQuery.eq("instance_name", requestedInstance);
    const { data: instance, error: instanceError } = await instanceQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (instanceError) throw instanceError;
    if (!instance?.instance_name) return json({ error: "whatsapp_instance_not_found" }, 404);
    const instanceName = instance.instance_name as string;

    const evolutionContacts = await fetchEvolution(
      `/chat/findContacts/${encodeURIComponent(instanceName)}`,
      { where: {} },
    );
    if (!evolutionContacts.ok) {
      console.error("contact_profile_provider_fetch_failed", instanceName, evolutionContacts.status);
      return json({ error: "whatsapp_contact_fetch_failed", status: evolutionContacts.status }, 502);
    }
    const responseData = evolutionContacts.data && typeof evolutionContacts.data === "object"
      ? evolutionContacts.data as Record<string, unknown>
      : {};
    const nestedData = responseData.data && typeof responseData.data === "object"
      ? responseData.data as Record<string, unknown>
      : {};
    const contactList = Array.isArray(evolutionContacts.data)
      ? evolutionContacts.data
      : Array.isArray(responseData.contacts)
        ? responseData.contacts
        : Array.isArray(responseData.data)
          ? responseData.data
          : Array.isArray(nestedData.contacts)
            ? nestedData.contacts
        : null;
    if (!contactList) return json({ error: "invalid_contact_response" }, 502);

    const providerContacts = new Map<string, Record<string, unknown>>();
    for (const rawContact of contactList) {
      if (!rawContact || typeof rawContact !== "object") continue;
      const contact = rawContact as Record<string, unknown>;
      const jid = [contact.id, contact.remoteJid, contact.jid]
        .find((value): value is string => typeof value === "string") || "";
      if (!jid.endsWith("@s.whatsapp.net")) continue;
      const phone = normalizePhone(jid);
      if (phone) providerContacts.set(phone, contact);
    }

    let contactsQuery = admin
      .from("whatsapp_contacts")
      .select("id,phone_number,name,profile_picture_url,profile_picture_updated_at")
      .eq("user_id", ownerUserId)
      .eq("instance_name", instanceName)
      .eq("is_group", false)
      .not("phone_number", "is", null)
      .order("phone_number", { ascending: true })
      .limit(pageSize + 1);
    if (cursor) contactsQuery = contactsQuery.gt("phone_number", cursor);
    const { data: contactRows, error: contactsError } = await contactsQuery;
    if (contactsError) throw contactsError;

    const rows = contactRows || [];
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    let updated = 0;
    let failed = 0;
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(PROFILE_LOOKUP_CONCURRENCY, page.length) }, async () => {
      while (nextIndex < page.length) {
        const row = page[nextIndex++];
        const phone = String(row.phone_number || "");
        const provider = providerContacts.get(phone);
        const name = pickName(provider);
        const directPicture = pickPicture(provider);
        const checkedAt = row.profile_picture_updated_at
          ? new Date(row.profile_picture_updated_at).getTime()
          : 0;
        const pictureIsStale = !checkedAt || Date.now() - checkedAt >= PROFILE_MAX_AGE_MS;
        const needsPictureLookup = !directPicture && pictureIsStale;
        const pictureResult = needsPictureLookup
          ? await fetchProfilePicture(instanceName, phone)
          : null;
        if (pictureResult?.error) {
          failed += 1;
          console.error("contact_profile_picture_fetch_failed", instanceName, phone, pictureResult.error);
        }

        const pictureUrl = directPicture || pictureResult?.url || null;
        const patch: Record<string, unknown> = {};
        if (name && name !== row.name) patch.name = name;
        if (pictureUrl && pictureUrl !== row.profile_picture_url) patch.profile_picture_url = pictureUrl;
        if (
          directPicture && (pictureIsStale || pictureUrl !== row.profile_picture_url)
          || pictureResult?.url
          || pictureResult?.notFound
        ) {
          patch.profile_picture_updated_at = new Date().toISOString();
        }
        if (Object.keys(patch).length) {
          const { error: updateError } = await admin
            .from("whatsapp_contacts")
            .update(patch)
            .eq("id", row.id)
            .eq("user_id", ownerUserId);
          if (updateError) {
            failed += 1;
            console.error("contact_profile_save_failed", instanceName, phone, updateError.message);
          } else {
            updated += 1;
          }
        }
      }
    });
    await Promise.all(workers);
    const cursorNext = page.length ? String(page[page.length - 1].phone_number) : cursor;

    return json({
      ok: true,
      instanceName,
      updated,
      failed,
      partial: failed > 0,
      hasMore,
      nextCursor: hasMore ? cursorNext : null,
    });
  } catch (error) {
    console.error("whatsapp_contact_profiles_error", error instanceof Error ? error.message : "unknown_error");
    return json({ error: "whatsapp_contact_profiles_failed" }, 500);
  }
});
