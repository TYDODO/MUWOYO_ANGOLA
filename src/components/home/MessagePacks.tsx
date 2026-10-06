import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { MessageSquare, Check } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

type TopUpPack = {
  id: string;
  name: string;
  messages: number;
  price_kz: number;
  position?: number;
};

const defaultPacks: TopUpPack[] = [
  { id: "start", name: "Muwoyo Start", messages: 500, price_kz: 12999, position: 1 },
  { id: "growth", name: "Muwoyo Growth", messages: 1000, price_kz: 19999, position: 2 },
  { id: "big", name: "Muwoyo Big", messages: 2500, price_kz: 34999, position: 3 },
  { id: "enterprise", name: "Enterprise", messages: 2147483647, price_kz: 0, position: 4 },
];

const packDetails: Record<string, { description: string; benefits: string[] }> = {
  "Muwoyo Start": {
    description: "500 créditos de IA por mês",
    benefits: ["500 créditos de IA", "1 agente de IA", "Base de conhecimento da IA", "Gestão de contactos", "Pedidos", "1 loja online", "Domínio padrão Muwoyo", "Afiliados", "1 utilizador", "Até 50 produtos", "Transferência de atendimento para humano"],
  },
  "Muwoyo Growth": {
    description: "1 000 créditos de IA por mês",
    benefits: ["1.000 créditos de IA", "2 agentes de IA", "Agente de Atendimento", "Agente de Follow Up", "Base de conhecimento da IA", "Gestão de contactos", "Pedidos", "Agenda", "Transferência para humano", "Loja online", "Domínio padrão Muwoyo", "Afiliados", "3 utilizadores", "Inbox", "Até 150 produtos"],
  },
  "Muwoyo Big": {
    description: "2 500 créditos de IA por mês",
    benefits: ["2.500 créditos de IA", "2 agentes de IA", "Agente de Atendimento", "Agente de Follow Up", "Até 500 produtos", "Loja online avançada", "Domínio personalizado", "10 utilizadores", "Gestão de contactos", "Pedidos", "Agenda", "Transferência para humano", "Afiliados", "Shared Inbox", "SEO da loja"],
  },
  Enterprise: {
    description: "Funcionalidades ilimitadas",
    benefits: ["Créditos de IA ilimitados", "Agentes de IA ilimitados", "Produtos ilimitados", "Utilizadores ilimitados", "Lojas ilimitadas", "Domínios personalizados", "SEO avançado", "Inbox ilimitado", "Shared Inbox", "Todas as funcionalidades", "Suporte dedicado"],
  },
};

export const MessagePacks = () => {
  const [packs, setPacks] = useState<TopUpPack[]>(defaultPacks);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const loadPacks = async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id,name,monthly_messages,price_kz,position")
        .eq("is_active", true)
        .order("position", { ascending: true });

      if (!error) {
        const loadedPacks = ((data as Array<TopUpPack & { monthly_messages?: number }>) || []).map((pack) => ({ ...pack, messages: pack.monthly_messages ?? pack.messages }));
        setPacks(loadedPacks.length > 0 ? loadedPacks : defaultPacks);
      }
    };

    void loadPacks();
  }, []);
  return (
    <section id="messages" className="py-24 lg:py-32 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-4">
            Planos mensais
          </p>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground">Escolha o plano para o seu negócio.</h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Teste durante 3 dias com 100 mensagens gratuitas e escolha um plano mensal quando estiver pronto.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {packs.slice(0, 4).map((p, index) => (
            <div
              key={p.id}
              className={`relative h-full rounded-2xl border bg-card p-6 flex flex-col ${
                index === 1
                  ? "border-primary shadow-elevated ring-1 ring-primary/20"
                  : "border-border shadow-soft"
              }`}
            >
              {index === 1 && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-foreground text-background px-3 py-1 text-[11px] font-semibold tracking-wide">
                  Mais escolhido
                </span>
              )}

              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-accent text-primary mb-4">
                <MessageSquare className="h-4 w-4" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {p.name}
              </h3>
              <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">
                {packDetails[p.name]?.description || "Mais capacidade para acompanhar o volume do seu negócio."}
              </p>
              <p className="text-sm text-muted-foreground mt-3">
                {p.name === "Enterprise" ? "Créditos ilimitados" : `${p.messages.toLocaleString("pt-AO")} créditos de IA por mês`}
              </p>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground tabular-nums">
                  {p.name === "Enterprise" ? "Sob consulta" : p.price_kz.toLocaleString("pt-AO")}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  {p.name === "Enterprise" ? "" : "Kz"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {p.name === "Enterprise" ? "Fale com a nossa equipa" : "por mês"}
              </p>

              <ul className="mt-5 min-h-[92px] space-y-2 text-xs text-foreground">
                {(packDetails[p.name]?.benefits || ["Mensagens com a IA Muwoyo", "Sem expiração mensal", "Recarga simples no painel", "Mais capacidade para a sua operação"]).map((benefit) => (
                  <li key={benefit} className="flex gap-2">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" strokeWidth={3} />
                    {benefit}
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className={`mt-auto w-full rounded-xl h-11 font-semibold ${
                  index === 1
                    ? "bg-foreground hover:bg-foreground/90 text-background"
                    : "bg-secondary hover:bg-secondary/80 text-foreground"
                }`}
              >
                {p.name === "Enterprise" ? <a href="https://wa.me/244962011401" target="_blank" rel="noreferrer">Falar com suporte</a> : <Link to="/login">Pagar este plano</Link>}
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10">
          Cada plano fica ativo durante 30 dias e inclui o limite mensal indicado.
        </p>
        <p className="text-center text-sm font-semibold text-foreground mt-3">
          Escolha outro plano quando o volume do seu negócio mudar.
        </p>
      </div>
    </section>
  );
};
