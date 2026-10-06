import { useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DateTimeSelect from "@/components/DateTimeSelect";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Phone, User, Clock, History } from "lucide-react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths, startOfDay, isBefore, compareAsc, compareDesc } from "date-fns";

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

// Angola timezone is UTC+1 (Africa/Luanda). We normalize instants to Angola local
// time for grouping and display so dates/times shown are consistent for users in Angola.
const ANGOLA_OFFSET_MIN = -60; // minutes from UTC (UTC+1 => -60 from Date.getTimezoneOffset semantics)

const toAngolaDate = (value: string | Date) => {
  const d = new Date(value);
  const utcMs = d.getTime();
  const localOffsetMin = d.getTimezoneOffset();
  const adjustMin = ANGOLA_OFFSET_MIN - localOffsetMin;
  return new Date(utcMs + adjustMin * 60 * 1000);
};

const getDateKey = (value: string | Date) => {
  const d = typeof value === "string" ? toAngolaDate(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatDateLabel = (date: Date) =>
  toAngolaDate(date).toLocaleDateString("pt-AO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

const formatTimeLabel = (value: string | null) =>
  value
    ? toAngolaDate(value).toLocaleTimeString("pt-AO", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sem horário";

const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const statusStyles: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  canceled: "bg-red-100 text-red-800",
  completed: "bg-sky-100 text-sky-800",
  default: "bg-slate-100 text-slate-800",
};

const statusLabel: Record<string, string> = {
  confirmed: "Confirmado",
  pending: "Pendente",
  canceled: "Cancelado",
  completed: "Concluído",
};

function scheduleErrorMessage(error: { code?: string; message?: string }) {
  if (error.code === "42501" || error.message?.toLowerCase().includes("row-level security")) return "A sua conta não tem permissão para alterar estes agendamentos.";
  if (error.code === "23505") return "Este agendamento já existe. Escolha outro horário.";
  if (error.code === "23503") return "O cliente associado já não existe. Atualize os dados e tente novamente.";
  return "Não foi possível concluir o agendamento. Verifique os dados e tente novamente.";
}

export default function Schedule() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [rows, setRows] = useState<Appt[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [manualForm, setManualForm] = useState({ customer_name: "", customer_phone: "", service: "", description: "", scheduled_at: "", status: "confirmed" });

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true });
    if (error) {
      toast({ title: "Não foi possível carregar os agendamentos", description: scheduleErrorMessage(error), variant: "destructive" });
      return;
    }
    setRows((data as any) || []);
  };

  useEffect(() => {
    if (!user) return;

    const syncExpiredAppointments = async () => {
      try {
        await supabase.rpc("update_expired_appointments");
      } catch {
        // ignore RPC errors for the schedule refresh path
      }
    };

    void syncExpiredAppointments();
    void load();

    const channel = supabase
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
      supabase.removeChannel(channel);
    };
  }, [user]);

  const addManualAppointment = async () => {
    if (!user || !manualForm.customer_name.trim() || !manualForm.scheduled_at) return;
    const scheduledAt = new Date(manualForm.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime())) return toast({ title: "Data inválida", description: "Escolha uma data e hora válidas.", variant: "destructive" });
    setSaving(true);
    try {
      const values = { customer_name: manualForm.customer_name.trim(), customer_phone: manualForm.customer_phone.replace(/\D/g, "") || null, service: manualForm.service.trim() || null, description: manualForm.description.trim() || null, scheduled_at: scheduledAt.toISOString(), status: manualForm.status };
      const { error } = editingId
        ? await supabase.from("appointments").update(values).eq("id", editingId).eq("user_id", user.id)
        : await supabase.from("appointments").insert({ user_id: user.id, ...values });
      if (error) return toast({ title: "Não foi possível guardar o agendamento", description: scheduleErrorMessage(error), variant: "destructive" });
      setManualForm({ customer_name: "", customer_phone: "", service: "", description: "", scheduled_at: "", status: "confirmed" });
      setEditingId(null);
      setManualOpen(false);
      await load();
      toast({ title: editingId ? "Agendamento atualizado" : "Agendamento criado" });
    } catch (error) {
      toast({ title: "Falha ao guardar agendamento", description: error instanceof Error ? error.message : "Não foi possível comunicar com o servidor.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const editAppointment = (appointment: Appt) => {
    setEditingId(appointment.id);
    const date = appointment.scheduled_at ? new Date(appointment.scheduled_at) : new Date();
    setManualForm({ customer_name: appointment.customer_name || "", customer_phone: appointment.customer_phone || "", service: appointment.service || "", description: appointment.description || "", scheduled_at: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`, status: appointment.status });
    setManualOpen(true);
  };

  const updateAppointmentStatus = async (id: string, status: string) => {
    if (!user) return;
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id).eq("user_id", user.id);
    if (error) return toast({ title: "Não foi possível atualizar o agendamento", description: scheduleErrorMessage(error), variant: "destructive" });
    await load();
  };

  const deleteAppointment = async (id: string) => {
    if (!user || !window.confirm("Eliminar este agendamento?")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", id).eq("user_id", user.id);
    if (error) return toast({ title: "Não foi possível eliminar o agendamento", description: scheduleErrorMessage(error), variant: "destructive" });
    setDialogOpen(false);
    await load();
    toast({ title: "Agendamento eliminado" });
  };

  const groupedByDate = useMemo(() => {
    const map = new Map<string, Appt[]>();
    rows.forEach((appt) => {
      if (!appt.scheduled_at) return;
      const key = getDateKey(appt.scheduled_at);
      const dayItems = map.get(key) || [];
      dayItems.push(appt);
      map.set(key, dayItems);
    });
    return map;
  }, [rows]);

  const confirmedGroupedByDate = useMemo(() => {
    const map = new Map<string, Appt[]>();
    rows
      .filter((appt) => appt.status === "confirmed")
      .forEach((appt) => {
        if (!appt.scheduled_at) return;
        const key = getDateKey(appt.scheduled_at);
        const dayItems = map.get(key) || [];
        dayItems.push(appt);
        map.set(key, dayItems);
      });
    return map;
  }, [rows]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [allModalOpen, setAllModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // calendar should always indicate confirmed upcoming appointments
  const calendarMap = confirmedGroupedByDate;

  const today = startOfDay(new Date());

  const upcomingConfirmed = useMemo(
    () =>
      rows
        .filter((a) => a.status === "confirmed" && a.scheduled_at && !isBefore(new Date(a.scheduled_at), today))
        .sort((a, b) => compareAsc(new Date(a.scheduled_at || ""), new Date(b.scheduled_at || ""))),
    [rows, today],
  );

  const historyItems = useMemo(() => {
    return [...rows]
      .filter((a) => a.scheduled_at)
      .sort((a, b) => compareDesc(new Date(a.scheduled_at || ""), new Date(b.scheduled_at || "")))
      .slice(0, 100)
      .filter((a) => {
        const scheduled = new Date(a.scheduled_at || "");
        // include past items OR any canceled OR any completed items
        return isBefore(scheduled, today) || a.status === "canceled" || a.status === "completed";
      })
      .slice(0, 30);
  }, [rows, today]);

  

  const selectedDayAppointments = useMemo(
    () => (selectedDate ? groupedByDate.get(getDateKey(selectedDate)) || [] : []),
    [selectedDate, groupedByDate],
  );

  const displayedAppointments = selectedDayAppointments;

  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart, calendarEnd],
  );

  const monthLabel = `${monthNames[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`;

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setDialogOpen(true);
  };

  const handleAllOpen = () => {
    setAllModalOpen(true);
  };

  const handleHistoryOpen = () => {
    setHistoryModalOpen(true);
  };

  const handleAppointmentClick = (appt: Appt) => {
    if (appt.scheduled_at) {
      setSelectedDate(startOfDay(toAngolaDate(appt.scheduled_at)));
    }
    setDialogOpen(true);
  };

  return (
    <DashboardShell
      title="Minha Agenda"
      description="Visualização de calendário com agendamentos e detalhes por dia."
    >
      <div className="space-y-6">
        <Card className="rounded-3xl bg-transparent shadow-none border-none min-h-auto sm:border-border sm:bg-card/90 sm:shadow-sm sm:min-h-[620px]">
          <CardHeader className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Minha Agenda</CardTitle>
            <Button onClick={() => setManualOpen(true)}>Novo agendamento</Button>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[minmax(420px,1.1fr)_minmax(380px,0.9fr)]">
            <section className="space-y-6">
              <div className="rounded-none border-none bg-transparent p-0 sm:rounded-3xl sm:border sm:border-border sm:bg-slate-50 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Calendário</p>
                    <h2 className="text-2xl font-semibold text-slate-900">{monthLabel}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCalendarMonth((prev) => subMonths(prev, 1))}>
                      Anterior
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}>
                      Próximo
                    </Button>
                  </div>
                </div>

                <div className="mx-auto w-full max-w-[28rem] sm:rounded-3xl sm:bg-slate-50 sm:p-1">
                  <div className="mx-auto w-full">
                    <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:gap-2">
                      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
                        <div key={day} className="py-2">
                          {day}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-7 gap-2">
                      {calendarDays.map((date) => {
                    const key = getDateKey(date);
                    const dayAppointments = calendarMap.get(key) || [];
                    const isCurrentMonth = isSameMonth(date, monthStart);
                    const selected = isSameDay(date, selectedDate);
                    const todayFlag = isToday(date);

                    const baseStyles = selected
                      ? 'bg-emerald-600 text-white shadow-lg'
                      : todayFlag
                      ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                      : 'bg-transparent text-slate-900 hover:bg-slate-100';

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleDateSelect(date)}
                        className={`group w-full rounded-3xl p-2 text-left transition sm:aspect-square ${baseStyles} ${!isCurrentMonth ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-semibold leading-none">{format(date, 'd')}</span>
                          {todayFlag && (
                            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${selected ? 'bg-white/10 text-white/90' : 'bg-emerald-200 text-emerald-900'}`}>
                              Hoje
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 text-[0.7rem] text-slate-500">
                          {dayAppointments.length ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-800">
                              {dayAppointments.length} ag.
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{isCurrentMonth ? null : 'fora'}</span>
                        </div>
                      </button>
                    );
                  })}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-100 p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-600">
                      <History className="h-4 w-4 text-slate-500" />
                      Agenda rápida
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">{selectedDate ? formatDateLabel(selectedDate) : 'Selecione uma data'}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-900 shadow-sm">
                      {selectedDayAppointments.length} agendamento{selectedDayAppointments.length === 1 ? '' : 's'}
                    </span>
                    <Button variant="outline" size="sm" onClick={handleAllOpen}>
                      Ver todos
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleHistoryOpen}>
                      <History className="mr-2 h-4 w-4" />
                      Histórico
                    </Button>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-700">
                  Clique em um dia no calendário para ver apenas os agendamentos desse dia.
                </p>
              </div>

              <div className="space-y-4">
                    {selectedDayAppointments.map((appt) => (
                      <div key={appt.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="text-base font-semibold text-slate-950">{appt.service || 'Agendamento'}</div>
                            <div className="text-sm font-medium text-slate-800">{formatDateLabel(new Date(appt.scheduled_at || ''))} • {formatTimeLabel(appt.scheduled_at)}</div>
                            <div className="text-sm text-slate-700">{appt.customer_name || 'Cliente'}</div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                              appt.status === 'canceled'
                                ? 'bg-red-100 text-red-800'
                                : statusStyles[appt.status] ?? statusStyles.default
                            }`}
                          >
                            {statusLabel[appt.status] ?? appt.status}
                          </span>
                        </div>
                        {appt.description && (
                          <div className="mt-3 rounded-2xl bg-slate-950/5 p-4 text-sm text-slate-800">
                            {appt.description}
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => editAppointment(appt)}>Editar</Button>
                          <Button size="sm" variant="outline" onClick={() => void updateAppointmentStatus(appt.id, appt.status === "confirmed" ? "completed" : "confirmed")}>{appt.status === "confirmed" ? "Marcar concluído" : "Confirmar"}</Button>
                          <Button size="sm" variant="destructive" onClick={() => void deleteAppointment(appt.id)}>Eliminar</Button>
                        </div>
                      </div>
                    ))}
                    {selectedDayAppointments.length === 0 && (
                      <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-slate-500">
                        Seleciona uma data para ver os agendamentos desse dia.
                      </div>
                    )}
                  </div>
            </section>
          </CardContent>
        </Card>
      </div>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Editar agendamento" : "Novo agendamento"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div><Label>Cliente</Label><Input required value={manualForm.customer_name} onChange={(event) => setManualForm({ ...manualForm, customer_name: event.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label>Telefone</Label><Input value={manualForm.customer_phone} onChange={(event) => setManualForm({ ...manualForm, customer_phone: event.target.value })} /></div><div><Label>Serviço</Label><Input value={manualForm.service} onChange={(event) => setManualForm({ ...manualForm, service: event.target.value })} /></div></div>
            <DateTimeSelect value={manualForm.scheduled_at} onChange={(scheduled_at) => setManualForm({ ...manualForm, scheduled_at })} required />
            <div><Label>Estado</Label><Select value={manualForm.status} onValueChange={(status) => setManualForm({ ...manualForm, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="confirmed">Confirmado</SelectItem><SelectItem value="pending">Pendente</SelectItem></SelectContent></Select></div>
            <div><Label>Descrição</Label><Textarea value={manualForm.description} onChange={(event) => setManualForm({ ...manualForm, description: event.target.value })} /></div>
            <Button onClick={() => void addManualAppointment()} disabled={saving || !manualForm.customer_name.trim() || !manualForm.scheduled_at}>{saving ? "A guardar..." : "Guardar agendamento"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl w-full max-w-[calc(100vw-1.5rem)] mx-auto max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agendamentos para {selectedDate ? formatDateLabel(selectedDate) : "data selecionada"}</DialogTitle>
            <DialogDescription>
              {selectedDayAppointments.length} agendamento{selectedDayAppointments.length === 1 ? "" : "s"} neste dia.
            </DialogDescription>
          </DialogHeader>

          {selectedDayAppointments.length === 0 ? (
            <div className="rounded-3xl border border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum agendamento encontrado para esta data.
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-4">
              {selectedDayAppointments.map((appt) => (
                <AccordionItem key={appt.id} value={appt.id} className="rounded-3xl border border-border bg-background">
                  <AccordionTrigger className="px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {appt.service || "Agendamento"}
                        </div>
                        <div className="text-sm text-slate-700">
                          {appt.customer_name || "Cliente"}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          appt.status === 'canceled'
                            ? 'bg-red-100 text-red-800'
                            : statusStyles[appt.status] ?? statusStyles.default
                        }`}
                      >
                        {statusLabel[appt.status] ?? appt.status}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="grid gap-3">
                      <div className="flex items-center gap-2 text-sm text-slate-800">
                        <User className="h-4 w-4" />
                        {appt.customer_name || "-"}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-800">
                        <Phone className="h-4 w-4" />
                        +{appt.customer_phone || "-"}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-800">
                        <Clock className="h-4 w-4" />
                        {formatTimeLabel(appt.scheduled_at)}
                      </div>
                      {appt.description && (
                        <div className="rounded-2xl bg-slate-950/5 p-4 text-sm text-slate-800">
                          {appt.description}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={allModalOpen} onOpenChange={setAllModalOpen}>
        <DialogContent className="sm:max-w-3xl w-full max-w-[calc(100vw-1.5rem)] mx-auto max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Todos os agendamentos confirmados</DialogTitle>
            <DialogDescription>{upcomingConfirmed.length} agendamento{upcomingConfirmed.length === 1 ? "" : "s"} confirmados futuros.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {upcomingConfirmed.map((appt) => (
              <div key={appt.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-slate-950">{appt.service || 'Agendamento'}</div>
                    <div className="text-sm font-medium text-slate-800">{formatDateLabel(new Date(appt.scheduled_at || ''))} • {formatTimeLabel(appt.scheduled_at)}</div>
                    <div className="text-sm text-slate-700">{appt.customer_name || 'Cliente'}</div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[appt.status] ?? statusStyles.default}`}>
                    {statusLabel[appt.status] ?? appt.status}
                  </span>
                </div>
                {appt.description && <div className="mt-3 rounded-2xl bg-slate-950/5 p-4 text-sm text-slate-800">{appt.description}</div>}
              </div>
            ))}
            {upcomingConfirmed.length === 0 && <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-slate-500">Nenhum agendamento confirmado futuro encontrado.</div>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAllModalOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="sm:max-w-3xl w-full max-w-[calc(100vw-1.5rem)] mx-auto max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de agendamentos</DialogTitle>
            <DialogDescription>{historyItems.length} agendamento{historyItems.length === 1 ? "" : "s"} recentes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {historyItems.map((appt) => (
              <div key={appt.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-slate-950">{appt.service || 'Agendamento'}</div>
                    <div className="text-sm font-medium text-slate-800">{formatDateLabel(new Date(appt.scheduled_at || ''))} • {formatTimeLabel(appt.scheduled_at)}</div>
                    <div className="text-sm text-slate-700">{appt.customer_name || 'Cliente'}</div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[appt.status] ?? statusStyles.default}`}>
                    {statusLabel[appt.status] ?? appt.status}
                  </span>
                </div>
                {appt.description && <div className="mt-3 rounded-2xl bg-slate-950/5 p-4 text-sm text-slate-800">{appt.description}</div>}
              </div>
            ))}
            {historyItems.length === 0 && <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-slate-500">Nenhum histórico encontrado.</div>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setHistoryModalOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

    </DashboardShell>
  );
}
