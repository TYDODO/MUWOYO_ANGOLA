import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const monthNames = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const pad = (value: number) => String(value).padStart(2, "0");

type Props = { value: string; onChange: (value: string) => void; label?: string; required?: boolean };

export default function DateTimeSelect({ value, onChange, label = "Data e hora", required = false }: Props) {
  const [draft, setDraft] = useState({ year: "", month: "", day: "", hour: "", minute: "" });
  const parts = useMemo(() => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return match
      ? { year: match[1], month: match[2], day: match[3], hour: match[4], minute: match[5] }
      : draft;
  }, [draft, value]);

  useEffect(() => {
    if (!value) setDraft({ year: "", month: "", day: "", hour: "", minute: "" });
  }, [value]);

  const update = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    setDraft(next);
    if (Object.values(next).some((item) => !item)) {
      return;
    }
    const maxDay = new Date(Number(next.year), Number(next.month), 0).getDate();
    const day = Math.min(Number(next.day), maxDay);
    const normalized = { ...next, day: pad(day) };
    setDraft(normalized);
    onChange(`${normalized.year}-${normalized.month}-${normalized.day}T${normalized.hour}:${normalized.minute}`);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, index) => currentYear + index);
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const minutes = [0, 15, 30, 45];

  return <div className="grid gap-2">
    <Label>{label}</Label>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <Select value={parts.year} onValueChange={(year) => update({ year })}><SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger><SelectContent>{years.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent></Select>
      <Select value={parts.month} onValueChange={(month) => update({ month })}><SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger><SelectContent>{monthNames.map((month, index) => <SelectItem key={month} value={pad(index + 1)}>{month}</SelectItem>)}</SelectContent></Select>
      <Select value={parts.day} onValueChange={(day) => update({ day })}><SelectTrigger><SelectValue placeholder="Dia" /></SelectTrigger><SelectContent>{days.map((day) => <SelectItem key={day} value={pad(day)}>{pad(day)}</SelectItem>)}</SelectContent></Select>
      <Select value={parts.hour} onValueChange={(hour) => update({ hour })}><SelectTrigger><SelectValue placeholder="Hora" /></SelectTrigger><SelectContent>{hours.map((hour) => <SelectItem key={hour} value={pad(hour)}>{pad(hour)}h</SelectItem>)}</SelectContent></Select>
      <Select value={parts.minute} onValueChange={(minute) => update({ minute })}><SelectTrigger><SelectValue placeholder="Min" /></SelectTrigger><SelectContent>{minutes.map((minute) => <SelectItem key={minute} value={pad(minute)}>{pad(minute)}min</SelectItem>)}</SelectContent></Select>
    </div>
    {required && !value && <p className="text-xs text-muted-foreground">Escolha ano, mês, dia e horário.</p>}
  </div>;
}
