import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type TransferRequest = {
  id: string;
  user_id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  customer_notes: string | null;
  transfer_status: "on" | "off";
  transfer_reason: string | null;
  transferred_at: string | null;
  updated_at: string;
};

export default function AdminSupport() {
  const [rows, setRows] = useState<TransferRequest[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("human_transfer_requests").select("id,user_id,customer_name,customer_phone,customer_email,customer_notes,transfer_status,transfer_reason,transferred_at,updated_at").order("updated_at", { ascending: false }).limit(500);
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      setRows(data || []);
      setLoadError("");
      setLoading(false);
    })();
  }, [reloadKey]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const term = query.trim().toLocaleLowerCase("pt");
    const matchesQuery = !term || `${row.customer_name || ""} ${row.customer_phone} ${row.customer_email || ""} ${row.transfer_reason || ""} ${row.customer_notes || ""}`.toLocaleLowerCase("pt").includes(term);
    const matchesFilter = filter === "all" || row.transfer_status === filter;
    return matchesQuery && matchesFilter;
  }), [rows, query, filter]);

  const openWhatsApp = (phone: string) => {
    const digits = phone.replace(/\D/g, "").replace(/^244/, "");
    window.open(`https://wa.me/244${digits}`, "_blank", "noopener,noreferrer");
  };

  return (
    <AdminShell mode="admin" title="Suporte" description="Pedidos de clientes encaminhados para atendimento humano." search={query} onSearch={setQuery} onRefresh={() => setReloadKey((key) => key + 1)}>
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Pedidos de atendimento" value={rows.length} /><Stat label="Transferências ativas" value={rows.filter((row) => row.transfer_status === "on").length} /><Stat label="Em espera" value={rows.filter((row) => row.transfer_status === "off").length} /></div>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Atendimentos transferidos</CardTitle><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="on">Ativos</SelectItem><SelectItem value="off">Em espera</SelectItem></SelectContent></Select></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="py-5 text-sm text-muted-foreground">A carregar pedidos...</p> : loadError ? <p role="alert" className="py-5 text-sm text-destructive">Não foi possível carregar o suporte: {loadError}</p> : filteredRows.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Nenhum pedido encontrado.</p> : filteredRows.map((row) => (
            <article key={row.id} className="flex flex-col gap-3 border-b pb-4 last:border-0 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="font-medium">{row.customer_name || "Cliente"}</h3><p className="text-sm text-muted-foreground">{row.customer_phone}{row.customer_email ? ` · ${row.customer_email}` : ""}</p><p className="mt-2 text-sm">{row.transfer_reason || "Motivo não informado"}</p>{row.customer_notes && <p className="mt-1 text-sm text-muted-foreground">{row.customer_notes}</p>}<p className="mt-1 text-xs text-muted-foreground">{row.transfer_status === "on" ? "Transferência ativa" : "Em espera"} · {new Date(row.updated_at).toLocaleString("pt-AO")}</p></div><Button type="button" variant="outline" className="shrink-0" onClick={() => openWhatsApp(row.customer_phone)}><Phone className="mr-2 h-4 w-4" /><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</Button></article>
          ))}
        </CardContent>
      </Card>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value.toLocaleString("pt-AO")}</p></CardContent></Card>;
}