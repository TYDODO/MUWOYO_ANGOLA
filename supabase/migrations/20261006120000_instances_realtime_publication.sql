do $$
begin
  alter publication supabase_realtime add table public.instances;
exception when duplicate_object then
  null;
end;
$$;