import { ScrollArea } from "@/components/ui/scroll-area";

export function TermsOfUseViewer() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <main className="max-w-4xl mx-auto px-4">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-center">
              Termos de Uso
            </h1>
            <p className="text-center text-gray-600 mt-2">
              Última actualização: 22 Agosto de 2026
            </p>
          </header>
            <ScrollArea className="h-[600px] w-full p-0">
              <div className="space-y-6 text-sm leading-relaxed">
                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    1. Aceitação dos termos
                  </h2>
                  <p>
                    Ao criar uma conta e utilizar a plataforma Muwoyo, o
                    utilizador declara ter lido, compreendido e aceite na
                    totalidade os presentes Termos de Uso. Caso não concorde com
                    alguma das condições aqui estabelecidas, deverá abster-se de
                    utilizar a plataforma.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    2. Descrição do serviço
                  </h2>
                  <p className="mb-3">
                    A Muwoyo é uma plataforma de automação de atendimento e
                    vendas via WhatsApp que disponibiliza as seguintes
                    funcionalidades:
                  </p>
                  <ul className="list-disc ml-6 mb-3 space-y-1">
                    <li>
                      Agente de inteligência artificial treinado com as
                      informações do negócio do utilizador, capaz de responder
                      automaticamente a clientes 24 horas por dia.
                    </li>
                    <li>
                      Loja online personalizada com link e QR Code únicos,
                      integrada com o WhatsApp do utilizador.
                    </li>
                    <li>
                      Painel de gestão com métricas de desempenho, registo de
                      pedidos, agendamentos e relatórios automáticos.
                    </li>
                    <li>
                      Integrações pré-configuradas com Google Sheets, Google
                      Analytics e Google Calendar.
                    </li>
                    <li>
                      Pacotes de mensagens adquiridos pelo utilizador conforme o
                      volume do seu negócio.
                    </li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    3. Registo e conta
                  </h2>
                  <p>
                    Para utilizar a Muwoyo, o utilizador deve criar uma conta
                    com informações verdadeiras, completas e actualizadas. O
                    utilizador é responsável pela confidencialidade das suas
                    credenciais de acesso e por todas as actividades realizadas
                    na sua conta. A Muwoyo reserva-se o direito de suspender ou
                    encerrar contas que forneçam informações falsas ou que
                    violem estes termos.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    4. Período de teste e activação
                  </h2>
                  <p>
                    Após o registo, a conta recebe 50 mensagens gratuitas para
                    testar o agente de IA. O utilizador pode configurar o seu
                    negócio, produtos, loja e WhatsApp conforme as permissões
                    da plataforma. Quando as mensagens de teste terminarem, o
                    painel continua acessível, mas o agente precisa de
                    activação para continuar a responder.
                  </p>
                  <p className="mt-3">
                    A activação exige o pagamento único do setup de 22.500 Kz.
                    Depois da confirmação do pagamento, a conta aguarda a
                    activação manual por um administrador ou subadministrador
                    autorizado. Após a activação são adicionadas 200 mensagens
                    de bónus, uma única vez por conta.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    5. Taxa de activação e pacotes de mensagens
                  </h2>
                  <p className="mb-3">
                    A activação da conta Muwoyo está sujeita ao pagamento de uma
                    taxa única de 22.500 Kz, que inclui todas as funcionalidades
                    descritas na plataforma. Não existem mensalidades nem custos
                    recorrentes obrigatórios associados à activação.
                  </p>
                  <p className="mb-3">
                    Após a activação, o utilizador pode adquirir pacotes de
                    mensagens conforme necessário, nos seguintes volumes
                    disponíveis: 500, 1.000 e 2.500 mensagens. O plano Big não é
                    oferecido publicamente; planos personalizados são tratados
                    com o suporte. Os
                    pacotes adquiridos não têm data de expiração mensal e podem
                    ser utilizados ao ritmo do negócio do utilizador.
                  </p>
                  <p>
                    Os pagamentos são processados através dos meios
                    disponibilizados na plataforma e não são reembolsáveis após
                    a activação do serviço ou do pacote adquirido.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">6. Contas sem actividade</h2>
                  <p>
                    Contas criadas que não tenham qualquer actividade na plataforma durante 30 dias podem ser eliminadas, incluindo os dados associados. Considera-se actividade a configuração do negócio, conexão do WhatsApp, utilização de mensagens, pagamentos, recargas ou outras acções registadas na conta. Contas que tenham iniciado actividade não são eliminadas por esta regra.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    7. Uso aceitável
                  </h2>
                  <p className="mb-3">
                    O utilizador compromete-se a utilizar a plataforma Muwoyo
                    exclusivamente para fins legítimos e em conformidade com a
                    legislação angolana e internacional aplicável. É
                    expressamente proibido utilizar a plataforma para:
                  </p>
                  <ul className="list-disc ml-6 mb-3 space-y-1">
                    <li>
                      Enviar mensagens não solicitadas em massa, spam ou
                      conteúdo enganoso.
                    </li>
                    <li>
                      Difundir conteúdo ilegal, ofensivo, discriminatório ou que
                      violem direitos de terceiros.
                    </li>
                    <li>
                      Tentar aceder a sistemas, dados ou contas de outros
                      utilizadores sem autorização.
                    </li>
                    <li>
                      Utilizar a plataforma para fins que violem os Termos de
                      Serviço do WhatsApp ou da Meta.
                    </li>
                    <li>
                      Revender, sublicenciar ou transferir o acesso à plataforma
                      a terceiros sem autorização expressa da Muwoyo.
                    </li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    7. Responsabilidades do utilizador
                  </h2>
                  <p>
                    O utilizador é o único responsável pelo conteúdo introduzido
                    na plataforma, incluindo informações sobre produtos, preços,
                    descrições e regras de atendimento configuradas no agente de
                    inteligência artificial. A Muwoyo não se responsabiliza por
                    informações incorrectas fornecidas pelo utilizador nem pelas
                    consequências das interações entre o agente de IA e os
                    clientes do utilizador.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    8. Disponibilidade do serviço
                  </h2>
                  <p>
                    A Muwoyo empenha-se em garantir a máxima disponibilidade da
                    plataforma. No entanto, não garante disponibilidade
                    ininterrupta e não se responsabiliza por interrupções
                    causadas por manutenção programada, falhas técnicas fora do
                    seu controlo ou indisponibilidade de serviços de terceiros
                    como o WhatsApp ou os serviços Google.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    9. Propriedade intelectual
                  </h2>
                  <p>
                    Todos os elementos da plataforma Muwoyo, incluindo o nome,
                    logótipo, design, código e funcionalidades, são propriedade
                    exclusiva da Muwoyo Lda. e estão protegidos por legislação
                    de propriedade intelectual. O utilizador não adquire
                    qualquer direito de propriedade sobre a plataforma pelo
                    facto de a utilizar.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    10. Suspensão e encerramento
                  </h2>
                  <p>
                    A Muwoyo reserva-se o direito de suspender ou encerrar o
                    acesso de qualquer utilizador que viole estes Termos de Uso,
                    sem aviso prévio e sem direito a reembolso. O utilizador
                    pode encerrar a sua conta a qualquer momento através do
                    painel ou contactando o suporte. O encerramento da conta não
                    implica o reembolso de valores já pagos.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    11. Limitação de responsabilidade
                  </h2>
                  <p>
                    A Muwoyo não se responsabiliza por perdas de receita, perda
                    de dados, danos indirectos ou qualquer prejuízo resultante
                    do uso ou da impossibilidade de uso da plataforma. A
                    responsabilidade máxima da Muwoyo perante o utilizador em
                    qualquer circunstância não excede o valor pago pelo
                    utilizador nos últimos 30 dias.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    12. Alterações aos termos
                  </h2>
                  <p>
                    A Muwoyo pode actualizar estes Termos de Uso a qualquer
                    momento. As alterações serão comunicadas por email ou por
                    notificação na plataforma com um mínimo de 7 dias de
                    antecedência. O uso continuado da plataforma após a entrada
                    em vigor das alterações implica a aceitação das novas
                    condições.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    13. Lei aplicável e foro
                  </h2>
                  <p>
                    Estes Termos de Uso são regidos pela legislação da República
                    de Angola. Qualquer litígio decorrente da utilização da
                    plataforma será submetido aos tribunais competentes de
                    Cabinda, Angola.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">14. Contacto</h2>
                  <p>
                    Para qualquer questão relacionada com estes Termos de Uso,
                    pode contactar-nos através de suporte@muwoyo.com ou pelo
                    WhatsApp +244 928663898
                  </p>
                </section>
              </div>
            </ScrollArea>
      </main>
    </div>
  );
}
