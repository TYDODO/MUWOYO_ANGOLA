import { FormEvent, useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  RefreshCw,
  Search,
  MessageCircle,
  DownloadCloud,
  Ban,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Contact = {
  id: string;
  name: string | null;
  phone_number: string;
  should_respond: boolean;
  last_message_at?: string | null;
  is_group?: boolean;
};
type Blocked = {
  id: string;
  phone_number: string;
  reason: string | null;
  is_active: boolean;
};

type WhatsAppInstance = { id: string; instance_name: string };

export default function MyWhatsApp() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Contact[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualShouldRespond, setManualShouldRespond] = useState(true);
  const [activeInstance, setActiveInstance] = useState<WhatsAppInstance | null>(null);
  const [activeTab, setActiveTab] = useState<"contacts" | "no-response" | "blocked">("contacts");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: instance }, { data: c }, { data: b }] = await Promise.all([
      supabase
        .from("instances")
        .select("id,instance_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("whatsapp_contacts")
        .select("id, name, phone_number, should_respond, last_message_at, is_group")
        .eq("user_id", user.id)
        .eq("is_group", false)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(500),
      supabase
        .from("blocked_contacts")
        .select("id, phone_number, reason, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true),
    ]);
    setActiveInstance(instance || null);
    setRows(((c as Contact[]) || []).filter((contact) => /^[1-9][0-9]{7,14}$/.test(contact.phone_number) && !contact.phone_number.includes("@")));
    setBlocked((b as Blocked[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const toggleRespond = async (c: Contact) => {
    const nextValue = !c.should_respond;
    const { error } = await supabase
      .from("whatsapp_contacts")
      .update({ should_respond: nextValue })
      .eq("id", c.id);
    if (error) return toast({ title: "Não foi possível atualizar o contacto", description: error.message, variant: "destructive" });
    setRows((r) => r.map((x) => x.id === c.id ? { ...x, should_respond: nextValue } : x));
  };

  const addContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!activeInstance) return toast({ title: "WhatsApp não conectado", description: "Conecte uma instância antes de adicionar contactos.", variant: "destructive" });
    const phoneNumber = manualPhone.replace(/\D/g, "");
    if (phoneNumber.length < 7 || phoneNumber.length > 15) return toast({ title: "Número inválido", description: "Introduza entre 7 e 15 dígitos.", variant: "destructive" });
    const { error } = await supabase.from("whatsapp_contacts").upsert({ user_id: user.id, instance_name: activeInstance.instance_name, whatsapp_instance_id: activeInstance.id, remote_jid: `${phoneNumber}@s.whatsapp.net`, phone_number: phoneNumber, name: manualName.trim() || null, should_respond: manualShouldRespond }, { onConflict: "user_id,instance_name,phone_number" });
    if (error) return toast({ title: "Não foi possível guardar o contacto", description: error.message, variant: "destructive" });
    setManualPhone("");
    setManualName("");
    toast({ title: "Contacto adicionado" });
    load();
  };

  const toggleSelected = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        `${r.name || ""} ${r.phone_number}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [rows, search],
  );
  const visibleContacts = activeTab === "no-response" ? filtered.filter((c) => !c.should_respond) : filtered;
  const allVisibleSelected = visibleContacts.length > 0 && visibleContacts.every((c) => selected.includes(c.id));
  const toggleAll = () => setSelected((current) => allVisibleSelected ? current.filter((id) => !visibleContacts.some((c) => c.id === id)) : Array.from(new Set([...current, ...visibleContacts.map((c) => c.id)])));
  const bulkSetRespond = async (shouldRespond: boolean) => {
    if (!selected.length) return;
    const { error } = await supabase.from("whatsapp_contacts").update({ should_respond: shouldRespond }).in("id", selected);
    if (error) return toast({ title: "Não foi possível atualizar os contactos", description: error.message, variant: "destructive" });
    setSelected([]);
    toast({ title: `${selected.length} contacto(s) atualizado(s)` });
    load();
  };

  const blockContact = async (c: Contact) => {
    if (!user) return;
    await supabase
      .from("blocked_contacts")
      .insert({
        user_id: user.id,
        phone_number: c.phone_number,
        is_active: true,
      });
    toast({ title: "Contacto bloqueado" });
    load();
  };

  const unblock = async (b: Blocked) => {
    await supabase
      .from("blocked_contacts")
      .update({ is_active: false })
      .eq("id", b.id);
    toast({ title: "Desbloqueado" });
    load();
  };

  const importFromWhatsApp = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-import", {
        body: {},
      });
      setImporting(false);
      if (error) {
        console.warn("Function whatsapp-import not available:", error.message);
        return toast({
          title: "Erro",
          description: error.message,
          variant: "destructive",
        });
      }
      toast({ title: `${data?.imported || 0} contactos sincronizados` });
      load();
    } catch (error) {
      setImporting(false);
      console.warn("Function call failed:", error);
      toast({
        title: "Erro",
        description: "Erro ao conectar com o servidor",
        variant: "destructive",
      });
    }
  };
  const filteredBlocked = useMemo(
    () => blocked.filter((b) => b.phone_number.includes(search)),
    [blocked, search],
  );

  return (
    <DashboardShell
      title="Meus contactos"
      description="Contactos, regras de resposta e bloqueios da sua conta."
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar contacto ou número"
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={importFromWhatsApp}
          disabled={importing}
          className="gap-2"
        >
          <DownloadCloud
            className={`h-4 w-4 ${importing ? "animate-bounce" : ""}`}
          />{" "}
          {importing ? "A importar..." : "Importar do WhatsApp"}
        </Button>
        <Button
          variant="outline"
          onClick={load}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{" "}
          Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={addContact} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <div><label htmlFor="contact-name" className="mb-1 block text-xs font-medium text-muted-foreground">Nome (opcional)</label><Input id="contact-name" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Nome do cliente" /></div>
            <div><label htmlFor="contact-phone" className="mb-1 block text-xs font-medium text-muted-foreground">Número do cliente</label><Input id="contact-phone" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="Ex: 2449..." required /></div>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={manualShouldRespond} onChange={(e) => setManualShouldRespond(e.target.checked)} /> Responder</label>
            <Button type="submit" className="gap-2"><UserPlus className="h-4 w-4" />Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3 sm:w-auto">
          <TabsTrigger value="contacts">
            Meus contactos ({filtered.length})
          </TabsTrigger>
          <TabsTrigger value="no-response">
            Não responder ({filtered.filter((c) => !c.should_respond).length})
          </TabsTrigger>
          <TabsTrigger value="blocked">
            Bloqueados ({filteredBlocked.length})
          </TabsTrigger>
        </TabsList>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {selected.length > 0 && <><Button size="sm" variant="outline" onClick={() => void bulkSetRespond(true)}>Responder selecionados</Button><Button size="sm" variant="outline" onClick={() => void bulkSetRespond(false)}>Não responder selecionados</Button></>}
        </div>

        <TabsContent value="contacts" className="grid gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /> Selecionar todos os contactos visíveis</label>
          {visibleContacts.map((c) => {
            const initials = (c.name || c.phone_number)
              .slice(0, 2)
              .toUpperCase();
            const last = c.last_message_at
              ? new Date(c.last_message_at).toLocaleString("pt-AO", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null;
            return (
              <Card key={c.id} className="overflow-hidden">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelected(c.id)} aria-label={`Selecionar ${c.name || c.phone_number}`} />
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.name || c.phone_number)}&backgroundColor=16a34a&textColor=ffffff`}
                        alt={c.name || c.phone_number}
                      />
                      <AvatarFallback className="bg-primary/15 font-semibold text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {c.name || "Contacto WhatsApp"}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        +{c.phone_number}
                      </div>
                      {last && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MessageCircle className="h-3 w-3" />
                          {last}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant={c.should_respond ? "destructive" : "default"}
                      onClick={() => toggleRespond(c)}
                    >
                      {c.should_respond ? "Não responder" : "Responder"}
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => blockContact(c)}
                      title="Bloquear"
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <Card>
              <CardContent className="p-6 text-muted-foreground">
                Nenhum contacto. Use "Importar do WhatsApp" para puxar da sua
                conta conectada.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="no-response" className="grid gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /> Selecionar todos os contactos visíveis</label>
          {visibleContacts.map((c) => {
            const initials = (c.name || c.phone_number).slice(0, 2).toUpperCase();
            return <Card key={c.id}><CardContent className="flex items-center justify-between gap-3 p-4"><div className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelected(c.id)} aria-label={`Selecionar ${c.name || c.phone_number}`} /><Avatar className="h-10 w-10"><AvatarFallback>{initials}</AvatarFallback></Avatar><div className="min-w-0"><div className="truncate font-semibold">{c.name || "Contacto WhatsApp"}</div><div className="truncate text-sm text-muted-foreground">+{c.phone_number}</div></div></div><Button size="sm" onClick={() => toggleRespond(c)}>Responder</Button></CardContent></Card>;
          })}
          {visibleContacts.length === 0 && <Card><CardContent className="p-6 text-muted-foreground">Nenhum contacto configurado para não responder.</CardContent></Card>}
        </TabsContent>

        <TabsContent value="blocked" className="grid gap-3">
          {filteredBlocked.length === 0 && (
            <Card>
              <CardContent className="p-6 text-muted-foreground">
                Nenhum contacto bloqueado.
              </CardContent>
            </Card>
          )}
          {filteredBlocked.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-semibold">+{b.phone_number}</div>
                  {b.reason && (
                    <div className="text-xs text-muted-foreground">
                      {b.reason}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => unblock(b)}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" /> Desbloquear
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
