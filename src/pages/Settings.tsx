import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

type BankData = {
  iban: string;
  account_holder_name: string;
  bank_name: string;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [bankData, setBankData] = useState<BankData>({
    iban: "",
    account_holder_name: "",
    bank_name: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);

      const [{ data: profileData }, { data: affiliateData }] = await Promise.all([
        supabase.from("profiles").select("full_name, phone, email").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("affiliate_profiles")
          .select("iban, account_holder_name, bank_name")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      setFullName(profileData?.full_name ?? "");
      setPhone(profileData?.phone ?? "");
      setEmail(profileData?.email ?? user.email ?? "");
      setBankData({
        iban: affiliateData?.iban ?? "",
        account_holder_name: affiliateData?.account_holder_name ?? "",
        bank_name: affiliateData?.bank_name ?? "",
      });
      setLoading(false);
    };

    load();
  }, [user]);

  const saveSettings = async () => {
    if (!user) return;

    setSaving(true);

    try {
      const profilePatch: Record<string, string> = {
        full_name: fullName,
        phone: phone.replace(/\D/g, ""),
      };

      const { error: profileError } = await supabase
        .from("profiles")
        .update(profilePatch)
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      if (email.trim() && email.trim().toLowerCase() !== user.email?.toLowerCase()) {
        const { error: emailError } = await supabase
          .from("profiles")
          .update({ pending_email: email.trim().toLowerCase(), email_verified: false })
          .eq("user_id", user.id);

        if (emailError) throw emailError;
      }

      if (oldPassword || newPassword) {
        if (!oldPassword || !newPassword) {
          throw new Error("Preenche a senha atual e a nova senha.");
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email!,
          password: oldPassword,
        });

        if (signInError) throw new Error("Senha atual incorreta.");

        const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
        if (passwordError) throw passwordError;
      }

      const { error: bankError } = await supabase
        .from("affiliate_profiles")
        .upsert(
          {
            user_id: user.id,
            iban: bankData.iban,
            account_holder_name: bankData.account_holder_name,
            bank_name: bankData.bank_name,
          },
          { onConflict: "user_id" },
        );

      if (bankError) throw bankError;

      toast({ title: "Definições guardadas", description: "Os seus dados foram atualizados." });
      setOldPassword("");
      setNewPassword("");
    } catch (error: any) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell title="Definições" description="Atualize os seus dados pessoais e informações bancárias.">
      <Card className="mx-auto max-w-4xl">
        <CardHeader>
          <CardTitle>Definições da conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar definições...
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="oldPassword">Senha atual</Label>
                  <Input id="oldPassword" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova senha</Label>
                  <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="mb-4 text-lg font-semibold">Dados bancários</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="iban">IBAN</Label>
                    <Input id="iban" value={bankData.iban} onChange={(e) => setBankData((prev) => ({ ...prev, iban: e.target.value }))} placeholder="0000 0000 0000 0000" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="account_holder_name">Titular da conta</Label>
                    <Input id="account_holder_name" value={bankData.account_holder_name} onChange={(e) => setBankData((prev) => ({ ...prev, account_holder_name: e.target.value }))} placeholder="Nome completo" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="bank_name">Banco</Label>
                    <Input id="bank_name" value={bankData.bank_name} onChange={(e) => setBankData((prev) => ({ ...prev, bank_name: e.target.value }))} placeholder="Nome do banco" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveSettings} disabled={saving}>
                  {saving ? "A guardar..." : "Guardar definições"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
