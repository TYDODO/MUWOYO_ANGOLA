import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatKwanza, getAvailableBalance } from "@/lib/affiliate";
import {
  BadgeCheck,
  CreditCard,
  Gift,
  Plus,
  TrendingUp,
  UserPlus,
  Wallet,
  ArrowDownToLine,
  ArrowUpRight,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WithdrawalDialog from "@/components/WithdrawalDialog";

type CommissionRow = {
  id: string;
  amount_kz: number;
  movement_type: string;
  source: string | null;
  description: string | null;
  created_at: string;
  related_transaction_id?: string | null;
};

type WithdrawalRow = {
  id: string;
  transaction_id: string;
  payment_id?: string | null;
  amount_kz: number;
  status: string;
  requested_at: string;
  paid_at?: string | null;
  payment_reference?: string | null;
  iban?: string | null;
  account_holder_name?: string | null;
  bank_name?: string | null;
};

type InvitedUserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  account_status: string | null;
  created_at: string;
};

const statusLabel = (status: string | null) => {
  switch (status) {
    case "active":
      return "Ativa";
    case "trial":
      return "Em teste";
    case "awaiting_activation":
      return "Aguardando ativação";
    case "suspended":
      return "Suspensa";
    default:
      return "Desconhecido";
  }
};

export default function AffiliatesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [affiliateProfile, setAffiliateProfile] = useState<any>(null);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [invitedUsers, setInvitedUsers] = useState<InvitedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<WithdrawalRow | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    const [{ data: profileData }, { data: affiliateData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, account_status, full_name, email, referred_by, referral_code_used")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("affiliate_profiles")
        .select("id, user_id, affiliate_code, iban, account_holder_name, bank_name, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const affiliateId = affiliateData?.id ?? null;

    const [{ data: commissionData }, { data: withdrawalData }, { data: invitedData }] = await Promise.all([
      affiliateId
        ? supabase
            .from("affiliate_commissions")
            .select("id, amount_kz, movement_type, source, description, created_at, related_transaction_id")
            .eq("affiliate_id", affiliateId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as CommissionRow[] }),
      affiliateId
        ? supabase
            .from("affiliate_withdrawal_requests")
            .select("id, transaction_id, payment_id, amount_kz, status, requested_at, paid_at, payment_reference, iban, account_holder_name, bank_name")
            .eq("affiliate_id", affiliateId)
            .order("requested_at", { ascending: false })
        : Promise.resolve({ data: [] as WithdrawalRow[] }),
      affiliateId
        ? supabase
            .from("profiles")
            .select("user_id, full_name, email, phone, account_status, created_at")
            .eq("referred_by", affiliateId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as InvitedUserRow[] }),
    ]);

    setProfile(profileData ?? null);
    setAffiliateProfile(affiliateData ?? null);
    setCommissions((commissionData ?? []) as CommissionRow[]);
    setWithdrawals((withdrawalData ?? []) as WithdrawalRow[]);
    setInvitedUsers((invitedData ?? []) as InvitedUserRow[]);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const balance = useMemo(() => getAvailableBalance(commissions), [commissions]);
  const totalCommission = useMemo(
    () => commissions.filter((row) => row.movement_type === "commission").reduce((sum, row) => sum + row.amount_kz, 0),
    [commissions],
  );
  const totalReserved = useMemo(
    () => commissions.filter((row) => row.movement_type === "withdrawal_reserved").reduce((sum, row) => sum + row.amount_kz, 0),
    [commissions],
  );
  const referralLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = window.location.origin;
    return affiliateProfile ? `${base}/criar-conta?ref=${affiliateProfile.affiliate_code}` : "";
  }, [affiliateProfile]);

  const handleCreateProfile = async () => {
    if (!user) return;
    setCreating(true);
    const { error } = await supabase.rpc("create_affiliate_profile");
    setCreating(false);

    if (error) {
      toast({ title: "Erro ao criar perfil", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Perfil criado", description: "O seu código de afiliado já está disponível." });
    loadData();
  };

  const copyReferral = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    toast({ title: "Link copiado", description: "O link de indicação foi copiado para a área de transferência." });
  };

  if (loading) {
    return (
      <DashboardShell title="Afiliados" description="A carregar dados do programa de afiliados.">
        <div className="text-sm text-muted-foreground">A carregar...</div>
      </DashboardShell>
    );
  }

  const hasProfile = Boolean(affiliateProfile);
  const isActiveAccount = profile?.account_status === "active";

  return (
    <DashboardShell title="Afiliados" description="Acompanhe as suas comissões, saldo e pedidos de saque.">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Wallet className="h-4 w-4 text-emerald-600" /> Saldo disponível
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatKwanza(balance)}</div>
              <p className="mt-2 text-xs text-muted-foreground">Ledger atual do programa</p>
            </CardContent>
          </Card>

          <Card className="border-indigo-500/20 bg-indigo-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-indigo-600" /> Comissões
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatKwanza(totalCommission)}</div>
              <p className="mt-2 text-xs text-muted-foreground">Total acumulado de comissão</p>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ArrowUpRight className="h-4 w-4 text-amber-600" /> Reservas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatKwanza(totalReserved)}</div>
              <p className="mt-2 text-xs text-muted-foreground">Valores em processamento</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <UserPlus className="h-4 w-4 text-primary" /> Convidados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{invitedUsers.length}</div>
              <p className="mt-2 text-xs text-muted-foreground">Utilizadores indicados</p>
            </CardContent>
          </Card>
        </div>

        {!hasProfile && (
          <Card className="border-dashed border-border bg-muted/20">
            <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Ainda não tens um perfil de afiliado</h3>
                <p className="text-sm text-muted-foreground">
                  {isActiveAccount
                    ? "Cria o teu perfil para receber código de indicação e comissões."
                    : "É necessário que a sua conta esteja ativa para criar o perfil de afiliado."}
                </p>
              </div>
              <Button onClick={handleCreateProfile} disabled={creating || !isActiveAccount}>
                <Plus className="mr-2 h-4 w-4" />
                {creating ? "A criar..." : "Criar perfil"}
              </Button>
            </CardContent>
          </Card>
        )}

        {hasProfile && (
          <Card className="border-primary/20 bg-gradient-to-r from-background via-primary/5 to-background">
            <CardHeader>
              <CardTitle>Acções rápidas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 md:flex-row">
              <Button onClick={() => setWithdrawalDialogOpen(true)} className="gap-2">
                <ArrowDownToLine className="h-4 w-4" /> Sacar
              </Button>
              <Button onClick={() => navigate("/recargas")} className="gap-2">
                <CreditCard className="h-4 w-4" /> Comprar mensagens
              </Button>
              <Button variant="outline" onClick={copyReferral} className="gap-2">
                <Gift className="h-4 w-4" /> Partilhar link
              </Button>
            </CardContent>
          </Card>
        )}

        {hasProfile && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Transações</CardTitle>
              </CardHeader>
              <CardContent>
                {commissions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Ainda não há transações registadas.</div>
                ) : (
                  <div className="space-y-3">
                    {commissions.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => {
                          const withdrawal = withdrawals.find((w) => w.transaction_id === row.related_transaction_id);
                          if (withdrawal) {
                            setSelectedTransaction(withdrawal);
                          }
                        }}
                        className="flex w-full items-center justify-between rounded-xl border bg-background/60 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div>
                          <div className="font-medium capitalize">{row.movement_type.replace("_", " ")}</div>
                          <div className="text-xs text-muted-foreground">{row.description || row.source || "Movimento"}</div>
                        </div>
                        <div className="text-right">
                          <div className={row.movement_type.includes("withdrawal") || row.movement_type === "adjustment_debit" ? "text-red-600" : "text-emerald-600"}>
                            {row.movement_type === "withdrawal_reserved" || row.movement_type === "adjustment_debit" ? "-" : "+"}
                            {formatKwanza(row.amount_kz)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{new Date(row.created_at).toLocaleString("pt-PT")}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-emerald-600" />
                  Utilizadores convidados
                </CardTitle>
              </CardHeader>
              <CardContent>
                {invitedUsers.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Ainda não convidaste nenhum utilizador.</div>
                ) : (
                  <div className="space-y-3">
                    {invitedUsers.map((person) => (
                      <div key={person.user_id} className="flex flex-col gap-3 rounded-xl border bg-background/60 p-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-medium">{person.full_name ?? "Sem nome"}</div>
                          <div className="text-sm text-muted-foreground">{person.email ?? person.phone ?? "Sem contacto"}</div>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{statusLabel(person.account_status)}</span>
                          <span className="text-muted-foreground">{new Date(person.created_at).toLocaleDateString("pt-PT")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <WithdrawalDialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen} balance={balance} affiliateProfile={affiliateProfile} onSuccess={loadData} />

      <Dialog open={Boolean(selectedTransaction)} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
        <DialogContent className="sm:max-w-xl">
          {selectedTransaction && (
            <>
              <DialogHeader>
                <DialogTitle>Detalhes da transação</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Código</span>
                    <span className="font-semibold">{selectedTransaction.transaction_id}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Valor</span>
                    <span className="font-semibold">{formatKwanza(selectedTransaction.amount_kz)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Estado</span>
                    <span className="font-semibold text-amber-600">Em processamento</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Pagamento</div>
                    <div className="mt-2 font-mono text-sm">{selectedTransaction.payment_id ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Referência</div>
                    <div className="mt-2 text-sm">{selectedTransaction.payment_reference ?? "—"}</div>
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="text-sm font-medium">Dados bancários</div>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <div>IBAN: {selectedTransaction.iban ?? "—"}</div>
                    <div>Titular: {selectedTransaction.account_holder_name ?? "—"}</div>
                    <div>Banco: {selectedTransaction.bank_name ?? "—"}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setSelectedTransaction(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
