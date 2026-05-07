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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CalendarDays, Phone, User } from "lucide-react";

type Appt = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  service: string | null;
  description: string | null;
  scheduled_at: string | null;
  status: string;
  created_at: string;
};

export default function Schedule() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Appt[]>([]);
  const [open, setOpen] = useState<Appt | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true });
    setRows((data as any) || []);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`appts-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
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
    await supabase.from("appointments").update({ status }).eq("id", id);
    load();
  };

  return (
    <DashboardShell
      title="Minha Agenda"
      description="Agendamentos preenchidos automaticamente pela IA."
    >
      <div className="grid gap-3">
        {rows.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Nenhum agendamento ainda. A IA preenche aqui quando os clientes
              pedem para marcar.
            </CardContent>
          </Card>
        )}
        {rows.map((a) => (
          <Card
            key={a.id}
            className="cursor-pointer transition hover:shadow-md"
            onClick={() => setOpen(a)}
          >
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <div className="font-semibold truncate">
                    {a.service || "Agendamento"}
                  </div>
                </div>
                <div className="mt-1 text-sm text-muted-foreground truncate">
                  {a.customer_name || "Cliente"} - +{a.customer_phone || "-"}
                </div>
              </div>
              <div className="text-right">
                <Badge variant={a.status === "pending" ? "default" : "outline"}>
                  {a.status}
                </Badge>
                <div className="mt-1 text-sm font-medium">
                  {a.scheduled_at
                    ? new Date(a.scheduled_at).toLocaleString("pt-AO")
                    : "Sem data"}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={() => setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhe do agendamento</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3">
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
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {open.scheduled_at
                    ? new Date(open.scheduled_at).toLocaleString("pt-AO")
                    : "Sem data"}
                </div>
              </div>
              {open.service && (
                <div>
                  <b>Serviço:</b> {open.service}
                </div>
              )}
              {open.description && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  {open.description}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <Select
                  value={open.status}
                  onValueChange={(v) => updateStatus(open.id, v)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="confirmed">Confirmado</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                {open.customer_phone && (
                  <Button
                    onClick={() =>
                      window.open(
                        `https://wa.me/${open.customer_phone}`,
                        "_blank",
                      )
                    }
                  >
                    WhatsApp
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
