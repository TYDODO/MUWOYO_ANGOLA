import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardShell from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type AssignedConversation = {
  id: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  contact: { name: string | null; custom_name: string | null; phone_number: string } | null;
};

const modules = [
  { path: "/inbox", permission: "inbox.view", label: "Abrir Inbox" },
  { path: "/crm", permission: "crm.view", label: "Contactos" },
  { path: "/pedidos", permission: "orders.view", label: "Pedidos" },
  { path: "/agenda", permission: "agenda.view", label: "Agenda" },
  { path: "/produtos", permission: "products.view", label: "Produtos" },
];

export default function AttendantDashboard() {
  const { user } = useAuth();
  const { membership, permissions, ownerUserId } = useBusinessMembership();
  const { toast } = useToast();
  const [assigned, setAssigned] = useState<AssignedConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !ownerUserId || !permissions.includes("inbox.view")) {
      setAssigned([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void supabase
      .from("inbox_conversations")
      .select("id,contact_id,unread_count,last_message_at,last_message_preview")
      .eq("user_id", ownerUserId)
      .eq("assigned_to", user.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(5)
      .then(async ({ data, error }: { data: Omit<AssignedConversation, "contact">[] | null; error: { message: string } | null }) => {
        if (cancelled) return;
        if (error) toast({ title: "Não foi possível carregar as conversas", description: error.message, variant: "destructive" });
        const conversations = data || [];
        const contactIds = conversations.map((conversation) => conversation.contact_id);
        const { data: contacts } = contactIds.length
          ? await supabase.from("whatsapp_contacts").select("id,name,phone_number").in("id", contactIds)
          : { data: [] };
        const contactMap = new Map((contacts || []).map((contact) => [contact.id, { name: contact.name, custom_name: null, phone_number: contact.phone_number }]));
        setAssigned(conversations.map((conversation) => ({ ...conversation, contact: contactMap.get(conversation.contact_id) || null })));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user, ownerUserId, permissions, toast]);

  const allowedModules = modules.filter((module) => permissions.includes(module.permission));
  const unread = assigned.reduce((total, conversation) => total + conversation.unread_count, 0);

  return (
    <DashboardShell title="Área do atendente" description="O seu espaço de atendimento e trabalho atribuído.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Atendente</p><p className="mt-1 font-semibold">{membership?.name || membership?.email}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Conversas atribuídas</p><p className="mt-1 text-2xl font-semibold">{assigned.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Não lidas</p><p className="mt-1 text-2xl font-semibold">{unread}</p></CardContent></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader><CardTitle>As minhas conversas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">A carregar conversas...</p>}
            {!loading && assigned.map((conversation) => (
              <Link key={conversation.id} to="/inbox" className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/40">
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{conversation.contact?.custom_name || conversation.contact?.name || conversation.contact?.phone_number || "Contacto"}</span><span className="block truncate text-xs text-muted-foreground">{conversation.last_message_preview || "Sem mensagem recente"}</span></span>
                {conversation.unread_count > 0 && <Badge>{conversation.unread_count}</Badge>}
              </Link>
            ))}
            {!loading && assigned.length === 0 && <p className="text-sm text-muted-foreground">Ainda não tem conversas atribuídas.</p>}
            {permissions.includes("inbox.view") && <Button asChild className="mt-2"><Link to="/inbox">Ir para o Inbox</Link></Button>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Áreas autorizadas</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {allowedModules.map((module) => <Button key={module.path} variant="outline" asChild><Link to={module.path}>{module.label}</Link></Button>)}
            {!allowedModules.length && <p className="text-sm text-muted-foreground">O administrador ainda não atribuiu permissões.</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
