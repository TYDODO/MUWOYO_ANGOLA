import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const db = supabase as any;
type Plan = { id: string; name: string; price_kz: number; monthly_messages: number; features: string[] };
type PaymentMethod = { id: string; method_type: string; label: string; iban?: string; account_holder_name?: string; bank_name?: string; entity_name?: string; entity_number?: string; phone_number?: string; instructions?: string };

export default function MessageTopUp() {
  const { user } = useAuth(); const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]); const [methods, setMethods] = useState<PaymentMethod[]>([]); const [selected, setSelected] = useState<Plan | null>(null); const [file, setFile] = useState<File | null>(null); const [sending, setSending] = useState(false);
  useEffect(() => { Promise.all([
    db.from("subscription_plans").select("id,name,price_kz,monthly_messages,features").eq("is_active", true).order("position"),
    db.from("payment_methods").select("id,method_type,label,iban,account_holder_name,bank_name,entity_name,entity_number,phone_number,instructions").eq("is_active", true).order("updated_at", { ascending: false }),
  ]).then(([planResult, methodResult]: any[]) => { setPlans(planResult.data || []); setMethods(methodResult.data || []); }); }, []);
  const copy = async (value?: string) => { if (!value) return; await navigator.clipboard.writeText(value); toast({ title: "Copiado", description: "Informação copiada para a área de transferência." }); };
  const submit = async () => {
    if (!user || !selected || !file) return toast({ title: "Comprovativo necessário", description: "Selecione o comprovativo do pagamento.", variant: "destructive" });
    setSending(true); const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const upload = await supabase.storage.from("payment-proofs").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (upload.error) { setSending(false); return toast({ title: "Erro no upload", description: upload.error.message, variant: "destructive" }); }
    const paymentId = `MWY-${Date.now()}-${user.id.slice(0, 8).toUpperCase()}`;
    const { error } = await db.from("plan_subscriptions").insert({ user_id: user.id, plan_id: selected.id, payment_method_id: methods[0]?.id || null, payment_id: paymentId, proof_path: path });
    setSending(false); if (error) return toast({ title: "Não foi possível enviar", description: error.message, variant: "destructive" });
    toast({ title: "Pagamento enviado", description: "A equipa irá verificar o comprovativo." }); setSelected(null); setFile(null);
  };
  return <DashboardShell title="Planos Muwoyo" description="Escolha o plano mensal adequado ao seu negócio.">
    <div className="grid gap-4 lg:grid-cols-4">{plans.map((plan) => <Card key={plan.id} className={selected?.id === plan.id ? "border-primary ring-2 ring-primary/20" : ""}><CardHeader><CardTitle>{plan.name}</CardTitle><div className="text-3xl font-bold">{plan.name === "Enterprise" ? "Sob consulta" : `${Number(plan.price_kz).toLocaleString("pt-AO")} Kz`}<span className="text-sm font-normal text-muted-foreground">{plan.name === "Enterprise" ? "" : " / mês"}</span></div></CardHeader><CardContent className="space-y-4"><div className="font-medium">{plan.name === "Enterprise" ? "Funcionalidades ilimitadas" : `${plan.monthly_messages.toLocaleString("pt-AO")} créditos de IA por mês`}</div><ul className="space-y-2 text-sm text-muted-foreground">{(plan.features || []).map((feature) => <li key={feature}>✓ {feature}</li>)}</ul>{plan.name === "Enterprise" ? <Button className="w-full" asChild><a href="https://wa.me/244962011401" target="_blank" rel="noreferrer">Falar com suporte</a></Button> : <Button className="w-full" onClick={() => setSelected(plan)}>Pagar este plano</Button>}</CardContent></Card>)}</div>
    {selected && <Card className="border-primary/30"><CardHeader><CardTitle>Pagamento: {selected.name}</CardTitle></CardHeader><CardContent className="space-y-5">{methods.length === 0 ? <p className="text-sm text-muted-foreground">Os dados de pagamento ainda não foram configurados.</p> : methods.map((method) => <div key={method.id} className="space-y-2 rounded-md border p-4"><div className="font-semibold">{method.label}</div>{[["IBAN", method.iban], ["Titular", method.account_holder_name], ["Banco", method.bank_name], ["Entidade", method.entity_name], ["Número de entidade", method.entity_number], ["Telefone", method.phone_number]].filter(([, value]) => value).map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 text-sm"><span><span className="text-muted-foreground">{label}: </span>{value}</span><Button size="icon" variant="ghost" title={`Copiar ${label}`} onClick={() => copy(value)}><Copy className="h-4 w-4" /></Button></div>)}{method.instructions && <p className="text-sm text-muted-foreground">{method.instructions}</p>}</div>)}<div className="space-y-2"><Label htmlFor="proof">Comprovativo do pagamento</Label><Input id="proof" type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div><div className="flex gap-2"><Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button><Button onClick={submit} disabled={sending || !file}><Upload className="mr-2 h-4 w-4" />{sending ? "A enviar..." : "Enviar comprovativo"}</Button></div></CardContent></Card>}
  </DashboardShell>;
}
