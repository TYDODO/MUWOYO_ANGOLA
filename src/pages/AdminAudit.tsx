import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type AuditRow = {
  id: string;
  business_id: string;
  actor_user_id: string;
  action: string;
  target_user_id: string | null;
  conversation_id: string | null;
  metadata: Json;
  created_at: string;
};
type AuditClient = {
  rpc: (name: "admin_list_business_audit_log", args: { p_limit: number }) => PromiseLike<{ data: AuditRow[] | null; error: { message: string } | null }>;
};
const auditDb = supabase as unknown as AuditClient;

export default function AdminAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await auditDb.rpc("admin_list_business_audit_log", { p_limit: 500 });
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setRows(data || []);
    setLoadError("");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt");
    if (!term) return rows;
    return rows.filter((row) => `${row.action} ${row.actor_user_id} ${row.target_user_id || ""} ${row.business_id} ${JSON.stringify(row.metadata)}`.toLocaleLowerCase("pt").includes(term));
  }, [rows, query]);

  return (
    <AdminShell mode="admin" title="Auditoria e segurança" description="Registos de atividade empresarial guardados pela plataforma." search={query} onSearch={setQuery} onRefresh={() => setReloadKey((key) => key + 1)}>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Eventos registados ({rows.length})</CardTitle><Button variant="outline" size="icon" aria-label="Atualizar auditoria" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}><RefreshCw className="h-4 w-4" /></Button></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="py-5 text-sm text-muted-foreground">A carregar auditoria...</p> : loadError ? <p role="alert" className="py-5 text-sm text-destructive">Não foi possível carregar a auditoria: {loadError}</p> : filteredRows.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Nenhum evento encontrado.</p> : filteredRows.map((row) => (
            <article key={row.id} className="border-b pb-3 last:border-0">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div className="font-medium">{row.action}</div><time className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("pt-AO")}</time></div>
              <div className="mt-1 text-xs text-muted-foreground">Operador {row.actor_user_id} · negócio {row.business_id}{row.target_user_id ? ` · alvo ${row.target_user_id}` : ""}{row.conversation_id ? ` · conversa ${row.conversation_id}` : ""}</div>
              <pre className="mt-2 overflow-x-auto rounded-sm bg-muted/50 p-2 text-xs">{JSON.stringify(row.metadata, null, 2)}</pre>
            </article>
          ))}
        </CardContent>
      </Card>
    </AdminShell>
  );
}