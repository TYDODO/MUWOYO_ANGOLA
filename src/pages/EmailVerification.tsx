import { ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { supabase } from "@/integrations/supabase/client";
import { resendVerificationCode, verifyEmailCode, type EmailVerificationError } from "@/lib/email-verification";
import logo from "@/assets/muwoyo-logo.png";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

function errorMessage(error: EmailVerificationError) {
  switch (error) {
    case "invalid_code": return "O código está incorreto. Tente novamente.";
    case "expired_code": return "Este código expirou. Solicite um novo código.";
    case "too_many_attempts": return "O limite de tentativas foi atingido. Solicite um novo código mais tarde.";
    case "resend_cooldown": return "Aguarde alguns segundos antes de solicitar outro código.";
    case "unauthorized": return "A sua sessão expirou. Entre novamente para confirmar o e-mail.";
    case "not_configured": return "A confirmação por código ainda não está disponível. O backend de verificação será ligado posteriormente.";
    default: return "Ocorreu um erro temporário. Tente novamente.";
  }
}

export default function EmailVerification() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const location = useLocation();
  const navigate = useNavigate();
  const stateEmail = (location.state as { email?: string } | null)?.email;
  const initialSend = Boolean((location.state as { initialSend?: boolean } | null)?.initialSend);
  const emailChange = Boolean((location.state as { emailChange?: boolean } | null)?.emailChange);
  const email = stateEmail || user?.email || window.sessionStorage.getItem("muwoyo_pending_email") || "";
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [error, setError] = useState<EmailVerificationError | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const initialSendStarted = useRef(false);

  useEffect(() => {
    if (!roleLoading && role === "admin") navigate("/admin", { replace: true });
    if (!roleLoading && role === "sub_admin") navigate("/gestor", { replace: true });
  }, [navigate, role, roleLoading]);

  useEffect(() => {
    if (!initialSend || initialSendStarted.current) return;
    initialSendStarted.current = true;
    resendVerificationCode(email).then((result) => {
      if (result.success) setCooldown(RESEND_COOLDOWN_SECONDS);
      else setError(result.error);
    });
  }, [initialSend, email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const code = digits.join("");
  const updateDigits = (value: string, index: number) => {
    const numbers = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = numbers;
    setDigits(next);
    setStatus("idle");
    setError(null);
    if (numbers && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    setDigits([...pasted.split(""), ...Array(CODE_LENGTH - pasted.length).fill("")]);
    inputs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  const confirm = async () => {
    if (code.length !== CODE_LENGTH) return;
    setStatus("verifying");
    setError(null);
    const result = await verifyEmailCode(code, email);
    if (result.success) {
      await supabase.auth.refreshSession();
      setStatus("success");
      window.sessionStorage.removeItem("muwoyo_pending_email");
      window.setTimeout(() => navigate(emailChange ? "/dashboard" : "/dashboard", { replace: true }), 500);
    } else {
      setStatus("error");
      setError(result.error);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    const result = await resendVerificationCode(email);
    setResending(false);
    if (result.success) {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setDigits(Array(CODE_LENGTH).fill(""));
      setStatus("idle");
      setError(null);
    } else {
      setStatus("error");
      setError(result.error);
    }
  };

  if (roleLoading || role === "admin" || role === "sub_admin") {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <img src={logo} alt="Muwoyo" className="mx-auto mb-3 h-14 w-14 object-contain" />
          <MailCheck className="mx-auto mb-3 h-8 w-8 text-primary" />
          <CardTitle className="text-2xl">{emailChange ? "Confirme o novo email" : "Confirme o seu e-mail"}</CardTitle>
          <p className="text-sm text-muted-foreground">Enviámos um código de confirmação de 6 dígitos para:</p>
          <p className="font-semibold text-foreground">{maskEmail(email)}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-center text-sm text-muted-foreground">Digite o código abaixo para continuar.</p>
          <div className="flex justify-center gap-2" aria-label="Código de confirmação">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(input) => { inputs.current[index] = input; }}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(event) => updateDigits(event.target.value, index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onPaste={handlePaste}
                className="h-12 w-10 rounded-md border border-input bg-background text-center text-xl font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-label={`Dígito ${index + 1}`}
              />
            ))}
          </div>
          {error && <p className="text-center text-sm text-destructive">{errorMessage(error)}</p>}
          {status === "success" && <p className="text-center text-sm text-primary">E-mail confirmado. A abrir o dashboard...</p>}
          <Button className="w-full" disabled={code.length !== CODE_LENGTH || status === "verifying" || status === "success"} onClick={confirm}>
            {status === "verifying" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando...</> : "Confirmar e-mail"}
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            <p>Não recebeu o código?</p>
            <button type="button" className="mt-1 font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50" disabled={cooldown > 0 || resending} onClick={resend}>
              {resending ? "Reenviando código..." : cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}