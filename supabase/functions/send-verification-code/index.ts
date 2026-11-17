import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-email`;
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type VerificationIdentity = { id: string; email: string | null; user_metadata?: Record<string, unknown> };

async function getUser(req: Request): Promise<VerificationIdentity | null> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user as VerificationIdentity;
}

async function getRequestIdentity(req: Request, admin: ReturnType<typeof createClient>, body: { email?: unknown }): Promise<VerificationIdentity | null> {
  const user = await getUser(req);
  if (user) return user;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return null;
  const { data: profile } = await admin.from("profiles").select("user_id,email,full_name").eq("email", email).maybeSingle();
  const { data: member } = profile?.user_id
    ? { data: null }
    : await admin.from("business_members").select("user_id,email,name").ilike("email", email).eq("status", "pending").maybeSingle();
  const userId = profile?.user_id || member?.user_id;
  if (!userId) return null;
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  return authUser.user as VerificationIdentity | null || {
    id: userId,
    email,
    user_metadata: { full_name: profile?.full_name || member?.name || email },
  };
}

function randomCode() {
  const values = new Uint32Array(1);
  const limit = 4_294_000_000;
  let value: number;
  do {
    crypto.getRandomValues(values);
    value = values[0];
  } while (value >= limit);
  return String(value % 1_000_000).padStart(6, "0");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const correlationId = crypto.randomUUID();

  try {
    const body = await req.clone().json().catch(() => ({})) as { email?: unknown };
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await getRequestIdentity(req, admin, body);
    if (!user?.email) return json({ success: false, error: "unauthorized" }, 401);
    if (body.email !== undefined && (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))) {
      return json({ success: false, error: "invalid_email" }, 400);
    }
    const targetEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : user.email;
    const { data: latest, error: latestError } = await admin
      .from("email_verifications")
      .select("id,last_sent_at,consumed_at")
      .eq("user_id", user.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      console.error("Could not check verification resend cooldown", { correlationId, error: latestError.message.slice(0, 300) });
      return json({ success: false, error: "temporary_error", correlation_id: correlationId }, 500);
    }
    if (latest?.last_sent_at && Date.now() - new Date(latest.last_sent_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      const retryAfter = Math.max(1, Math.ceil(RESEND_COOLDOWN_SECONDS - (Date.now() - new Date(latest.last_sent_at).getTime()) / 1000));
      return new Response(JSON.stringify({ success: false, error: "resend_cooldown", retry_after_seconds: retryAfter }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter) },
      });
    }

    const { error: consumePreviousError } = await admin.from("email_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("consumed_at", null);
    if (consumePreviousError) {
      console.error("Could not invalidate previous verification codes", { correlationId, error: consumePreviousError.message.slice(0, 300) });
      return json({ success: false, error: "temporary_error", correlation_id: correlationId }, 500);
    }

    const code = randomCode();
    const codeHash = await sha256(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
    const fullName = user.user_metadata?.full_name;
    const recipientName = typeof fullName === "string" ? fullName : targetEmail;
    const { error: insertError } = await admin.from("email_verifications").insert({
      user_id: user.id,
      email: targetEmail,
      code_hash: codeHash,
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString(),
    });
    if (insertError) return json({ success: false, error: "temporary_error" }, 500);

    const response = await fetch(INTERNAL_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify({
        to: { email: targetEmail, name: recipientName },
        template_type: "otp",
        template_data: { code },
      }),
      signal: AbortSignal.timeout(40000),
    });

    if (!response.ok) {
      const deliveryResult = await response.json().catch(() => null);
      const deliveryError = typeof deliveryResult?.error === "string" ? deliveryResult.error : "unknown";
      console.error("send-email rejected verification email", { correlationId, status: response.status, error: deliveryError });
      if (deliveryError !== "provider_temporary_error" && deliveryError !== "temporary_error") {
        const { error: consumeError } = await admin.from("email_verifications")
          .update({ consumed_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("code_hash", codeHash);
        if (consumeError) console.error("Failed to consume undelivered verification code", { correlationId, error: consumeError.message.slice(0, 300) });
      }
      return json({
        success: false,
        error: deliveryError === "provider_temporary_error" || deliveryError === "temporary_error" ? "temporary_error" : "delivery_failed",
        correlation_id: correlationId,
      }, deliveryError === "provider_temporary_error" || deliveryError === "temporary_error" ? 503 : 502);
    }

    return json({ success: true, correlation_id: correlationId });
  } catch (error) {
    console.error("send-verification-code error", {
      correlationId,
      error: error instanceof Error ? error.name : "unknown_error",
      detail: (error instanceof Error ? error.message : "unexpected_error")
        .split(SUPABASE_SERVICE_ROLE_KEY || "\u0000").join("[redacted]")
        .slice(0, 500),
    });
    return json({ success: false, error: "temporary_error", correlation_id: correlationId }, 500);
  }
});
