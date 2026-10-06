import { FormEvent, useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import DateTimeSelect from "@/components/DateTimeSelect";
import { useAuth } from "@/hooks/useAuth";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
type Contact = { id: string; name: string | null; phone_number: string; should_respond: boolean; is_group?: boolean };
type Tag = { id: string; name: string };
type Stage = { id: string; name: string };
type Campaign = { id: string; name: string; description: string | null; message_text: string; status: string; scheduled_at: string | null; recipient_count?: number; sent_count?: number; failed_count?: number };

const statusLabels: Record<string, string> = { draft: "Rascunho", scheduled: "Agendada", processing: "A processar", sending: "Enviando", completed: "Concluída", cancelled: "Cancelada", error: "Com erros" };

export default function Campaigns() {
  const { user } = useAuth();
  const { entitlements, planName, loading } = usePlanEntitlements();
  const { toast } = useToast();
  const [items, setItems] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [form, setForm] = useState({ name: "", description: "", message_text: "", scheduled_at: "" });
  const [audience, setAudience] = useState<"all" | "tag" | "stage" | "manual">("all");
  const [audienceValue, setAudienceValue] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeInstance, setActiveInstance] = useState<{ id: string; instance_name: string } | null>(null);
  const completedCount = items.filter((item) => item.status === "completed").length;
  const activeCount = items.filter((item) => ["scheduled", "sending", "processing"].includes(item.status)).length;

  const load = async () => {
    if (!user) return;
    const { data: instance } = await db.from("instances").select("id,instance_name").eq("user_id", user.id).eq("status", "connected").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setActiveInstance(instance || null);
    const [{ data: campaigns }, { data: contactRows }, { data: tagRows }, { data: stageRows }] = await Promise.all([
      db.from("campaigns").select("id,name,description,message_text,status,scheduled_at").eq("user_id", user.id).order("created_at", { ascending: false }),
      db.from("whatsapp_contacts").select("id,name,phone_number,should_respond,is_group").eq("user_id", user.id).eq("whatsapp_instance_id", instance?.id || "").eq("is_group", false).order("name"),
      db.from("crm_tags").select("id,name").eq("user_id", user.id).order("name"),
      db.from("crm_stages").select("id,name").eq("user_id", user.id).order("position"),
    ]);
    setItems(campaigns || []);
    setContacts(contactRows || []);
    setTags(tagRows || []);
    setStages(stageRows || []);
  };
  useEffect(() => { void load(); }, [user]);

  const eligibleContacts = useMemo(() => contacts.filter((contact) => contact.should_respond), [contacts]);
  const audienceContacts = useMemo(() => {
    if (audience === "manual") return eligibleContacts.filter((contact) => selectedIds.includes(contact.id));
    if (audience === "all") return eligibleContacts;
    if (audience === "tag" || audience === "stage") return eligibleContacts.filter((contact) => selectedIds.includes(contact.id));
    return eligibleContacts;
  }, [audience, eligibleContacts, selectedIds]);

  useEffect(() => {
    if (audience !== "tag" && audience !== "stage") return;
    if (!user || audienceValue === "all") return;
    void (async () => {
      const relation = audience === "tag" ? "crm_contact_tags" : "crm_contact_metadata";
      const field = audience === "tag" ? "tag_id" : "stage_id";
      const { data } = await db.from(relation).select("contact_id").eq("user_id", user.id).eq(field, audienceValue);
      setSelectedIds((data || []).map((row: { contact_id: string }) => row.contact_id));
    })();
  }, [audience, audienceValue, user]);

  const toggleManual = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !activeInstance || !form.name.trim() || !form.message_text.trim()) return;
    if (!editingId && !audienceContacts.length) return toast({ title: "Público vazio", description: "Selecione pelo menos um contacto elegível.", variant: "destructive" });
    const values = { name: form.name.trim(), description: form.description.trim() || null, message_text: form.message_text.trim(), status: form.scheduled_at ? "scheduled" : "draft", scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const { data: campaign, error } = editingId
      ? await db.from("campaigns").update(values).eq("id", editingId).eq("user_id", user.id).select("id").single()
      : await db.from("campaigns").insert({ user_id: user.id, whatsapp_instance_id: activeInstance.id, ...values }).select("id").single();
    if (error || !campaign) return toast({ title: "Não foi possível criar a campanha", description: error?.message, variant: "destructive" });
    if (!editingId) {
      const { error: audienceError } = await db.from("campaign_contacts").insert(audienceContacts.map((contact) => ({ campaign_id: campaign.id, contact_id: contact.id, user_id: user.id })));
      if (audienceError) return toast({ title: "Campanha criada sem público", description: audienceError.message, variant: "destructive" });
    }
    const shouldSendNow = !form.scheduled_at && !editingId;
    setForm({ name: "", description: "", message_text: "", scheduled_at: "" });
    setSelectedIds([]);
    setEditingId(null);
    if (shouldSendNow) {
      toast({ title: "Campanha criada", description: "O envio foi iniciado." });
      await send(campaign.id);
    } else toast({ title: form.scheduled_at ? "Campanha agendada" : "Campanha atualizada" });
    void load();
  };

  const editCampaign = (campaign: Campaign) => {
    setEditingId(campaign.id);
    setForm({ name: campaign.name, description: campaign.description || "", message_text: campaign.message_text, scheduled_at: campaign.scheduled_at ? campaign.scheduled_at.slice(0, 16) : "" });
    document.getElementById("new-campaign")?.scrollIntoView({ behavior: "smooth" });
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!user || !window.confirm("Eliminar esta campanha?")) return;
    const { error } = await db.from("campaigns").delete().eq("id", campaignId).eq("user_id", user.id);
    if (error) return toast({ title: "Não foi possível eliminar", description: error.message, variant: "destructive" });
    await load();
  };

  const send = async (campaignId: string) => {
    setSending(campaignId);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke("campaign-send", { body: { campaignId }, headers: sessionData.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : undefined });
    setSending("");
    if (error) return toast({ title: "Não foi possível enviar", description: error.message, variant: "destructive" });
    toast({ title: "Campanha processada" });
    void load();
  };

  if (loading) return <DashboardShell title="Campanhas" description="A carregar acesso do plano...">A carregar...</DashboardShell>;
  if (!entitlements.campaigns) return <DashboardShell title="Campanhas" description="Comunicação segmentada do seu negócio."><Card><CardContent className="space-y-3 p-6"><CardTitle>Campanhas</CardTitle><p className="text-sm text-muted-foreground">Esta funcionalidade está disponível a partir do plano Growth. Plano atual: {planName}.</p><Button onClick={() => window.location.assign("/recargas")}>Fazer upgrade</Button></CardContent></Card></DashboardShell>;

  return <DashboardShell title="Campanhas" description="Crie, segmente e acompanhe comunicações para os seus contactos.">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Campanhas</h2><p className="text-sm text-muted-foreground">Crie, envie e acompanhe campanhas para os seus contactos.</p></div><Button onClick={() => document.getElementById("new-campaign")?.scrollIntoView({ behavior: "smooth" })}>+ Nova campanha</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Campanhas", items.length, "Criadas"], ["Destinatários", contacts.length, "Contactos disponíveis"], ["Ativas", activeCount, "A processar"], ["Concluídas", completedCount, "Histórico"]].map(([label, value, caption]) => <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{caption}</p></CardContent></Card>)}</div>
    <Card id="new-campaign"><CardHeader><CardTitle>{editingId ? "Editar campanha" : "Nova campanha"}</CardTitle></CardHeader><CardContent><form onSubmit={create} className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2"><Input required placeholder="Nome da campanha" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><Input placeholder="Descrição opcional" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="grid gap-3 md:grid-cols-3"><Select value={audience} onValueChange={(value: typeof audience) => { setAudience(value); setAudienceValue("all"); }}><SelectTrigger><SelectValue placeholder="Selecionar público" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os elegíveis</SelectItem><SelectItem value="tag">Por tag</SelectItem><SelectItem value="stage">Por etapa</SelectItem><SelectItem value="manual">Manualmente</SelectItem></SelectContent></Select>{audience === "tag" && <Select value={audienceValue} onValueChange={setAudienceValue}><SelectTrigger><SelectValue placeholder="Escolher tag" /></SelectTrigger><SelectContent><SelectItem value="all">Escolher tag</SelectItem>{tags.map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}</SelectContent></Select>}{audience === "stage" && <Select value={audienceValue} onValueChange={setAudienceValue}><SelectTrigger><SelectValue placeholder="Escolher etapa" /></SelectTrigger><SelectContent><SelectItem value="all">Escolher etapa</SelectItem>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent></Select>}</div>
      {audience === "manual" && <div className="grid max-h-48 gap-2 overflow-y-auto rounded border p-3">{eligibleContacts.map((contact) => <label key={contact.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={() => toggleManual(contact.id)} />{contact.name || contact.phone_number}</label>)}</div>}
      <p className="text-sm text-muted-foreground">{audienceContacts.length} contacto(s) elegível(is) selecionado(s). Contactos sem autorização de resposta são excluídos.</p>
      <Textarea required placeholder="Mensagem da campanha" value={form.message_text} onChange={(e) => setForm({ ...form, message_text: e.target.value })} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><DateTimeSelect value={form.scheduled_at} onChange={(scheduled_at) => setForm({ ...form, scheduled_at })} label="Agendar para (opcional)" /><Button className="sm:w-fit">{editingId ? "Guardar alterações" : form.scheduled_at ? "Agendar campanha" : "Criar e enviar"}</Button></div>
    </form></CardContent></Card>
    <Card><CardHeader><CardTitle>Histórico</CardTitle></CardHeader><CardContent className="space-y-2">{items.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma campanha criada.</p>}{items.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded border p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-medium">{item.name}</div><div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Badge variant="outline">{statusLabels[item.status] || item.status}</Badge>{item.scheduled_at ? new Date(item.scheduled_at).toLocaleString("pt-AO") : "Sem agendamento"}</div></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => editCampaign(item)}>Editar</Button><Button size="sm" variant="destructive" onClick={() => void deleteCampaign(item.id)}>Eliminar</Button><Button size="sm" disabled={Boolean(sending) || ["completed", "sending"].includes(item.status)} onClick={() => void send(item.id)}>{sending === item.id ? "A enviar..." : "Enviar agora"}</Button></div></div>)}</CardContent></Card>
  </DashboardShell>;
}
