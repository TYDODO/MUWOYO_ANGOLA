import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type DaySchedule = {
  open: boolean;
  start_time: string;
  end_time: string;
};

type BusinessHours = Record<DayKey, DaySchedule>;

const weekDays: { key: DayKey; label: string }[] = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

const defaultBusinessHours: BusinessHours = weekDays.reduce(
  (acc, day) => ({
    ...acc,
    [day.key]: { open: false, start_time: "", end_time: "" },
  }),
  {} as BusinessHours,
);

const normalizeBusinessHours = (value: unknown): BusinessHours => {
  if (!value || typeof value !== "object") return defaultBusinessHours;
  const payload = value as Record<string, unknown>;

  return weekDays.reduce((acc, day) => {
    const dayValue = payload[day.key] as Record<string, unknown> | undefined;
    const open = dayValue?.open === true;
    const start_time = typeof dayValue?.start_time === "string" ? dayValue.start_time : "";
    const end_time = typeof dayValue?.end_time === "string" ? dayValue.end_time : "";

    return {
      ...acc,
      [day.key]: { open, start_time, end_time },
    };
  }, {} as BusinessHours);
};

const isValidHour = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

type Props = {
  onSave?: (businessHours: BusinessHours) => Promise<{ error?: any } | void>;
};

export default function BusinessHoursConfig({ onSave }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [businessHours, setBusinessHours] = useState<BusinessHours>(defaultBusinessHours);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commonStart, setCommonStart] = useState("");
  const [commonEnd, setCommonEnd] = useState("");
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    supabase
      .from("profiles")
      .select("business_hours")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }: any) => {
        setLoading(false);
        if (error) {
          return toast({ title: "Erro", description: error.message, variant: "destructive" });
        }
        if (data?.business_hours) {
          const normalized = normalizeBusinessHours(data.business_hours);
          setBusinessHours(normalized);
          syncCommonTimes(normalized);
        }
      });
  }, [user, toast]);

  const updateDay = (day: DayKey, values: Partial<DaySchedule>) => {
    setBusinessHours((current) => {
      const next = {
        ...current,
        [day]: { ...current[day], ...values },
      };
      return next;
    });
  };

  const syncCommonTimes = (nextHours: BusinessHours) => {
    const firstOpen = Object.values(nextHours).find((d) => d.open);
    if (firstOpen) {
      setCommonStart(firstOpen.start_time || "");
      setCommonEnd(firstOpen.end_time || "");
    }
  };

  const toggleDay = (day: DayKey) => {
    setBusinessHours((cur) => ({ ...cur, [day]: { ...cur[day], open: !cur[day].open } }));
  };

  const applyCommonTimes = () => {
    setBusinessHours((cur) => {
      const out = { ...cur };
      (Object.keys(out) as DayKey[]).forEach((k) => {
        if (out[k].open) {
          out[k] = { ...out[k], start_time: commonStart, end_time: commonEnd };
        }
      });
      return out;
    });
  };

  const saveBusinessHours = async () => {
    if (!user) return;

    const invalidDay = weekDays.find((day) => {
      const schedule = businessHours[day.key];
      return (
        schedule.open &&
        (!isValidHour(schedule.start_time) || !isValidHour(schedule.end_time))
      );
    });

    if (invalidDay) {
      return toast({
        title: "Formato inválido",
        description: `Use o formato 24h HH:MM para ${invalidDay.label}.`,
        variant: "destructive",
      });
    }

    setSaving(true);
    let result: any = {};
    if (onSave) {
      result = await onSave(businessHours);
    } else {
      const { error } = await supabase
        .from("profiles")
        .upsert({ user_id: user.id, business_hours: businessHours }, { onConflict: "user_id" });
      result = { error };
    }
    setSaving(false);

    if (result?.error) {
      return toast({ title: "Erro", description: result.error.message || "Erro ao guardar.", variant: "destructive" });
    }

    toast({ title: "Guardado", description: "Horários de funcionamento atualizados." });
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>Horários de funcionamento</CardTitle>
      </CardHeader>
      <CardContent>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Ajuste o horário padrão e personalize apenas quando necessário.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
              </div>
            </div>

            <div className="grid gap-2 grid-cols-4 sm:grid-cols-7">
              {weekDays.map((d) => {
                const short = d.label.split('-')[0] || d.label;
                const open = businessHours[d.key].open;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDay(d.key)}
                    className={`rounded-full px-2 py-1 text-xs sm:text-sm font-medium transition ${open ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {short.replace('feira','').slice(0,3)}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Hora de início padrão (24h)</Label>
                <Input value={commonStart} placeholder="08:00" onChange={(e) => setCommonStart(e.target.value)} />
                <p className="text-xs text-muted-foreground">Hora aplicada a todos os dias selecionados.</p>
              </div>
              <div className="space-y-2">
                <Label>Hora de término padrão (24h)</Label>
                <Input value={commonEnd} placeholder="18:00" onChange={(e) => setCommonEnd(e.target.value)} />
                <p className="text-xs text-muted-foreground">Hora aplicada a todos os dias selecionados.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-4">
              <Button variant="outline" onClick={applyCommonTimes}>
                Aplicar horário
              </Button>
              <Button onClick={() => setCustomOpen(true)}>
                Personalizar horários
              </Button>
            </div>

            <Dialog open={customOpen} onOpenChange={setCustomOpen}>
              <DialogContent className="sm:max-w-3xl w-full max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Personalizar horários por dia</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  {weekDays.map((day) => {
                    const schedule = businessHours[day.key];
                    return (
                      <div key={day.key} className="rounded-md border p-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-base">{day.label}</Label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Aberto</span>
                            <Switch checked={schedule.open} onCheckedChange={(v) => updateDay(day.key, { open: !!v })} />
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Hora" value={schedule.start_time?.split(":")[0] || ""} disabled={!schedule.open} onChange={(e) => {
                              const currentMinutes = schedule.start_time?.split(":")[1] || "00";
                              updateDay(day.key, { start_time: `${e.target.value.padStart(2, "0")}:${currentMinutes}` });
                            }} />
                            <Input placeholder="Minuto" value={schedule.start_time?.split(":")[1] || ""} disabled={!schedule.open} onChange={(e) => {
                              const currentHour = schedule.start_time?.split(":")[0] || "08";
                              updateDay(day.key, { start_time: `${currentHour}:${e.target.value.padStart(2, "0")}` });
                            }} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Hora" value={schedule.end_time?.split(":")[0] || ""} disabled={!schedule.open} onChange={(e) => {
                              const currentMinutes = schedule.end_time?.split(":")[1] || "00";
                              updateDay(day.key, { end_time: `${e.target.value.padStart(2, "0")}:${currentMinutes}` });
                            }} />
                            <Input placeholder="Minuto" value={schedule.end_time?.split(":")[1] || ""} disabled={!schedule.open} onChange={(e) => {
                              const currentHour = schedule.end_time?.split(":")[0] || "18";
                              updateDay(day.key, { end_time: `${currentHour}:${e.target.value.padStart(2, "0")}` });
                            }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => setCustomOpen(false)}>Fechar</Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="flex justify-end">
              <Button type="button" onClick={saveBusinessHours} disabled={saving || loading} className="w-fit">
                {saving ? "A guardar..." : "Guardar alterações"}
              </Button>
            </div>
          </div>
      </CardContent>
    </Card>
  );
}
