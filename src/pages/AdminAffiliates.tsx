import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatKwanza } from "@/lib/affiliate";

type AffiliateProfileRow = {
  id: string;
  user_id: string;
  affiliate_code: string;
  iban: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  account_status?: string | null;
  referred_by?: string | null;
};

type CommissionRow = {
  affiliate_id: string;
  amount_kz: number;
  movement_type: string;
  created_at: string;
};

type WithdrawalRow = {
  id: string;
  transaction_id: string;
  payment_id: string | null;
  affiliate_id: string;
  amount_kz: number;
  status: string;
  requested_at: string;
  iban: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
};

const getBalanceForAffiliate = (rows: CommissionRow[], affiliateId: string) =>
  rows
    .filter((row) => row.affiliate_id === affiliateId)
    .reduce((total, row) => {
      switch (row.movement_type) {
        case "commission":
          return total + row.amount_kz;
        case "withdrawal_reserved":
          return total - row.amount_kz;
        case "withdrawal_release":
          return total + row.amount_kz;
        case "adjustment_credit":
          return total + row.amount_kz;
        case "adjustment_debit":
          return total - row.amount_kz;
        default:
          return total;
      }
    }, 0);

const statusLabel = (status: string | null | undefined) => {
  if (status === "active") return "Ativo";
  if (status === "trial") return "Em teste";
  if (status === "awaiting_activation") return "Aguardando ativação";
  if (status === "inactive") return "Inativo";
  return "Desconhecido";
};

export default function AdminAffiliatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [affiliates, setAffiliates] = useState<AffiliateProfileRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<Record<string, boolean>>({});
  const [reference, setReference] = useState<Record<string, string>>({});

  const loadData = async () => {
    if (!user) return;

    setLoading(true);

    const [{ data: affiliateData }, { data: profileData }, { data: commissionData }, { data: withdrawalData }] = await Promise.all([
      supabase.from("affiliate_profiles").select("id, user_id, affiliate_code, iban, account_holder_name, bank_name, created_at").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, email, phone, account_status, referred_by").order("created_at", { ascending: false }),
      supabase.from("affiliate_commissions").select("affiliate_id, amount_kz, movement_type, created_at").order("created_at", { ascending: false }),
      supabase.from("affiliate_withdrawal_requests").select("id, transaction_id, payment_id, affiliate_id, amount_kz, status, requested_at, iban, account_holder_name, bank_name").order("requested_at", { ascending: false }),
    ]);

    setAffiliates((affiliateData ?? []) as AffiliateProfileRow[]);
    setProfiles((profileData ?? []) as ProfileRow[]);
    setCommissions((commissionData ?? []) as CommissionRow[]);
    setWithdrawals((withdrawalData ?? []) as WithdrawalRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const profileMap = useMemo(
    () => Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p])),
    [profiles],
  );

  const affiliateEntries = useMemo(
    () =>
      affiliates.map((affiliate) => {
        const profile = profileMap[affiliate.user_id];
        const balance = getBalanceForAffiliate(commissions, affiliate.id);
        const invited = profiles.filter((candidate) => candidate.referred_by === affiliate.id);
        return {
          ...affiliate,
          profile,
          balance,
          invited,
        };
      }),
    [affiliates, commissions, profileMap],
  );

  const pendingWithdrawals = useMemo(
    () =>
      withdrawals.filter((row) => row.status === "processing").map((row) => {
        const affiliate = affiliates.find((a) => a.id === row.affiliate_id);
        const profile = profileMap[affiliate?.user_id ?? ""];
        return {
          ...row,
          affiliate,
          profile,
        };
      }),
    [affiliates, profileMap, withdrawals],
  );

  const paidWithdrawals = useMemo(
    () =>
      withdrawals.filter((row) => row.status === "paid").map((row) => {
        const affiliate = affiliates.find((a) => a.id === row.affiliate_id);
        const profile = profileMap[affiliate?.user_id ?? ""];
        return {
          ...row,
          affiliate,
          profile,
        };
      }),
    [affiliates, profileMap, withdrawals],
  );

  const handlePayWithdrawal = async (withdrawalId: string) => {
    if (!user) return;
    setPaying((prev) => ({ ...prev, [withdrawalId]: true }));

    const { error } = await supabase.rpc("pay_affiliate_withdrawal", {
      p_withdrawal_id: withdrawalId,
      p_actor_id: user.id,
      p_payment_reference: reference[withdrawalId] ?? null,
    });

    setPaying((prev) => ({ ...prev, [withdrawalId]: false }));

    if (error) {
      toast({ title: "Erro ao pagar saque", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Pagamento registado", description: "O saque foi marcado como pago." });
    await loadData();
  };

  return (
    <AdminShell title="Afiliados" mode="admin">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total de afiliados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{affiliateEntries.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Saques pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingWithdrawals.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Saques pagos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{paidWithdrawals.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Afiliados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">A carregar...</div>
          ) : affiliateEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground">Ainda não existem afiliados.</div>
          ) : (
            <div className="space-y-3">
              {affiliateEntries.map((affiliate) => (
                <div key={affiliate.id} className="rounded-md border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-lg font-semibold">{affiliate.profile?.full_name ?? "Utilizador sem nome"}</div>
                      <div className="text-sm text-muted-foreground">{affiliate.profile?.email ?? affiliate.user_id}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Código</div>
                      <div className="font-mono text-sm">{affiliate.affiliate_code}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Telefone</div>
                      <div className="text-sm">{affiliate.profile?.phone ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Banco</div>
                      <div className="text-sm">{affiliate.bank_name ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Saldo</div>
                      <div className="text-sm font-semibold">{formatKwanza(affiliate.balance)}</div>
                    </div>
                  </div>
                  <div className="mt-4 border-t pt-3">
                    <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Clientes indicados ({affiliate.invited.length})</div>
                    {affiliate.invited.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Nenhum cliente indicado.</div>
                    ) : (
                      <div className="space-y-2">
                        {affiliate.invited.map((invited) => (
                          <div key={invited.user_id} className="flex items-center justify-between gap-3 text-sm">
                            <span>{invited.full_name ?? invited.email ?? invited.phone ?? "Cliente"}</span>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs">{statusLabel(invited.account_status)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saques pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingWithdrawals.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem saques pendentes.</div>
          ) : (
            <div className="space-y-4">
              {pendingWithdrawals.map((row) => (
                <div key={row.id} className="rounded-md border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-semibold">{row.transaction_id}</div>
                      <div className="text-sm text-muted-foreground">
                        {row.profile?.full_name ?? "Utilizador"} · {row.profile?.email ?? "sem email"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {row.account_holder_name ?? row.affiliate?.account_holder_name ?? "—"} · {row.bank_name ?? row.affiliate?.bank_name ?? "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">{formatKwanza(row.amount_kz)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(row.requested_at).toLocaleString("pt-PT")}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Referência do pagamento</label>
                      <Input
                        value={reference[row.id] ?? ""}
                        onChange={(e) => setReference((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        placeholder="TRANSFER-BCI-9283746"
                      />
                    </div>
                    <Button disabled={paying[row.id]} onClick={() => handlePayWithdrawal(row.id)}>
                      {paying[row.id] ? "A pagar..." : "Marcar como pago"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
