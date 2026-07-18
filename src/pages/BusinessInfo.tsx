import { FormEvent, useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import BusinessHoursConfig from "@/components/BusinessHoursConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function BusinessInfo() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ business_name: "", ai_name: "", business_description: "", ai_rules: "" });

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("business_name, ai_name, business_description, ai_rules").eq("user_id", user.id).maybeSingle().then(({ data }: any) => {
      if (data) setForm({ business_name: data.business_name || "", ai_name: data.ai_name || "", business_description: data.business_description || "", ai_rules: data.ai_rules || "" });
    });
  }, [user]);

  const save = async (businessHours?: any) => {
    if (!user) return { error: { message: "Sem utilizador" } };
    setSaving(true);
    const payload = { ...form } as any;
    if (businessHours) payload.business_hours = businessHours;
    const { error } = await supabase.from("profiles").update(payload).eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return { error };
    }
    toast({ title: "Guardado", description: "Informações atualizadas com sucesso." });
    return {};
  };

  return (
    <DashboardShell title="Informações do negócio" description="Configure o perfil e as regras que a IA deve seguir.">
      <Card className="border-border/60 shadow-sm">
        <CardHeader><CardTitle>Dados da empresa e agente IA</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Nome da empresa</Label><Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Ex: Muwoyo Store" /></div>
              <div className="space-y-2"><Label>Nome do agente de IA</Label><Input value={form.ai_name} onChange={(e) => setForm({ ...form, ai_name: e.target.value })} placeholder="Ex: Assistente Muwoyo" /></div>
            </div>
            <div className="space-y-2"><Label>Informações completas da empresa</Label><Textarea className="min-h-36" value={form.business_description} onChange={(e) => setForm({ ...form, business_description: e.target.value })} placeholder="Horários, serviços, localização, formas de pagamento, entrega, garantias..." /></div>
            <div className="space-y-2"><Label>Regras que a IA deve seguir</Label><Textarea className="min-h-36" value={form.ai_rules} onChange={(e) => setForm({ ...form, ai_rules: e.target.value })} placeholder="Tom de voz, limites, quando encaminhar para humano, o que nunca deve responder..." /></div>
            {/* Botão de guardar movido para o fim (BusinessHoursConfig) — todas as alterações são salvas por lá */}
          </form>
        </CardContent>
      </Card>
      <div className="mt-6">
        <BusinessHoursConfig onSave={save} />
      </div>
    </DashboardShell>
  );
}
