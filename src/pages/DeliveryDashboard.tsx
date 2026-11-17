import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDeliveryPerson } from "@/hooks/useDeliveryPerson";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, MapPin, Phone, Truck } from "lucide-react";
import { deliveryStatusTransitions } from "@/lib/delivery";

type DeliveryStatus = "awaiting_pickup" | "preparing" | "ready_for_delivery" | "in_delivery" | "delivered" | "failed_delivery" | "cancelled";
type DeliveryOrder = {
  id: string;
  order_number: string;
  user_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_location: string | null;
  delivery_address: string | null;
  delivery_fee: number;
  delivery_distance_km: number | null;
  delivery_status: DeliveryStatus;
  discount: number;
  items: unknown;
  notes: string | null;
  status: string;
  subtotal: number;
  total: number | null;
  created_at: string;
  is_primary: boolean;
};
type Filter = "all" | "pending" | "in_progress" | "delivered" | "cancelled";
const statusNames: Record<DeliveryStatus, string> = {
  awaiting_pickup: "Aguardando recolha",
  preparing: "Em preparação",
  ready_for_delivery: "Pronto para entrega",
  in_delivery: "Em entrega",
  delivered: "Entregue",
  failed_delivery: "Falha na entrega",
  cancelled: "Cancelado",
};
const labelFilter: Record<Filter, string> = { all: "Todos", pending: "Pendentes", in_progress: "Em andamento", delivered: "Concluídos", cancelled: "Cancelados" };

function orderItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (typeof value !== "string") return [];
  try { return orderItems(JSON.parse(value)); } catch { return []; }
}

function money(value: number | null | undefined) {
  return `${Number(value || 0).toLocaleString("pt-AO")} Kz`;
}

function locationHref(location: string) {
  const trimmed = location.trim();
  if (/^https:\/\/(maps\.google\.com|www\.google\.com\/maps|maps\.app\.goo\.gl)\//i.test(trimmed)) return trimmed;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

export default function DeliveryDashboard() {
  const { user, signOut } = useAuth();
  const { deliveryPerson, loading: personLoading } = useDeliveryPerson();
  const { toast } = useToast();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<DeliveryOrder | null>(null);
  const [history, setHistory] = useState<{ delivery_status: DeliveryStatus; notes: string | null; created_at: string }[]>([]);
  const [statusNote, setStatusNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    if (!deliveryPerson?.id) return;
    setLoading(true);
    const { data: assignments, error: assignmentError } = await supabase.from("delivery_order_assignments")
      .select("order_id,is_primary").eq("delivery_person_id", deliveryPerson.id).eq("active", true);
    if (assignmentError) {
      toast({ title: "Não foi possível carregar as atribuições", description: assignmentError.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const assignmentMap = new Map((assignments || []).map((assignment) => [assignment.order_id, assignment.is_primary]));
    const ids = [...assignmentMap.keys()];
    if (!ids.length) {
      setOrders([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from("store_orders").select("*").in("id", ids).order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Não foi possível carregar os pedidos", description: error.message, variant: "destructive" });
      return;
    }
    setOrders((data || []).map((order) => ({
      ...order,
      delivery_status: order.delivery_status as DeliveryStatus,
      is_primary: assignmentMap.get(order.id) === true,
    })));
  }, [deliveryPerson?.id, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) {
      setHistory([]);
      return;
    }
    void supabase.from("delivery_order_status_history")
      .select("delivery_status,notes,created_at")
      .eq("order_id", selected.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast({ title: "Não foi possível carregar o histórico", description: error.message, variant: "destructive" });
        setHistory((data || []) as typeof history);
      });
  }, [selected, toast]);

  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (filter === "pending") return ["awaiting_pickup", "preparing", "ready_for_delivery"].includes(order.delivery_status);
    if (filter === "in_progress") return ["in_delivery", "failed_delivery"].includes(order.delivery_status);
    if (filter === "delivered") return order.delivery_status === "delivered";
    if (filter === "cancelled") return order.delivery_status === "cancelled";
    return true;
  }), [filter, orders]);

  const updateStatus = async (status: DeliveryStatus) => {
    if (!selected) return;
    setSavingStatus(true);
    const { error } = await supabase.rpc("update_delivery_order_status", {
      p_order_id: selected.id,
      p_status: status,
      p_notes: statusNote.trim() || null,
    });
    setSavingStatus(false);
    if (error) {
      toast({ title: "Não foi possível atualizar o estado", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Estado da entrega atualizado" });
    setStatusNote("");
    setSelected({ ...selected, delivery_status: status, status: status === "delivered" ? "delivered" : status === "cancelled" ? "cancelled" : selected.status });
    await load();
  };

  if (personLoading || loading && !deliveryPerson) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">A carregar painel...</div>;
  if (!user || !deliveryPerson || deliveryPerson.status !== "active") return <div className="p-8 text-center">A conta de entregador está indisponível. <Button variant="link" onClick={() => void signOut()}>Terminar sessão</Button></div>;

  const pendingCount = orders.filter((order) => ["awaiting_pickup", "preparing", "ready_for_delivery"].includes(order.delivery_status)).length;
  const activeCount = orders.filter((order) => ["in_delivery", "failed_delivery"].includes(order.delivery_status)).length;
  const doneCount = orders.filter((order) => order.delivery_status === "delivered").length;

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Truck className="h-5 w-5" /></span><div><p className="font-semibold">Painel de entregas</p><p className="text-xs text-muted-foreground">{deliveryPerson.name}</p></div></div>
          <Button size="sm" variant="outline" onClick={() => void signOut()}>Sair</Button>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Atribuídos</p><p className="mt-1 text-2xl font-semibold">{orders.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pendentes</p><p className="mt-1 text-2xl font-semibold">{pendingCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Em andamento</p><p className="mt-1 text-2xl font-semibold">{activeCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Concluídos</p><p className="mt-1 text-2xl font-semibold">{doneCount}</p></CardContent></Card>
        </div>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Os meus pedidos</CardTitle>
            <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(labelFilter) as Filter[]).map((value) => <SelectItem key={value} value={value}>{labelFilter[value]}</SelectItem>)}</SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">A carregar pedidos...</p>}
            {!loading && filteredOrders.map((order) => (
              <button key={order.id} type="button" onClick={() => setSelected(order)} className="block w-full rounded-lg border bg-background p-4 text-left transition hover:border-primary/50 hover:shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{order.customer_name || "Cliente"}</p>
                    <p className="mt-1 text-xs font-medium text-primary">{order.order_number}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{order.customer_phone || "Sem telefone"} · {new Date(order.created_at).toLocaleDateString("pt-AO")}</p>
                  </div>
                  <Badge variant={order.delivery_status === "delivered" ? "default" : order.delivery_status === "cancelled" || order.delivery_status === "failed_delivery" ? "destructive" : "outline"}>{statusNames[order.delivery_status]}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="line-clamp-1 text-muted-foreground">{orderItems(order.items).map((item) => `${String(item.name || item.product || item.title || "Produto")} ×${String(item.qty || item.quantity || 1)}`).join(", ") || "Sem produtos"}</span>
                  <span className="font-semibold">{money(order.total)}</span>
                </div>
                {(order.delivery_address || order.customer_location) && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{order.delivery_address || order.customer_location}</p>}
              </button>
            ))}
            {!loading && filteredOrders.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{orders.length ? "Nenhum pedido corresponde a este filtro." : "Ainda não tem pedidos atribuídos."}</p>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Detalhes da entrega</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold">{selected.customer_name || "Cliente"}</h3><Badge>{statusNames[selected.delivery_status]}</Badge></div>
              <p className="text-sm font-medium text-primary">{selected.order_number}</p>
              <div className="grid gap-2 text-sm">
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{selected.customer_phone || "Sem telefone"}</p>
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{selected.delivery_address || selected.customer_location || "Sem localização"}</p>
                <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" />{new Date(selected.created_at).toLocaleString("pt-AO")}</p>
              </div>
              {(selected.delivery_address || selected.customer_location) && <Button asChild variant="outline" className="w-full"><a href={locationHref(selected.delivery_address || selected.customer_location || "")} target="_blank" rel="noreferrer">Abrir localização no mapa</a></Button>}
              {selected.customer_phone && <Button asChild variant="outline" className="w-full"><a href={`https://wa.me/${selected.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Contactar cliente no WhatsApp</a></Button>}
              <div className="rounded-md border p-3 text-sm">
                <p className="mb-2 font-semibold">Produtos</p>
                <div className="space-y-2">{orderItems(selected.items).map((item, index) => {
                  const quantity = Number(item.qty || item.quantity || 1);
                  const price = Number(item.price || item.price_kz || 0);
                  return <div key={index} className="flex justify-between gap-3"><span>{String(item.name || item.product || item.title || `Produto ${index + 1}`)} ×{quantity}</span><span>{money(price * quantity)}</span></div>;
                })}</div>
              </div>
              <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{money(selected.subtotal)}</span></div>
                <div className="flex justify-between"><span>Taxa de entrega</span><span>{money(selected.delivery_fee)}</span></div>
                {selected.discount > 0 && <div className="flex justify-between"><span>Desconto</span><span>-{money(selected.discount)}</span></div>}
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Total{selected.status === "pending" ? " (a cobrar se pagamento na entrega)" : ""}</span><span>{money(selected.total)}</span></div>
              </div>
              {selected.delivery_distance_km !== null && <p className="text-sm text-muted-foreground">Distância informada: {selected.delivery_distance_km} km</p>}
              {selected.notes && <div className="rounded-md border p-3 text-sm"><b>Observações:</b> {selected.notes}</div>}
              {selected.is_primary && deliveryStatusTransitions[selected.delivery_status].length > 0 && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-semibold">Atualizar estado da entrega</p>
                  <Textarea value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Observação (opcional)" />
                  <div className="flex flex-wrap gap-2">{deliveryStatusTransitions[selected.delivery_status].map((status) => <Button key={status} size="sm" variant={status === "cancelled" ? "destructive" : "default"} disabled={savingStatus} onClick={() => void updateStatus(status)}>{savingStatus ? "A guardar..." : statusNames[status]}</Button>)}</div>
                </div>
              )}
              {history.length > 0 && <div className="space-y-2"><p className="text-sm font-semibold">Histórico</p>{history.map((entry, index) => <div key={`${entry.created_at}-${index}`} className="border-l-2 border-primary/30 pl-3 text-sm"><p>{statusNames[entry.delivery_status]}</p><p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString("pt-AO")}{entry.notes ? ` · ${entry.notes}` : ""}</p></div>)}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
