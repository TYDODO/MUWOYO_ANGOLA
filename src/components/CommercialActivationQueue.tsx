import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ActivationItem = {
  id: string;
  user_id: string;
  amount_kz: number;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  profile?: { full_name: string | null; email: string | null; phone: string | null; created_at: string; account_status: string };
};

export default function CommercialActivationQueue() {
  const { toast } = useToast();
  const [items, setItems] = useState<ActivationItem[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("commercial-flow", { body: { action: "listPendingActivations" } });
    if (error || data?.error) {
      toast({ title: "Não foi possível carregar os pagamentos", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    setItems(data?.requests || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const call = async (action: string, item: ActivationItem) => {
    setBusy(item.id);
    const { data, error } = await supabase.functions.invoke("commercial-flow", {
      body: action === "confirmSetupPayment"
        ? { action, requestId: item.id }
        : { action, userId: item.user_id },
    });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Operação não concluída", description: error?.message || data?.error || "Verifique a configuração do Supabase.", variant: "destructive" });
      return;
    }
    toast({ title: action === "activateAccount" ? "Conta ativada" : "Pagamento confirmado" });
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    load();
  };

  if (!items.length) return null;
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Contas de setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-semibold">{item.profile?.full_name || "Cliente"}</div>
              <div className="text-muted-foreground">{item.profile?.email || "-"} · +{item.profile?.phone || "-"}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {item.status === "confirmed" ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Clock3 className="h-3.5 w-3.5" />}
                {item.status === "confirmed" ? "Pagamento confirmado - aguardando ativação" : "Pedido de setup aguardando confirmação"} · {Number(item.amount_kz).toLocaleString("pt-AO")} Kz
              </div>
            </div>
            {item.status === "confirmed" ? (
              <Button disabled={busy === item.id} onClick={() => call("activateAccount", item)}>Ativar</Button>
            ) : (
              <Button variant="outline" disabled={busy === item.id} onClick={() => call("confirmSetupPayment", item)}>Confirmar pagamento</Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}