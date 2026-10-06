import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
type Payment = { id: string; payment_id: string; status: string; submitted_at: string; confirmed_at?: string | null; expires_at?: string | null; plan?: { name: string; price_kz: number } };

export default function Billing() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selected, setSelected] = useState<Payment | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session?.user) return;
      const [{ data: rows }, { data: plans }] = await Promise.all([
        db.from("plan_subscriptions").select("id,payment_id,status,submitted_at,confirmed_at,expires_at,plan_id").eq("user_id", auth.session.user.id).order("created_at", { ascending: false }),
        db.from("subscription_plans").select("id,name,price_kz"),
      ]);
      const planMap = new Map((plans || []).map((plan: Payment["plan"] & { id: string }) => [plan.id, plan]));
      setPayments((rows || []).map((row: Payment & { plan_id: string }) => ({ ...row, plan: planMap.get(row.plan_id) })));
    })();
  }, []);

  const statusLabel = (status: string) => ({ pending: "Pendente", active: "Ativo", expired: "Expirado", rejected: "Rejeitado" }[status] || status);

  return <DashboardShell title="Faturação" description="Consulte o histórico dos seus pagamentos e subscrições.">
    <Card><CardHeader><CardTitle>Histórico de pagamentos</CardTitle></CardHeader><CardContent className="space-y-3">
      {payments.length === 0 && <p className="text-sm text-muted-foreground">Ainda não existem pagamentos enviados.</p>}
      {payments.map((payment) => <button type="button" key={payment.id} onClick={() => setSelected(payment)} className="flex w-full flex-col gap-2 rounded-md border p-4 text-left transition hover:border-primary sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold">{payment.plan?.name || "Plano"} {payment.plan?.price_kz ? `· ${Number(payment.plan.price_kz).toLocaleString("pt-AO")} Kz` : ""}</div><div className="text-sm text-muted-foreground">ID: {payment.payment_id} · Enviado em {new Date(payment.submitted_at).toLocaleDateString("pt-AO")}</div></div><div className="text-sm font-medium">{statusLabel(payment.status)}{payment.expires_at && ` · até ${new Date(payment.expires_at).toLocaleDateString("pt-AO")}`}</div></button>)}
    </CardContent></Card>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>Detalhes da transação</DialogTitle></DialogHeader>{selected && <div className="space-y-3 text-sm"><div><span className="text-muted-foreground">Payment ID: </span><strong>{selected.payment_id}</strong></div><div><span className="text-muted-foreground">Plano: </span>{selected.plan?.name || "-"}</div><div><span className="text-muted-foreground">Valor: </span>{selected.plan?.price_kz ? `${Number(selected.plan.price_kz).toLocaleString("pt-AO")} Kz` : "Sob consulta"}</div><div><span className="text-muted-foreground">Estado: </span>{statusLabel(selected.status)}</div><div><span className="text-muted-foreground">Enviado: </span>{new Date(selected.submitted_at).toLocaleString("pt-AO")}</div>{selected.confirmed_at && <div><span className="text-muted-foreground">Confirmado: </span>{new Date(selected.confirmed_at).toLocaleString("pt-AO")}</div>}{selected.expires_at && <div><span className="text-muted-foreground">Válido até: </span>{new Date(selected.expires_at).toLocaleString("pt-AO")}</div>}<Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button></div>}</DialogContent></Dialog>
  </DashboardShell>;
}
