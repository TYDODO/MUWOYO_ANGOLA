alter table public.audio_voice_settings
  add column if not exists favorite_voice_ids text[] not null default '{}';

create or replace function public.set_audio_voice_favorite(
  p_user_id uuid,
  p_reference_id text,
  p_favorite boolean
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  favorites text[];
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_reference_id is null or length(trim(p_reference_id)) = 0 or p_favorite is null then
    raise exception 'invalid_voice_favorite';
  end if;

  insert into public.audio_voice_settings(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.audio_voice_settings
  set favorite_voice_ids = case
        when p_favorite and not (p_reference_id = any(favorite_voice_ids))
          then array_append(favorite_voice_ids, trim(p_reference_id))
        when not p_favorite
          then array_remove(favorite_voice_ids, trim(p_reference_id))
        else favorite_voice_ids
      end,
      updated_at = now()
  where user_id = p_user_id
  returning favorite_voice_ids into favorites;
  return favorites;
end;
$$;

revoke all on function public.set_audio_voice_favorite(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_audio_voice_favorite(uuid, text, boolean) to service_role;
