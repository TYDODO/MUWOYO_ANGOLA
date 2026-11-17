import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trackMetaEvent } from "@/lib/meta-pixel";

const faqs = [
  {
    question: "O que posso fazer com a Muwoyo?",
    answer: "A Muwoyo reúne atendimento automatizado com IA no WhatsApp, CRM, Inbox para a equipa, campanhas, produtos, loja online, pedidos, entregas, agendamentos e relatórios. A disponibilidade de algumas funcionalidades depende do plano activo.",
  },
  {
    question: "Como funciona o período de teste?",
    answer: "A conta pode testar a plataforma durante 3 dias e utilizar até 100 créditos de IA. Consulte o painel para acompanhar o prazo e o saldo disponíveis; depois do teste, escolha um plano para continuar a utilizar as funcionalidades pagas.",
  },
  {
    question: "Como a IA aprende sobre o meu negócio?",
    answer: "Adicione informações sobre produtos, preços, serviços, horários, regras e formas de atendimento. A IA usa esse contexto para responder aos clientes. Reveja as respostas e mantenha os dados do negócio actualizados.",
  },
  {
    question: "Como ligo o WhatsApp e acompanho as conversas?",
    answer: "Ligue o número da empresa através das opções disponíveis no painel. As conversas sincronizadas aparecem no Inbox, onde a equipa pode consultar o histórico, atribuir atendimentos, usar etiquetas e encaminhar mensagens conforme as permissões da conta e as capacidades do canal.",
  },
  {
    question: "Posso combinar a IA com atendimento humano?",
    answer: "Sim. A equipa pode acompanhar conversas pelo Inbox e assumir ou receber atendimentos conforme as opções disponíveis na conta. Também pode organizar contactos e actividade no CRM.",
  },
  {
    question: "Como funcionam as mensagens de boas-vindas?",
    answer: "Pode configurar uma mensagem inicial com texto e conteúdos multimédia. Quando está activa, é enviada no primeiro contacto; a mensagem inicial do cliente não é encaminhada à IA, e o atendimento automatizado prossegue depois da sequência de boas-vindas.",
  },
  {
    question: "A IA pode responder com áudio no WhatsApp?",
    answer: "Nos planos elegíveis, pode activar uma voz clonada ou escolher uma voz disponível na biblioteca, ajustar parâmetros e configurar respostas em áudio. O envio depende do plano, da voz activa e do saldo de áudio. O plano Start não inclui estas funcionalidades.",
  },
  {
    question: "Como são contabilizados os créditos de IA e os minutos de áudio?",
    answer: "São saldos separados. Os créditos de IA são usados conforme o plano e a utilização indicada no painel; os áudios consomem segundos do saldo de áudio, primeiro do plano e depois de recargas disponíveis. Consulte o painel para ver limites, consumo e saldo actual.",
  },
  {
    question: "O que posso personalizar na loja online?",
    answer: "Pode configurar a identidade visual, produtos, categorias, preços, promoções e opções de pesquisa e filtro. Os produtos podem incluir várias imagens e vídeos, além de variantes como cores e tamanhos. A loja tem um link próprio e pode encaminhar clientes para o WhatsApp.",
  },
  {
    question: "Posso organizar campanhas, clientes e agendamentos?",
    answer: "Sim. A Muwoyo inclui ferramentas de CRM, etiquetas, campanhas e follow-up, além de gestão de agendamentos. O acesso e os limites podem variar conforme o plano activo.",
  },
  {
    question: "Como funcionam os planos e pagamentos?",
    answer: "Os planos e preços actualmente disponíveis são apresentados na secção Planos e no painel. A activação ocorre após a confirmação do pagamento; os limites e a duração aplicáveis são os apresentados para o plano escolhido.",
  },
  {
    question: "O que acontece quando atinjo o limite do meu plano?",
    answer: "O painel mostra os saldos e limites da conta. Quando um limite é atingido, a funcionalidade que depende desse saldo pode ficar indisponível até à renovação ou à activação de um plano ou recarga elegível. As conversas e os dados existentes permanecem sujeitos às condições da conta.",
  },
  {
    question: "A Muwoyo exige ferramentas externas para funcionar?",
    answer: "As ferramentas essenciais de gestão, como CRM, produtos, pedidos e loja online, estão disponíveis na plataforma. Algumas funções dependem de serviços externos ligados à conta, como o WhatsApp, fornecedores de IA ou integrações configuradas pelo utilizador.",
  },
  {
    question: "Como são tratados os meus dados e as preferências de cookies?",
    answer: "Os dados são tratados para disponibilizar e proteger a plataforma, conforme a Política de Privacidade. O Pixel da Meta para medição de marketing só é activado após consentimento; pode gerir ou retirar essa escolha na página de privacidade.",
  },
  {
    question: "Como posso contactar o suporte?",
    answer: "Use o botão “Falar com suporte” na página ou contacte a equipa pelo WhatsApp. O suporte atende em português.",
  },
];

const FAQSection = () => {
  return (
    <section className="py-20 sm:py-28 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/3 to-background" />
      </div>

      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-3">
            Perguntas Frequentes
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6">
            Esclareça as suas <span className="gradient-text">dúvidas</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Respostas sobre a plataforma, os planos e as ferramentas da Muwoyo.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="w-full space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border border-border/50 rounded-lg px-6 bg-card/50"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pt-2">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <div className="text-center mt-12">
          <p className="text-muted-foreground mb-4">
            Ainda tem dúvidas? Fale com a nossa equipa de suporte.
          </p>
          <a
            href="https://wa.me/244962011401"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackMetaEvent("Contact")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            Falar com Suporte
          </a>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
