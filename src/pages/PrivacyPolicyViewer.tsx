import { ScrollArea } from "@/components/ui/scroll-area";
<<<<<<< HEAD
import { PrivacyContent } from "@/components/legal/PrivacyContent";
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
import { openMetaPixelPreferences } from "@/lib/meta-pixel";

export function PrivacyPolicyViewer() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
<<<<<<< HEAD
      <main className="mx-auto max-w-4xl px-4">
        <header className="mb-8">
          <h1 className="text-center text-3xl font-bold">
            Política de Privacidade
          </h1>
          <p className="mt-2 text-center text-gray-600">
            Última actualização: 17 de Novembro de 2026
          </p>
        </header>
        <ScrollArea className="h-[600px] w-full p-0">
          <PrivacyContent />
        </ScrollArea>
        <button
          type="button"
          className="mt-4 rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-100"
          onClick={openMetaPixelPreferences}
        >
          Gerir preferências de cookies
        </button>
=======
      <main className="max-w-4xl mx-auto px-4">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-center">
              Política de Privacidade
            </h1>
            <p className="text-center text-gray-600 mt-2">
              Última atualização: 10 Novembro de 2026
            </p>
          </header>
            <ScrollArea className="h-[600px] w-full p-0">
              <div className="space-y-6 text-sm leading-relaxed">
                <section>
                  <h2 className="text-lg font-semibold mb-3">1. Introdução</h2>
                  <p>
                    A Muwoyo Lda.("nós", "nosso", "Muwooyo") está comprometida
                    em proteger a privacidade e os dados pessoais dos seus
                    utilizadores. Esta Política de Privacidade descreve como
                    coletamos, usamos, armazenamos e protegemos as suas
                    informações quando você utiliza a nossa plataforma de
                    automação de atendimento via WhatsApp.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    2. Informações que Coletamos
                  </h2>
                  <p className="mb-3">
                    Coletamos as seguintes categorias de informações:
                  </p>
                  <h3 className="font-medium mb-2">
                    2.1 Informações fornecidas pelo utilizador:
                  </h3>
                  <ul className="list-disc ml-6 mb-3 space-y-1">
                    <li>
                      Dados de registro (nome, email, número de telefone, nome
                      da empresa)
                    </li>
                    <li>
                      Informações de pagamento (processadas por terceiros)
                    </li>
                    <li>
                      Registos de créditos de teste, bónus de activação e
                      recargas, incluindo datas e referências de pagamento.
                    </li>
                    <li>
                      Conteúdo configurado (informações sobre o negócio,
                      produtos, regras de atendimento)
                    </li>
                    <li>Mensagens de clientes e respostas da IA</li>
                  </ul>
                  <h3 className="font-medium mb-2">
                    2.2 Informações automáticas:
                  </h3>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Dados de uso da plataforma</li>
                    <li>Informações do dispositivo e navegador</li>
                    <li>Logs de acesso e interações</li>
                    <li>Métricas de desempenho do sistema</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    3. Como Usamos as Suas Informações
                  </h2>
                  <p className="mb-3">Utilizamos as suas informações para:</p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Fornecer e manter os serviços da plataforma</li>
                    <li>Treinar e melhorar o sistema de IA</li>
                    <li>Processar o setup, activação e recargas solicitadas</li>
                    <li>Controlar o saldo de teste, bónus e mensagens utilizadas</li>
                    <li>Registar confirmações de pagamento e activações administrativas</li>
                    <li>Enviar comunicações importantes sobre o serviço</li>
                    <li>Garantir a segurança e integridade da plataforma</li>
                    <li>Cumprir obrigações legais e regulatórias</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    4. Partilha de Informações
                  </h2>
                  <p className="mb-3">
                    Não vendemos, alugamos nem partilhamos as suas informações
                    pessoais com terceiros, exceto nas seguintes circunstâncias:
                  </p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Com o seu consentimento expresso</li>
                    <li>Para cumprir obrigações legais</li>
                    <li>
                      Com prestadores de serviços confiáveis que nos ajudam a
                      operar a plataforma
                    </li>
                    <li>Para proteger os nossos direitos e segurança</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    5. Segurança dos Dados
                  </h2>
                  <p>
                    Implementamos medidas de segurança técnicas e
                    organizacionais apropriadas para proteger as suas
                    informações contra acesso não autorizado, alteração,
                    divulgação ou destruição. Isso inclui encriptação de dados,
                    backups regulares e controles de acesso.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    6. Retenção de Dados
                  </h2>
                  <p>
                    Mantemos as suas informações apenas pelo tempo necessário
                    para fornecer os nossos serviços e cumprir obrigações
                    legais. Quando deixar de usar a plataforma, podemos reter
                    certas informações conforme exigido por lei ou para fins
                    legítimos de negócios.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">7. Contas sem actividade</h2>
                  <p>
                    Podemos eliminar contas criadas há 30 dias que não tenham registado qualquer actividade. Quando a conta já tiver mensagens, configuração, conexão do WhatsApp, pagamento, recarga ou outra actividade, esta regra de eliminação por inactividade deixa de se aplicar. A eliminação respeita os prazos de retenção exigidos por lei.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    8. Seus Direitos
                  </h2>
                  <p className="mb-3">
                    De acordo com a legislação angolana e internacional
                    aplicável, você tem o direito de:
                  </p>
                  <ul className="list-disc ml-6 space-y-1">
                    <li>Aceder às suas informações pessoais</li>
                    <li>Corrigir dados incorretos ou incompletos</li>
                    <li>Solicitar a eliminação dos seus dados</li>
                    <li>Restringir o processamento dos seus dados</li>
                    <li>Portabilidade dos seus dados</li>
                    <li>Retirar consentimento a qualquer momento</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    8. Cookies e Tecnologias Semelhantes
                  </h2>
                  <p>
                    Com o seu consentimento, utilizamos o Pixel da Meta
                    (Meta Platforms, Inc.) para medir visitas à página pública
                    e rotas visitadas, contactos, registos e ativações do teste
                    gratuito.
                    O Pixel pode tratar identificadores de cookies e informações
                    técnicas do navegador e da visita para medição de campanhas.
                    Os eventos não incluem palavras-passe, tokens de autenticação,
                    mensagens, conteúdo de conversas, dados bancários ou dados de
                    contacto do utilizador. O Pixel só é carregado após a escolha
                    afirmativa do utilizador; a recusa não afeta o funcionamento
                    da plataforma. Pode alterar ou retirar a escolha em
                    “Preferências de cookies”.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    9. Links para Sites de Terceiros
                  </h2>
                  <p>
                    A nossa plataforma pode conter links para sites de
                    terceiros. Não somos responsáveis pelas práticas de
                    privacidade ou conteúdo desses sites. Recomendamos que leia
                    as políticas de privacidade de todos os sites que visitar.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    10. Alterações a esta Política
                  </h2>
                  <p>
                    Podemos atualizar esta Política de Privacidade
                    periodicamente. Notificaremos você sobre quaisquer
                    alterações significativas através da plataforma ou por
                    email. O uso continuado dos nossos serviços após alterações
                    constituirá aceitação da política revisada.
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-3">11. Contacto</h2>
                  <p>
                    Para questões sobre esta Política de Privacidade ou para
                    exercer os seus direitos, entre em contacto connosco:
                  </p>
                  <p className="mt-2">
                    <strong>Email:</strong> suporte@muwoyo.com
                    <br />
                    <strong>WhatsApp:</strong> +244 928 663 898
                    <br />
                    <strong>Endereço:</strong> Cabinda, Angola
                  </p>
                </section>
              </div>
            </ScrollArea>
            <button
              type="button"
              className="mt-4 rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-100"
              onClick={openMetaPixelPreferences}
            >
              Gerir preferências de cookies
            </button>
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
      </main>
    </div>
  );
}
