import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Save, X } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Plan = {
  id: string;
  name: string;
  price_kz: number;
  monthly_messages: number;
  features: string[];
  is_active: boolean;
  position: number;
};

type PlanForm = Omit<Plan, "id"> & { id?: string };

const emptyPlan: PlanForm = {
  name: "",
  price_kz: 0,
  monthly_messages: 1000,
  features: [],
  is_active: true,
  position: 0,
};
export default function AdminPlans() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [featuresText, setFeaturesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("id,name,price_kz,monthly_messages,features,is_active,position")
      .order("position", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar planos", description: error.message, variant: "destructive" });
    } else {
      setPlans((data || []).map((plan) => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features.filter((feature): feature is string => typeof feature === "string") : [],
      })));
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (plan?: Plan) => {
    const next = plan ? { ...plan } : { ...emptyPlan, position: plans.length + 1 };
    setForm(next);
    setFeaturesText(next.features.join("\n"));
  };

  const save = async () => {
    if (!form) return;
    const name = form.name.trim();
    const price = Number(form.price_kz);
    const monthlyMessages = Number(form.monthly_messages);
    if (!name || price <= 0 || monthlyMessages <= 0) {
      toast({ title: "Verifique os dados", description: "Nome, preço e mensagens mensais devem ser válidos.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      name,
      price_kz: price,
      monthly_messages: monthlyMessages,
      features: featuresText.split("\n").map((feature) => feature.trim()).filter(Boolean),
      is_active: form.is_active,
      position: Number(form.position) || 0,
      updated_at: new Date().toISOString(),
    };
    const result = form.id
      ? await supabase.from("subscription_plans").update(payload).eq("id", form.id)
      : await supabase.from("subscription_plans").insert(payload);
    setSaving(false);
    if (result.error) {
      toast({ title: "Não foi possível guardar", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Plano guardado" });
    setForm(null);
    await load();
  };

  const toggleActive = async (plan: Plan, active: boolean) => {
    const { error } = await supabase.from("subscription_plans").update({ is_active: active }).eq("id", plan.id);
    if (error) {
      toast({ title: "Não foi possível alterar o plano", description: error.message, variant: "destructive" });
      return;
    }
    setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, is_active: active } : item));
  };

  return (
    <AdminShell mode="admin" title="Planos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Catálogo de planos comerciais apresentados aos clientes.</p>
        <Button onClick={() => startEdit()}><Plus className="mr-2 h-4 w-4" />Novo plano</Button>
      </div>

      {form && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{form.id ? "Editar plano" : "Criar plano"}</CardTitle>
            <Button variant="ghost" size="icon" aria-label="Fechar edição" onClick={() => setForm(null)}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2"><Label htmlFor="plan-name">Nome</Label><Input id="plan-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="plan-price">Preço (Kz)</Label><Input id="plan-price" type="number" min="1" value={form.price_kz || ""} onChange={(event) => setForm({ ...form, price_kz: Number(event.target.value) })} /></div>
              <div className="space-y-2"><Label htmlFor="plan-messages">Mensagens mensais</Label><Input id="plan-messages" type="number" min="1" value={form.monthly_messages || ""} onChange={(event) => setForm({ ...form, monthly_messages: Number(event.target.value) })} /></div>
              <div className="space-y-2"><Label htmlFor="plan-position">Ordem de apresentação</Label><Input id="plan-position" type="number" min="0" value={form.position} onChange={(event) => setForm({ ...form, position: Number(event.target.value) })} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="plan-features">Funcionalidades, uma por linha</Label><Textarea id="plan-features" rows={5} value={featuresText} onChange={(event) => setFeaturesText(event.target.value)} /></div>
            <div className="flex items-center gap-3"><Switch id="plan-active" checked={form.is_active} onCheckedChange={(isActive) => setForm({ ...form, is_active: isActive })} /><Label htmlFor="plan-active">Disponível para novas subscrições</Label></div>
            <div className="flex gap-2"><Button onClick={() => void save()} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "A guardar..." : "Guardar plano"}</Button><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button></div>
          </CardContent>
        </Card>
      )}

      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">A carregar planos...</p> : plans.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Ainda não existem planos.</p> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? "opacity-70" : undefined}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div><CardTitle>{plan.name}</CardTitle><p className="mt-2 text-2xl font-bold">{Number(plan.price_kz).toLocaleString("pt-AO")} Kz</p><p className="text-sm text-muted-foreground">{Number(plan.monthly_messages).toLocaleString("pt-AO")} mensagens / mês</p></div>
                <Button variant="ghost" size="icon" aria-label={`Editar ${plan.name}`} onClick={() => startEdit(plan)}><Pencil className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="min-h-20 space-y-1 text-sm text-muted-foreground">{plan.features.map((feature, index) => <li key={`${plan.id}-${index}`}>• {feature}</li>)}</ul>
                <div className="flex items-center justify-between border-t pt-3"><span className="text-sm">{plan.is_active ? "Ativo" : "Inativo"}</span><Switch aria-label={`${plan.is_active ? "Desativar" : "Ativar"} ${plan.name}`} checked={plan.is_active} onCheckedChange={(active) => void toggleActive(plan, active)} /></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
