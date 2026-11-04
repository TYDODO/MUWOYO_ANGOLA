import { useEffect, useMemo, useRef, useState } from "react";
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
const DEFAULT_STAGE_COLOR = "#64748b";
const DEFAULT_TAG_COLOR = "#0f766e";

function isMissingColorColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "42703"
    || error.code === "PGRST204"
    || /could not find .*color|column .*color.* does not exist|schema cache.*color/i.test(error.message || "")
  ));
}
function isMissingViewedAtColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "42703"
    || error.code === "PGRST204"
    || /could not find .*crm_viewed_at|column .*crm_viewed_at.* does not exist|schema cache.*crm_viewed_at/i.test(error.message || "")
  ));
}

type Stage = { id: string; name: string; position: number; color: string };
type Tag = { id: string; name: string; color: string };
type Contact = {
  id: string;
  name: string | null;
  phone_number: string;
  crm_viewed_at: string | null;
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
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryType, setCategoryType] = useState<"stage" | "tag">("tag");
  const [newCategory, setNewCategory] = useState({ name: "", color: DEFAULT_TAG_COLOR });
  const [savingCategory, setSavingCategory] = useState(false);
  const [readTrackingAvailable, setReadTrackingAvailable] = useState(true);
  const readTrackingNoticeShown = useRef(false);

  const load = async () => {
    if (!user) return;
    const { data: instance } = await db.from("instances").select("id,instance_name").eq("user_id", user.id).eq("status", "connected").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setActiveInstance(instance || null);
    if (!instance) { setContacts([]); setStages([]); setTags([]); return; }
    const [contactResult, stageResult, tagResult, { data: metadataRows }, { data: tagLinks }] = await Promise.all([
      db.from("whatsapp_contacts").select("id,name,phone_number,crm_viewed_at,last_message_at,created_at,is_group").eq("user_id", user.id).eq("whatsapp_instance_id", instance.id).eq("is_group", false).order("last_message_at", { ascending: false, nullsFirst: false }),
      db.from("crm_stages").select("id,name,position,color").eq("user_id", user.id).order("position"),
      db.from("crm_tags").select("id,name,color").eq("user_id", user.id).order("name"),
      db.from("crm_contact_metadata").select("contact_id,stage_id,owner_id,notes").eq("user_id", user.id),
      db.from("crm_contact_tags").select("contact_id,tag_id").eq("user_id", user.id),
    ]);
    const [{ data: contactFallback }, { data: stageFallback }, { data: tagFallback }] = await Promise.all([
      isMissingViewedAtColumn(contactResult.error)
        ? db.from("whatsapp_contacts").select("id,name,phone_number,last_message_at,created_at,is_group").eq("user_id", user.id).eq("whatsapp_instance_id", instance.id).eq("is_group", false).order("last_message_at", { ascending: false, nullsFirst: false })
        : Promise.resolve({ data: null }),
      stageResult.error && isMissingColorColumn(stageResult.error)
        ? db.from("crm_stages").select("id,name,position").eq("user_id", user.id).order("position")
        : Promise.resolve({ data: null }),
      tagResult.error && isMissingColorColumn(tagResult.error)
        ? db.from("crm_tags").select("id,name").eq("user_id", user.id).order("name")
        : Promise.resolve({ data: null }),
    ]);
    const contactRows = contactResult.data || contactFallback || [];
    const trackingAvailable = !isMissingViewedAtColumn(contactResult.error);
    setReadTrackingAvailable(trackingAvailable);
    if (!trackingAvailable && !readTrackingNoticeShown.current) {
      readTrackingNoticeShown.current = true;
      toast({ title: "Atualização do CRM necessária", description: "Aplique a migration crm_category_colors no Supabase para acompanhar contactos novos ainda não visualizados.", variant: "destructive" });
    }
    const stageRows = (stageResult.data || stageFallback || []).map((stage: Partial<Stage>) => ({ ...stage, color: stage.color || DEFAULT_STAGE_COLOR }));
    const tagRows = (tagResult.data || tagFallback || []).map((tag: Partial<Tag>) => ({ ...tag, color: tag.color || DEFAULT_TAG_COLOR }));
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
    const viewedAt = contact.crm_viewed_at || new Date().toISOString();
    const viewedContact = { ...contact, crm_viewed_at: viewedAt };
    setSelected(viewedContact);
    setNotes(contact.metadata?.notes || "");
    if (!contact.crm_viewed_at && user && readTrackingAvailable) {
      const { error } = await db.from("whatsapp_contacts")
        .update({ crm_viewed_at: viewedAt })
        .eq("id", contact.id)
        .eq("user_id", user.id);
      if (error) {
        toast({ title: "Não foi possível marcar o contacto como visualizado", description: error.message, variant: "destructive" });
        setSelected(contact);
      } else {
        setContacts((current) => current.map((item) => item.id === contact.id ? viewedContact : item));
      }
    }
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

  const saveCategory = async () => {
    if (!user || !newCategory.name.trim()) return;
    setSavingCategory(true);
    const table = categoryType === "stage" ? "crm_stages" : "crm_tags";
    const payload = categoryType === "stage"
      ? { user_id: user.id, name: newCategory.name.trim(), position: stages.reduce((max, stage) => Math.max(max, stage.position), 0) + 1, color: newCategory.color }
      : { user_id: user.id, name: newCategory.name.trim(), color: newCategory.color };
    let result = await db.from(table).insert(payload);
    const missingColor = isMissingColorColumn(result.error);
    if (missingColor) {
      const { color: _color, ...legacyPayload } = payload;
      result = await db.from(table).insert(legacyPayload);
    }
    setSavingCategory(false);
    if (result.error) {
      toast({ title: "Não foi possível criar a categoria", description: result.error.message, variant: "destructive" });
      return;
    }
    await load();
    setNewCategory({ name: "", color: categoryType === "stage" ? DEFAULT_STAGE_COLOR : DEFAULT_TAG_COLOR });
    toast({
      title: categoryType === "stage" ? "Etapa criada" : "Etiqueta criada",
      ...(missingColor ? { description: "A categoria foi criada, mas para guardar cores personalizadas aplique a migration de cores do CRM no Supabase." } : {}),
    });
  };

  const updateCategory = async (type: "stage" | "tag", item: Stage | Tag, patch: { name?: string; color?: string }) => {
    if (!user) return;
    const table = type === "stage" ? "crm_stages" : "crm_tags";
    const { error } = await db.from(table).update(patch).eq("id", item.id).eq("user_id", user.id);
    if (error) {
      toast({
        title: "Não foi possível atualizar a categoria",
        description: isMissingColorColumn(error)
          ? "Aplique a migration crm_category_colors no Supabase para guardar cores."
          : error.message,
        variant: "destructive",
      });
      return;
    }
    await load();
    setSelected((current) => current ? {
      ...current,
      stage: type === "stage" && current.stage?.id === item.id ? { ...current.stage, ...patch } : current.stage,
      tags: type === "tag" ? current.tags.map((tag) => tag.id === item.id ? { ...tag, ...patch } : tag) : current.tags,
    } : current);
  };

  const deleteCategory = async (type: "stage" | "tag", item: Stage | Tag) => {
    if (!user || !window.confirm(`Eliminar ${type === "stage" ? "a etapa" : "a etiqueta"} "${item.name}"?`)) return;
    const table = type === "stage" ? "crm_stages" : "crm_tags";
    const { error } = await db.from(table).delete().eq("id", item.id).eq("user_id", user.id);
    if (error) {
      toast({ title: "Não foi possível eliminar a categoria", description: error.message, variant: "destructive" });
      return;
    }
    if (type === "stage" && stageFilter === item.id) setStageFilter("all");
    if (type === "tag" && tagFilter === item.id) setTagFilter("all");
    await load();
    setSelected((current) => current ? {
      ...current,
      stage: type === "stage" && current.stage?.id === item.id ? undefined : current.stage,
      tags: type === "tag" ? current.tags.filter((tag) => tag.id !== item.id) : current.tags,
    } : current);
    toast({ title: "Categoria eliminada" });
  };

  const contrastColor = (color: string) => {
    const hex = color.replace("#", "");
    if (!/^[\da-f]{6}$/i.test(hex)) return "#ffffff";
    const [red, green, blue] = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.179 ? "#17211d" : "#ffffff";
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
        <Button variant="outline" onClick={() => setCategoryManagerOpen(true)}>Gerir categorias</Button>
        <Button variant="outline" onClick={() => setKanban((value) => !value)}>{kanban ? "Ver lista" : "Ver Kanban"}</Button>
      </div>

      {kanban ? (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-4 xl:grid-cols-7">
          {stages.map((stage) => (
            <Card key={stage.id} className="min-w-[190px]">
              <CardHeader>
                <CardTitle className="text-sm">
                  <Badge style={{ backgroundColor: stage.color, color: contrastColor(stage.color) }}>{stage.name}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filtered.filter((contact) => contact.stage?.id === stage.id).map((contact) => (
                  <button type="button" key={contact.id} onClick={() => void openContact(contact)} className="w-full rounded border p-2 text-left text-sm hover:border-primary">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="truncate">{contact.name || contact.phone_number}</span>
                      {readTrackingAvailable && !contact.crm_viewed_at && <Badge className="bg-emerald-600 text-[10px] text-white">Novo</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {contact.tags.map((tag) => (
                        <Badge key={tag.id} style={{ backgroundColor: tag.color, color: contrastColor(tag.color) }}>{tag.name}</Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle>Contactos ({filtered.length})</CardTitle></CardHeader>
          <CardContent className="overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-3">Nome</th><th>Telefone</th><th>Etapa</th><th>Tags</th>
                  <th>Responsável</th><th>Última interação</th><th>Criado em</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((contact) => (
                  <tr key={contact.id} className="cursor-pointer border-b hover:bg-muted/40" onClick={() => void openContact(contact)}>
                    <td className="py-3 font-medium">
                      <span className="inline-flex items-center gap-2">
                        {contact.name || "Sem nome"}
                        {readTrackingAvailable && !contact.crm_viewed_at && <Badge className="bg-emerald-600 text-[10px] text-white">Novo</Badge>}
                      </span>
                    </td>
                    <td>{contact.phone_number}</td>
                    <td><Badge style={contact.stage ? { backgroundColor: contact.stage.color, color: contrastColor(contact.stage.color) } : undefined}>{contact.stage?.name || "Novo"}</Badge></td>
                    <td>
                      <div className="flex max-w-48 flex-wrap gap-1">
                        {contact.tags.map((tag) => (
                          <Badge key={tag.id} style={{ backgroundColor: tag.color, color: contrastColor(tag.color) }}>{tag.name}</Badge>
                        ))}
                      </div>
                    </td>
                    <td>{contact.metadata?.owner_id ? "Atribuído" : "Sem responsável"}</td>
                    <td>{contact.last_message_at ? new Date(contact.last_message_at).toLocaleString("pt-AO") : "-"}</td>
                    <td>{new Date(contact.created_at).toLocaleDateString("pt-AO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Seguinte</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={categoryManagerOpen} onOpenChange={setCategoryManagerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Personalizar etapas e etiquetas</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={categoryType} onValueChange={(value: "stage" | "tag") => {
              setCategoryType(value);
              setNewCategory({ name: "", color: value === "stage" ? DEFAULT_STAGE_COLOR : DEFAULT_TAG_COLOR });
            }}>
              <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stage">Etapas</SelectItem>
                <SelectItem value="tag">Etiquetas</SelectItem>
              </SelectContent>
            </Select>
            <Input
              aria-label={categoryType === "stage" ? "Nome da etapa" : "Nome da etiqueta"}
              placeholder={categoryType === "stage" ? "Nova etapa" : "Nova etiqueta"}
              value={newCategory.name}
              onChange={(event) => setNewCategory((current) => ({ ...current, name: event.target.value }))}
              onKeyDown={(event) => { if (event.key === "Enter") void saveCategory(); }}
            />
            <Input
              aria-label="Cor da nova categoria"
              type="color"
              className="h-10 w-12 shrink-0 p-1"
              value={newCategory.color}
              onChange={(event) => setNewCategory((current) => ({ ...current, color: event.target.value }))}
            />
            <Button disabled={savingCategory || !newCategory.name.trim()} onClick={() => void saveCategory()}>
              {savingCategory ? "A guardar..." : "Adicionar"}
            </Button>
          </div>
          {([
            { type: "stage" as const, label: "Etapas", items: stages },
            { type: "tag" as const, label: "Etiquetas", items: tags },
          ]).map(({ type, label, items }) => (
            <section key={type} className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">{label}</h3>
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-md border p-2">
                  <Input
                    aria-label={`Nome: ${item.name}`}
                    className="h-9"
                    defaultValue={item.name}
                    onBlur={(event) => {
                      const name = event.currentTarget.value.trim();
                      if (name && name !== item.name) void updateCategory(type, item, { name });
                      else if (!name) event.currentTarget.value = item.name;
                    }}
                    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                  />
                  <Input
                    aria-label={`Cor: ${item.name}`}
                    className="h-9 w-12 shrink-0 p-1"
                    type="color"
                    defaultValue={item.color}
                    onBlur={(event) => {
                      if (event.currentTarget.value !== item.color) {
                        void updateCategory(type, item, { color: event.currentTarget.value });
                      }
                    }}
                  />
                  <Badge style={{ backgroundColor: item.color, color: contrastColor(item.color) }}>{item.name}</Badge>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void deleteCategory(type, item)}>Eliminar</Button>
                </div>
              ))}
              {!items.length && <p className="text-xs text-muted-foreground">Sem {label.toLowerCase()} personalizadas.</p>}
            </section>
          ))}
        </DialogContent>
      </Dialog>

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
