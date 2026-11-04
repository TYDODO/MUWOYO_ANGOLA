import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { useDeliveryPerson } from "@/hooks/useDeliveryPerson";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type GateReason = "trial" | "plan" | "credits";

export default function CreditGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { membership } = useBusinessMembership();
  const { deliveryPerson } = useDeliveryPerson();
  const navigate = useNavigate();
  const [reason, setReason] = useState<GateReason | null>(null);
  const [open, setOpen] = useState(false);

  const check = useCallback(async () => {
    if (!user || membership?.role === "attendant" || deliveryPerson?.status === "active") {
      setReason(null);
      setOpen(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("messages_received,message_limit,onboarding_completed,account_status,trial_expires_at,subscription_expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data?.onboarding_completed) return;
    const now = Date.now();
    const remaining =
      Number(data?.message_limit || 0) - Number(data?.messages_received || 0);
    const trialExpired = Boolean(data.trial_expires_at && new Date(data.trial_expires_at).getTime() <= now && (data.account_status === "trial" || (data.account_status === "inactive" && !data.subscription_expires_at)));
    const planExpired = Boolean(data.subscription_expires_at && new Date(data.subscription_expires_at).getTime() <= now);
    const inactive = data.account_status === "inactive";
    const creditsExhausted = remaining <= 0 && Number(data.message_limit || 0) > 0 && ["active", "trial"].includes(data.account_status || "");
    const nextReason = trialExpired ? "trial" : planExpired || (inactive && !data.trial_expires_at) ? "plan" : creditsExhausted ? "credits" : null;
    setReason(nextReason);
    if (!nextReason) setOpen(false);
  }, [deliveryPerson?.status, membership?.role, user]);

  const isRenewalRoute = () => window.location.pathname === "/recargas";

  const guardActionClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!reason || isRenewalRoute() || !(event.target instanceof Element)) return;
    const button = event.target.closest("button");
    if (!button || button.closest("nav,a,[role='combobox'],[role='tablist'],[data-allow-expired]")) return;
    if (button.hasAttribute("aria-haspopup") || button.getAttribute("aria-expanded") === "true") return;
    const label = `${button.innerText || ""} ${button.getAttribute("aria-label") || ""} ${button.title || ""}`;
    if (!/\b(guardar|salvar|enviar|criar|adicionar|remover|eliminar|apagar|confirmar|ativar|suspender|pausar|publicar|agendar|executar|comprar|assinar|pagar|concluir|desconectar)\b/i.test(label)) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  const guardFormSubmit = (event: FormEvent<HTMLDivElement>) => {
    if (!reason || isRenewalRoute() || !(event.target instanceof HTMLFormElement) || event.target.hasAttribute("data-allow-expired")) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  useEffect(() => {
    check();
    if (!user) return;
    const ch = supabase
      .channel(`credit-gate-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${user.id}`,
        },
        check,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [check, user]);

  return (
    <div onClickCapture={guardActionClick} onSubmitCapture={guardFormSubmit}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reason === "trial" ? "O seu período de teste esgotou" : reason === "plan" ? "A validade do seu plano esgotou" : "Os seus créditos esgotaram"}</DialogTitle>
            <DialogDescription>{reason === "credits" ? "Assine ou renove um plano para continuar a executar ações na plataforma." : "Assine um plano para continuar a usar as funcionalidades da plataforma. Pode continuar a navegar pelas secções."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Continuar a navegar</Button>
            <Button onClick={() => { setOpen(false); navigate("/recargas"); }}>Ver planos</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
