import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EVOLUTION_URL = (Deno.env.get("EVOLUTION_API_URL") || "https://api.muwoyo.com").replace(/\/+$/, "");
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
<<<<<<< HEAD
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const evo = async (path: string, body: unknown, method = "POST") => fetch(`${EVOLUTION_URL}${path}`, {
  method,
  headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(15000),
});
=======
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const evo = async (path: string, body: unknown, method = "POST") => fetch(`${EVOLUTION_URL}${path}`, { method, headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY }, body: JSON.stringify(body) });
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e

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

<<<<<<< HEAD
    if (action === "forward_messages") {
      const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      const messageIds = body.messageIds;
      const targetPhone = typeof body.targetPhoneNumber === "string" ? body.targetPhoneNumber.replace(/\D/g, "") : "";
      if (!conversationId || !targetPhone || !/^[1-9][0-9]{7,14}$/.test(targetPhone)
          || !Array.isArray(messageIds) || messageIds.length === 0 || messageIds.length > 100
          || messageIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
          || new Set(messageIds).size !== messageIds.length) {
        return json({ error: "invalid_forward_selection" }, 400);
      }
      if (!EVOLUTION_KEY) return json({ error: "whatsapp_not_configured" }, 503);

      const { data: conversation, error: conversationError } = await admin.from("inbox_conversations")
        .select("id,user_id,instance_name,contact_id,assigned_to")
        .eq("id", conversationId)
        .maybeSingle();
      if (conversationError) return json({ error: "conversation_lookup_failed" }, 500);
      if (!conversation?.instance_name) return json({ error: "conversation_not_found" }, 404);

      const { data: business, error: businessError } = await client.from("businesses")
        .select("id").eq("owner_id", conversation.user_id).maybeSingle();
      if (businessError) return json({ error: "authorization_lookup_failed" }, 500);
      if (conversation.user_id !== auth.user.id) {
        if (!business || conversation.assigned_to !== auth.user.id) return json({ error: "forbidden" }, 403);
        const { data: canSend, error: permissionError } = await client.rpc("has_business_permission", {
          p_permission: "inbox.send",
          p_business_id: business.id,
        });
        if (permissionError) return json({ error: "authorization_lookup_failed" }, 500);
        if (!canSend) return json({ error: "forbidden" }, 403);
      }

      const { data: sourceContact, error: sourceError } = await admin.from("whatsapp_contacts")
        .select("phone_number,remote_jid,is_group")
        .eq("id", conversation.contact_id)
        .eq("user_id", conversation.user_id)
        .eq("instance_name", conversation.instance_name)
        .maybeSingle();
      if (sourceError) return json({ error: "source_contact_lookup_failed" }, 500);
      if (!sourceContact?.phone_number || sourceContact.is_group) return json({ error: "source_contact_not_found" }, 404);

      const { data: targetContact, error: targetError } = await admin.from("whatsapp_contacts")
        .select("phone_number,remote_jid,is_group")
        .eq("user_id", conversation.user_id)
        .eq("instance_name", conversation.instance_name)
        .eq("phone_number", targetPhone)
        .maybeSingle();
      if (targetError) return json({ error: "target_contact_lookup_failed" }, 500);
      if (!targetContact || targetContact.is_group) return json({ error: "target_contact_not_found" }, 404);
      if (targetContact.phone_number === sourceContact.phone_number) return json({ error: "cannot_forward_to_source" }, 400);

      const { data: selectedMessages, error: messageError } = await admin.from("messages")
        .select("id,external_id,from_me,direction,kind,message_text,media_url,mime_type,file_name,file_size_bytes,is_voice_note,media_metadata,created_at")
        .eq("user_id", conversation.user_id)
        .eq("whatsapp_instance_id", conversation.instance_name)
        .eq("phone_number", sourceContact.phone_number)
        .in("id", messageIds);
      if (messageError) return json({ error: "message_lookup_failed" }, 500);
      if ((selectedMessages || []).length !== messageIds.length) return json({ error: "message_selection_mismatch" }, 400);

      let forwardedCount = 0;
      const failedIds: string[] = [];
      for (const message of selectedMessages || []) {
        if (!message.external_id) {
          failedIds.push(message.id);
          continue;
        }
        try {
          const response = await evo(`/message/forwardMessage/${encodeURIComponent(conversation.instance_name)}`, {
            number: targetContact.phone_number,
            key: {
              remoteJid: sourceContact.remote_jid || `${sourceContact.phone_number}@s.whatsapp.net`,
              fromMe: typeof message.from_me === "boolean" ? message.from_me : message.direction === "outbound",
              id: message.external_id,
            },
          });
          const responseText = await response.text();
          let result: Record<string, unknown> = {};
          try {
            const parsed: unknown = responseText ? JSON.parse(responseText) : {};
            if (isRecord(parsed)) result = parsed;
          } catch {
            result = {};
          }
          if (!response.ok) {
            console.error("inbox_forward_provider_failed", JSON.stringify({ instance: conversation.instance_name, status: response.status, messageId: message.id }));
            failedIds.push(message.id);
            continue;
          }

          forwardedCount += 1;
          const nestedKeys = [result, result.data, result.message]
            .map((item) => isRecord(item) && isRecord(item.key) ? item.key.id : null);
          const externalId = String(nestedKeys.find((id): id is string => typeof id === "string") || "");
          const { data: savedMessage, error: saveError } = await admin.from("messages").insert({
            user_id: conversation.user_id,
            phone_number: targetContact.phone_number,
            direction: "outbound",
            kind: message.kind || "text",
            message_text: message.message_text,
            media_url: message.media_url,
            mime_type: message.mime_type,
            file_name: message.file_name,
            file_size_bytes: message.file_size_bytes,
            is_voice_note: message.kind === "audio" && message.is_voice_note === true,
            media_metadata: message.media_metadata || {},
            external_id: externalId || null,
            whatsapp_instance_id: conversation.instance_name,
            from_me: true,
            is_historical: false,
            delivery_status: "sent",
            sent_at: new Date().toISOString(),
          }).select("id").single();
          if (saveError || !savedMessage) {
            console.error("inbox_forward_history_save_failed", saveError?.message || "message_missing");
            continue;
          }
          const { error: historyError } = await admin.from("n8n_chat_histories").insert({
            user_id: conversation.user_id,
            phone_number: targetContact.phone_number,
            session_id: `${conversation.user_id}_${targetContact.phone_number}`,
            message: {
              type: "human",
              data: {
                content: message.message_text || "",
                kind: message.kind || "text",
                media_url: message.media_url,
                message_id: externalId || null,
                external_id: externalId || null,
                database_message_id: savedMessage.id,
                forwarded: true,
              },
            },
          });
          if (historyError) console.error("inbox_forward_history_insert_failed", historyError.message);
        } catch (error) {
          console.error("inbox_forward_failed", error instanceof Error ? error.message : "unknown_error");
          failedIds.push(message.id);
        }
      }
      return json({ ok: failedIds.length === 0, forwardedCount, failedCount: failedIds.length, failedIds }, failedIds.length && !forwardedCount ? 502 : 200);
    }

=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
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
