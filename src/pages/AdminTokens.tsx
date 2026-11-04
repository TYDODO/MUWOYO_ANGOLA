import { FormEvent, useEffect, useMemo, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type UserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  message_limit: number;
  messages_received: number;
  role?: string;
};

const formatNumber = (value: number) => Number(value || 0).toLocaleString("pt-AO");

export default function AdminTokens() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] = await Promise.all([
      supabase.from("profiles").select("user_id,full_name,email,phone,business_name,message_limit,messages_received").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const error = profilesError || rolesError;
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const roleByUser = new Map((roles || []).map((row) => [row.user_id, row.role]));
    const rows = (profiles || [])
      .filter((profile) => !roleByUser.has(profile.user_id) || roleByUser.get(profile.user_id) === "client")
      .map((profile) => ({
        ...profile,
        message_limit: Number(profile.message_limit || 0),
        messages_received: Number(profile.messages_received || 0),
        role: roleByUser.get(profile.user_id) || "client",
      } as UserRow));
    setUsers(rows);
    setLoadError("");
    setSelectedUserId((current) => rows.some((row) => row.user_id === current) ? current : rows[0]?.user_id || "");
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt");
    if (!term) return users;
    return users.filter((user) => `${user.full_name || ""} ${user.email || ""} ${user.phone || ""} ${user.business_name || ""}`.toLocaleLowerCase("pt").includes(term));
  }, [users, query]);

  const totalMessages = users.reduce((sum, user) => sum + user.message_limit, 0);
  const consumedMessages = users.reduce((sum, user) => sum + user.messages_received, 0);
  const remainingMessages = users.reduce((sum, user) => sum + Math.max(0, user.message_limit - user.messages_received), 0);
  const exhaustedUsers = users.filter((user) => user.message_limit - user.messages_received <= 0).length;

  const addMessages = async (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(amount);
    if (!selectedUserId || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
      toast({ title: "Verifique os dados", description: "Selecione um utilizador e indique uma quantidade inteira entre 1 e 1.000.000.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "addMessages", userId: selectedUserId, amount: quantity },
    });
    setSaving(false);
    if (error || data?.error) {
      toast({ title: "Não foi possível adicionar créditos", description: data?.error || error?.message, variant: "destructive" });
      return;
    }

    toast({ title: "Créditos adicionados", description: `${formatNumber(quantity)} mensagens foram adicionadas ao saldo.` });
    setAmount("");
    await load();
  };

  return (
    <AdminShell mode="admin" title="Créditos e consumo" description="Saldo de mensagens, consumo e recargas de clientes." search={query} onSearch={setQuery}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Utilizadores" value={formatNumber(users.length)} />
        <Stat label="Mensagens atribuídas" value={formatNumber(totalMessages)} />
        <Stat label="Mensagens consumidas" value={formatNumber(consumedMessages)} />
        <Stat label="Sem saldo disponível" value={formatNumber(exhaustedUsers)} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div><CardTitle>Adicionar créditos</CardTitle><p className="mt-1 text-sm text-muted-foreground">O saldo será somado ao limite atual do cliente.</p></div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" />Atualizar</Button>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end" onSubmit={addMessages}>
            <div className="space-y-2"><Label htmlFor="credit-user">Cliente</Label><Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={loading || users.length === 0}><SelectTrigger id="credit-user"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.user_id} value={user.user_id}>{user.full_name || user.business_name || user.email || user.phone || user.user_id}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="credit-amount">Mensagens</Label><Input id="credit-amount" type="number" min="1" max="1000000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex.: 1000" required /></div>
            <Button type="submit" disabled={saving || loading || users.length === 0}><Wallet className="mr-2 h-4 w-4" />{saving ? "A adicionar..." : "Adicionar saldo"}</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">Saldo disponível atualmente: {formatNumber(remainingMessages)} mensagens.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Consumo por cliente</CardTitle></CardHeader>
        <CardContent className="overflow-auto p-0">
          {loading ? <p className="p-6 text-sm text-muted-foreground">A carregar consumo...</p> : loadError ? <p role="alert" className="p-6 text-sm text-destructive">Não foi possível carregar os saldos: {loadError}</p> : filteredUsers.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nenhum cliente encontrado.</p> : (
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Cliente</th><th className="p-3">Email / telefone</th><th className="p-3">Atribuídas</th><th className="p-3">Consumidas</th><th className="p-3">Disponíveis</th><th className="p-3">Consumo</th></tr></thead>
              <tbody>{filteredUsers.map((user) => {
                const available = Math.max(0, user.message_limit - user.messages_received);
                const usage = user.message_limit ? Math.min(100, (user.messages_received / user.message_limit) * 100) : 100;
                return <tr key={user.user_id} className="border-b last:border-0 hover:bg-muted/30"><td className="p-3 font-medium">{user.full_name || user.business_name || "Sem nome"}</td><td className="p-3">{user.email || user.phone || "—"}</td><td className="p-3">{formatNumber(user.message_limit)}</td><td className="p-3">{formatNumber(user.messages_received)}</td><td className="p-3">{formatNumber(available)}</td><td className="p-3">{usage.toFixed(0)}%</td></tr>;
              })}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></CardContent></Card>;
}
