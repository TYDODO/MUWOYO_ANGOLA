import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEB_PUSH_BACKEND_URL = Deno.env.get("WEB_PUSH_BACKEND_URL") || "";
const WEB_PUSH_BACKEND_TOKEN = Deno.env.get("WEB_PUSH_BACKEND_TOKEN") || "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function updateQueue(notificationId: string, processed: boolean, lastError: string | null) {
  const { error } = await admin
    .from("push_dispatch_queue")
    .update({ processed, last_error: lastError })
    .eq("notification_id", notificationId);
  if (error) console.error("push queue status update failed", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SERVICE_KEY || req.headers.get("Authorization") !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const notificationId = typeof body.notification_id === "string" ? body.notification_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
      return json({ error: "invalid_notification_id" }, 400);
    }

    if (!WEB_PUSH_BACKEND_URL || !WEB_PUSH_BACKEND_TOKEN) {
      await updateQueue(notificationId, false, "push_backend_not_configured");
      return json({ error: "push_backend_not_configured" }, 503);
    }

    const { data: notification, error: notificationError } = await admin
      .from("notifications")
      .select("id,user_id,title,message,image_url,link,type,created_at")
      .eq("id", notificationId)
      .maybeSingle();
    if (notificationError) {
      await updateQueue(notificationId, false, "notification_lookup_failed");
      return json({ error: "notification_lookup_failed" }, 500);
    }
    if (!notification) {
      await updateQueue(notificationId, true, "notification_not_found");
      return json({ error: "notification not found" }, 404);
    }

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("web_push_subscriptions")
      .select("endpoint,p256dh,auth,user_id")
      .eq("user_id", notification.user_id);
    if (subscriptionsError) {
      await updateQueue(notificationId, false, "subscription_lookup_failed");
      return json({ error: "subscription_lookup_failed" }, 500);
    }

    const dispatches = await Promise.all(
      (subscriptions || []).map(async (subscription: any) => {
        const payload = {
          title: notification.title || "Muwoyo",
          body: notification.message || "",
          icon: notification.image_url || "/favicon.ico",
          url: notification.link || "/dashboard",
        };

        try {
          const response = await fetch(`${WEB_PUSH_BACKEND_URL}/api/push/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${WEB_PUSH_BACKEND_TOKEN}` },
            body: JSON.stringify({
              user_id: subscription.user_id,
              subscription: {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth,
                },
              },
              data: payload,
            }),
          });
          if (response.status === 404 || response.status === 410) {
            await admin.from("web_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
          }
          return { status: response.status, ok: response.ok };
        } catch {
          return { status: 0, ok: false };
        }
      }),
    );

    const failed = dispatches.filter((dispatch) => !dispatch.ok);
    await updateQueue(notificationId, failed.length === 0, failed.length ? `push_delivery_failed:${failed.length}` : null);
    return json({ ok: failed.length === 0, notification_id: notification.id, sent: dispatches.length - failed.length, failed: failed.length }, failed.length ? 502 : 200);
  } catch (error: any) {
    console.error("push-dispatch error", error);
    return json({ error: error?.message || "internal" }, 500);
  }
});
