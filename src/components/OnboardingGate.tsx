import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import BusinessHoursConfig from "@/components/BusinessHoursConfig";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { LegalAcceptance } from "@/components/LegalAcceptance";
import logo from "@/assets/muwoyo-logo.png";
import { useToast } from "@/hooks/use-toast";
import { clearBusinessInfoDraft, readBusinessInfoDraft, writeBusinessInfoDraft } from "@/lib/business-info-draft";

type Field = {
  key: keyof Form;
  label: string;
  placeholder: string;
  type?: "text" | "textarea" | "select";
  options?: string[];
  help?: string;
};
type Form = {
  acquisition_source: string;
  business_name: string;
  ai_name: string;
  transfer_phone: string;
  ai_personality: string;
  business_description: string;
  ai_rules: string;
  business_hours: Record<string, { open: boolean; start_time: string; end_time: string }>;
  appointment_duration_minutes: number;
  accepts_appointments: boolean;
};

const STEPS: Field[] = [
  {
    key: "acquisition_source",
    label: "Onde ouviu falar da Muwoyo?",
    placeholder: "Selecione uma opção",
    type: "select",
    options: ["TikTok", "Facebook", "Google", "ChatGPT", "Amigo ou familiar", "Outro"],
  },
  {
    key: "business_name",
    label: "Qual é o nome da sua empresa?",
    placeholder: "Ex: Boutique Cabinda",
    help: "É o nome que a IA vai usar nas conversas.",
  },
  {
    key: "ai_name",
    label: "Que nome vai dar à sua atendente virtual?",
    placeholder: "Ex: Joana",
    help: "É como os clientes vão chamar a sua IA.",
  },
  {
    key: "transfer_phone",
    label: "Qual é o número para transferir para atendimento humano?",
    placeholder: "Ex: +244 9xx xxx xxx",
    help: "Este número aparece quando a IA precisa encaminhar para pessoa real.",
  },
  {
    key: "ai_personality",
    label: "Como deve ser a personalidade da IA?",
    placeholder: "Amigável, profissional, persuasiva, formal…",
    type: "textarea",
    help: "Descreva o tom da sua atendente virtual.",
  },
  {
    key: "business_description",
    label: "Conte sobre o seu negócio",
    placeholder: "Horários, serviços, formas de pagamento, localização…",
    type: "textarea",
    help: "Quanto mais detalhe, melhor a IA responde.",
  },
  {
    key: "ai_rules",
    label: "Que regras a IA deve seguir?",
    placeholder:
      "Tom amigável, nunca prometer prazos, encaminhar para humano se pedir reembolso…",
    type: "textarea",
    help: "Defina limites e estilo de atendimento.",
  },
];

export default function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(true);
  const [step, setStep] = useState(-1);
  const [showLegalAcceptance, setShowLegalAcceptance] = useState(false);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [form, setForm] = useState<Form>({
    acquisition_source: "",
    business_name: "",
    ai_name: "Muwoyo",
    transfer_phone: "",
    ai_personality: "",
    business_description: "",
    ai_rules: "",
    business_hours: {
      monday: { open: false, start_time: "08:00", end_time: "17:00" },
      tuesday: { open: false, start_time: "08:00", end_time: "17:00" },
      wednesday: { open: false, start_time: "08:00", end_time: "17:00" },
      thursday: { open: false, start_time: "08:00", end_time: "17:00" },
      friday: { open: false, start_time: "08:00", end_time: "17:00" },
      saturday: { open: false, start_time: "09:00", end_time: "14:00" },
      sunday: { open: false, start_time: "", end_time: "" },
    },
    appointment_duration_minutes: 30,
    accepts_appointments: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select(
        "onboarding_completed,acquisition_source,business_name,ai_name,transfer_phone,ai_personality,business_description,ai_rules,business_hours,appointment_duration_minutes,accepts_appointments",
      )
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        const draft = readBusinessInfoDraft(user.id) || {};
        const savedState = window.localStorage.getItem(`muwoyo-onboarding-state-${user.id}`);
        let onboardingState: { step?: number; legal?: boolean } = {};
        try { onboardingState = savedState ? JSON.parse(savedState) : {}; } catch { window.localStorage.removeItem(`muwoyo-onboarding-state-${user.id}`); }
        setDone(!!data?.onboarding_completed);
        setStep(typeof onboardingState.step === "number" ? Math.min(Math.max(onboardingState.step, -1), STEPS.length - 1) : -1);
        setShowLegalAcceptance(onboardingState.legal === true);
        setForm({
          acquisition_source: draft.acquisition_source ?? data?.acquisition_source ?? "",
          business_name: draft.business_name ?? data?.business_name ?? "",
          ai_name: draft.ai_name ?? data?.ai_name ?? "Muwoyo",
          transfer_phone: draft.transfer_phone ?? data?.transfer_phone ?? "",
          ai_personality: draft.ai_personality ?? data?.ai_personality ?? "",
          business_description: draft.business_description ?? data?.business_description ?? "",
          ai_rules: draft.ai_rules ?? data?.ai_rules ?? "",
          business_hours: draft.business_hours ?? data?.business_hours ?? form.business_hours,
          appointment_duration_minutes: Number(draft.appointment_duration_minutes ?? data?.appointment_duration_minutes ?? 30),
          accepts_appointments: draft.accepts_appointments ?? data?.accepts_appointments ?? true,
        });
        setStateLoaded(true);
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (user && !done) writeBusinessInfoDraft(user.id, form);
  }, [user, form, done]);

  useEffect(() => {
    if (!user || !stateLoaded || done) return;
    window.localStorage.setItem(`muwoyo-onboarding-state-${user.id}`, JSON.stringify({ step, legal: showLegalAcceptance }));
  }, [user, stateLoaded, done, step, showLegalAcceptance]);

  if (roleLoading || loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "sub_admin") return <Navigate to="/gestor" replace />;
  if (done) return <>{children}</>;

  // Show legal acceptance after form completion
  if (showLegalAcceptance) {
    return (
      <LegalAcceptance
        userId={user!.id}
        onComplete={async () => {
          if (!user) return;

          // Mark onboarding as completed and send welcome notifications
          const { error } = await supabase
            .from("profiles")
            .update({
              onboarding_completed: true,
            })
            .eq("user_id", user.id);

          if (error) {
            toast({ title: "Não foi possível concluir o onboarding", description: error.message, variant: "destructive" });
            return;
          }

          clearBusinessInfoDraft(user.id);
          window.localStorage.removeItem(`muwoyo-onboarding-state-${user.id}`);

          setDone(true);
        }}
        onReject={() => {
          // Account is already suspended by LegalAcceptance component
          window.location.href = "/";
        }}
      />
    );
  }

  const next = async (e: FormEvent) => {
    e.preventDefault();
    if (current.key === "transfer_phone") {
      const digits = form.transfer_phone.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) {
        toast({ title: "Número inválido", description: "Introduza um número com 7 a 15 dígitos.", variant: "destructive" });
        return;
      }
      setForm((currentForm) => ({ ...currentForm, transfer_phone: digits }));
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        ...form,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Não foi possível guardar os dados", description: error.message, variant: "destructive" });
      return;
    }
    writeBusinessInfoDraft(user.id, form);
    setShowLegalAcceptance(true);
  };

  // Welcome screen
  if (step === -1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="mx-auto w-full max-w-lg text-center space-y-6">
          <img
            src={logo}
            alt="Muwoyo"
            className="mx-auto h-24 w-24 object-contain"
          />
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">
              Seja muito bem-vindo(a) à Muwoyo
            </h1>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg leading-relaxed">
              Precisamos que nos forneça algumas informações sobre o seu negócio
              para poder conectar o seu WhatsApp e a nossa IA começar a
              responder instantaneamente com as informações da sua empresa.
            </p>
          </div>
          <Button
            size="lg"
            className="h-12 w-full sm:w-auto sm:px-12"
            onClick={() => setStep(0)}
          >
            Começar agora <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground">
            Leva menos de 2 minutos.
          </p>
        </div>
      </div>
    );
  }

  const current = STEPS[step];
  const value = form[current.key] || "";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      <form onSubmit={next} className="mx-auto w-full max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Muwoyo" className="h-9 w-9 object-contain" />
          <div className="flex-1">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Passo {step + 1} de {STEPS.length}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-bold sm:text-3xl">{current.label}</h2>
          {current.help && (
            <p className="text-sm text-muted-foreground">{current.help}</p>
          )}
          {current.type === "select" ? (
            <select required autoFocus className="h-12 w-full rounded-md border bg-background px-3 text-base" value={value} onChange={(e) => setForm({ ...form, [current.key]: e.target.value })}>
              <option value="">{current.placeholder}</option>
              {current.options?.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : current.key === "business_hours" ? (
            <BusinessHoursConfig value={form.business_hours} onChange={(business_hours) => setForm({ ...form, business_hours })} />
          ) : current.type === "textarea" ? (
            <Textarea
              required
              type={current.key === "transfer_phone" ? "tel" : "text"}
              inputMode={current.key === "transfer_phone" ? "numeric" : undefined}
              pattern={current.key === "transfer_phone" ? "[+0-9 ()-]{7,20}" : undefined}
              autoFocus
              className="min-h-32 text-base"
              placeholder={current.placeholder}
              value={value}
              onChange={(e) => setForm({ ...form, [current.key]: current.key === "transfer_phone" ? e.target.value.replace(/\D/g, "") : e.target.value })}
            />
          ) : (
            <Input
              required
              autoFocus
              className="h-12 text-base"
              placeholder={current.placeholder}
              value={value}
              onChange={(e) =>
                setForm({ ...form, [current.key]: e.target.value })
              }
            />
          )}
        </div>

        {step === STEPS.length - 1 && (
          <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">Aceita agendamentos</Label>
                <p className="text-xs text-muted-foreground">Permitir que clientes agendem automaticamente.</p>
              </div>
              <Switch
                checked={form.accepts_appointments}
                onCheckedChange={(checked) => setForm({ ...form, accepts_appointments: !!checked })}
              />
            </div>

            <div className="space-y-2">
              <Label>Duração média do agendamento (minutos)</Label>
              <Input
                type="number"
                min={10}
                max={240}
                value={form.appointment_duration_minutes}
                onChange={(e) => setForm({ ...form, appointment_duration_minutes: Number(e.target.value || 30) })}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1"
              onClick={() => setStep(step - 1)}
            >
              Voltar
            </Button>
          )}
          <Button type="submit" className="h-12 flex-1" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : step === STEPS.length - 1 ? (
              "Concluir"
            ) : (
              "Avançar"
            )}
            {!saving && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
