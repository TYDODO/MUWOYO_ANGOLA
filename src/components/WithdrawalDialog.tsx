import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatKwanza } from "@/lib/affiliate";
import WithdrawalReceipt from "./WithdrawalReceipt";
import { ArrowRight, Plus } from "lucide-react";

type WithdrawalDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: number;
  affiliateProfile: any;
  onSuccess: () => void;
};

type WithdrawalState = "amount" | "account" | "receipt";

export default function WithdrawalDialog({
  open,
  onOpenChange,
  balance,
  affiliateProfile,
  onSuccess,
}: WithdrawalDialogProps) {
  const { toast } = useToast();
  const [state, setState] = useState<WithdrawalState>("amount");
  const [amount, setAmount] = useState("");
  const [accountMode, setAccountMode] = useState<"saved" | "new">("saved");
  const [newBankData, setNewBankData] = useState({ iban: "", account_holder_name: "", bank_name: "" });
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  const handleAmountSubmit = async () => {
    const parsed = Number(amount);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({ title: "Valor inválido", description: "Introduza um valor superior a 0.", variant: "destructive" });
      return;
    }

    if (parsed > balance) {
      toast({ title: "Saldo insuficiente", description: "Não tem saldo suficiente para este saque.", variant: "destructive" });
      return;
    }

    if (!affiliateProfile?.iban && accountMode === "saved") {
      toast({ title: "Conta bancária não configurada", description: "Configura os dados bancários nas definições.", variant: "destructive" });
      return;
    }

    setState("account");
  };

  const handleAccountSubmit = async () => {
    if (!affiliateProfile) return;

    setLoading(true);

    try {
      const parsed = Number(amount);
      let bankData = { iban: "", account_holder_name: "", bank_name: "" };

      if (accountMode === "saved") {
        bankData = {
          iban: affiliateProfile.iban,
          account_holder_name: affiliateProfile.account_holder_name,
          bank_name: affiliateProfile.bank_name,
        };
      } else {
        if (!newBankData.iban || !newBankData.account_holder_name || !newBankData.bank_name) {
          toast({ title: "Dados incompletos", description: "Preencha todos os campos.", variant: "destructive" });
          setLoading(false);
          return;
        }

        bankData = newBankData;

        const { error: updateError } = await supabase
          .from("affiliate_profiles")
          .update({
            iban: newBankData.iban,
            account_holder_name: newBankData.account_holder_name,
            bank_name: newBankData.bank_name,
          })
          .eq("id", affiliateProfile.id);

        if (updateError) throw updateError;
      }

      const { error: withdrawError, data: withdrawData } = await supabase.rpc("request_affiliate_withdrawal", {
        p_amount_kz: parsed,
      });

      if (withdrawError) throw withdrawError;

      const withdrawal = withdrawData;
      if (withdrawal) {
        setSuccessData({
          transaction_id: withdrawal.transaction_id,
          payment_id: withdrawal.payment_id || withdrawal.transaction_id,
          amount: parsed,
          bank_name: bankData.bank_name,
          account_holder_name: bankData.account_holder_name,
          iban: bankData.iban,
          payment_reference: withdrawal.payment_reference || "REF-PENDING",
          requested_at: new Date().toISOString(),
          paid_at: null,
          status: "processing",
        });
        setState("receipt");
      }

      onSuccess();
    } catch (error: any) {
      toast({ title: "Erro ao solicitar saque", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount("");
    setAccountMode("saved");
    setNewBankData({ iban: "", account_holder_name: "", bank_name: "" });
    setState("amount");
    setSuccessData(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {state === "amount" && (
          <>
            <DialogHeader>
              <DialogTitle>Solicitar Saque</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Saldo disponível para saque</div>
                <div className="mt-2 text-3xl font-bold text-emerald-600">{formatKwanza(balance)}</div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Valor em Kz</Label>
                <Input
                  id="amount"
                  type="number"
                  min={1000}
                  step={1000}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="text-lg"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleClose()} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={handleAmountSubmit} className="flex-1 gap-2">
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        {state === "account" && (
          <>
            <DialogHeader>
              <DialogTitle>Selecionar Conta Bancária</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                {affiliateProfile?.iban && (
                  <Card
                    className={`cursor-pointer border-2 transition ${accountMode === "saved" ? "border-primary bg-primary/5" : "border-border"}`}
                    onClick={() => setAccountMode("saved")}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold">{affiliateProfile.bank_name || "Banco"}</div>
                          <div className="text-sm text-muted-foreground">{affiliateProfile.account_holder_name}</div>
                          <div className="mt-1 font-mono text-xs">
                            {affiliateProfile.iban?.slice(0, 4)} •••• •••• •••• {affiliateProfile.iban?.slice(-4)}
                          </div>
                        </div>
                        <div className={`mt-1 h-5 w-5 rounded-full border-2 ${accountMode === "saved" ? "border-primary bg-primary" : "border-border"}`} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card
                  className={`cursor-pointer border-2 transition ${accountMode === "new" ? "border-primary bg-primary/5" : "border-border"}`}
                  onClick={() => setAccountMode("new")}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <Plus className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-semibold">Usar nova conta</div>
                      <div className="text-sm text-muted-foreground">Adiciona e usa uma nova conta bancária</div>
                    </div>
                    <div className={`ml-auto h-5 w-5 rounded-full border-2 ${accountMode === "new" ? "border-primary bg-primary" : "border-border"}`} />
                  </CardContent>
                </Card>
              </div>

              {accountMode === "new" && (
                <div className="space-y-3 rounded-lg border border-dashed p-4">
                  <div className="space-y-2">
                    <Label htmlFor="newIban">IBAN</Label>
                    <Input
                      id="newIban"
                      value={newBankData.iban}
                      onChange={(e) => setNewBankData((prev) => ({ ...prev, iban: e.target.value }))}
                      placeholder="AO06..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newHolder">Titular</Label>
                    <Input
                      id="newHolder"
                      value={newBankData.account_holder_name}
                      onChange={(e) => setNewBankData((prev) => ({ ...prev, account_holder_name: e.target.value }))}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newBank">Banco</Label>
                    <Input
                      id="newBank"
                      value={newBankData.bank_name}
                      onChange={(e) => setNewBankData((prev) => ({ ...prev, bank_name: e.target.value }))}
                      placeholder="Nome do banco"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setState("amount")} className="flex-1">
                  Anterior
                </Button>
                <Button onClick={handleAccountSubmit} disabled={loading} className="flex-1 gap-2">
                  {loading ? "A processar..." : "Confirmar Saque"}
                </Button>
              </div>
            </div>
          </>
        )}

        {state === "receipt" && successData && (
          <>
            <DialogHeader>
              <DialogTitle>Saque Solicitado</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <WithdrawalReceipt
                transactionId={successData.transaction_id}
                paymentId={successData.payment_id}
                affiliateName={affiliateProfile?.account_holder_name || "Utilizador"}
                affiliateCode={affiliateProfile?.affiliate_code || ""}
                amount={successData.amount}
                bankName={successData.bank_name}
                accountHolder={successData.account_holder_name}
                iban={successData.iban}
                paymentReference={successData.payment_reference}
                requestedAt={successData.requested_at}
                paidAt={successData.paid_at}
                status={successData.status}
              />
            </div>
            <Button onClick={handleClose} className="w-full">
              Fechar
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
