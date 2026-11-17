import { FormEvent, useCallback, useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ChevronDown, ChevronUp, Clock3, MapPin, Package, Pencil, Plus, Truck } from "lucide-react";

type DeliveryPerson = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  notes: string | null;
  status: string;
};
type AssignedOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_location: string | null;
  delivery_address: string | null;
  delivery_status: string;
  total: number | null;
  created_at: string;
};
type ActiveAssignment = {
  delivery_person_id: string;
  is_primary: boolean;
  assigned_at: string;
  store_orders: AssignedOrder | null;
};
type FeeType = "free" | "fixed" | "per_order" | "distance";
type DistanceRule = { max_km: number; fee: number };
type FeeSettings = { business_id: string; fee_type: FeeType; default_fee: number; distance_rules: DistanceRule[] };
type PersonForm = { name: string; email: string; phone: string; password: string; avatar_url: string; notes: string };
const emptyPerson: PersonForm = { name: "", email: "", phone: "", password: "", avatar_url: "", notes: "" };
const deliveryStatusLabels: Record<string, string> = {
  awaiting_pickup: "Aguardando recolha",
  preparing: "Em preparação",
  ready_for_delivery: "Pronto para entrega",
  in_delivery: "Em entrega",
  delivered: "Entregue",
  failed_delivery: "Falha na entrega",
  cancelled: "Cancelado",
};

function getFunctionError(error: { message: string; context?: unknown } | null, dataError?: unknown) {
  if (typeof dataError === "string") return dataError;
  if (error?.context instanceof Response) return error.context.clone().json().then((body) => String(body?.error || error.message));
  return Promise.resolve(error?.message || "unknown_error");
}

function formatMoney(value: number | null) {
  return `${Number(value || 0).toLocaleString("pt-AO")} Kz`;
}

function formatDeliveryDate(value: string) {
  return new Date(value).toLocaleString("pt-AO", { dateStyle: "short", timeStyle: "short" });
}

function deliveryStatusVariant(status: string) {
  if (status === "delivered") return "default";
  if (status === "failed_delivery" || status === "cancelled") return "destructive";
  return "outline";
}

function parseDistanceRules(value: string): DistanceRule[] | null {
  const rows = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const rules: DistanceRule[] = [];
  for (const row of rows) {
    const match = row.match(/^(\d+(?:[.,]\d+)?)\s*=\s*(\d+(?:[.,]\d+)?)$/);
    if (!match) return null;
    const max_km = Number(match[1].replace(",", "."));
    const fee = Number(match[2].replace(",", "."));
    if (!Number.isFinite(max_km) || !Number.isFinite(fee) || max_km <= 0 || fee < 0) return null;
    rules.push({ max_km, fee });
  }
  if (rules.some((rule, index) => index > 0 && rule.max_km <= rules[index - 1].max_km)) return null;
  return rules;
}

export default function DeliveryManagement() {
  const { membership, isOwner, ownerUserId, loading: membershipLoading } = useBusinessMembership();
  const { toast } = useToast();
  const [people, setPeople] = useState<DeliveryPerson[]>([]);
  const [assignmentsByPerson, setAssignmentsByPerson] = useState<Record<string, ActiveAssignment[]>>({});
  const [expandedPeople, setExpandedPeople] = useState<string[]>([]);
  const [feeSettings, setFeeSettings] = useState<FeeSettings | null>(null);
  const [feeType, setFeeType] = useState<FeeType>("free");
  const [defaultFee, setDefaultFee] = useState("0");
  const [distanceRules, setDistanceRules] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryPerson | null>(null);
  const [form, setForm] = useState<PersonForm>(emptyPerson);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!membership?.business_id || !ownerUserId || !isOwner) return;
    setLoading(true);
    const [{ data: peopleData, error: peopleError }, { data: feeData, error: feeError }] = await Promise.all([
      supabase.functions.invoke("delivery-management", { body: { action: "list" } }),
      supabase.from("delivery_fee_settings").select("*").eq("business_id", membership.business_id).maybeSingle(),
    ]);
    if (peopleError || peopleData?.error) {
      setLoading(false);
      toast({ title: "Não foi possível carregar os entregadores", description: await getFunctionError(peopleError, peopleData?.error), variant: "destructive" });
      return;
    }
    if (feeError) {
      setLoading(false);
      toast({ title: "Não foi possível carregar as taxas", description: feeError.message, variant: "destructive" });
      return;
    }
    const deliveryPeople = (peopleData?.people || []) as DeliveryPerson[];
    setPeople(deliveryPeople);
    const nextAssignments: Record<string, ActiveAssignment[]> = {};
    if (deliveryPeople.length) {
      const { data: assignmentRows, error: assignmentError } = await supabase.from("delivery_order_assignments")
        .select("delivery_person_id,order_id,is_primary,assigned_at")
        .in("delivery_person_id", deliveryPeople.map((person) => person.id))
        .eq("active", true)
        .order("assigned_at", { ascending: false });
      if (assignmentError) {
        setLoading(false);
        toast({ title: "Não foi possível carregar os pedidos atribuídos", description: assignmentError.message, variant: "destructive" });
        return;
      }

      const orderIds = [...new Set((assignmentRows || []).map((assignment) => assignment.order_id))];
      if (orderIds.length) {
        const { data: orders, error: ordersError } = await supabase.from("store_orders")
          .select("id,order_number,customer_name,customer_phone,customer_location,delivery_address,delivery_status,total,created_at")
          .eq("user_id", ownerUserId)
          .in("id", orderIds);
        if (ordersError) {
          setLoading(false);
          toast({ title: "Não foi possível carregar os pedidos atribuídos", description: ordersError.message, variant: "destructive" });
          return;
        }

        const ordersById = new Map((orders || []).map((order) => [order.id, order as AssignedOrder]));
        for (const assignment of assignmentRows || []) {
          const order = ordersById.get(assignment.order_id);
          if (!order) continue;
          (nextAssignments[assignment.delivery_person_id] ||= []).push({
            delivery_person_id: assignment.delivery_person_id,
            is_primary: assignment.is_primary,
            assigned_at: assignment.assigned_at,
            store_orders: order,
          });
        }
      }
    }
    setAssignmentsByPerson(nextAssignments);
    if (feeData) {
      const settings = feeData as FeeSettings;
      setFeeSettings(settings);
      setFeeType(settings.fee_type);
      setDefaultFee(String(settings.default_fee));
      setDistanceRules(settings.distance_rules.map((rule) => `${rule.max_km}=${rule.fee}`).join("\n"));
    }
    setLoading(false);
  }, [isOwner, membership?.business_id, ownerUserId, toast]);

  useEffect(() => { void load(); }, [load]);

  const savePerson = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const action = editing ? "update" : "create";
    const { data, error } = await supabase.functions.invoke("delivery-management", {
      body: { action, person_id: editing?.id, ...form },
    });
    setSaving(false);
    if (error || data?.error) {
      const code = await getFunctionError(error, data?.error);
      const message = code === "email_already_registered"
        ? "Já existe uma conta registada com este e-mail."
        : code === "invalid_input"
          ? "Informe nome, e-mail válido e uma palavra-passe com pelo menos 8 caracteres."
          : code;
      toast({ title: "Não foi possível guardar o entregador", description: message, variant: "destructive" });
      return;
    }
    toast({
      title: editing ? "Entregador atualizado" : "Conta de entregador criada",
      description: editing ? undefined : "Foi iniciado o envio do código de verificação para o e-mail indicado.",
    });
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyPerson);
    await load();
  };

  const edit = (person: DeliveryPerson) => {
    setEditing(person);
    setForm({
      name: person.name,
      email: person.email,
      phone: person.phone || "",
      password: "",
      avatar_url: person.avatar_url || "",
      notes: person.notes || "",
    });
    setDialogOpen(true);
  };

  const setStatus = async (person: DeliveryPerson, status: "active" | "suspended" | "removed") => {
    if (status === "removed" && !window.confirm(`Remover a conta de ${person.name}?`)) return;
    const { data, error } = await supabase.functions.invoke("delivery-management", {
      body: { action: "status", person_id: person.id, status },
    });
    if (error || data?.error) {
      const code = await getFunctionError(error, data?.error);
      toast({
        title: "Não foi possível alterar o estado",
        description: code === "email_not_verified" ? "O entregador precisa confirmar o e-mail antes de ser ativado." : code,
        variant: "destructive",
      });
      return;
    }
    await load();
  };

  const saveFees = async (event: FormEvent) => {
    event.preventDefault();
    if (!membership?.business_id) return;
    const fee = Number(defaultFee);
    if (!Number.isFinite(fee) || fee < 0) {
      toast({ title: "Taxa inválida", description: "Informe um valor igual ou superior a zero.", variant: "destructive" });
      return;
    }
    const rules = feeType === "distance" ? parseDistanceRules(distanceRules) : [];
    if (feeType === "distance" && (!rules || !rules.length)) {
      toast({ title: "Regras de distância inválidas", description: "Use uma regra por linha no formato quilómetros=taxa, por exemplo 5=1000.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("delivery_fee_settings").upsert({
      business_id: membership.business_id,
      fee_type: feeType,
      default_fee: feeType === "free" || feeType === "per_order" ? 0 : fee,
      distance_rules: rules,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Não foi possível guardar as taxas", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Configuração de entrega guardada" });
    await load();
  };

  const activeAssignments = Object.values(assignmentsByPerson).flat();
  const deliveredAssignments = activeAssignments.filter(({ store_orders }) => store_orders?.delivery_status === "delivered").length;
  const ongoingAssignments = activeAssignments.filter(({ store_orders }) =>
    store_orders && ["preparing", "ready_for_delivery", "in_delivery", "failed_delivery"].includes(store_orders.delivery_status),
  ).length;

  if (membershipLoading) return <DashboardShell title="Entregadores"><p>A carregar...</p></DashboardShell>;
  if (!isOwner) return <DashboardShell title="Entregadores"><p className="text-sm text-muted-foreground">Apenas o responsável da empresa pode gerir entregadores.</p></DashboardShell>;

  return (
    <DashboardShell title="Entregadores" description="Gira contas, atribuições e taxas de entrega da empresa.">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setForm(emptyPerson); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Cadastrar entregador
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><span className="rounded-full bg-primary/10 p-2 text-primary"><Truck className="h-4 w-4" /></span><div><p className="text-sm text-muted-foreground">Entregadores ativos</p><p className="text-xl font-semibold">{people.filter((person) => person.status === "active").length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><span className="rounded-full bg-primary/10 p-2 text-primary"><Package className="h-4 w-4" /></span><div><p className="text-sm text-muted-foreground">Pedidos atribuídos</p><p className="text-xl font-semibold">{activeAssignments.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><span className="rounded-full bg-primary/10 p-2 text-primary"><CheckCircle2 className="h-4 w-4" /></span><div><p className="text-sm text-muted-foreground">Em andamento / entregues</p><p className="text-xl font-semibold">{ongoingAssignments} / {deliveredAssignments}</p></div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Equipa e pedidos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">A carregar entregadores...</p>}
          {!loading && people.map((person) => (
            <div key={person.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Truck className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{person.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{person.email}{person.phone ? ` · ${person.phone}` : ""}</p>
                    {person.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{person.notes}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={person.status === "active" ? "default" : "outline"}>
                    {person.status === "pending" ? "A confirmar e-mail" : person.status === "active" ? "Ativo" : person.status === "suspended" ? "Suspenso" : "Removido"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => edit(person)}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                  {person.status === "active"
                    ? <Button size="sm" variant="outline" onClick={() => void setStatus(person, "suspended")}>Suspender</Button>
                    : person.status !== "removed" && <Button size="sm" onClick={() => void setStatus(person, "active")}>Ativar</Button>}
                  {person.status !== "removed" && <Button size="sm" variant="destructive" onClick={() => void setStatus(person, "removed")}>Remover</Button>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span><strong>{assignmentsByPerson[person.id]?.length || 0}</strong> pedidos atribuídos</span>
                  <span><strong>{assignmentsByPerson[person.id]?.filter(({ store_orders }) => store_orders?.delivery_status === "delivered").length || 0}</strong> entregues</span>
                  <span><strong>{assignmentsByPerson[person.id]?.filter(({ store_orders }) => store_orders && ["awaiting_pickup", "preparing", "ready_for_delivery", "in_delivery", "failed_delivery"].includes(store_orders.delivery_status)).length || 0}</strong> pendentes / em curso</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpandedPeople((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])}
                  aria-expanded={expandedPeople.includes(person.id)}
                >
                  {expandedPeople.includes(person.id) ? <>Ocultar pedidos <ChevronUp className="ml-1 h-4 w-4" /></> : <>Ver pedidos <ChevronDown className="ml-1 h-4 w-4" /></>}
                </Button>
              </div>
              {expandedPeople.includes(person.id) && (
                <div className="mt-3 space-y-2">
                  {(assignmentsByPerson[person.id] || []).map(({ store_orders: order, is_primary: isPrimary, assigned_at: assignedAt }) => order && (
                    <div key={order.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{order.order_number}</span>
                          <Badge variant={deliveryStatusVariant(order.delivery_status)}>{deliveryStatusLabels[order.delivery_status] || order.delivery_status}</Badge>
                          {isPrimary && <Badge variant="outline">Responsável principal</Badge>}
                        </div>
                        <p className="text-sm">{order.customer_name || "Cliente sem nome"}{order.customer_phone ? ` · ${order.customer_phone}` : ""}</p>
                        {(order.delivery_address || order.customer_location) && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{order.delivery_address || order.customer_location}</p>}
                        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />Atribuído em {formatDeliveryDate(assignedAt)}</p>
                      </div>
                      <div className="font-semibold sm:text-right">{formatMoney(order.total)}</div>
                    </div>
                  ))}
                  {!assignmentsByPerson[person.id]?.length && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Ainda não há pedidos ativos atribuídos a este entregador.</p>}
                </div>
              )}
            </div>
          ))}
          {!loading && people.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há entregadores. Cadastre uma conta para começar.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Taxas de entrega</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveFees} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Modelo da taxa padrão</Label>
              <Select value={feeType} onValueChange={(value) => setFeeType(value as FeeType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Frete grátis</SelectItem>
                  <SelectItem value="fixed">Taxa fixa</SelectItem>
                  <SelectItem value="per_order">Definir taxa em cada pedido</SelectItem>
                  <SelectItem value="distance">Por distância manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(feeType === "fixed" || feeType === "distance") && (
              <div className="space-y-2">
                <Label>Taxa padrão (Kz)</Label>
                <Input type="number" min="0" step="1" value={defaultFee} onChange={(event) => setDefaultFee(event.target.value)} />
              </div>
            )}
            {feeType === "distance" && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Intervalos de distância (km=taxa, um por linha)</Label>
                <Textarea value={distanceRules} onChange={(event) => setDistanceRules(event.target.value)} placeholder={"5=1000\n10=2000\n15=3000"} />
                <p className="text-xs text-muted-foreground">A distância será informada manualmente no pedido; a plataforma não inventa coordenadas nem distâncias.</p>
              </div>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "A guardar..." : feeSettings ? "Guardar taxas" : "Guardar configuração"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar entregador" : "Cadastrar entregador"}</DialogTitle></DialogHeader>
          <form onSubmit={savePerson} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Nome completo</Label><Input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
              <div className="space-y-2"><Label>Telefone</Label><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>E-mail</Label><Input required type="email" disabled={Boolean(editing)} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
            {!editing && <div className="space-y-2"><Label>Palavra-passe inicial</Label><Input required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><p className="text-xs text-muted-foreground">A palavra-passe não será exibida novamente.</p></div>}
            <div className="space-y-2"><Label>Fotografia (URL, opcional)</Label><Input type="url" value={form.avatar_url} onChange={(event) => setForm({ ...form, avatar_url: event.target.value })} placeholder="https://..." /></div>
            <div className="space-y-2"><Label>Informações adicionais</Label><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
            <Button type="submit" disabled={saving}>{saving ? "A guardar..." : editing ? "Guardar alterações" : "Criar conta"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
