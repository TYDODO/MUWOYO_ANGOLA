alter table public.audio_voice_settings
  add column if not exists favorite_voice_models jsonb not null default '[]'::jsonb;

alter table public.audio_voice_settings
  drop constraint if exists audio_voice_settings_favorite_models_array;
alter table public.audio_voice_settings
  add constraint audio_voice_settings_favorite_models_array
  check (jsonb_typeof(favorite_voice_models) = 'array');

create or replace function public.set_audio_voice_favorite_cached(
  p_user_id uuid,
  p_reference_id text,
  p_favorite boolean,
  p_voice jsonb default null
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
  if p_user_id is null or p_reference_id is null
     or length(trim(p_reference_id)) = 0 or p_favorite is null then
    raise exception 'invalid_voice_favorite';
  end if;
  if p_favorite and (
    p_voice is null
    or jsonb_typeof(p_voice) <> 'object'
    or p_voice->>'reference_id' <> trim(p_reference_id)
  ) then
    raise exception 'invalid_favorite_voice_details';
  end if;

  insert into public.audio_voice_settings(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.audio_voice_settings
  set favorite_voice_ids = case
        when p_favorite and not (trim(p_reference_id) = any(favorite_voice_ids))
          then array_append(favorite_voice_ids, trim(p_reference_id))
        when not p_favorite
          then array_remove(favorite_voice_ids, trim(p_reference_id))
        else favorite_voice_ids
      end,
      favorite_voice_models = case
        when p_favorite then (
          select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
          from jsonb_array_elements(favorite_voice_models) with ordinality as item(value, ordinality)
          where item.value->>'reference_id' <> trim(p_reference_id)
        ) || jsonb_build_array(p_voice)
        else (
          select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
          from jsonb_array_elements(favorite_voice_models) with ordinality as item(value, ordinality)
          where item.value->>'reference_id' <> trim(p_reference_id)
        )
      end,
      updated_at = now()
  where user_id = p_user_id
  returning favorite_voice_ids into favorites;
  return favorites;
end;
$$;

revoke all on function public.set_audio_voice_favorite_cached(uuid, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.set_audio_voice_favorite_cached(uuid, text, boolean, jsonb) to service_role;
