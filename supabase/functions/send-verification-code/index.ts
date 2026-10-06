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

async function getUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user;
}

async function getRequestIdentity(req: Request, admin: ReturnType<typeof createClient>, body: any) {
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
  return authUser.user || { id: userId, email, user_metadata: { full_name: profile?.full_name || member?.name || email } } as any;
}

function randomCode() {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString().slice(-6).padStart(6, "0");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.clone().json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await getRequestIdentity(req, admin, body);
    if (!user?.email) return json({ success: false, error: "unauthorized" }, 401);
    const targetEmail = typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ? body.email.trim().toLowerCase() : user.email;
    const { data: latest } = await admin
      .from("email_verifications")
      .select("id,last_sent_at,consumed_at")
      .eq("user_id", user.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest?.last_sent_at && Date.now() - new Date(latest.last_sent_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      return json({ success: false, error: "resend_cooldown" }, 429);
    }

    await admin.from("email_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("consumed_at", null);

    const code = randomCode();
    const codeHash = await sha256(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        to: { email: targetEmail, name: user.user_metadata?.full_name || targetEmail },
        template_type: "otp",
        template_data: { code },
      }),
    });

    if (!response.ok) {
      console.error("ZeptoMail rejected verification email", response.status);
      await admin.from("email_verifications").update({ consumed_at: new Date().toISOString() }).eq("user_id", user.id).eq("code_hash", codeHash);
      return json({ success: false, error: "temporary_error" }, 502);
    }

    return json({ success: true });
  } catch (error) {
    console.error("send-verification-code error", error);
    return json({ success: false, error: "temporary_error" }, 500);
  }
});
