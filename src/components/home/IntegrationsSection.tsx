import { CheckCircle2 } from "lucide-react";
import integrationsWoman from "@/assets/integrations-woman.jpg";
import googleSheets from "@/assets/landing/google-sheets.svg";
import googleAnalytics from "@/assets/landing/google-analytics.svg";
import googleCalendar from "@/assets/landing/google-calendar.svg";

const integrations = [
  {
    name: "Google Sheets",
    icon: googleSheets,
    description:
      "Sincronize pedidos, clientes e inventário em tempo real com as suas folhas de cálculo.",
  },
  {
    name: "Google Analytics",
    icon: googleAnalytics,
    description:
      "Acompanhe conversões, funil de venda e comportamento dos clientes automaticamente.",
  },
  {
    name: "Google Calendar",
    icon: googleCalendar,
    description: "Agende reuniões, demos e follow-ups que saem do WhatsApp.",
  },
];

const aiFeatures = [
  "Cadastro automático de leads e clientes",
  "Agendamento inteligente de reuniões e demos",
  "Relatórios exportados automaticamente",
  "IA que analisa dados e sugere ações",
];

export default function IntegrationsSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header + Image - side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
              Ferramentas{" "}
              <span className="text-green-500">Pré-Configuradas</span> Para
              Melhorar a sua experiencia com a
              <span className="text-green-500"> Muwoyo</span>
            </h2>
            <p className="text-muted-foreground mt-4 text-base md:text-lg leading-relaxed">
              Google Sheets, Google Analytics e Google Calendar já estão
              preparados para trabalhar com o painel Muwoyo. A IA organiza
              clientes, pedidos e agendamentos, enquanto você acompanha os
              dados importantes num único lugar.
            </p>
          </div>
          <div className="flex justify-center">
            <img
              src={integrationsWoman}
              alt="Mulher a trabalhar com integrações"
              className="rounded-2xl w-full max-w-md object-cover shadow-lg aspect-[4/3]"
              loading="lazy"
            />
          </div>
        </div>

        {/* Integration cards with real logos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {integrations.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-8 hover:shadow-md transition-shadow"
            >
              <img
                src={item.icon}
                alt={item.name}
                className="h-12 w-12 mb-5 object-contain"
                loading="lazy"
              />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {item.name}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* AI Features box */}
        <div className="rounded-xl bg-accent/50 border border-primary/10 p-8">
          <h3 className="text-lg font-bold text-foreground text-center mb-6">
            O que a IA faz com as suas integrações
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiFeatures.map((feat, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-sm text-foreground">{feat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
