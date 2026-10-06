import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, MapPin, Phone, User } from "lucide-react";

type Order = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_location: string | null;
  items: any;
  total: number | null;
  notes: string | null;
  status: string;
  created_at: string;
};

export default function Orders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Order[]>([]);
  const [open, setOpen] = useState<Order | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [manualForm, setManualForm] = useState({ customer_name: "", customer_phone: "", customer_location: "", item_name: "", quantity: "1", price: "", notes: "" });

  const normalizeOrderItems = (value: any): any[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          return normalizeOrderItems(parsed);
        } catch {
          return [];
        }
      }
      return [];
    }

    const possibleKeys = ["items", "products", "line_items", "order_items", "cart"];
    for (const key of possibleKeys) {
      const candidate = value[key];
      if (candidate) {
        const normalized = normalizeOrderItems(candidate);
        if (normalized.length > 0) return normalized;
      }
    }

    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.result)) return value.result;

    return [];
  };

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("store_orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const parsed = (data as any[] | null) || [];
    const normalized = parsed.map((r) => {
      let items = r.items;
      try {
        if (typeof items === "string" && items.trim()) {
          items = JSON.parse(items);
        }
      } catch {
        // keep original if parse fails
      }
      items = normalizeOrderItems(items);
      return { ...r, items };
    });
    setRows(normalized as Order[]);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`orders-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_orders",
          filter: `user_id=eq.${user.id}`,
        },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("store_orders").update({ status }).eq("id", id);
    if (error) return;
    setOpen((current) => current ? { ...current, status } : current);
    load();
  };

  const deleteOrder = async (id: string) => {
    if (!user || !window.confirm("Eliminar este pedido?")) return;
    const { error } = await supabase.from("store_orders").delete().eq("id", id).eq("user_id", user.id);
    if (error) return;
    setOpen(null);
    await load();
  };

  const addManualOrder = async () => {
    if (!user || !manualForm.customer_name.trim() || !manualForm.item_name.trim()) return;
    setSaving(true);
    const quantity = Math.max(1, Number(manualForm.quantity) || 1);
    const price = Math.max(0, Number(manualForm.price) || 0);
    const values = { customer_name: manualForm.customer_name.trim(), customer_phone: manualForm.customer_phone.replace(/\D/g, "") || null, customer_location: manualForm.customer_location.trim() || null, items: [{ name: manualForm.item_name.trim(), qty: quantity, price }], total: quantity * price, notes: manualForm.notes.trim() || null };
    const { error } = editingId
      ? await supabase.from("store_orders").update(values).eq("id", editingId).eq("user_id", user.id)
      : await supabase.from("store_orders").insert({ user_id: user.id, ...values, status: "new" });
    setSaving(false);
    if (error) return toast({ title: "Não foi possível guardar o pedido", description: error.message, variant: "destructive" });
    setManualForm({ customer_name: "", customer_phone: "", customer_location: "", item_name: "", quantity: "1", price: "", notes: "" });
    setEditingId(null);
    setManualOpen(false);
    await load();
    toast({ title: editingId ? "Pedido atualizado" : "Pedido registado" });
  };

  const editOrder = (order: Order) => {
    const item = Array.isArray(order.items) ? order.items[0] || {} : {};
    setEditingId(order.id);
    setManualForm({ customer_name: order.customer_name || "", customer_phone: order.customer_phone || "", customer_location: order.customer_location || "", item_name: item.name || item.product || item.title || "", quantity: String(item.qty || 1), price: String(item.price ?? ""), notes: order.notes || "" });
    setManualOpen(true);
  };

  const statusLabel: Record<string, string> = {
    new: "Novo",
    confirmed: "Confirmado",
    delivered: "Entregue",
    cancelled: "Cancelado",
  };
  const newOrderCount = rows.filter((order) => order.status === "new").length;
  const accumulatedValue = rows.reduce((total, order) => total + Number(order.total || 0), 0);

  return (
    <DashboardShell
      title="Pedidos"
      description="Registe pedidos recebidos pela IA ou adicionados manualmente."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total de pedidos</p><p className="mt-1 text-2xl font-semibold">{rows.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Novos</p><p className="mt-1 text-2xl font-semibold">{newOrderCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Valor acumulado</p><p className="mt-1 text-2xl font-semibold">{accumulatedValue.toLocaleString("pt-AO")} Kz</p></CardContent></Card>
      </div>
      <div className="mb-4 flex justify-end"><Button onClick={() => setManualOpen(true)}>Novo pedido</Button></div>
      <div className="grid gap-3">
        {rows.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Nenhum pedido ainda. A IA cria pedidos durante as conversas com
              seus clientes.
            </CardContent>
          </Card>
        )}
        {rows.map((o) => (
          <Card
            key={o.id}
            className="cursor-pointer transition hover:shadow-md"
            onClick={() => setOpen(o)}
          >
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  <div className="font-semibold truncate">
                    {o.customer_name || "Cliente sem nome"}
                  </div>
                </div>
                <div className="mt-1 text-sm text-muted-foreground truncate">
                  +{o.customer_phone || "-"}
                </div>
                <div className="mt-2 text-sm">
                  {Array.isArray(o.items) && o.items.length > 0 ? (
                    <>
                      {o.items.slice(0, 2).map((it: any, idx: number) => (
                        <span key={idx} className="block truncate">
                          {it.name || it.product || it.title || JSON.stringify(it)} {it.qty ? `x${it.qty}` : ""}
                        </span>
                      ))}
                      {o.items.length > 2 && (
                        <span className="text-xs text-muted-foreground">e mais {o.items.length - 2} item(s)</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Sem itens registrados.</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <Badge variant={o.status === "new" ? "default" : "outline"}>
                  {statusLabel[o.status] || o.status}
                </Badge>
                <div className="mt-1 font-bold text-primary">
                  {Number(o.total || 0).toLocaleString("pt-AO")} Kz
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("pt-AO")}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Editar pedido" : "Novo pedido"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2"><div><Label>Cliente</Label><Input value={manualForm.customer_name} onChange={(event) => setManualForm({ ...manualForm, customer_name: event.target.value })} /></div><div><Label>Telefone</Label><Input value={manualForm.customer_phone} onChange={(event) => setManualForm({ ...manualForm, customer_phone: event.target.value })} /></div></div>
            <div><Label>Localização</Label><Input value={manualForm.customer_location} onChange={(event) => setManualForm({ ...manualForm, customer_location: event.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px_140px]"><div><Label>Item</Label><Input value={manualForm.item_name} onChange={(event) => setManualForm({ ...manualForm, item_name: event.target.value })} /></div><div><Label>Quantidade</Label><Input type="number" min="1" value={manualForm.quantity} onChange={(event) => setManualForm({ ...manualForm, quantity: event.target.value })} /></div><div><Label>Preço unitário</Label><Input type="number" min="0" value={manualForm.price} onChange={(event) => setManualForm({ ...manualForm, price: event.target.value })} /></div></div>
            <div><Label>Notas</Label><Textarea value={manualForm.notes} onChange={(event) => setManualForm({ ...manualForm, notes: event.target.value })} /></div>
            <Button onClick={() => void addManualOrder()} disabled={saving || !manualForm.customer_name.trim() || !manualForm.item_name.trim()}>{saving ? "A guardar..." : editingId ? "Guardar alterações" : "Guardar pedido"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!open} onOpenChange={() => setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhe do pedido</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-4">
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {open.customer_name || "-"}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />+
                  {open.customer_phone || "-"}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {open.customer_location || "Sem localização"}
                </div>
              </div>
              <div>
                <div className="mb-2 font-semibold">Itens</div>
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  {Array.isArray(open.items) && open.items.length > 0 ? (
                    open.items.map((it: any, i: number) => (
                      <div key={i} className="rounded-sm border p-2">
                        <div className="flex justify-between items-start">
                          <div className="font-medium">{it.name || it.product || it.title || `Item ${i + 1}`}</div>
                          <div className="text-sm text-muted-foreground">{it.qty ? `x${it.qty}` : ""}</div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground space-y-1">
                          {it.price !== undefined && (
                            <div>Preço: {Number(it.price).toLocaleString("pt-AO")} Kz</div>
                          )}
                          {it.price_kz !== undefined && (
                            <div>Preço: {Number(it.price_kz).toLocaleString("pt-AO")} Kz</div>
                          )}
                          {it.color && <div>Cor: {it.color}</div>}
                          {it.variant && <div>Variante: {it.variant}</div>}
                          {it.details && <div>Detalhes: {it.details}</div>}
                          {it.options && typeof it.options === "object" && (
                            <div>
                              Opções:
                              <ul className="list-disc list-inside">
                                {Object.entries(it.options).map(([k, v]) => (
                                  <li key={k} className="text-xs">{k}: {String(v)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {/* fallback: render any other fields */}
                          {Object.keys(it).filter(k => !["name","product","title","qty","price","price_kz","color","variant","details","options"].includes(k)).length > 0 && (
                            <div className="text-xs">
                              Outros: {Object.entries(it).filter(([k]) => !["name","product","title","qty","price","price_kz","color","variant","details","options"].includes(k)).map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' • ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">Sem itens registrados.</div>
                  )}
                </div>
              </div>
              {open.notes && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <b>Notas:</b> {open.notes}
                </div>
              )}
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => editOrder(open)}>Editar pedido</Button><Button variant="destructive" className="flex-1" onClick={() => void deleteOrder(open.id)}>Eliminar pedido</Button></div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-2xl font-bold text-primary">
                  {Number(open.total || 0).toLocaleString("pt-AO")} Kz
                </div>
                <Select
                  value={open.status}
                  onValueChange={(v) => updateStatus(open.id, v)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Novo</SelectItem>
                    <SelectItem value="confirmed">Confirmado</SelectItem>
                    <SelectItem value="delivered">Entregue</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {open.customer_phone && (
                <Button
                  className="w-full"
                  onClick={() =>
                    window.open(
                      `https://wa.me/${open.customer_phone}`,
                      "_blank",
                    )
                  }
                >
                  Falar no WhatsApp
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
