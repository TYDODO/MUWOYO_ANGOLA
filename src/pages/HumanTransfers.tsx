import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, MessageCircle, Phone } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type TransferRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_notes: string | null;
  transfer_status: "on" | "off";
  transfer_reason: string | null;
  transferred_at: string | null;
  reopened_at: string | null;
  created_at: string | null;
};

export default function HumanTransfers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("human_transfer_requests")
      .select(
        "id,customer_name,customer_phone,customer_email,customer_notes,transfer_status,transfer_reason,transferred_at,reopened_at,created_at",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setLoading(false);

    if (error) {
      console.warn("Failed to load human transfers", error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setRows((data as TransferRow[]) || []);
  };

  const statusSummary = useMemo(() => {
    const on = rows.filter((r) => r.transfer_status === "on").length;
    const off = rows.length - on;
    return { on, off };
  }, [rows]);

  useEffect(() => {
    void load();
  }, [user]);

  const openWhatsApp = (phone: string | null) => {
    if (!phone) return;
    const sanitized = phone.replace(/\D/g, "").replace(/^244/, "");
    window.open(`https://wa.me/244${sanitized}`, "_blank", "noopener,noreferrer");
  };

  return (
    <DashboardShell title="Transferido para humano" description="Acompanhe clientes em transferência e abra o WhatsApp rapidamente.">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Ativos</div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">{statusSummary.on}</div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Em espera</div>
            <div className="mt-2 text-2xl font-bold text-amber-600">{statusSummary.off}</div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="mt-2 text-2xl font-bold text-foreground">{rows.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Lista de transferidos</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">A carregar transferências…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum cliente transferido para humano até agora.</div>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {rows.map((row) => (
                <AccordionItem key={row.id} value={row.id} className="border-b border-border/60 px-1">
                  <AccordionTrigger className="py-4 hover:no-underline"><div className="flex min-w-0 items-center gap-3 text-left"><span className={`h-2 w-2 shrink-0 rounded-full ${row.transfer_status === "on" ? "bg-emerald-500" : "bg-slate-300"}`} /><span className="truncate font-semibold">{row.customer_name || "Cliente"}</span><span className="truncate text-sm text-muted-foreground">{row.customer_phone || "Sem telefone"}</span></div></AccordionTrigger>
                  <AccordionContent className="space-y-3 px-1 pb-4"><div className="text-sm text-muted-foreground">{row.transfer_reason || "Sem motivo informado."}</div>{row.customer_notes && <div className="text-sm text-muted-foreground">{row.customer_notes}</div>}<Button variant="outline" size="sm" onClick={() => openWhatsApp(row.customer_phone)}><Phone className="mr-2 h-4 w-4" />WhatsApp</Button></AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
