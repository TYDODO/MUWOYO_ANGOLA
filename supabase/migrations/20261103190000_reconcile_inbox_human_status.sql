update public.inbox_conversations
set status = 'open'
where status = 'human'
  and response_mode = 'ai';
