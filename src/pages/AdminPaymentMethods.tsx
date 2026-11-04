import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Save } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type PaymentMethod = {
  id: string;
  method_type: string;
  label: string;
  iban: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
  entity_name: string | null;
  entity_number: string | null;
  phone_number: string | null;
  instructions: string | null;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
};
type PaymentMethodValues = Omit<PaymentMethod, "id" | "updated_at" | "updated_by">;
type AdminPaymentDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      payment_methods: {
        Row: PaymentMethod;
        Insert: Partial<PaymentMethod> & Pick<PaymentMethod, "method_type" | "label">;
        Update: Partial<PaymentMethod>;
        Relationships: [];
      };
    };
  };
};

const db = supabase as unknown as SupabaseClient<AdminPaymentDatabase>;
const emptyMethod: PaymentMethodValues = {
  method_type: "bank_transfer",
  label: "Transferência bancária",
  iban: "",
  account_holder_name: "",
  bank_name: "",
  entity_name: "",
  entity_number: "",
  phone_number: "",
  instructions: "",
  is_active: true,
};

export default function AdminPaymentMethods() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [method, setMethod] = useState<PaymentMethodValues>(emptyMethod);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db.from("payment_methods").select("*").eq("is_active", true).order("updated_at", { ascending: false }).limit(1);
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const current = data?.[0];
    setMethodId(current?.id || null);
    if (current) {
      const { id: _id, updated_at: _updatedAt, updated_by: _updatedBy, ...values } = current;
      setMethod(values);
    }
    setLoadError("");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const values = { ...method, updated_by: user?.id || null, updated_at: new Date().toISOString() };
    const result = methodId
      ? await db.from("payment_methods").update(values).eq("id", methodId)
      : await db.from("payment_methods").insert(values);
    setSaving(false);
    if (result.error) {
      toast({ title: "Não foi possível guardar", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Dados de pagamento guardados" });
    await load();
  };

  const update = (key: keyof PaymentMethodValues, value: string) => setMethod((current) => ({ ...current, [key]: value }));

  return (
    <AdminShell mode="admin" title="Pagamentos e transações" description="Configure os dados que aparecem aos clientes ao escolher um plano." onRefresh={() => void load()}>
      <Card>
        <CardHeader><CardTitle>Meio de pagamento apresentado aos clientes</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {loadError && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">Não foi possível carregar os dados: {loadError}</p>}
          {loading ? <p className="text-sm text-muted-foreground">A carregar configuração...</p> : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="payment-method-type">Tipo</Label><select id="payment-method-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={method.method_type} onChange={(event) => update("method_type", event.target.value)}><option value="bank_transfer">Transferência bancária</option><option value="entity">Referência / entidade</option></select></div>
                <Field id="payment-label" label="Nome apresentado" value={method.label} onChange={(value) => update("label", value)} />
                <Field id="payment-iban" label="IBAN" value={method.iban || ""} onChange={(value) => update("iban", value)} />
                <Field id="payment-holder" label="Nome do titular" value={method.account_holder_name || ""} onChange={(value) => update("account_holder_name", value)} />
                <Field id="payment-bank" label="Banco" value={method.bank_name || ""} onChange={(value) => update("bank_name", value)} />
                <Field id="payment-entity-name" label="Nome da entidade" value={method.entity_name || ""} onChange={(value) => update("entity_name", value)} />
                <Field id="payment-entity-number" label="Número da entidade" value={method.entity_number || ""} onChange={(value) => update("entity_number", value)} />
                <Field id="payment-phone" label="Telefone" value={method.phone_number || ""} onChange={(value) => update("phone_number", value)} />
              </div>
              <div className="space-y-2"><Label htmlFor="payment-instructions">Instruções adicionais</Label><Textarea id="payment-instructions" value={method.instructions || ""} onChange={(event) => update("instructions", event.target.value)} /></div>
              <Button onClick={() => void save()} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "A guardar..." : "Guardar configuração"}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}