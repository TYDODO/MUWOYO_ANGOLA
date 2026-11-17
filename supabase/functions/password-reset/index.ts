import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CODE_TTL_MINUTES = 10;
const TOKEN_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function randomDigits() {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString().slice(-6).padStart(6, "0");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function getAccount(admin: ReturnType<typeof createClient>, email: string) {
  const { data: profile } = await admin.from("profiles").select("user_id,email,full_name").ilike("email", email).maybeSingle();
  if (!profile?.user_id) return null;
  const { data } = await admin.auth.admin.getUserById(profile.user_id);
  return { id: profile.user_id, email: data.user?.email || profile.email, name: profile.full_name || profile.email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "request";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (action === "request") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ success: false, error: "invalid_email" }, 400);
      const account = await getAccount(admin, email);
      // Do not reveal whether an email exists in the system.
      if (!account) return json({ success: true });
      const { data: latest } = await admin.from("password_reset_codes").select("last_sent_at").eq("user_id", account.id).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latest?.last_sent_at && Date.now() - new Date(latest.last_sent_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) return json({ success: false, error: "resend_cooldown" }, 429);

      await admin.from("password_reset_codes").update({ consumed_at: new Date().toISOString() }).eq("user_id", account.id).is("consumed_at", null);
      const code = randomDigits();
      const { error } = await admin.from("password_reset_codes").insert({ user_id: account.id, email: account.email, code_hash: await sha256(code), expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString() });
      if (error) return json({ success: false, error: "temporary_error" }, 500);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ to: { email: account.email, name: account.name }, template_type: "password_reset", template_data: { name: account.name, code } }),
      });
      if (!response.ok) return json({ success: false, error: "temporary_error" }, 502);
      return json({ success: true });
    }

    if (action === "verify") {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!/^\d{6}$/.test(code) || !email) return json({ success: false, error: "invalid_code" }, 400);
      const account = await getAccount(admin, email);
      if (!account) return json({ success: false, error: "invalid_code" }, 400);
      const { data: record } = await admin.from("password_reset_codes").select("id,code_hash,expires_at,attempts,max_attempts").eq("user_id", account.id).eq("email", account.email).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!record || new Date(record.expires_at).getTime() <= Date.now()) return json({ success: false, error: "expired_code" }, 400);
      if (record.attempts >= record.max_attempts) return json({ success: false, error: "too_many_attempts" }, 429);
      if (await sha256(code) !== record.code_hash) {
        const attempts = record.attempts + 1;
        await admin.from("password_reset_codes").update({ attempts }).eq("id", record.id);
        return json({ success: false, error: attempts >= record.max_attempts ? "too_many_attempts" : "invalid_code" }, 400);
      }
      await admin.from("password_reset_codes").update({ consumed_at: new Date().toISOString() }).eq("id", record.id);
      const rawToken = crypto.randomUUID() + crypto.randomUUID();
      await admin.from("password_reset_tokens").insert({ user_id: account.id, token_hash: await sha256(rawToken), expires_at: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString() });
      return json({ success: true, reset_token: rawToken });
    }

    if (action === "update") {
      const token = typeof body.reset_token === "string" ? body.reset_token : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 6 || !token) return json({ success: false, error: "invalid_password" }, 400);
      const { data: reset } = await admin.from("password_reset_tokens").select("id,user_id,expires_at").eq("token_hash", await sha256(token)).is("consumed_at", null).maybeSingle();
      if (!reset || new Date(reset.expires_at).getTime() <= Date.now()) return json({ success: false, error: "expired_token" }, 400);
      const { error } = await admin.auth.admin.updateUserById(reset.user_id, { password });
      if (error) return json({ success: false, error: "password_update_failed" }, 400);
      await admin.from("password_reset_tokens").update({ consumed_at: new Date().toISOString() }).eq("id", reset.id);
      return json({ success: true });
    }
    return json({ success: false, error: "invalid_action" }, 400);
  } catch (error) {
    console.error("password-reset error", error);
    return json({ success: false, error: "temporary_error" }, 500);
  }
});
