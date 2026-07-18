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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

const getDateKey = (value: string | Date) => new Date(value).toISOString().slice(0, 10);

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString("pt-AO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

const formatTimeLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("pt-AO", {
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

export default function Schedule() {
  const { user } = useAuth();
  
  const [rows, setRows] = useState<Appt[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

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
  const [viewMode, setViewMode] = useState<"day" | "all" | "history">("day");

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

  

  const selectedAppointments = useMemo(() => {
    if (viewMode === "history") return historyItems;
    if (viewMode === "all") return upcomingConfirmed;
    // default 'day'
    return selectedDate ? (confirmedGroupedByDate.get(getDateKey(selectedDate)) || []) : [];
  }, [viewMode, historyItems, upcomingConfirmed, selectedDate, confirmedGroupedByDate]);

  const displayedAppointments = selectedAppointments;

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
  };

  const handleAppointmentClick = (appt: Appt) => {
    if (appt.scheduled_at) {
      setSelectedDate(new Date(appt.scheduled_at));
    }
    setDialogOpen(true);
  };

  return (
    <DashboardShell
      title="Minha Agenda"
      description="Visualização de calendário com agendamentos e detalhes por dia."
    >
      <div className="space-y-6">
        <Card className="rounded-3xl border-border bg-card/90 shadow-sm min-h-[620px]">
          <CardHeader>
            <CardTitle>Minha Agenda</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[minmax(420px,1.1fr)_minmax(380px,0.9fr)]">
            <section className="space-y-6">
              <div className="rounded-3xl border border-border bg-slate-50 p-5">
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

                <div className="mt-4 grid grid-cols-7 gap-2 text-center text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
                    <div key={day} className="py-2">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-7 gap-2">
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
                        className={`group min-h-[78px] rounded-3xl p-3 text-left transition ${baseStyles} ${!isCurrentMonth ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{format(date, 'd')}</span>
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
            </section>

            <section className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-100 p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-600">
                      <History className="h-4 w-4 text-slate-500" />
                      {viewMode === 'history' ? 'Histórico de agendas' : viewMode === 'all' ? 'Todos agendamentos' : 'Agendamentos confirmados'}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">{selectedDate ? formatDateLabel(selectedDate) : 'Selecione uma data'}</h3>
                  </div>
                  <div className="flex flex-col items-start gap-3 sm:items-end">
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-900 shadow-sm">
                      {displayedAppointments.length} agendamento{displayedAppointments.length === 1 ? '' : 's'}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant={viewMode === 'all' ? 'secondary' : 'outline'} size="sm" onClick={() => setViewMode((v) => (v === 'all' ? 'day' : 'all'))}>
                        Ver todos
                      </Button>
                      <Button variant={viewMode === 'history' ? 'secondary' : 'outline'} size="sm" onClick={() => setViewMode((v) => (v === 'history' ? 'day' : 'history'))}>
                        <History className="mr-2 h-4 w-4" />
                        Histórico
                      </Button>
                      {/* botão de limpeza removido — histórico automático mostra últimos 30 */}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-700">
                  {viewMode === 'all'
                    ? 'Aqui estão todos os agendamentos confirmados futuros.'
                    : viewMode === 'history'
                    ? 'Últimos 30 históricos (concluídos, cancelados e passados).'
                    : 'Clique em um dia no calendário para ver apenas os agendamentos desse dia.'}
                </p>
              </div>

              {displayedAppointments.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Nenhum agendamento encontrado.
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedAppointments.map((appt) => (
                    <button
                      key={appt.id}
                      type="button"
                      className="w-full rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                      onClick={() => handleAppointmentClick(appt)}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-base font-semibold text-slate-950">{appt.service || 'Agendamento'}</div>
                          <div className="mt-1 text-sm text-slate-700">{appt.customer_name || 'Cliente'}</div>
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
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-800">
                        <span>{formatTimeLabel(appt.scheduled_at)}</span>
                        <span>{appt.customer_phone || 'Sem telefone'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Agendamentos para {selectedDate ? formatDateLabel(selectedDate) : "data selecionada"}</DialogTitle>
            <DialogDescription>
              {selectedAppointments.length} agendamento{selectedAppointments.length === 1 ? "" : "s"} neste dia.
            </DialogDescription>
          </DialogHeader>

          {selectedAppointments.length === 0 ? (
            <div className="rounded-3xl border border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum agendamento encontrado para esta data.
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-4">
              {selectedAppointments.map((appt) => (
                <AccordionItem key={appt.id} value={appt.id} className="rounded-3xl border border-border bg-background">
                  <AccordionTrigger className="px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {appt.service || "Agendamento"}
                        </div>
                        <div className="text-sm text-muted-foreground">
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
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        {appt.customer_name || "-"}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        +{appt.customer_phone || "-"}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {formatTimeLabel(appt.scheduled_at)}
                      </div>
                      {appt.description && (
                        <div className="rounded-2xl bg-slate-950/5 p-4 text-sm text-slate-700">
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

    </DashboardShell>
  );
}
