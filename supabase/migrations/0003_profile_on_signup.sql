-- New, not ported -- school_app has no equivalent trigger (profiles
-- are created manually there too). Standard Supabase pattern: a row in
-- auth.users always gets a matching profiles row, using whatever name
-- was passed as signup metadata (falls back to the email's local part).

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
