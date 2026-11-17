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

const json = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
    const messageIds = Array.isArray(body?.messageIds)
      ? [...new Set(body.messageIds.filter((id: unknown) => typeof id === "string"))].slice(0, 100)
      : [];
    if (!conversationId && !messageIds.length) return json({ error: "conversation_id_or_message_ids_required" }, 400);

    let newlyRead: {
      message_id?: string;
      user_id: string;
      whatsapp_instance_id: string;
      phone_number: string;
      external_id: string | null;
    }[] = [];
    let markedMessageIds: string[] = [];
    let unreadCountReconciled = !conversationId;

    if (conversationId) {
      const { data, error } = await supabase.rpc("mark_inbox_conversation_read", {
        p_conversation_id: conversationId,
      });
      if (!error) {
        newlyRead = data || [];
        markedMessageIds = newlyRead
          .map((message) => message.message_id)
          .filter((id): id is string => typeof id === "string");
        unreadCountReconciled = true;
      } else if (error.code === "PGRST202" || error.code === "42883") {
        const { data: conversation, error: conversationError } = await supabase
          .from("inbox_conversations")
          .select("id,user_id,instance_name,contact_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (conversationError || !conversation) {
          return json({ error: "conversation_not_accessible", details: conversationError?.message || null }, 403);
        }
        const { data: contact, error: contactError } = await supabase
          .from("whatsapp_contacts")
          .select("phone_number")
          .eq("id", conversation.contact_id)
          .eq("user_id", conversation.user_id)
          .maybeSingle();
        if (contactError || !contact?.phone_number) {
          return json({ error: "conversation_contact_not_found", details: contactError?.message || null }, 404);
        }

        for (let offset = 0; ; offset += 1000) {
          const { data: unreadMessages, error: unreadError } = await supabase
            .from("messages")
            .select("id")
            .eq("user_id", conversation.user_id)
            .eq("whatsapp_instance_id", conversation.instance_name)
            .eq("phone_number", contact.phone_number)
            .eq("direction", "inbound")
            .is("read_at", null)
            .or("and(or(from_me.is.null,from_me.eq.false),or(is_historical.is.null,is_historical.eq.false),or(delivery_status.is.null,delivery_status.neq.read))")
            .order("created_at", { ascending: true })
            .range(offset, offset + 999);
          if (unreadError) return json({ error: "unread_messages_fetch_failed", details: unreadError.message }, 403);
          const ids = (unreadMessages || [])
            .map((message) => message.id)
            .filter((id): id is string => typeof id === "string");
          markedMessageIds.push(...ids);
          for (let index = 0; index < ids.length; index += 100) {
            const { data: marked, error: markError } = await supabase.rpc("mark_inbox_messages_read", {
              p_message_ids: ids.slice(index, index + 100),
            });
            if (markError) return json({ error: "mark_read_failed", details: markError.message }, 403);
            newlyRead.push(...(marked || []));
          }
          if (ids.length < 1000) break;
        }

        const { data: resetConversation, error: resetError } = await admin
          .from("inbox_conversations")
          .update({ unread_count: 0 })
          .eq("id", conversationId)
          .eq("user_id", conversation.user_id)
          .select("id")
          .maybeSingle();
        unreadCountReconciled = !resetError && Boolean(resetConversation?.id);
      } else {
        return json({ error: "mark_read_failed", details: error.message }, 403);
      }
    } else {
      const { data, error } = await supabase.rpc("mark_inbox_messages_read", {
        p_message_ids: messageIds,
      });
      if (error) return json({ error: "mark_read_failed", details: error.message }, 403);
      newlyRead = data || [];
      markedMessageIds = messageIds;
    }

    const groups = new Map<string, { instanceName: string; phoneNumber: string; messages: { remoteJid: string; fromMe: boolean; id: string }[] }>();
    for (const message of newlyRead || []) {
      if (!message.external_id || !message.whatsapp_instance_id || !message.phone_number) continue;
      const key = `${message.whatsapp_instance_id}|${message.phone_number}`;
      const group = groups.get(key) || {
        instanceName: message.whatsapp_instance_id,
        phoneNumber: message.phone_number,
        messages: [],
      };
      group.messages.push({
        remoteJid: `${message.phone_number}@s.whatsapp.net`,
        fromMe: false,
        id: message.external_id,
      });
      groups.set(key, group);
    }

    let whatsappSynced = true;
    if (EVOLUTION_KEY) {
      for (const group of groups.values()) {
        for (let offset = 0; offset < group.messages.length; offset += 100) {
          try {
            const response = await fetch(`${EVOLUTION_URL}/chat/markMessageAsRead/${encodeURIComponent(group.instanceName)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
              body: JSON.stringify({ readMessages: group.messages.slice(offset, offset + 100) }),
              signal: AbortSignal.timeout(12000),
            });
            if (!response.ok) {
              whatsappSynced = false;
              console.error("Evolution read sync failed", group.instanceName, response.status, await response.text());
            }
          } catch (syncError) {
            whatsappSynced = false;
            console.error("Evolution read sync error", syncError);
          }
        }
      }
    } else if (groups.size) {
      whatsappSynced = false;
    }

    return json({
      ok: true,
      markedRead: (newlyRead || []).length,
      markedMessageIds,
      unreadCountReconciled,
      ...(conversationId && !unreadCountReconciled
        ? { warning: "unread_count_not_reconciled" }
        : {}),
      whatsappSynced,
    });
  } catch (error) {
    console.error("mark-conversation-read error", error);
    return json({ error: "internal_error" }, 500);
  }
});