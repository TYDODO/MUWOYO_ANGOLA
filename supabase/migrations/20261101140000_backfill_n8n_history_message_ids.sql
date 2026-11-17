update public.n8n_chat_histories as history
set message = jsonb_set(
  coalesce(history.message, '{}'::jsonb),
  '{data}',
  coalesce(history.message->'data', '{}'::jsonb) || jsonb_build_object(
    'message_id', history.message->'data'->>'external_id',
    'external_message_id', history.message->'data'->>'external_id',
    'message_key', jsonb_build_object(
      'id', history.message->'data'->>'external_id',
      'remoteJid', history.phone_number || '@s.whatsapp.net',
      'fromMe', history.message->>'type' in ('assistant', 'human')
    )
  ),
  true
)
where history.message->'data'->>'external_id' is not null
  and (
    history.message->'data'->>'message_id' is null
    or history.message->'data'->>'external_message_id' is null
    or history.message->'data'->'message_key' is null
  );
