import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ZEPTO_MAIL_API_KEY = Deno.env.get("ZEPTOMAIL_API_KEY") || "";
const ZEPTO_MAIL_ENDPOINT = Deno.env.get("ZEPTO_MAIL_ENDPOINT") || "https://api.zeptomail.com/v1.1/email";
const ZEPTO_MAIL_FROM = Deno.env.get("ZEPTO_MAIL_FROM") || "noreply@muwoyo.com";
const ZEPTO_MAIL_FROM_NAME = Deno.env.get("ZEPTO_MAIL_FROM_NAME") || "MUWOYO";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type TemplateType = "otp" | "welcome" | "trial_start" | "trial_expired" | "low_credits" | "password_reset";
type Body = { to?: { email: string; name?: string } | string; template_type?: TemplateType; template_data?: Record<string, unknown> };

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char));
}

function recipient(to: Body["to"]) {
  if (typeof to === "string") return { email: to, name: to };
  return { email: to?.email || "", name: to?.name || to?.email || "" };
}

function renderTemplate(type: TemplateType, data: Record<string, unknown>) {
  const name = escapeHtml(data.name || "Cliente");
  const remaining = escapeHtml(data.remaining ?? "0");
  const code = escapeHtml(data.code || "");
  const content: Record<TemplateType, { subject: string; title: string; body: string }> = {
    otp: { subject: "Confirme o seu e-mail na Muwoyo", title: "Confirme o seu e-mail", body: `<p>O seu código de confirmação é:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>Este código expira em 10 minutos.</p>` },
    welcome: { subject: "Bem-vindo à Muwoyo", title: "É um prazer receber você", body: `<p>Olá, ${name}.</p><p>Seja muito bem-vindo à Muwoyo. A sua conta foi confirmada com sucesso e estamos felizes por acompanhar o crescimento do seu negócio.</p><p>A partir de agora, pode configurar as informações da sua empresa, organizar os seus produtos e preparar o atendimento no WhatsApp com mais tranquilidade.</p><p>Conte connosco para tornar o seu atendimento mais rápido, organizado e disponível.</p>` },
    trial_start: { subject: "O seu teste gratuito Muwoyo começou", title: "Comece a explorar a Muwoyo", body: `<p>Olá, ${name}.</p><p>O seu período de teste gratuito começou. Você já tem 50 mensagens para conhecer a Inteligência Artificial da Muwoyo e perceber como ela pode ajudar no atendimento aos seus clientes.</p><p>Use este momento para configurar o seu negócio, adicionar os seus produtos e experimentar uma experiência de atendimento mais simples e eficiente.</p><p>O seu saldo atual é de <strong>${remaining}</strong> mensagens. Estamos aqui para ajudar em cada etapa.</p>` },
    trial_expired: { subject: "O seu teste Muwoyo chegou ao fim", title: "Obrigado por experimentar a Muwoyo", body: `<p>Olá, ${name}.</p><p>Esperamos que o período de teste tenha ajudado você a conhecer melhor as possibilidades da Muwoyo.</p><p>As suas mensagens gratuitas terminaram. Para continuar a atender os seus clientes com a Inteligência Artificial, conclua a ativação da sua conta.</p><p>Quando estiver pronto, a nossa equipa estará disponível para ajudar você a dar o próximo passo.</p>` },
    low_credits: { subject: "O seu saldo Muwoyo está quase a terminar", title: "Está quase na hora de recarregar", body: `<p>Olá, ${name}.</p><p>O seu saldo está a chegar ao fim e restam apenas <strong>${remaining}</strong> mensagens.</p><p>Para manter o atendimento da sua empresa sem interrupções, pode escolher uma recarga no painel quando for conveniente.</p><p>Assim, a Muwoyo continua disponível para acompanhar os seus clientes e as suas oportunidades.</p>` },
    password_reset: { subject: "Código para recuperar a sua senha Muwoyo", title: "Recuperação de senha", body: `<p>Olá, ${name}.</p><p>Recebemos um pedido para recuperar o acesso à sua conta.</p><p>O seu código de 6 dígitos é:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>Este código expira em 10 minutos. Se não fez este pedido, ignore este email.</p>` },
  };
  const selected = content[type];
  return {
    subject: selected.subject,
    htmlbody: `<div style="margin:0;background:#f4f8f6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#172033"><div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #dce9e2;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(23,32,51,.06)"><div style="padding:28px 32px;background:#173c32;color:#ffffff"><div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#b9e8c6;font-weight:700">MUWOYO</div><h1 style="margin:10px 0 0;font-size:26px;line-height:1.2">${selected.title}</h1></div><div style="padding:32px;line-height:1.7;font-size:16px">${selected.body}<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5eee9;color:#718078;font-size:13px">Este email foi enviado pela Muwoyo. Se não reconhece esta atividade, pode ignorar esta mensagem.</div></div></div></div>`
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!SUPABASE_SERVICE_ROLE_KEY || authorization !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) return json({ success: false, error: "unauthorized" }, 401);
  if (!ZEPTO_MAIL_API_KEY) return json({ success: false, error: "not_configured" }, 503);

  try {
    const body = await req.json() as Body;
    const to = recipient(body.to);
    if (!to.email || !body.template_type) return json({ success: false, error: "invalid_payload" }, 400);
    const template = renderTemplate(body.template_type, body.template_data || {});
    const response = await fetch(ZEPTO_MAIL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Zoho-enczapikey ${ZEPTO_MAIL_API_KEY}` },
      body: JSON.stringify({ from: { address: ZEPTO_MAIL_FROM, name: ZEPTO_MAIL_FROM_NAME }, to: [{ email_address: { address: to.email, name: to.name } }], subject: template.subject, htmlbody: template.htmlbody }),
    });
    if (!response.ok) {
      console.error("ZeptoMail error", response.status, await response.text());
      return json({ success: false, error: "provider_error" }, 502);
    }
    return json({ success: true });
  } catch (error) {
    console.error("send-email error", error);
    return json({ success: false, error: "temporary_error" }, 500);
  }
});
