import { useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const PAGE_SIZE = 25;

type Stage = { id: string; name: string; position: number };
type Tag = { id: string; name: string };
type Contact = {
  id: string;
  name: string | null;
  phone_number: string;
  last_message_at: string | null;
  created_at: string;
  metadata?: { stage_id: string | null; owner_id: string | null; notes: string | null };
  stage?: Stage;
  tags: Tag[];
};
type Activity = { id: string; activity_type: string; description: string | null; created_at: string };

const activityLabels: Record<string, string> = {
  contact_created: "Contacto criado",
  message_received: "Mensagem recebida",
  message_sent: "Mensagem enviada",
  stage_changed: "Etapa alterada",
};

export default function CRM() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [kanban, setKanban] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualContact, setManualContact] = useState({ name: "", phone_number: "" });
  const [activeInstance, setActiveInstance] = useState<{ id: string; instance_name: string } | null>(null);

  const load = async () => {
    if (!user) return;
    const { data: instance } = await db.from("instances").select("id,instance_name").eq("user_id", user.id).eq("status", "connected").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setActiveInstance(instance || null);
    if (!instance) { setContacts([]); setStages([]); setTags([]); return; }
    const [{ data: contactRows }, { data: stageRows }, { data: tagRows }, { data: metadataRows }, { data: tagLinks }] = await Promise.all([
      db.from("whatsapp_contacts").select("id,name,phone_number,last_message_at,created_at,is_group").eq("user_id", user.id).eq("whatsapp_instance_id", instance.id).eq("is_group", false).order("last_message_at", { ascending: false, nullsFirst: false }),
      db.from("crm_stages").select("id,name,position").eq("user_id", user.id).order("position"),
      db.from("crm_tags").select("id,name").eq("user_id", user.id).order("name"),
      db.from("crm_contact_metadata").select("contact_id,stage_id,owner_id,notes").eq("user_id", user.id),
      db.from("crm_contact_tags").select("contact_id,tag_id").eq("user_id", user.id),
    ]);
    const stageMap = new Map((stageRows || []).map((stage: Stage) => [stage.id, stage]));
    const metadataMap = new Map((metadataRows || []).map((item: { contact_id: string; stage_id: string | null; owner_id: string | null; notes: string | null }) => [item.contact_id, item]));
    const tagMap = new Map((tagRows || []).map((tag: Tag) => [tag.id, tag]));
    const contactTags = new Map<string, Tag[]>();
    (tagLinks || []).forEach((link: { contact_id: string; tag_id: string }) => {
      const tag = tagMap.get(link.tag_id);
      if (tag) contactTags.set(link.contact_id, [...(contactTags.get(link.contact_id) || []), tag]);
    });
    setStages(stageRows || []);
    setTags(tagRows || []);
    setContacts((contactRows || []).map((contact: Contact) => {
      const metadata = metadataMap.get(contact.id);
      return { ...contact, metadata, stage: metadata?.stage_id ? stageMap.get(metadata.stage_id) : undefined, tags: contactTags.get(contact.id) || [] };
    }));
  };

  useEffect(() => { void load(); }, [user]);

  const filtered = useMemo(() => contacts.filter((contact) => {
    const matchesSearch = `${contact.name || ""} ${contact.phone_number}`.toLowerCase().includes(search.toLowerCase());
    const matchesStage = stageFilter === "all" || contact.stage?.id === stageFilter;
    const matchesTag = tagFilter === "all" || contact.tags.some((tag) => tag.id === tagFilter);
    return matchesSearch && matchesStage && matchesTag;
  }), [contacts, search, stageFilter, tagFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const leadCount = contacts.filter((contact) => /novo|lead/i.test(contact.stage?.name || "")).length;
  const interestedCount = contacts.filter((contact) => /interess|negocia/i.test(contact.stage?.name || "")).length;
  const customerCount = contacts.filter((contact) => /cliente/i.test(contact.stage?.name || "")).length;
  const funnel = stages.map((stage) => ({ ...stage, count: contacts.filter((contact) => contact.stage?.id === stage.id).length })).sort((a, b) => b.count - a.count).slice(0, 4);

  useEffect(() => { setPage(1); }, [search, stageFilter, tagFilter]);

  const openContact = async (contact: Contact) => {
    setSelected(contact);
    setNotes(contact.metadata?.notes || "");
    if (!user) return;
    const { data } = await db.from("crm_activities").select("id,activity_type,description,created_at").eq("user_id", user.id).eq("contact_id", contact.id).order("created_at", { ascending: false }).limit(50);
    setActivities(data || []);
  };

  const updateContact = async (patch: Record<string, unknown>, description: string) => {
    if (!user || !selected) return;
    setSaving(true);
    const { error } = await db.from("crm_contact_metadata").upsert({ contact_id: selected.id, user_id: user.id, ...patch }, { onConflict: "contact_id" });
    if (!error) await db.from("crm_activities").insert({ user_id: user.id, contact_id: selected.id, activity_type: "crm_updated", description });
    setSaving(false);
    if (error) return toast({ title: "Não foi possível atualizar o contacto", description: error.message, variant: "destructive" });
    await load();
    setSelected((current) => current ? { ...current, metadata: { ...current.metadata, ...patch } as Contact["metadata"] } : current);
    toast({ title: "Contacto atualizado" });
  };

  const toggleTag = async (tag: Tag) => {
    if (!user || !selected) return;
    const hasTag = selected.tags.some((item) => item.id === tag.id);
    const result = hasTag
      ? await db.from("crm_contact_tags").delete().eq("user_id", user.id).eq("contact_id", selected.id).eq("tag_id", tag.id)
      : await db.from("crm_contact_tags").insert({ user_id: user.id, contact_id: selected.id, tag_id: tag.id });
    if (result.error) return toast({ title: "Não foi possível atualizar as tags", description: result.error.message, variant: "destructive" });
    await load();
    setSelected((current) => current ? { ...current, tags: hasTag ? current.tags.filter((item) => item.id !== tag.id) : [...current.tags, tag] } : current);
  };

  const addManualContact = async () => {
    if (!user || !manualContact.phone_number.trim()) return;
    const phone = manualContact.phone_number.replace(/\D/g, "");
    if (!activeInstance) return toast({ title: "WhatsApp não conectado", description: "Conecte um WhatsApp antes de adicionar contactos.", variant: "destructive" });
    const { data, error } = await db.from("whatsapp_contacts").upsert({ user_id: user.id, instance_name: activeInstance.instance_name, whatsapp_instance_id: activeInstance.id, canonical_remote_jid: `${phone}@s.whatsapp.net`, remote_jid: `${phone}@s.whatsapp.net`, identity_type: "phone", identity_status: "resolved", name: manualContact.name.trim() || null, phone_number: phone, should_respond: true }, { onConflict: "user_id,instance_name,phone_number", ignoreDuplicates: false }).select("id").single();
    if (error) return toast({ title: "Não foi possível guardar o contacto", description: error.message, variant: "destructive" });
    await db.from("crm_activities").insert({ user_id: user.id, contact_id: data.id, activity_type: "contact_created", description: "Contacto adicionado manualmente" });
    setManualContact({ name: "", phone_number: "" });
    setManualOpen(false);
    await load();
    toast({ title: "Contacto adicionado" });
  };

  const deleteContact = async () => {
    if (!user || !selected || !window.confirm("Eliminar este contacto?")) return;
    const { error } = await db.from("whatsapp_contacts").delete().eq("id", selected.id).eq("user_id", user.id);
    if (error) return toast({ title: "Não foi possível eliminar", description: error.message, variant: "destructive" });
    setSelected(null);
    await load();
  };

  return (
    <DashboardShell title="CRM" description="Organize contactos, oportunidades e histórico do negócio.">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Centro de clientes</h2><p className="text-sm text-muted-foreground">Gerencie contactos e acompanhe cada oportunidade.</p></div><Button onClick={() => setManualOpen(true)}>+ Novo contacto</Button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Contactos", contacts.length, "Todos os contactos"], ["Leads", leadCount, "Novos contactos"], ["Interessados", interestedCount, "Em negociação"], ["Clientes", customerCount, "Oportunidades ganhas"]].map(([label, value, caption]) => <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{caption}</p></CardContent></Card>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Funil de vendas</CardTitle></CardHeader><CardContent className="space-y-4">{funnel.map((stage) => <div key={stage.id}><div className="mb-1 flex justify-between text-sm"><span>{stage.name}</span><span className="font-medium">{stage.count}</span></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${contacts.length ? Math.max(4, stage.count / contacts.length * 100) : 0}%` }} /></div></div>)}{!funnel.length && <p className="text-sm text-muted-foreground">Crie etapas para acompanhar o funil.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Atividade recente</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{contacts.slice(0, 5).map((contact) => <div key={contact.id} className="flex items-center justify-between gap-3"><span className="truncate">{contact.name || contact.phone_number} entrou no CRM</span><span className="shrink-0 text-xs text-muted-foreground">{contact.last_message_at ? new Date(contact.last_message_at).toLocaleDateString("pt-AO") : "Novo"}</span></div>)}{!contacts.length && <p className="text-sm text-muted-foreground">As atividades aparecerão aqui.</p>}</CardContent></Card></div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input className="lg:max-w-md" placeholder="Pesquisar nome ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select value={stageFilter} onValueChange={setStageFilter}><SelectTrigger className="lg:w-48"><SelectValue placeholder="Todas as etapas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as etapas</SelectItem>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent></Select>
        <Select value={tagFilter} onValueChange={setTagFilter}><SelectTrigger className="lg:w-48"><SelectValue placeholder="Todas as tags" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as tags</SelectItem>{tags.map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" className="lg:ml-auto" onClick={() => setManualOpen(true)}>Adicionar contacto</Button>
        <Button variant="outline" onClick={() => setKanban((value) => !value)}>{kanban ? "Ver lista" : "Ver Kanban"}</Button>
      </div>

      {kanban ? <div className="grid gap-3 overflow-x-auto md:grid-cols-4 xl:grid-cols-7">{stages.map((stage) => <Card key={stage.id} className="min-w-[190px]"><CardHeader><CardTitle className="text-sm">{stage.name}</CardTitle></CardHeader><CardContent className="space-y-2">{filtered.filter((contact) => contact.stage?.id === stage.id).map((contact) => <button type="button" key={contact.id} onClick={() => void openContact(contact)} className="w-full rounded border p-2 text-left text-sm hover:border-primary"><div className="font-medium">{contact.name || contact.phone_number}</div><div className="text-xs text-muted-foreground">{contact.tags.map((tag) => tag.name).join(", ")}</div></button>)}</CardContent></Card>)}</div> : <Card><CardHeader><CardTitle>Contactos ({filtered.length})</CardTitle></CardHeader><CardContent className="overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left"><th className="py-3">Nome</th><th>Telefone</th><th>Etapa</th><th>Tags</th><th>Responsável</th><th>Última interação</th><th>Criado em</th></tr></thead><tbody>{visible.map((contact) => <tr key={contact.id} className="cursor-pointer border-b hover:bg-muted/40" onClick={() => void openContact(contact)}><td className="py-3 font-medium">{contact.name || "Sem nome"}</td><td>{contact.phone_number}</td><td>{contact.stage?.name || "Novo"}</td><td><div className="flex max-w-48 flex-wrap gap-1">{contact.tags.map((tag) => <Badge key={tag.id} variant="secondary">{tag.name}</Badge>)}</div></td><td>{contact.metadata?.owner_id ? "Atribuído" : "Sem responsável"}</td><td>{contact.last_message_at ? new Date(contact.last_message_at).toLocaleString("pt-AO") : "-"}</td><td>{new Date(contact.created_at).toLocaleDateString("pt-AO")}</td></tr>)}</tbody></table><div className="mt-4 flex items-center justify-between text-sm text-muted-foreground"><span>Página {page} de {totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Seguinte</Button></div></div></CardContent></Card>}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{selected?.name || selected?.phone_number}</DialogTitle></DialogHeader>{selected && <Tabs defaultValue="overview"><TabsList className="grid w-full grid-cols-4"><TabsTrigger value="overview">Visão geral</TabsTrigger><TabsTrigger value="history">Atividades</TabsTrigger><TabsTrigger value="conversations">Conversas</TabsTrigger><TabsTrigger value="orders">Pedidos</TabsTrigger></TabsList><TabsContent value="overview" className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Telefone</Label><p className="mt-1 text-sm">{selected.phone_number}</p></div><div><Label>Última interação</Label><p className="mt-1 text-sm">{selected.last_message_at ? new Date(selected.last_message_at).toLocaleString("pt-AO") : "-"}</p></div></div><div><Label>Etapa</Label><Select value={selected.metadata?.stage_id || stages[0]?.id} onValueChange={(stageId) => void updateContact({ stage_id: stageId }, "Etapa alterada")}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Tags</Label><div className="mt-2 flex flex-wrap gap-2">{tags.map((tag) => <Button key={tag.id} size="sm" variant={selected.tags.some((item) => item.id === tag.id) ? "default" : "outline"} onClick={() => void toggleTag(tag)}>{tag.name}</Button>)}</div></div><div><Label htmlFor="crm-notes">Notas</Label><Textarea id="crm-notes" className="mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} /><Button className="mt-2" disabled={saving} onClick={() => void updateContact({ notes }, "Nota atualizada")}>Guardar notas</Button></div></TabsContent><TabsContent value="history" className="space-y-2">{activities.length ? activities.map((activity) => <div key={activity.id} className="rounded border p-3 text-sm"><div className="font-medium">{activityLabels[activity.activity_type] || activity.activity_type}</div><div className="text-muted-foreground">{activity.description || "-"} · {new Date(activity.created_at).toLocaleString("pt-AO")}</div></div>) : <p className="text-sm text-muted-foreground">Ainda não existem atividades.</p>}</TabsContent><TabsContent value="conversations" className="text-sm text-muted-foreground">As conversas deste contacto ficam disponíveis na Inbox.</TabsContent><TabsContent value="orders" className="text-sm text-muted-foreground">Os pedidos associados ao telefone ficam disponíveis em Pedidos.</TabsContent></Tabs>}</DialogContent></Dialog>
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar contacto</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div><Label htmlFor="manual-contact-name">Nome</Label><Input id="manual-contact-name" value={manualContact.name} onChange={(event) => setManualContact({ ...manualContact, name: event.target.value })} placeholder="Nome do contacto" /></div>
            <div><Label htmlFor="manual-contact-phone">Telefone</Label><Input id="manual-contact-phone" required value={manualContact.phone_number} onChange={(event) => setManualContact({ ...manualContact, phone_number: event.target.value })} placeholder="244900000000" /></div>
            <Button onClick={() => void addManualContact()} disabled={!manualContact.phone_number.trim()}>Guardar contacto</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
