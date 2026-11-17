import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trackMetaEvent } from "@/lib/meta-pixel";

const faqs = [
  {
<<<<<<< HEAD
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
=======
    question: "A Muwoyo cobra mensalidade?",
    answer: "Sim. Depois dos 3 dias de teste, escolha um plano mensal conforme o volume do seu negócio.",
  },
  {
    question: "Como funcionam as 100 mensagens gratuitas?",
    answer: "O teste começa quando você confirma o email. A partir desse momento, tem 3 dias e até 100 mensagens para testar a Muwoyo.",
  },
  {
    question: "O que recebo depois de ativar a conta?",
    answer: "Depois da confirmação do pagamento, o plano escolhido fica ativo por 30 dias e renova mediante novo pagamento.",
  },
  {
    question: "As mensagens têm validade?",
    answer: "O teste termina após 3 dias ou quando as 100 mensagens forem utilizadas. Cada plano pago tem o seu limite mensal.",
  },
  {
    question: "O que acontece quando as minhas mensagens terminarem?",
    answer: "Pode escolher outro plano ou enviar um novo comprovativo quando o ciclo mensal terminar.",
  },
  {
    question: "Como a IA conhece o meu negócio?",
    answer: "Você fornece informações como produtos, preços, serviços, horários, regras e outras informações relevantes. A Muwoyo utiliza esses dados para ajudar a IA a responder aos clientes com contexto.",
  },
  {
    question: "Preciso de várias ferramentas externas?",
    answer: "Não. A Muwoyo já reúne várias funções essenciais. Quando uma ferramenta externa for necessária, a plataforma pode trabalhar através das integrações disponíveis.",
  },
  {
    question: "Como funciona a loja online?",
    answer: "A Muwoyo permite criar uma loja online personalizada para apresentar produtos, com link próprio, QR Code e ligação ao WhatsApp.",
  },
  {
    question: "O suporte é em português?",
    answer: "Sim. A equipa da Muwoyo presta suporte em português.",
  },
/*
  {
    question: "A IA consegue entender diferentes sotaques e dialetos?",
    answer:
      "Sim! Nossa IA é treinada para compreender diversos sotaques e dialetos do português, incluindo variações de Angola, Portugal e Moçambique. Ela aprende com cada interação para melhorar ainda mais o atendimento.",
  },
  {
    question: "Posso integrar a Muwoyo com meus sistemas atuais?",
    answer:
      "Sim! A Muwoyo oferece integrações com Google Sheets, Google Analytics, Google Calendar e muitas outras ferramentas através de API. Também é possível fazer integrações personalizadas conforme suas necessidades.",
  },
  {
    question: "Como é feito o treinamento da IA para meu negócio?",
    answer:
      "O treinamento é simples! Você fornece informações sobre seus produtos, serviços, preços e tom de voz desejado. Nossa IA analisa esse conteúdo e cria respostas personalizadas. Quanto mais informações você fornecer, melhor será o atendimento.",
  },
  {
    question: "O que acontece se eu atingir o limite de mensagens?",
    answer:
      "Você receberá notificações quando estiver próximo do limite. Após atingir o limite, a IA continuará respondendo, mas você será notificado para fazer upgrade. Nenhuma conversa será perdida e seus clientes sempre serão atendidos.",
  },
  {
    question: "Como funciona a loja online incluída?",
    answer:
      "A loja online é um bônus exclusivo para assinantes Muwoyo. Ela vem personalizada com sua marca (logo e cores), permite cadastro ilimitado de produtos, aceita pagamentos via transferência bancária e é totalmente integrada ao WhatsApp para automação de vendas.",
  },
  {
    question: "Posso cancelar a qualquer momento?",
    answer:
      "Sim! Você pode cancelar sua assinatura a qualquer momento diretamente no painel de controle. O cancelamento entra em vigor no final do período de faturamento atual, então você não perde nenhum dia pago. Não há multas ou taxas de cancelamento.",
  },
  {
    question: "O suporte é em português?",
    answer:
      "Sim! Todo nosso suporte é em português nativo, com atendimento via WhatsApp, email e chat. Nossa equipe está disponível para ajudar com configuração, dúvidas técnicas e estratégias para maximizar seus resultados com a Muwoyo.",
  },
*/
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
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
<<<<<<< HEAD
            Esclareça as suas <span className="gradient-text">dúvidas</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Respostas sobre a plataforma, os planos e as ferramentas da Muwoyo.
=======
            Tire suas <span className="gradient-text">dúvidas</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Tudo o que você precisa saber sobre a Muwoyo e como ela pode
            transformar seu negócio.
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
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
<<<<<<< HEAD
            Ainda tem dúvidas? Fale com a nossa equipa de suporte.
=======
            Ainda tem dúvidas? Entre em contato com nosso suporte
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
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
