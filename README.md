# Muwoyo

Aplicação Muwoyo para automação de atendimento e vendas via WhatsApp.

## Clonagem de voz e minutos de áudio

A área do cliente está disponível em `/voz` e a gestão Super Admin em `/admin/audio`.
O saldo do plano é renovado por período; os segundos de Top-up são persistentes e
só podem ser consumidos enquanto a conta tiver uma assinatura de áudio elegível.
Top-ups custam 50 Kz/minuto, têm mínimo de 20 minutos e só são creditados após
aprovação do comprovativo no painel administrativo.
Contas em período de teste recebem uma única quota de 20 minutos de áudio; o
consumo é debitado apenas quando um áudio é enviado. Ao esgotar a quota, a
clonagem e o envio de áudio ficam bloqueados até ativar um plano elegível. A
quota gratuita não é renovada nem restaurada por alterações de estado.

Cada voz clonada pode gerar até três pré-visualizações ao longo da sua vida útil.
O texto tem limite de 500 caracteres e os MP3 ficam em storage privado; o
histórico é reproduzido por URLs assinadas. A geração usa `POST /v1/tts` da Fish
Audio com o modelo `s2.1-pro-free`. A aba de voz também permite selecionar uma
voz pública da biblioteca e ajustar velocidade, volume, expressividade,
estabilidade, tamanho dos blocos e normalização; os ajustes ficam guardados por
empresa e são enviados no payload do webhook em `metadata.voice_settings`.
A biblioteca separa vozes recomendadas Muwoyo das vozes públicas exploráveis.
O catálogo público usa páginas de 20 resultados com filtros de idioma, pesquisa
com debounce e ordenação por popularidade ou gostos. A prévia utiliza a amostra
pública quando disponível; a curadoria é gerida em `/admin/audio`. Favoritos
ficam guardados por empresa.
`remaining_audio_seconds` usa `-1` para representar saldo ilimitado Enterprise;
nesse caso, `audio_unlimited` também vem como `true`.

Configure `FISH_AUDIO_API_KEY` como secret do Supabase antes de usar clonagem,
geração ou exclusão de vozes. `EVOLUTION_API_KEY` e `EVOLUTION_API_URL` também
devem estar configuradas para envio pela Evolution. A função `send-voice` exige
`N8N_CALLBACK_SECRET` (o mesmo secret usado pelo callback existente).
Não coloque essas chaves em variáveis `VITE_*` nem no código do navegador.

O webhook inclui `metadata.audio_delivery`. O fluxo n8n deve, depois de gerar a
resposta da IA, chamar o URL `send_url` com o texto e a voz ativa, usando
`metadata.callback_secret` como `secret`, `metadata.queue_id` como `queue_id` e
os restantes identificadores enviados no payload. Se a função responder
`ok: true`, ela já envia/regista o áudio e contabiliza a mensagem de IA; não
envie também a resposta em texto nem chame o callback normal para essa resposta.
Se responder `text_fallback: true`, envie a resposta normal em texto e use o
callback normal. A função debita segundos do plano primeiro e do Top-up depois,
e devolve o saldo sem parar o fluxo de texto quando não há minutos disponíveis.

Campanhas agendadas são disparadas pelo cron do Supabase a cada minuto e
processadas em lotes curtos para poderem retomar sem duplicar destinatários.
A migration `20261115010000_campaign_scheduler_and_welcome_order.sql` instala
o agendamento e o bloqueio de concorrência. A sequência de boas-vindas pode ser
reordenada e fica guardada por configuração.

No Inbox, mensagens selecionadas podem ser reencaminhadas para outro contacto da
mesma instância WhatsApp. A sincronização de contactos também cria e associa as
etiquetas devolvidas pela integração WhatsApp Business ao CRM.
