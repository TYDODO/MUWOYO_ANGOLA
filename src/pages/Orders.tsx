import { useCallback, useEffect, useState } from "react";
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
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, MapPin, Phone, User, FileDown, Truck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select as SelectControl, SelectContent as SelectControlContent, SelectItem as SelectControlItem, SelectTrigger as SelectControlTrigger, SelectValue as SelectControlValue } from "@/components/ui/select";
import { calculateDistanceFee, calculateOrderTotal } from "@/lib/delivery";
import muwoyoLogo from "@/assets/muwoyo-logo.png";

type Order = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_location: string | null;
  delivery_address: string | null;
  delivery_fee: number;
  delivery_distance_km: number | null;
  delivery_status: string;
  discount: number;
  subtotal: number;
  items: Record<string, unknown>[];
  total: number | null;
  notes: string | null;
  status: string;
  created_at: string;
};
type DeliveryPerson = { id: string; user_id: string; name: string; email: string; status: string };
type OrderAssignment = { delivery_person_id: string; is_primary: boolean };
type FeeSetting = { fee_type: string; default_fee: number; distance_rules: unknown };
const emptyManualForm = { customer_name: "", customer_phone: "", customer_location: "", delivery_address: "", item_name: "", quantity: "1", price: "", delivery_fee: "0", delivery_distance_km: "", discount: "0", notes: "" };

function getDistanceFee(setting: FeeSetting | null, distance: number) {
  return setting?.fee_type === "distance" ? calculateDistanceFee(setting.distance_rules, distance) : null;
}

function orderItemName(item: Record<string, unknown>, index: number) {
  return String(item?.name || item?.product || item?.title || `Item ${index + 1}`);
}
function itemQuantity(item: Record<string, unknown>) {
  const quantity = Number(item.qty || item.quantity || 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}
function itemUnitPrice(item: Record<string, unknown>) {
  const price = Number(item.price ?? item.price_kz ?? 0);
  return Number.isFinite(price) && price >= 0 ? price : 0;
}
function normalizeOrderItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  if (typeof value === "string" && value.trim()) {
    try { return normalizeOrderItems(JSON.parse(value)); } catch { return []; }
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["items", "products", "line_items", "order_items", "cart", "data", "result"]) {
    const normalized = normalizeOrderItems(record[key]);
    if (normalized.length) return normalized;
  }
  return [];
}

export default function Orders() {
  const { user } = useAuth();
  const { isOwner, membership, ownerUserId, loading: membershipLoading } = useBusinessMembership();
  const { toast } = useToast();
  const [rows, setRows] = useState<Order[]>([]);
  const [deliveryPeople, setDeliveryPeople] = useState<DeliveryPerson[]>([]);
  const [assignments, setAssignments] = useState<Record<string, { id: string; name: string; is_primary: boolean }[]>>({});
  const [feeSetting, setFeeSetting] = useState<FeeSetting | null>(null);
  const [open, setOpen] = useState<Order | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [manualForm, setManualForm] = useState(emptyManualForm);
  const [selectedDeliveryPeople, setSelectedDeliveryPeople] = useState<string[]>([]);
  const [primaryDeliveryPerson, setPrimaryDeliveryPerson] = useState("");
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentPersonId, setAssignmentPersonId] = useState("");
  const [assigningOrders, setAssigningOrders] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    if (!user || membershipLoading) return;
    const dataUserId = ownerUserId || user.id;
    const { data, error } = await supabase
      .from("store_orders")
      .select("*")
      .eq("user_id", dataUserId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Não foi possível carregar os pedidos", description: error.message, variant: "destructive" });
      return;
    }
    const parsed = data || [];
    const normalized = parsed.map((r) => {
      return { ...r, items: normalizeOrderItems(r.items) };
    });
    setRows(normalized);
    if (isOwner && membership?.business_id) {
      const [{ data: people, error: peopleError }, { data: fee, error: feeError }] = await Promise.all([
        supabase.from("delivery_people").select("id,user_id,name,email,status").eq("business_id", membership.business_id).eq("status", "active").order("name"),
        supabase.from("delivery_fee_settings").select("fee_type,default_fee,distance_rules").eq("business_id", membership.business_id).maybeSingle(),
      ]);
      if (peopleError || feeError) {
        toast({ title: "Não foi possível carregar as configurações de entrega", description: peopleError?.message || feeError?.message, variant: "destructive" });
        return;
      }
      setDeliveryPeople((people || []) as DeliveryPerson[]);
      setFeeSetting((fee as FeeSetting | null) || null);
      const orderIds = normalized.map((order) => String(order.id));
      if (orderIds.length) {
        const { data: assigned, error: assignmentError } = await supabase.from("delivery_order_assignments")
          .select("order_id,delivery_person_id,is_primary,delivery_people(name)")
          .in("order_id", orderIds).eq("active", true);
        if (assignmentError) {
          toast({ title: "Não foi possível carregar os entregadores atribuídos", description: assignmentError.message, variant: "destructive" });
          return;
        }
        const nextAssignments: Record<string, { id: string; name: string; is_primary: boolean }[]> = {};
        for (const assignment of assigned || []) {
          const relation = assignment.delivery_people;
          (nextAssignments[assignment.order_id] ||= []).push({
            id: assignment.delivery_person_id,
            name: relation?.name || "Entregador",
            is_primary: assignment.is_primary,
          });
        }
        setAssignments(nextAssignments);
      } else {
        setAssignments({});
      }
    }
  }, [isOwner, membership?.business_id, membershipLoading, ownerUserId, toast, user]);

  useEffect(() => {
    void load();
    if (!user || membershipLoading) return;
    const dataUserId = ownerUserId || user.id;
    const ch = supabase
      .channel(`orders-${dataUserId}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_orders",
          filter: `user_id=eq.${dataUserId}`,
        },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, membershipLoading, ownerUserId, user]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("store_orders").update({
      status,
      ...(status === "delivered" ? { delivery_status: "delivered" } : status === "cancelled" ? { delivery_status: "cancelled" } : {}),
    }).eq("id", id);
    if (error) {
      toast({ title: "Não foi possível atualizar o pedido", description: error.message, variant: "destructive" });
      return;
    }
    const deliveryStatus = status === "delivered" ? "delivered" : status === "cancelled" ? "cancelled" : null;
    setOpen((current) => current ? { ...current, status, ...(deliveryStatus ? { delivery_status: deliveryStatus } : {}) } : current);
    load();
  };

  const deleteOrder = async (id: string) => {
    if (!user || !window.confirm("Eliminar este pedido?")) return;
    const { error } = await supabase.from("store_orders").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      toast({ title: "Não foi possível eliminar o pedido", description: error.message, variant: "destructive" });
      return;
    }
    setOpen(null);
    await load();
  };

  const assignSelectedOrders = async () => {
    if (!isOwner || !user || !assignmentPersonId || !selectedOrders.length) return;
    setAssigningOrders(true);
    const results = await Promise.all(selectedOrders.map(async (order) => ({
      order,
      result: await supabase.rpc("assign_delivery_people", {
        p_order_id: order.id,
        p_delivery_person_ids: [assignmentPersonId],
        p_primary_delivery_person_id: assignmentPersonId,
      }),
    })));
    setAssigningOrders(false);

    const failed = results.filter(({ result }) => result.error);
    await load();
    if (failed.length) {
      setSelectedExportIds(failed.map(({ order }) => order.id));
      toast({
        title: "Não foi possível atribuir todos os pedidos",
        description: failed.map(({ order, result }) => `${order.order_number}: ${result.error?.message}`).join("; "),
        variant: "destructive",
      });
      return;
    }

    setSelectedExportIds([]);
    setAssignmentOpen(false);
    setAssignmentPersonId("");
    toast({ title: `${selectedOrders.length} pedido(s) atribuído(s) com sucesso` });
  };

  const addManualOrder = async () => {
    if (!user || !manualForm.customer_name.trim() || !manualForm.item_name.trim()) return;
    setSaving(true);
    const quantity = Number(manualForm.quantity);
    const price = Number(manualForm.price);
    const deliveryFee = Number(manualForm.delivery_fee);
    const discount = Number(manualForm.discount);
    if (!Number.isFinite(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0
      || !Number.isFinite(deliveryFee) || deliveryFee < 0 || !Number.isFinite(discount) || discount < 0) {
      setSaving(false);
      toast({ title: "Valores inválidos", description: "Informe quantidade válida e valores iguais ou superiores a zero.", variant: "destructive" });
      return;
    }
    const existingItems = editingId ? rows.find((order) => order.id === editingId)?.items || [] : [];
    const items = editingId && existingItems.length > 1
      ? [{ ...existingItems[0], name: manualForm.item_name.trim(), qty: quantity, price }, ...existingItems.slice(1)]
      : [{ name: manualForm.item_name.trim(), qty: quantity, price }];
    const subtotal = items.reduce((sum, item) => sum + itemQuantity(item) * itemUnitPrice(item), 0);
    const total = calculateOrderTotal(subtotal, deliveryFee, discount);
    if (total === null) {
      setSaving(false);
      toast({ title: "Desconto inválido", description: "O desconto não pode ser superior ao subtotal mais a entrega.", variant: "destructive" });
      return;
    }
    const distance = manualForm.delivery_distance_km.trim() ? Number(manualForm.delivery_distance_km) : null;
    if (distance !== null && (!Number.isFinite(distance) || distance < 0)) {
      setSaving(false);
      toast({ title: "Distância inválida", description: "Informe uma distância igual ou superior a zero.", variant: "destructive" });
      return;
    }
    const values = {
      customer_name: manualForm.customer_name.trim(),
      customer_phone: manualForm.customer_phone.replace(/\D/g, "") || null,
      customer_location: manualForm.customer_location.trim() || null,
      delivery_address: manualForm.delivery_address.trim() || manualForm.customer_location.trim() || null,
      items,
      subtotal,
      delivery_fee: deliveryFee,
      delivery_distance_km: distance,
      discount,
      total,
      notes: manualForm.notes.trim() || null,
    };
    let orderId = editingId;
    let error: { message: string } | null = null;
    if (editingId) {
      const result = await supabase.from("store_orders").update(values).eq("id", editingId).eq("user_id", user.id);
      error = result.error;
    } else {
      const result = await supabase.from("store_orders").insert({ user_id: user.id, ...values, status: "new", delivery_status: "awaiting_pickup" }).select("id").single();
      error = result.error;
      orderId = result.data?.id || null;
    }
    setSaving(false);
    if (error) return toast({ title: "Não foi possível guardar o pedido", description: error.message, variant: "destructive" });
    if (isOwner && orderId) {
      const { error: assignmentError } = await supabase.rpc("assign_delivery_people", {
        p_order_id: orderId,
        p_delivery_person_ids: selectedDeliveryPeople,
        p_primary_delivery_person_id: primaryDeliveryPerson || null,
      });
      if (assignmentError) {
        toast({ title: "Pedido guardado, mas não foi possível guardar a atribuição", description: assignmentError.message, variant: "destructive" });
        await load();
        return;
      }
    }
    setManualForm(emptyManualForm);
    setSelectedDeliveryPeople([]);
    setPrimaryDeliveryPerson("");
    setEditingId(null);
    setManualOpen(false);
    await load();
    toast({ title: editingId ? "Pedido atualizado" : "Pedido registado" });
  };

  const editOrder = (order: Order) => {
    const item = order.items[0] || {};
    setEditingId(order.id);
    const assigned = assignments[order.id] || [];
    setSelectedDeliveryPeople(assigned.map((assignment) => assignment.id));
    setPrimaryDeliveryPerson(assigned.find((assignment) => assignment.is_primary)?.id || "");
    setManualForm({
      ...emptyManualForm,
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      customer_location: order.customer_location || "",
      delivery_address: order.delivery_address || order.customer_location || "",
      item_name: String(item.name || item.product || item.title || ""),
      quantity: String(item.qty || item.quantity || 1),
      price: String(item.price ?? item.price_kz ?? ""),
      delivery_fee: String(order.delivery_fee || 0),
      delivery_distance_km: order.delivery_distance_km === null ? "" : String(order.delivery_distance_km),
      discount: String(order.discount || 0),
      notes: order.notes || "",
    });
    setManualOpen(true);
  };

  const startNewOrder = () => {
    setEditingId(null);
    setSelectedDeliveryPeople([]);
    setPrimaryDeliveryPerson("");
    setManualForm({
      ...emptyManualForm,
      delivery_fee: feeSetting?.fee_type === "fixed" ? String(feeSetting.default_fee) : "0",
    });
    setManualOpen(true);
  };

  const filteredRows = rows.filter((order) => {
    const matchesText = !search.trim() || `${order.customer_name || ""} ${order.customer_phone || ""} ${order.order_number}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesText && matchesStatus;
  });

  const exportOrders = async (selectedOrders: Order[]) => {
    if (!selectedOrders.length) {
      toast({ title: "Não há pedidos para exportar", description: "Selecione pelo menos um pedido ou ajuste os filtros." });
      return;
    }
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 16;
        const maxWidth = pageWidth - margin * 2;
        const logoResponse = await fetch(muwoyoLogo);
        if (!logoResponse.ok) throw new Error("Não foi possível carregar a logo da Muwoyo.");
        const logoBlob = await logoResponse.blob();
        const logoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Não foi possível preparar a logo da Muwoyo."));
          reader.onerror = () => reject(new Error("Não foi possível ler a logo da Muwoyo."));
          reader.readAsDataURL(logoBlob);
        });

        let y = 18;
        const drawPageHeader = (continuation: boolean) => {
          pdf.addImage(logoDataUrl, "PNG", margin, 10, 12, 12);
          pdf.setTextColor(20, 34, 53);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(continuation ? 12 : 15);
          pdf.text("MUWOYO", margin + 16, 15);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(continuation ? 8 : 9);
          pdf.setTextColor(82, 97, 116);
          pdf.text("RELATÓRIO CONSOLIDADO DE PEDIDOS", margin + 16, 20);
          pdf.setDrawColor(22, 156, 120);
          pdf.setLineWidth(0.6);
          pdf.line(margin, 27, pageWidth - margin, 27);
          y = 34;
        };
        const addPage = () => {
          pdf.addPage();
          drawPageHeader(true);
        };
        const ensureSpace = (height: number) => {
          if (y + height > pageHeight - 18) addPage();
        };
        const addText = (text: string, size = 9, bold = false, indent = 0) => {
          pdf.setFont("helvetica", bold ? "bold" : "normal");
          pdf.setFontSize(size);
          const lines = pdf.splitTextToSize(text, maxWidth - indent) as string[];
          const lineHeight = size * 0.5;
          ensureSpace(lines.length * lineHeight + 3);
          pdf.setTextColor(47, 59, 72);
          pdf.text(lines, margin + indent, y);
          y += lines.length * lineHeight + 3;
        };
        const formatMoney = (value: number | null | undefined) =>
          `${Number(value || 0).toLocaleString("pt-AO")} Kz`;
        const totalValue = selectedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

        drawPageHeader(false);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(20, 34, 53);
        pdf.text(`${selectedOrders.length} ${selectedOrders.length === 1 ? "pedido" : "pedidos"}`, margin, y + 1);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(82, 97, 116);
        pdf.text(`Gerado em ${new Date().toLocaleString("pt-AO")}`, margin, y + 7);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(22, 156, 120);
        pdf.text(`Total: ${formatMoney(totalValue)}`, pageWidth - margin, y + 3, { align: "right" });
        y += 14;

        for (const [orderIndex, order] of selectedOrders.entries()) {
          ensureSpace(17);
          pdf.setFillColor(234, 247, 239);
          pdf.setDrawColor(208, 230, 215);
          pdf.roundedRect(margin, y, maxWidth, 9, 1.5, 1.5, "FD");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(20, 34, 53);
          pdf.text(`PEDIDO ${orderIndex + 1}  |  ${order.order_number}`, margin + 3, y + 6);
          pdf.setTextColor(22, 120, 91);
          pdf.text(statusLabel[order.status] || order.status, pageWidth - margin - 3, y + 6, { align: "right" });
          y += 13;

          addText(`Data: ${new Date(order.created_at).toLocaleString("pt-AO")}  |  Entrega: ${deliveryStatusLabel[order.delivery_status] || order.delivery_status || "Aguardando recolha"}`, 8);
          addText(`Cliente: ${order.customer_name || "-"}  |  Telefone: ${order.customer_phone || "-"}`, 8);
          addText(`Endereço: ${order.delivery_address || order.customer_location || "-"}`, 8);
          addText("PRODUTOS", 8, true);
          if (order.items.length) {
            order.items.forEach((item, index) => {
              const quantity = itemQuantity(item);
              const unit = itemUnitPrice(item);
              addText(`${orderItemName(item, index)}  |  ${quantity} x ${formatMoney(unit)}  |  ${formatMoney(quantity * unit)}`, 8, false, 3);
            });
          } else {
            addText("Sem itens registrados.", 8, false, 3);
          }

          const assigned = assignments[order.id] || [];
          addText(`Entregador(es): ${assigned.map((person) => `${person.name}${person.is_primary ? " (responsável)" : ""}`).join(", ") || "Não atribuído"}`, 8);
          addText(`Subtotal: ${formatMoney(order.subtotal || order.total)}  |  Entrega: ${formatMoney(order.delivery_fee)}  |  Desconto: ${formatMoney(order.discount)}`, 8);
          addText(`TOTAL DO PEDIDO: ${formatMoney(order.total)}`, 9, true);
          if (order.notes) addText(`Observações: ${order.notes}`, 8);
          if (orderIndex < selectedOrders.length - 1) {
            ensureSpace(5);
            pdf.setDrawColor(225, 232, 227);
            pdf.setLineWidth(0.3);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 5;
          }
          if (orderIndex % 20 === 19) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }

        const pageCount = pdf.getNumberOfPages();
        for (let page = 1; page <= pageCount; page++) {
          pdf.setPage(page);
          pdf.setDrawColor(225, 232, 227);
          pdf.setLineWidth(0.3);
          pdf.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(82, 97, 116);
          pdf.text("Muwoyo | Relatório consolidado de pedidos", margin, pageHeight - 8);
          pdf.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
        }
        pdf.save(`muwoyo-pedidos-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("orders_pdf_export_failed", error);
      toast({ title: "Não foi possível exportar os pedidos", description: error instanceof Error ? error.message : "Erro inesperado ao gerar o PDF.", variant: "destructive" });
    }
  };

  const statusLabel: Record<string, string> = {
    new: "Novo",
    confirmed: "Confirmado",
    delivered: "Entregue",
    cancelled: "Cancelado",
  };
  const deliveryStatusLabel: Record<string, string> = {
    awaiting_pickup: "Aguardando recolha",
    preparing: "Em preparação",
    ready_for_delivery: "Pronto para entrega",
    in_delivery: "Em entrega",
    delivered: "Entregue",
    failed_delivery: "Falha na entrega",
    cancelled: "Cancelado",
  };
  const newOrderCount = rows.filter((order) => order.status === "new").length;
  const accumulatedValue = rows.reduce((total, order) => total + Number(order.total || 0), 0);
  const selectedOrders = rows.filter((order) => selectedExportIds.includes(order.id));
  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((order) => selectedExportIds.includes(order.id));
  const allOrdersSelected = rows.length > 0 && rows.every((order) => selectedExportIds.includes(order.id));

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap gap-2">
          <Input className="w-full sm:max-w-xs" placeholder="Pesquisar cliente ou pedido" value={search} onChange={(event) => setSearch(event.target.value)} />
          <SelectControl value={statusFilter} onValueChange={setStatusFilter}>
            <SelectControlTrigger className="w-full sm:w-44"><SelectControlValue placeholder="Estado" /></SelectControlTrigger>
            <SelectControlContent>
              <SelectControlItem value="all">Todos os estados</SelectControlItem>
              <SelectControlItem value="new">Novo</SelectControlItem>
              <SelectControlItem value="confirmed">Confirmado</SelectControlItem>
              <SelectControlItem value="delivered">Entregue</SelectControlItem>
              <SelectControlItem value="cancelled">Cancelado</SelectControlItem>
            </SelectControlContent>
          </SelectControl>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportOrders(selectedOrders.length ? selectedOrders : filteredRows)}>
            <FileDown className="mr-2 h-4 w-4" />Exportar PDF{selectedOrders.length ? ` (${selectedOrders.length})` : ""}
          </Button>
<<<<<<< HEAD
          {isOwner && selectedOrders.length > 0 && deliveryPeople.length > 0 && <Button
            variant="outline"
=======
          {isOwner && <Button
            variant="outline"
            disabled={!selectedOrders.length || !deliveryPeople.length}
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
            onClick={() => {
              setAssignmentPersonId("");
              setAssignmentOpen(true);
            }}
          >
            <Truck className="mr-2 h-4 w-4" />Atribuir entregador{selectedOrders.length ? ` (${selectedOrders.length})` : ""}
          </Button>}
          <Button onClick={startNewOrder}>Novo pedido</Button>
        </div>
      </div>
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={allFilteredSelected} onCheckedChange={(checked) => setSelectedExportIds(checked ? [...new Set([...selectedExportIds, ...filteredRows.map((order) => order.id)])] : selectedExportIds.filter((id) => !filteredRows.some((order) => order.id === id)))} aria-label="Selecionar pedidos filtrados" />
        Selecionar pedidos filtrados
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => setSelectedExportIds(allOrdersSelected ? [] : rows.map((order) => order.id))}
        >
          {allOrdersSelected ? "Limpar seleção" : "Selecionar todos os pedidos"}
        </Button>
      </div>
      <div className="grid gap-3">
        {rows.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Nenhum pedido ainda. A IA cria pedidos durante as conversas com
              seus clientes.
            </CardContent>
          </Card>
        )}
        {filteredRows.map((o) => (
          <Card
            key={o.id}
            className="cursor-pointer transition hover:shadow-md"
            onClick={() => setOpen(o)}
          >
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <Checkbox checked={selectedExportIds.includes(o.id)} onClick={(event) => event.stopPropagation()} onCheckedChange={(checked) => setSelectedExportIds((current) => checked ? [...new Set([...current, o.id])] : current.filter((id) => id !== o.id))} aria-label={`Selecionar pedido de ${o.customer_name || "cliente"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  <div className="font-semibold truncate">
                    {o.customer_name || "Cliente sem nome"}
                  </div>
                </div>
                <div className="mt-1 text-xs font-medium text-primary">{o.order_number}</div>
                <div className="mt-1 text-sm text-muted-foreground truncate">
                  +{o.customer_phone || "-"}
                </div>
                <div className="mt-2 text-sm">
                  {Array.isArray(o.items) && o.items.length > 0 ? (
                    <>
                      {o.items.slice(0, 2).map((it, idx) => (
                        <span key={idx} className="block truncate">
                          {orderItemName(it, idx)} {itemQuantity(it) ? `x${itemQuantity(it)}` : ""}
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
                {isOwner && <div className="mt-2 flex flex-wrap gap-1">{(assignments[o.id] || []).map((person) => <Badge key={person.id} variant={person.is_primary ? "default" : "outline"}>{person.name}{person.is_primary ? " · responsável" : ""}</Badge>)}</div>}
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

      <Dialog open={assignmentOpen} onOpenChange={(open) => {
        if (assigningOrders) return;
        setAssignmentOpen(open);
        if (!open) setAssignmentPersonId("");
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atribuir pedidos a um entregador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione o entregador responsável por {selectedOrders.length} pedido(s).
            </p>
            {deliveryPeople.length ? (
              <SelectControl value={assignmentPersonId} onValueChange={setAssignmentPersonId}>
                <SelectControlTrigger><SelectControlValue placeholder="Escolher entregador" /></SelectControlTrigger>
                <SelectControlContent>
                  {deliveryPeople.map((person) => (
                    <SelectControlItem key={person.id} value={person.id}>{person.name}</SelectControlItem>
                  ))}
                </SelectControlContent>
              </SelectControl>
            ) : (
              <p className="text-sm text-muted-foreground">Cadastre um entregador ativo antes de atribuir pedidos.</p>
            )}
            <Button className="w-full" onClick={() => void assignSelectedOrders()} disabled={assigningOrders || !assignmentPersonId || !selectedOrders.length}>
              {assigningOrders ? "A atribuir..." : "Confirmar atribuição"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Editar pedido" : "Novo pedido"}</DialogTitle></DialogHeader>
          <div className="grid max-h-[75vh] gap-4 overflow-y-auto pr-1">
            <div className="grid gap-4 sm:grid-cols-2"><div><Label>Cliente</Label><Input value={manualForm.customer_name} onChange={(event) => setManualForm({ ...manualForm, customer_name: event.target.value })} /></div><div><Label>Telefone</Label><Input value={manualForm.customer_phone} onChange={(event) => setManualForm({ ...manualForm, customer_phone: event.target.value })} /></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Localização / referência</Label><Input value={manualForm.customer_location} onChange={(event) => setManualForm({ ...manualForm, customer_location: event.target.value })} /></div><div><Label>Endereço de entrega</Label><Input value={manualForm.delivery_address} onChange={(event) => setManualForm({ ...manualForm, delivery_address: event.target.value })} /></div></div>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px_140px]"><div><Label>Item</Label><Input value={manualForm.item_name} onChange={(event) => setManualForm({ ...manualForm, item_name: event.target.value })} /></div><div><Label>Quantidade</Label><Input type="number" min="1" value={manualForm.quantity} onChange={(event) => setManualForm({ ...manualForm, quantity: event.target.value })} /></div><div><Label>Preço unitário</Label><Input type="number" min="0" value={manualForm.price} onChange={(event) => setManualForm({ ...manualForm, price: event.target.value })} /></div></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Taxa de entrega (Kz)</Label><Input type="number" min="0" value={manualForm.delivery_fee} onChange={(event) => setManualForm({ ...manualForm, delivery_fee: event.target.value })} /><p className="mt-1 text-xs text-muted-foreground">{feeSetting?.fee_type === "fixed" ? `Padrão: ${Number(feeSetting.default_fee).toLocaleString("pt-AO")} Kz` : feeSetting?.fee_type === "free" ? "Padrão: frete grátis" : feeSetting?.fee_type === "distance" ? "Taxa calculada por distância manual" : "Definida individualmente"}</p><Button type="button" className="mt-2" size="sm" variant="outline" onClick={() => setManualForm({ ...manualForm, delivery_fee: "0" })}>Definir frete grátis</Button></div>
              <div><Label>Distância (km, opcional)</Label><Input type="number" min="0" step="0.1" value={manualForm.delivery_distance_km} onChange={(event) => {
                const nextDistance = event.target.value;
                const calculated = nextDistance ? getDistanceFee(feeSetting, Number(nextDistance)) : null;
                setManualForm({ ...manualForm, delivery_distance_km: nextDistance, ...(calculated !== null ? { delivery_fee: String(calculated) } : {}) });
              }} /><p className="mt-1 text-xs text-muted-foreground">Apenas distância informada manualmente.</p></div>
              <div><Label>Desconto (Kz)</Label><Input type="number" min="0" value={manualForm.discount} onChange={(event) => setManualForm({ ...manualForm, discount: event.target.value })} /></div>
            </div>
            {isOwner && <div className="space-y-2 rounded-md border p-3">
              <Label>Entregadores responsáveis por este pedido</Label>
              {deliveryPeople.length ? <div className="grid gap-2 sm:grid-cols-2">{deliveryPeople.map((person) => <label key={person.id} className="flex items-center gap-2 text-sm"><Checkbox checked={selectedDeliveryPeople.includes(person.id)} onCheckedChange={(checked) => {
                setSelectedDeliveryPeople((current) => checked ? [...new Set([...current, person.id])] : current.filter((id) => id !== person.id));
                if (!checked && primaryDeliveryPerson === person.id) setPrimaryDeliveryPerson("");
              }} />{person.name}</label>)}</div> : <p className="text-sm text-muted-foreground">Cadastre entregadores antes de atribuir pedidos.</p>}
              {selectedDeliveryPeople.length > 0 && <div className="space-y-1"><Label>Responsável principal (único autorizado a alterar o estado)</Label><SelectControl value={primaryDeliveryPerson} onValueChange={setPrimaryDeliveryPerson}><SelectControlTrigger><SelectControlValue placeholder="Selecione o responsável" /></SelectControlTrigger><SelectControlContent>{deliveryPeople.filter((person) => selectedDeliveryPeople.includes(person.id)).map((person) => <SelectControlItem key={person.id} value={person.id}>{person.name}</SelectControlItem>)}</SelectControlContent></SelectControl></div>}
            </div>}
            <div><Label>Notas</Label><Textarea value={manualForm.notes} onChange={(event) => setManualForm({ ...manualForm, notes: event.target.value })} /></div>
            <p className="text-sm font-semibold">Total: {Math.max(0, (Number(manualForm.quantity) || 0) * (Number(manualForm.price) || 0) + (Number(manualForm.delivery_fee) || 0) - (Number(manualForm.discount) || 0)).toLocaleString("pt-AO")} Kz</p>
            <Button onClick={() => void addManualOrder()} disabled={saving || !manualForm.customer_name.trim() || !manualForm.item_name.trim() || selectedDeliveryPeople.length > 0 && !primaryDeliveryPerson}>{saving ? "A guardar..." : editingId ? "Guardar alterações" : "Guardar pedido"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!open} onOpenChange={() => setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhe do pedido</DialogTitle>
            {open && <p className="text-sm font-medium text-primary">{open.order_number}</p>}
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
                  {open.delivery_address || open.customer_location || "Sem localização"}
                </div>
              </div>
              {(open.delivery_address || open.customer_location) && <Button asChild size="sm" variant="outline"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(open.delivery_address || open.customer_location || "")}`} target="_blank" rel="noreferrer">Abrir localização no mapa</a></Button>}
              {isOwner && <div className="flex flex-wrap gap-1">{(assignments[open.id] || []).map((person) => <Badge key={person.id} variant={person.is_primary ? "default" : "outline"}>{person.name}{person.is_primary ? " · responsável" : ""}</Badge>)}</div>}
<<<<<<< HEAD
              {isOwner && deliveryPeople.length > 0 && <Button
                className="w-full"
                variant="outline"
=======
              {isOwner && <Button
                className="w-full"
                variant="outline"
                disabled={!deliveryPeople.length}
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
                onClick={() => {
                  setSelectedExportIds([open.id]);
                  setAssignmentPersonId("");
                  setOpen(null);
                  setAssignmentOpen(true);
                }}
              >
                <Truck className="mr-2 h-4 w-4" />Atribuir entregador
              </Button>}
              <div>
                <div className="mb-2 font-semibold">Itens</div>
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  {Array.isArray(open.items) && open.items.length > 0 ? (
                    open.items.map((it, i) => (
                      <div key={i} className="rounded-sm border p-2">
                        <div className="flex justify-between items-start">
                          <div className="font-medium">{orderItemName(it, i)}</div>
                          <div className="text-sm text-muted-foreground">{itemQuantity(it) ? `x${itemQuantity(it)}` : ""}</div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground space-y-1">
                          {(it.price !== undefined || it.price_kz !== undefined) && <div>Preço: {itemUnitPrice(it).toLocaleString("pt-AO")} Kz</div>}
                          {typeof it.color === "string" && <div>Cor: {it.color}</div>}
                          {typeof it.variant === "string" && <div>Variante: {it.variant}</div>}
                          {typeof it.details === "string" && <div>Detalhes: {it.details}</div>}
                          {it.options && typeof it.options === "object" && !Array.isArray(it.options) && (
                            <div>
                              Opções:
                              <ul className="list-disc list-inside">
                                {Object.entries(it.options as Record<string, unknown>).map(([k, v]) => (
                                  <li key={k} className="text-xs">{k}: {String(v)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {Object.keys(it).filter((key) => !["name", "product", "title", "qty", "quantity", "price", "price_kz", "color", "variant", "details", "options"].includes(key)).length > 0 && (
                            <div className="text-xs">
                              Outros: {Object.entries(it).filter(([key]) => !["name", "product", "title", "qty", "quantity", "price", "price_kz", "color", "variant", "details", "options"].includes(key)).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" • ")}
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
              <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{Number(open.subtotal || open.total || 0).toLocaleString("pt-AO")} Kz</span></div>
                <div className="flex justify-between"><span>Taxa de entrega</span><span>{Number(open.delivery_fee || 0).toLocaleString("pt-AO")} Kz</span></div>
                {Number(open.discount || 0) > 0 && <div className="flex justify-between"><span>Desconto</span><span>-{Number(open.discount).toLocaleString("pt-AO")} Kz</span></div>}
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span>{Number(open.total || 0).toLocaleString("pt-AO")} Kz</span></div>
                <div className="pt-1 text-xs text-muted-foreground">Estado da entrega: {deliveryStatusLabel[open.delivery_status] || open.delivery_status || "Aguardando recolha"}</div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => exportOrders([open])}><FileDown className="mr-2 h-4 w-4" />Baixar pedido em PDF</Button>
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
