import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Wallet,
} from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  phone: string | null;
  business_name: string | null;
  role?: string;
};

const sb = supabase as any;

export default function AdminTokens() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [tokenBalances, setTokenBalances] = useState<any[]>([]);
  const [tokenUsageRows, setTokenUsageRows] = useState<any[]>([]);
  const [depositForm, setDepositForm] = useState({
    userId: "",
    amount: "",
    description: "",
  });
  const [modelSettings, setModelSettings] = useState({
    model_name: "gpt-4o",
    input_cost_per_1m_usd: "0",
    output_cost_per_1m_usd: "0",
    estimated_tokens_per_message: "1500",
  });

  const loadUsers = async () => {
    const { data: profiles } = await sb
      .from("profiles")
      .select("user_id, full_name, phone, business_name")
      .order("created_at", { ascending: false });
    const { data: roles } = await sb.from("user_roles").select("user_id, role");
    const roleMap = new Map((roles || []).map((r: any) => [r.user_id, r.role]));
    const rows = (profiles || []).map((p: UserRow) => ({
      ...p,
      role: roleMap.get(p.user_id) || "client",
    }));
    setUsers(rows);
    if (!selectedUserId && rows[0]?.user_id) {
      setSelectedUserId(rows[0].user_id);
    }
  };

  const loadTokenBalances = async () => {
    const { data, error } = await sb
      .from("v_ai_user_balance_dashboard")
      .select(
        "user_id,total_depositado_usd,total_gasto_usd,saldo_atual_usd,mensagens_restantes_estimadas",
      )
      .order("saldo_atual_usd", { ascending: false });

    if (error) {
      console.warn("Failed to load AI balance overview", error);
      setTokenBalances([]);
      return;
    }

    const rows = await Promise.all((data || []).map(async (row: any) => {
      const { data: profile } = await sb
        .from("profiles")
        .select("full_name,business_name")
        .eq("user_id", row.user_id)
        .maybeSingle();

      return {
        ...row,
        full_name: profile?.full_name || "Usuário sem nome",
        business_name: profile?.business_name || "-",
      };
    }));

    setTokenBalances(rows);
  };

  const loadTokenUsage = async (userId: string) => {
    if (!userId) {
      setTokenUsageRows([]);
      return;
    }

    const { data, error } = await sb
      .from("ai_usage_events")
      .select(
        "id,user_id,execution_id,workflow_name,workflow_id,model_id,prompt_tokens,completion_tokens,total_tokens,cost_usd,created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      console.warn("Failed to load AI usage history", error);
      setTokenUsageRows([]);
      return;
    }

    setTokenUsageRows(data || []);
  };

  const handleRegisterDeposit = async (e?: FormEvent) => {
    e?.preventDefault();
    const userId = depositForm.userId || selectedUserId;
    const amount = Number(depositForm.amount);
    if (!userId || !amount || amount <= 0) {
      toast({
        title: "Dados inválidos",
        description: "Escolha um utilizador e Informe um valor válido em USD.",
        variant: "destructive",
      });
      return;
    }

    const { data: authUser } = await sb.auth.getUser();
    const { error } = await sb.from("user_ai_deposits").insert({
      user_id: userId,
      amount_usd: amount,
      description: depositForm.description || "Depósito manual do admin",
      created_by: authUser?.user?.id,
    });

    if (error) {
      console.warn("Deposit insert failed", error);
      toast({
        title: "Erro ao registrar depósito",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const { error: rpcError } = await sb.rpc("recalculate_all_user_ai_balances");
    if (rpcError) {
      toast({
        title: "Depósito gravado",
        description: "Mas o recalculo imediato falhou no banco.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Depósito registado",
      description: `USD ${amount.toFixed(2)} atribuído com sucesso.`,
    });
    setDepositForm({ userId: "", amount: "", description: "" });
    await loadTokenBalances();
    await loadTokenUsage(userId);
  };

  const handleRecalculateBalances = async () => {
    const { error } = await sb.rpc("recalculate_all_user_ai_balances");
    if (error) {
      console.warn("Balance recalc failed", error);
      toast({
        title: "Erro ao recalcular",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    await loadTokenBalances();
    await loadTokenUsage(selectedUserId);
    toast({ title: "Saldos recalculados", description: "Dados atualizados." });
  };

  const selectedBalance = useMemo(
    () =>
      tokenBalances.find((row) => row.user_id === selectedUserId) || {
        total_depositado_usd: 0,
        total_gasto_usd: 0,
        saldo_atual_usd: 0,
        mensagens_restantes_estimadas: 0,
      },
    [selectedUserId, tokenBalances],
  );

  useEffect(() => {
    void loadUsers();
    void loadTokenBalances();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      void loadTokenUsage(selectedUserId);
    }
  }, [selectedUserId]);

  return (
    <AdminShell mode="admin" title="Gerenciamento de Tokens & Saldo">
      <Card className="border border-border/60 bg-background text-foreground shadow-sm">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold text-foreground">
              Gerenciamento de Tokens & Saldo
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Selecione um utilizador e acompanhe o saldo disponível em USD, o consumo e os custos por execução.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-full min-w-[280px] border-border bg-background text-foreground">
                <SelectValue placeholder="Selecionar usuário" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name || u.business_name || u.phone || u.user_id.slice(0, 8)} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="default" size="sm" onClick={handleRecalculateBalances}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar Saldo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground">Total Depositado</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-600">
                {Number(selectedBalance.total_depositado_usd || 0).toFixed(2)} USD
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground">Total Gasto</div>
              <div className="mt-2 text-2xl font-semibold text-amber-600">
                {Number(selectedBalance.total_gasto_usd || 0).toFixed(2)} USD
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground">Saldo Restante</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-700">
                {Number(selectedBalance.saldo_atual_usd || 0).toFixed(2)} USD
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground">Estimativa de Mensagens</div>
              <div className="mt-2 text-2xl font-semibold text-sky-700">
                {selectedBalance.mensagens_restantes_estimadas ?? 0}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg font-semibold text-foreground">Histórico de Consumo de IA</div>
                <div className="text-xs text-muted-foreground">Últimas 25 execuções</div>
              </div>
              <div className="overflow-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-3">Data / Hora</th>
                      <th className="pb-3">Workflow</th>
                      <th className="pb-3">Modelo</th>
                      <th className="pb-3">Input</th>
                      <th className="pb-3">Output</th>
                      <th className="pb-3">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokenUsageRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">
                          Sem eventos de uso para este utilizador ainda.
                        </td>
                      </tr>
                    ) : (
                      tokenUsageRows.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="py-3 text-foreground">
                            {new Date(row.created_at).toLocaleString("pt-AO")}
                          </td>
                          <td className="py-3 text-foreground">
                            {row.workflow_name || row.workflow_id || "n8n"}
                          </td>
                          <td className="py-3 text-foreground">{row.model_id || "-"}</td>
                          <td className="py-3 text-foreground">{row.prompt_tokens || 0}</td>
                          <td className="py-3 text-foreground">{row.completion_tokens || 0}</td>
                          <td className="py-3 text-emerald-700">
                            ${Number(row.cost_usd || 0).toFixed(4)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div className="text-lg font-semibold text-foreground">Custos de Modelo</div>
              <div className="space-y-3">
                <Label className="text-foreground">Modelo</Label>
                <Input
                  placeholder="Modelo (ex.: gpt-4o)"
                  value={modelSettings.model_name}
                  onChange={(e) => setModelSettings({ ...modelSettings, model_name: e.target.value })}
                />
                <Label className="text-foreground">Input / 1M tokens (USD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.000001"
                  placeholder="0.00"
                  value={modelSettings.input_cost_per_1m_usd}
                  onChange={(e) => setModelSettings({ ...modelSettings, input_cost_per_1m_usd: e.target.value })}
                />
                <Label className="text-foreground">Output / 1M tokens (USD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.000001"
                  placeholder="0.00"
                  value={modelSettings.output_cost_per_1m_usd}
                  onChange={(e) => setModelSettings({ ...modelSettings, output_cost_per_1m_usd: e.target.value })}
                />
                <Label className="text-foreground">Média de tokens / mensagem</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="1500"
                  value={modelSettings.estimated_tokens_per_message}
                  onChange={(e) =>
                    setModelSettings({
                      ...modelSettings,
                      estimated_tokens_per_message: e.target.value,
                    })
                  }
                />
                <Button
                  className="w-full"
                  onClick={async () => {
                    const { error } = await sb.from("ai_models").upsert(
                      {
                        model_name: modelSettings.model_name,
                        input_cost_per_1m_usd: Number(modelSettings.input_cost_per_1m_usd || 0),
                        output_cost_per_1m_usd: Number(modelSettings.output_cost_per_1m_usd || 0),
                        estimated_tokens_per_message: Number(modelSettings.estimated_tokens_per_message || 1500),
                      },
                      { onConflict: "model_name" },
                    );
                    if (error) {
                      toast({ title: "Erro", description: error.message, variant: "destructive" });
                      return;
                    }
                    toast({ title: "Custo salvo", description: "Modelo atualizado com sucesso." });
                  }}
                >
                  Salvar custo do modelo
                </Button>
              </div>

              <form className="mt-5 space-y-3 rounded-lg border border-border bg-background p-4" onSubmit={handleRegisterDeposit}>
                <div className="text-sm font-semibold text-foreground">Recarga de Saldo em USD</div>
                <Select
                  value={depositForm.userId || selectedUserId}
                  onValueChange={(value) => setDepositForm({ ...depositForm, userId: value })}
                >
                  <SelectTrigger className="border-border bg-background text-foreground">
                    <SelectValue placeholder="Escolher utilizador" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.full_name || u.business_name || u.phone || u.user_id.slice(0, 8)} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Valor em USD"
                  value={depositForm.amount}
                  onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                />
                <Textarea
                  placeholder="Descrição do depósito"
                  value={depositForm.description}
                  onChange={(e) => setDepositForm({ ...depositForm, description: e.target.value })}
                />
                <Button type="submit" className="w-full">
                  <Wallet className="mr-2 h-4 w-4" />
                  Gravar depósito
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
