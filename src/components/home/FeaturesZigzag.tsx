import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BarChart3, CalendarDays, ClipboardList, FileText, UsersRound } from "lucide-react";

// Importar imagens
import onlineStore from "@/assets/online-store.jpg";
import aiTrainedBusiness from "@/assets/landing/ai-trained-business.png";
import sales247Original from "@/assets/landing/sales-24h.png";
import dashboardOriginal from "@/assets/landing/dashboard.png";

const FeaturesZigzag = () => {
  const navigate = useNavigate();

  const handleCreateStore = () => {
    navigate("/login");
  };

  const features = [
    {
      title: "Loja Online Profissional",
      highlight: "Uma loja pronta para ajudar a sua empresa a vender online.",
      description:
        '<p>Ao ativar a sua conta Muwoyo, recebe acesso a uma loja online personalizada para o seu negócio.</p><p>A loja pode incluir a sua identidade visual, produtos cadastrados, um link exclusivo e acesso direto pelo navegador. Você partilha o link e os seus clientes conhecem os produtos e iniciam o processo de compra.</p><p><strong>Pagamentos diretamente para si</strong><br/>Os pagamentos são feitos através dos métodos e coordenadas definidos pela sua empresa, com mais controlo e sem complicar o processo para os seus clientes.</p>',
      image: onlineStore,
      alt: "Loja online profissional",
    },
    {
      title: "IA treinada no seu negócio",
      highlight: "Vende como alguém que conhece a sua empresa.",
      description:
        "A Inteligência Artificial aprende informações sobre o seu negócio, incluindo produtos, preços, serviços, regras e forma de atendimento.<br/><br/>Assim, responde com mais contexto, apresenta soluções aos clientes e conduz as conversas de forma natural.<br/><br/><strong>A sua empresa mantém a sua identidade. A Muwoyo ajuda a automatizar o trabalho repetitivo.</strong>",
      image: aiTrainedBusiness,
      alt: "IA treinada no seu negócio",
    },
    {
      title: "Vendas 24 horas por dia",
      highlight: "O seu negócio nunca dorme.",
      description:
        "Venda 24 horas por dia, sem depender de dados móveis ou da bateria do seu telefone. A Inteligência Artificial da Muwoyo mantém o seu WhatsApp online e atende os clientes 24/7, mesmo enquanto você dorme ou está sem internet. Se alguém enviar uma mensagem às 3h da manhã, receberá uma resposta e poderá concluir a compra. O seu negócio continua a vender enquanto você descansa.",
      image: sales247Original,
      alt: "Vendas 24 horas por dia",
    },
    {
      title: "Painel Muwoyo",
      highlight: "Todos os dados importantes num único lugar.",
      description:
        "Acompanhe a atividade do seu negócio através de um painel simples e centralizado. Tenha uma visão clara sobre clientes, conversas, pedidos e resultados sem precisar alternar entre várias ferramentas.",
      panelItems: [
        [UsersRound, "Registo de clientes e leads"],
        [ClipboardList, "Organização de pedidos"],
        [CalendarDays, "Agendamento de reuniões, atendimentos e reservas"],
        [FileText, "Acompanhamento de informações importantes"],
        [BarChart3, "Geração de relatórios com dados do negócio"],
      ],
      image: dashboardOriginal,
      alt: "Painel Muwoyo",
    },
  ];

  return (
    <section id="funcionalidades" className="py-20">
      <div className="container mx-auto px-6 space-y-24">
        {[features[1], features[2], features[3], features[0]].map((feature, i) => {
          const isReversed = i < 3 ? i % 2 === 0 : i % 2 !== 0;

          if (feature.title === "Loja Online Profissional") {
            return (
              <div
                key={i}
                className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center"
              >
                <div className="lg:col-span-3 space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-3xl lg:text-4xl font-bold text-gray-900">
                      {feature.title}
                    </h3>
                    <p className="text-xl text-emerald-600 font-semibold">
                      {feature.highlight}
                    </p>
                  </div>
                  <div
                    className="text-gray-600 leading-relaxed space-y-4"
                    dangerouslySetInnerHTML={{ __html: feature.description }}
                  />
                  <button
                    onClick={handleCreateStore}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    Criar Minha Loja Gratuita Agora
                  </button>
                </div>
                <div className="lg:col-span-2">
                  <div className="relative">
                    <img
                      src={feature.image}
                      alt={feature.alt}
                      className="block w-full max-w-full h-auto rounded-2xl shadow-2xl object-contain"
                    />
                  </div>
                </div>
              </div>
            );
          }

          return (
            <motion.div
              key={i}
              className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${isReversed ? "lg:flex-row-reverse" : ""}`}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <>
                <div className={`space-y-6 ${isReversed ? "lg:order-2" : ""}`}>
                  <div className="space-y-4">
                    <h3 className="text-3xl lg:text-4xl font-bold text-gray-900">
                      {feature.title}
                    </h3>
                    <p className="text-xl text-emerald-600 font-semibold">
                      {feature.highlight}
                    </p>
                  </div>
                  <div className="text-gray-600 leading-relaxed">
                    <div dangerouslySetInnerHTML={{ __html: feature.description }} />
                    {feature.panelItems && (
                      <>
                        <p className="mt-6 font-semibold text-gray-800">A Muwoyo ajuda a automatizar tarefas como:</p>
                        <ul className="mt-4 space-y-3">
                          {feature.panelItems.map(([Icon, label]) => (
                            <li key={label} className="flex items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                <Icon className="h-4 w-4" />
                              </span>
                              <span>{label}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-6 font-semibold text-gray-800">Menos trabalho manual. Mais organização. Mais tempo para focar no crescimento.</p>
                      </>
                    )}
                  </div>
                </div>
                <div
                  className={`${isReversed ? "lg:order-1" : ""} flex justify-center`}
                >
                  <img
                    src={feature.image}
                    alt={feature.alt}
                      className="block w-full max-w-2xl h-auto rounded-2xl shadow-2xl object-contain"
                  />
                </div>
              </>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};

export default FeaturesZigzag;
