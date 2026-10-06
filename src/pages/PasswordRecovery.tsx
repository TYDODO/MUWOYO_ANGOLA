import { FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/muwoyo-logo.png";
import { supabase } from "@/integrations/supabase/client";

export default function PasswordRecovery() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const codeInputs = useRef<Array<HTMLInputElement | null>>([]);

  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("password-reset", { body: { action: "request", email } });
    setSubmitting(false);
    if (error || data?.error) {
      toast({ title: "Não foi possível enviar o código", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    setStep("code");
    toast({ title: "Código enviado", description: "Verifique o seu email e introduza o código de 6 dígitos." });
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("password-reset", { body: { action: "verify", email, code } });
    setSubmitting(false);
    if (error || data?.error || !data?.reset_token) {
      toast({ title: "Código inválido", description: data?.error || error?.message || "Confirme o código recebido.", variant: "destructive" });
      return;
    }
    setResetToken(data.reset_token);
    setStep("password");
  };

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 6 || password !== confirmation) {
      toast({ title: "Confirme a nova senha", description: "Use pelo menos 6 caracteres e repita a senha corretamente.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("password-reset", { body: { action: "update", reset_token: resetToken, password } });
    setSubmitting(false);
    if (error || data?.error) {
      toast({ title: "Não foi possível atualizar a senha", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    setUpdated(true);
  };

  if (updated) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-4"><Card className="w-full max-w-md text-center shadow-xl"><CardContent className="space-y-4 p-8"><CheckCircle2 className="mx-auto h-12 w-12 text-primary" /><h1 className="text-2xl font-bold">Senha atualizada</h1><p className="text-sm text-muted-foreground">A sua senha foi alterada. Já pode entrar novamente.</p><Button className="w-full" onClick={() => navigate("/login", { replace: true })}>Voltar ao login</Button></CardContent></Card></div>;
  }

  const title = step === "password" ? "Definir nova senha" : step === "code" ? "Confirmar código" : "Recuperar password";
  const description = step === "password" ? "Escolha uma senha nova para voltar a aceder à sua conta." : step === "code" ? "Introduza o código de 6 dígitos enviado para o seu email." : "Enviaremos um código de 6 dígitos para o seu email.";
  return <div className="flex min-h-screen items-center justify-center bg-background p-4"><Card className="w-full max-w-md shadow-xl"><CardHeader className="space-y-3 text-center"><img src={logo} alt="Muwoyo" className="mx-auto h-14 w-14 object-contain" /><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></div><CardTitle>{title}</CardTitle><p className="text-sm text-muted-foreground">{description}</p></CardHeader><CardContent>{step === "password" ? <form className="space-y-4" onSubmit={updatePassword}><Input type="password" minLength={8} required placeholder="Nova senha" value={password} onChange={(event) => setPassword(event.target.value)} /><Input type="password" minLength={8} required placeholder="Repetir nova senha" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /><Button className="w-full" disabled={submitting}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{submitting ? "A guardar..." : "Atualizar senha"}</Button></form> : step === "code" ? <form className="space-y-4" onSubmit={verifyCode}><div className="flex justify-center gap-2" aria-label="Código de 6 dígitos">{Array.from({ length: 6 }, (_, index) => <Input key={index} ref={(element) => { codeInputs.current[index] = element; }} inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} maxLength={1} required value={code[index] || ""} onChange={(event) => { const digit = event.target.value.replace(/\D/g, ""); const next = code.split(""); next[index] = digit; setCode(next.join("").slice(0, 6)); if (digit && index < 5) codeInputs.current[index + 1]?.focus(); }} onKeyDown={(event) => { if (event.key === "Backspace" && !code[index] && index > 0) codeInputs.current[index - 1]?.focus(); }} className="h-12 w-10 p-0 text-center text-lg font-semibold" aria-label={`Dígito ${index + 1}`} />)}</div><Button className="w-full" disabled={submitting || code.length !== 6}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{submitting ? "A validar..." : "Confirmar código"}</Button></form> : <form className="space-y-4" onSubmit={requestReset}><Input type="email" required autoComplete="email" placeholder="O seu email" value={email} onChange={(event) => setEmail(event.target.value)} /><Button className="w-full" disabled={submitting}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{submitting ? "A enviar..." : "Enviar código"}</Button></form>}<Button variant="ghost" className="mt-4 w-full" onClick={() => navigate("/login")}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao login</Button></CardContent></Card></div>;
}
