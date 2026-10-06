import { supabase } from "@/integrations/supabase/client";

export const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export function isValidVapidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return urlBase64ToUint8Array(value).length === 65;
  } catch {
    return false;
  }
}

export async function persistPushSubscriptionToSupabase(userId: string | null, subscription: PushSubscription) {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");

  const payload = {
    user_id: userId,
    endpoint: subscription.endpoint,
    keys: {
      p256dh: p256dh ? btoa(String.fromCharCode(...new Uint8Array(p256dh))) : null,
      auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : null,
    },
  };

  const { data, error } = await supabase.functions.invoke("subscribe", {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || "Falha ao persistir a subscription do browser.");
  }

  return data || payload;
}

export async function notifyBrowserFromApp(title: string, message: string, icon?: string, url?: string) {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body: message,
    icon: icon || "/favicon.ico",
    badge: icon || "/favicon.ico",
    data: { url: url || "/dashboard" },
  });
}

export async function initWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return {
      ok: false,
      reason: "Este navegador não suporta Web Push API.",
    };
  }

  if (!("Notification" in window)) {
    return {
      ok: false,
      reason: "Este navegador não suporta notificações nativas.",
    };
  }

  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));

  if (isIos && !isStandalone) {
    return {
      ok: false,
      reason: "No iPhone/iPad, instale a Muwoyo no ecrã principal e abra a app instalada para ativar notificações.",
    };
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || import.meta.env.VAPID_PUBLIC_KEY;
  if (!isValidVapidPublicKey(vapidPublicKey)) {
    return {
      ok: false,
      reason: "A chave pública VAPID não está configurada no ambiente de produção.",
    };
  }

  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted") {
    return {
      ok: false,
      reason: permission === "denied"
        ? "As notificações estão bloqueadas neste dispositivo. Ative-as nas definições do navegador e tente novamente."
        : "A permissão de notificações não foi concluída.",
    };
  }

  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const registration = await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.getSubscription() ||
    await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  await persistPushSubscriptionToSupabase(session?.user?.id || null, subscription);
  // Subscription is persisted via Supabase client (RLS allows the user to insert their own subscription).

  return {
    ok: true,
    subscription,
  };
}
