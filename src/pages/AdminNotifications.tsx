import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Notice = { id: string; user_id: string; title: string; message: string; type: string; created_at: string; is_read: boolean; link: string | null };
type Audience = "client" | "sub_admin" | "admin" | "all";

export default function AdminNotifications() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Notice[]>([]);
  const [profiles, setProfiles] = useState<Map<string, { full_name: string | null; email: string | null }>>(new Map());
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("client");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [noticeResult, profileResult] = await Promise.all([
      supabase.from("notifications").select("id,user_id,title,message,type,created_at,is_read,link").order("created_at", { ascending: false }).limit(500),
      supabase.from("profiles").select("user_id,full_name,email"),
    ]);
    const error = noticeResult.error || profileResult.error;
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setRows(noticeResult.data || []);
    setProfiles(new Map((profileResult.data || []).map((profile) => [profile.user_id, { full_name: profile.full_name, email: profile.email }])));
    setLoadError("");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt");
    if (!term) return rows;
    return rows.filter((row) => {
      const profile = profiles.get(row.user_id);
      return `${row.title} ${row.message} ${row.type} ${profile?.full_name || ""} ${profile?.email || ""}`.toLocaleLowerCase("pt").includes(term);
    });
  }, [rows, profiles, query]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "sendNotification", title: title.trim(), message: message.trim(), targetRole: audience },
    });
    setSending(false);
    if (error || data?.error || data?.count === 0) {
      toast({ title: "Não foi possível enviar", description: data?.error || error?.message || "Não há destinatários com esse perfil.", variant: "destructive" });
      return;
    }
    toast({ title: "Notificação enviada", description: `${data?.count || 0} destinatários.` });
    setTitle("");
    setMessage("");
    setReloadKey((key) => key + 1);
  };

  return (
    <AdminShell mode="admin" title="Notificações e incidentes" description="Histórico de notificações e comunicação administrativa." search={query} onSearch={setQuery} onRefresh={() => setReloadKey((key) => key + 1)}>
      <Card>
        <CardHeader><CardTitle>Enviar notificação</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={send}>
            <div className="space-y-2"><Label htmlFor="notice-title">Título</Label><Input id="notice-title" maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="notice-audience">Destinatários</Label><Select value={audience} onValueChange={(value) => setAudience(value as Audience)}><SelectTrigger id="notice-audience"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="client">Clientes</SelectItem><SelectItem value="sub_admin">Subadmins</SelectItem><SelectItem value="admin">Administradores</SelectItem><SelectItem value="all">Todos os utilizadores</SelectItem></SelectContent></Select></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="notice-message">Mensagem</Label><Textarea id="notice-message" maxLength={1000} rows={4} required value={message} onChange={(event) => setMessage(event.target.value)} /></div>
            <div className="md:col-span-2"><Button type="submit" disabled={sending}><Send className="mr-2 h-4 w-4" />{sending ? "A enviar..." : "Enviar"}</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Atividade recente</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="py-5 text-sm text-muted-foreground">A carregar notificações...</p> : loadError ? <p role="alert" className="py-5 text-sm text-destructive">Não foi possível carregar notificações: {loadError}</p> : filteredRows.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Nenhuma notificação encontrada.</p> : filteredRows.map((row) => {
            const recipient = profiles.get(row.user_id);
            return <article key={row.id} className="flex flex-col gap-2 border-b pb-3 last:border-0 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{row.title}</h3><span className="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">{row.type}</span></div><p className="mt-1 text-sm text-muted-foreground">{row.message}</p><p className="mt-1 text-xs text-muted-foreground">{recipient?.full_name || recipient?.email || row.user_id}</p></div><time className="shrink-0 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("pt-AO")}</time></article>;
          })}
        </CardContent>
      </Card>
    </AdminShell>
  );
}