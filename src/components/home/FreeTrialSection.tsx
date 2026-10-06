import { Clock3, Check } from "lucide-react";
import { Link } from "react-router-dom";

const benefits = [
  "Acesso ao painel Muwoyo",
  "Configuração inicial do seu negócio",
  "Teste do atendimento com Inteligência Artificial",
];

export default function FreeTrialSection() {
  return (
    <section id="teste-gratuito" className="bg-emerald-50 py-20 lg:py-28">
      <div className="container mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-emerald-700">Teste gratuito</p>
          <h2 className="text-4xl font-bold tracking-tight text-gray-900 lg:text-5xl">Experimente a Muwoyo durante 24 horas.</h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">Crie a sua conta, configure o seu negócio e veja como a Inteligência Artificial pode ajudar a atender os seus clientes no WhatsApp.</p>
          <ul className="mt-6 space-y-3 text-gray-700">
            {benefits.map((benefit) => <li key={benefit} className="flex items-center gap-3"><Check className="h-5 w-5 text-emerald-600" />{benefit}</li>)}
          </ul>
          <Link to="/criar-conta" className="mt-8 inline-flex rounded-xl bg-emerald-600 px-7 py-3 font-semibold text-white transition hover:bg-emerald-700">Começar teste gratuito</Link>
        </div>
        <div className="flex items-center gap-5 rounded-2xl border border-emerald-200 bg-white p-7 shadow-sm">
          <Clock3 className="h-12 w-12 shrink-0 text-emerald-600" />
          <div><p className="text-3xl font-bold text-gray-900">24 horas</p><p className="mt-1 text-gray-600">para conhecer a plataforma sem compromisso.</p></div>
        </div>
      </div>
    </section>
  );
}
