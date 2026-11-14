import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EVOLUTION_URL = (Deno.env.get("EVOLUTION_API_URL") || "https://api.muwoyo.com").replace(/\/+$/, "");
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const evo = async (path: string, body: unknown, method = "POST") => fetch(`${EVOLUTION_URL}${path}`, { method, headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY }, body: JSON.stringify(body) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const header = req.headers.get("Authorization");
    if (!header?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: header } } });
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const phone = String(body.phoneNumber || "");
    const instanceName = String(body.instanceName || "");

    if (action === "delete_messages") {
      const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      const messageIds = body.messageIds;
      if (
        !conversationId
        || !Array.isArray(messageIds)
        || messageIds.length === 0
        || messageIds.length > 100
        || messageIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        || new Set(messageIds).size !== messageIds.length
      ) {
        return json({ error: "invalid_message_selection" }, 400);
      }

      const { data: conversation, error: conversationError } = await admin
        .from("inbox_conversations")
        .select("id,user_id,instance_name,contact_id,assigned_to")
        .eq("id", conversationId)
        .maybeSingle();
      if (conversationError) return json({ error: "conversation_lookup_failed" }, 500);
      if (!conversation?.instance_name) return json({ error: "conversation_not_found" }, 404);

      const { data: business, error: businessError } = await client
        .from("businesses")
        .select("id")
        .eq("owner_id", conversation.user_id)
        .maybeSingle();
      if (businessError) return json({ error: "authorization_lookup_failed" }, 500);
      if (!business) return json({ error: "forbidden" }, 403);

      const isOwner = conversation.user_id === auth.user.id;
      if (!isOwner) {
        if (conversation.assigned_to !== auth.user.id) return json({ error: "forbidden" }, 403);
        const { data: canManage, error: permissionError } = await client.rpc("has_business_permission", {
          p_permission: "inbox.manage",
          p_business_id: business.id,
        });
        if (permissionError) return json({ error: "authorization_lookup_failed" }, 500);
        if (!canManage) return json({ error: "forbidden" }, 403);
      }

      const { data: contact, error: contactError } = await admin
        .from("whatsapp_contacts")
        .select("phone_number")
        .eq("id", conversation.contact_id)
        .eq("user_id", conversation.user_id)
        .eq("instance_name", conversation.instance_name)
        .maybeSingle();
      if (contactError) return json({ error: "contact_lookup_failed" }, 500);
      if (!contact?.phone_number) return json({ error: "contact_not_found" }, 404);

      const scopedMessages = admin
        .from("messages")
        .select("id")
        .eq("user_id", conversation.user_id)
        .eq("whatsapp_instance_id", conversation.instance_name)
        .eq("phone_number", contact.phone_number)
        .in("id", messageIds);
      const { data: matchingMessages, error: messageLookupError } = await scopedMessages;
      if (messageLookupError) return json({ error: "message_lookup_failed" }, 500);
      if ((matchingMessages || []).length !== messageIds.length) {
        return json({ error: "message_selection_mismatch" }, 400);
      }

      const { data: deletedMessages, error: deleteError } = await admin
        .from("messages")
        .delete()
        .eq("user_id", conversation.user_id)
        .eq("whatsapp_instance_id", conversation.instance_name)
        .eq("phone_number", contact.phone_number)
        .in("id", messageIds)
        .select("id");
      if (deleteError) return json({ error: "message_delete_failed" }, 500);
      if ((deletedMessages || []).length !== messageIds.length) {
        return json({ error: "message_selection_changed" }, 409);
      }
      return json({ ok: true, deletedCount: deletedMessages.length });
    }

    const { data: instance } = await admin.from("instances").select("instance_name").eq("user_id", auth.user.id).eq("instance_name", instanceName).maybeSingle();
    if (!instance) return json({ error: "instance_not_owned" }, 403);
    const { data: contact } = await admin.from("whatsapp_contacts").select("id,remote_jid,is_group").eq("user_id", auth.user.id).eq("instance_name", instanceName).eq("phone_number", phone).maybeSingle();
    if (!contact && action !== "create_group") return json({ error: "contact_not_found" }, 404);
    if (action === "create_group") return json({ error: "groups_not_allowed" }, 403);
    const jid = contact?.remote_jid || `${phone}@s.whatsapp.net`;

    if (action === "archive") {
      const response = await evo(`/chat/archiveChat/${encodeURIComponent(instanceName)}`, { lastMessage: {}, chat: jid });
      if (!response.ok) return json({ error: "archive_failed" }, 502);
      return json({ ok: true });
    }
    if (action === "block") {
      const response = await evo(`/chat/updateBlockStatus/${encodeURIComponent(instanceName)}`, { number: phone, status: "block" });
      if (!response.ok) return json({ error: "block_failed" }, 502);
      await admin.from("blocked_contacts").upsert({ user_id: auth.user.id, instance_name: instanceName, phone_number: phone, is_active: true }, { onConflict: "user_id,phone_number" });
      return json({ ok: true });
    }
    if (action === "delete") {
      await admin.from("inbox_conversations").delete().eq("user_id", auth.user.id).eq("instance_name", instanceName).eq("contact_id", contact!.id);
      await admin.from("messages").delete().eq("user_id", auth.user.id).eq("whatsapp_instance_id", instanceName).eq("phone_number", phone);
      return json({ ok: true });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (error) { console.error("inbox-actions", error); return json({ error: error instanceof Error ? error.message : "internal" }, 500); }
});
