import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const messageIds = Array.isArray(body?.messageIds)
      ? [...new Set(body.messageIds.filter((id: unknown) => typeof id === "string"))].slice(0, 100)
      : [];
    if (!messageIds.length) return json({ error: "message_ids_required" }, 400);

    const { data: newlyRead, error } = await supabase.rpc("mark_inbox_messages_read", {
      p_message_ids: messageIds,
    });
    if (error) return json({ error: "mark_read_failed", details: error.message }, 403);

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
        try {
          const response = await fetch(`${EVOLUTION_URL}/chat/markMessageAsRead/${encodeURIComponent(group.instanceName)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
            body: JSON.stringify({ readMessages: group.messages }),
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
    } else if (groups.size) {
      whatsappSynced = false;
    }

    return json({ ok: true, markedRead: (newlyRead || []).length, whatsappSynced });
  } catch (error) {
    console.error("mark-conversation-read error", error);
    return json({ error: "internal_error" }, 500);
  }
});