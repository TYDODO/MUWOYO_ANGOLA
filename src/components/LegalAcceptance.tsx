import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, ArrowRight, Check, Mail, Phone, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LegalAcceptanceProps {
  userId: string;
  onComplete: () => void;
  onReject: () => void;
}

export function LegalAcceptance({
  userId,
  onComplete,
  onReject,
}: LegalAcceptanceProps) {
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [legalConsent, setLegalConsent] = useState(false);
  const { toast } = useToast();

  const handleAccept = async () => {
    if (!legalConsent) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          privacy_policy_accepted: true,
          terms_accepted: true,
          legal_accepted_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;

      onComplete();
    } catch (error) {
      console.error("Erro ao aceitar termos:", error);
      toast({ title: "Não foi possível guardar a aceitação", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_suspended: true,
          status: "suspended",
          suspension_reason:
            "Recusou aceitar Política de Privacidade e Termos de Uso",
        })
        .eq("user_id", userId);

      if (error) throw error;

      setShowRejectionModal(true);
      onReject();
    } catch (error) {
      console.error("Erro ao rejeitar termos:", error);
      toast({ title: "Não foi possível atualizar a conta", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactEmail = () => {
    window.location.href = "mailto:suporte@muwoyo.com";
  };

  const handleContactWhatsApp = () => {
    window.open("https://wa.me/244962011401", "_blank");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8fafc] p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/10 to-transparent" />
      <div className="relative w-full max-w-3xl">
        <CardHeader className="bg-transparent p-0 pb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Último passo</p>
              <CardTitle className="mt-1 text-2xl sm:text-3xl">Tudo pronto para começar</CardTitle>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Leia os documentos que protegem a sua conta e os seus clientes. A aceitação fica registada com a data desta conclusão.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 bg-transparent p-0">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link to="/termos-uso" target="_blank" className="font-semibold text-primary hover:underline">Termos de Uso</Link>
            <Link to="/politica-privacidade" target="_blank" className="font-semibold text-primary hover:underline">Política de Privacidade</Link>
          </div>
          <label htmlFor="legal-consent" className="flex cursor-pointer items-start gap-3 py-2 transition">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${legalConsent ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}><Check className={`h-3.5 w-3.5 ${legalConsent ? "" : "opacity-0"}`} /></span>
            <input id="legal-consent" type="checkbox" checked={legalConsent} onChange={(e) => setLegalConsent(e.target.checked)} className="sr-only" />
            <span className="text-sm leading-relaxed">Confirmo que li e aceito os Termos de Uso e a Política de Privacidade.</span>
          </label>
          <Button onClick={handleAccept} disabled={!legalConsent || isLoading} className="h-12 w-full sm:w-auto sm:px-8">{isLoading ? "A guardar..." : "Aceitar e continuar"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
        </CardContent>
      </div>

      <Dialog open={showRejectionModal} onOpenChange={setShowRejectionModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-2">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <DialogTitle className="text-lg">Conta Suspensa</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Como você não concordou com os termos legais, sua conta foi
              suspensa. Para reativar sua conta, entre em contato conosco
              através dos canais abaixo:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <Button
              onClick={handleContactEmail}
              variant="outline"
              className="w-full justify-start"
            >
              <Mail className="mr-2 h-4 w-4" />
              suporte@muwoyo.com
            </Button>

            <Button
              onClick={handleContactWhatsApp}
              variant="outline"
              className="w-full justify-start"
            >
              <Phone className="mr-2 h-4 w-4" />
              WhatsApp: +244 928 663 898
            </Button>
          </div>

          <DialogFooter>
            <Button
              onClick={() => (window.location.href = "/")}
              variant="secondary"
              className="w-full"
            >
              Voltar à Página Inicial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
