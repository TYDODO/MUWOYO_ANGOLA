import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, FileCheck2, RefreshCw } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type PaymentProof = {
  id: string;
  user_id: string;
  plan_id: string;
  payment_id: string;
  proof_path: string | null;
  submitted_at: string;
  status: string;
  rejection_reason: string | null;
  plan?: { name: string; price_kz: number };
  profile?: { full_name: string | null; email: string | null; phone: string | null };
};

export default function AdminProofs() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PaymentProof[]>([]);
  const [preview, setPreview] = useState<{ url: string; title: string; isPdf: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [rejecting, setRejecting] = useState<PaymentProof | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [planResult, profileResult] = await Promise.all([
      supabase.from("subscription_plans").select("id,name,price_kz"),
      supabase.from("profiles").select("user_id,full_name,email,phone"),
    ]);
    if (planResult.error || profileResult.error) {
      setLoadError(planResult.error?.message || profileResult.error?.message || "Não foi possível carregar pagamentos.");
      setLoading(false);
      return;
    }
    const subscriptions: PaymentProof[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from("plan_subscriptions")
        .select("id,user_id,plan_id,payment_id,proof_path,submitted_at,status,rejection_reason")
        .order("submitted_at", { ascending: false })
        .range(from, from + 499);
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      subscriptions.push(...(data || []) as PaymentProof[]);
      if ((data || []).length < 500) break;
    }
    const plans = new Map((planResult.data || []).map((plan) => [plan.id, { name: plan.name, price_kz: Number(plan.price_kz || 0) }]));
    const profiles = new Map((profileResult.data || []).map((profile) => [profile.user_id, profile]));
    setRows(subscriptions.map((row) => ({
      ...row,
      plan: plans.get(row.plan_id),
      profile: profiles.get(row.user_id),
    })));
    setLoadError("");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt");
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesQuery = !term || `${row.profile?.full_name || ""} ${row.profile?.email || ""} ${row.profile?.phone || ""} ${row.payment_id} ${row.plan?.name || ""}`.toLocaleLowerCase("pt").includes(term);
      return matchesStatus && matchesQuery;
    });
  }, [rows, query, statusFilter]);

  const showProof = async (row: PaymentProof) => {
    if (!row.proof_path) {
      toast({ title: "Comprovativo indisponível", description: "Este pedido não tem um ficheiro associado.", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(row.proof_path, 3600);
    if (error) {
      toast({ title: "Não foi possível abrir o comprovativo", description: error.message, variant: "destructive" });
      return;
    }
    setPreview({ url: data.signedUrl, title: `Comprovativo ${row.payment_id}`, isPdf: row.proof_path.toLowerCase().endsWith(".pdf") });
  };

  const confirmPayment = async (row: PaymentProof) => {
    setBusyId(row.id);
    const { data, error } = await supabase.functions.invoke("commercial-flow", {
      body: { action: "confirmPlanPayment", subscriptionId: row.id },
    });
    if (error || data?.error || data?.ok === false) {
      setBusyId("");
      toast({ title: "Não foi possível confirmar", description: data?.error || error?.message || "A operação foi recusada.", variant: "destructive" });
      return;
    }
    toast({ title: "Pagamento confirmado", description: `O plano ${row.plan?.name || "selecionado"} foi ativado por 30 dias.` });
    setBusyId("");
    await load();
  };

  const rejectPayment = async () => {
    if (!rejecting || !rejectionReason.trim()) return;
    setBusyId(rejecting.id);
    const { data, error } = await supabase.functions.invoke("commercial-flow", {
      body: { action: "rejectPlanPayment", subscriptionId: rejecting.id, reason: rejectionReason.trim() },
    });
    setBusyId("");
    if (error || data?.error) {
      toast({ title: "Não foi possível recusar", description: data?.error || error?.message || "A operação foi recusada.", variant: "destructive" });
      return;
    }
    toast({ title: "Comprovativo recusado", description: "O cliente poderá consultar o motivo na faturação." });
    setRejecting(null);
    setRejectionReason("");
    await load();
  };

  const statusLabel = (status: string) => ({
    pending: "Aguardando confirmação",
    active: "Confirmado",
    rejected: "Recusado",
    expired: "Expirado",
  }[status] || status);

  return (
    <AdminShell mode="admin" title="Comprovativos e pagamentos" description="Consulte os comprovativos por estado, pesquise pelo ID do pagamento e reveja decisões." search={query} onSearch={setQuery} onRefresh={() => void load()}>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Comprovativos ({filteredRows.length})</CardTitle>
          <select aria-label="Filtrar pagamentos por estado" className="h-10 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos os estados</option><option value="pending">Aguardando confirmação</option><option value="active">Confirmados</option><option value="rejected">Recusados</option><option value="expired">Expirados</option>
          </select>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="py-6 text-sm text-muted-foreground">A carregar comprovativos...</p> : loadError ? <p role="alert" className="py-6 text-sm text-destructive">Não foi possível carregar os pagamentos: {loadError}</p> : filteredRows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Nenhum pagamento encontrado para estes filtros.</p> : filteredRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-4 rounded-md border p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{row.profile?.full_name || row.profile?.email || row.user_id}</p>
                <p className="text-sm text-muted-foreground">{row.profile?.phone || row.profile?.email || "Sem contacto"} · {row.plan?.name || "Plano removido"} · {Number(row.plan?.price_kz || 0).toLocaleString("pt-AO")} Kz</p>
                <p className="mt-1 text-xs text-muted-foreground">Payment ID {row.payment_id} · {statusLabel(row.status)} · enviado em {new Date(row.submitted_at).toLocaleString("pt-AO")}</p>
                {row.status === "rejected" && row.rejection_reason && <p className="mt-2 rounded-md bg-destructive/5 p-2 text-sm text-destructive">Motivo da recusa: {row.rejection_reason}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" className="gap-2" onClick={() => void showProof(row)} disabled={!row.proof_path}><FileCheck2 className="h-4 w-4" />Ver comprovativo</Button>
                {row.status === "pending" && <>
                  <Button type="button" variant="outline" onClick={() => { setRejecting(row); setRejectionReason(""); }} disabled={busyId === row.id}>Recusar</Button>
                  <Button type="button" onClick={() => void confirmPayment(row)} disabled={busyId === row.id}>{busyId === row.id ? "A confirmar..." : "Confirmar"}</Button>
                </>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="flex h-[90vh] max-w-5xl flex-col">
          <DialogHeader><DialogTitle>{preview?.title || "Comprovativo"}</DialogTitle></DialogHeader>
          {preview && <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/20">{preview.isPdf ? <iframe src={preview.url} title={preview.title} className="h-full w-full" /> : <img src={preview.url} alt={preview.title} className="h-full w-full object-contain" />}</div>}
          {preview && <Button variant="outline" asChild className="self-end"><a href={preview.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir noutro separador</a></Button>}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open && !busyId) setRejecting(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar comprovativo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Indique o motivo da recusa. O cliente poderá consultá-lo na área de faturação.</p>
          <Textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} placeholder="Ex.: valor ou titular não corresponde ao pagamento..." />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRejecting(null)} disabled={Boolean(busyId)}>Cancelar</Button><Button type="button" variant="destructive" onClick={() => void rejectPayment()} disabled={!rejectionReason.trim() || Boolean(busyId)}>{busyId ? "A recusar..." : "Confirmar recusa"}</Button></div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}