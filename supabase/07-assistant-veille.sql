-- Préparation locale : ne pas appliquer sans vérifier le plan Workers Free et relire ces droits.
-- Après 05 et 06. Le serveur planifié nécessite une clé Supabase serveur, jamais une clé VITE_*.
create table if not exists public.assistant_veille (
  user_id uuid not null default auth.uid(),
  business_id uuid not null,
  active boolean not null default false,
  prochain_scan timestamptz not null default now(),
  dernier_scan timestamptz,
  derniere_analyse timestamptz,
  texte text check (char_length(texte) <= 12000),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 4),
  empreinte text check (char_length(empreinte) = 64),
  derniere_erreur text check (char_length(derniere_erreur) <= 500),
  jour_quota date,
  analyses_jour integer not null default 0 check (analyses_jour between 0 and 4),
  primary key (user_id, business_id),
  foreign key (business_id, user_id) references public.business(id, user_id) on delete cascade
);
alter table public.assistant_veille enable row level security;
drop policy if exists "Chacun sa veille" on public.assistant_veille;
create policy "Chacun sa veille" on public.assistant_veille for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.assistant_veille from public, anon, authenticated;
grant select on public.assistant_veille to authenticated;
grant insert (user_id, business_id, active), update (active) on public.assistant_veille to authenticated;
grant all on public.assistant_veille to service_role;
create index if not exists assistant_veille_due on public.assistant_veille(prochain_scan) where active;

-- Budget durable partagé par toutes les instances et tous les business, jours UTC comme Cloudflare.
create table if not exists public.assistant_budget (
  jour date primary key,
  analyses integer not null default 0 check (analyses between 0 and 40)
);
alter table public.assistant_budget enable row level security;
revoke all on public.assistant_budget from public, anon, authenticated;
grant all on public.assistant_budget to service_role;

create or replace function public.reserver_analyse_assistant(p_jour date, p_user_id uuid, p_business_id uuid)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare total integer; local_total integer; local_jour date;
begin
  if p_jour <> (now() at time zone 'UTC')::date then return false; end if;
  if not exists (select 1 from public.business where id = p_business_id and user_id = p_user_id) then return false; end if;
  insert into public.assistant_budget(jour) values(p_jour) on conflict do nothing;
  select analyses into total from public.assistant_budget where jour = p_jour for update;
  if total >= 40 then return false; end if;
  insert into public.assistant_veille(user_id,business_id) values(p_user_id,p_business_id) on conflict do nothing;
  select analyses_jour, jour_quota into local_total, local_jour from public.assistant_veille
    where user_id=p_user_id and business_id=p_business_id for update;
  if local_jour is distinct from p_jour then local_total := 0; end if;
  if local_total >= 4 then return false; end if;
  update public.assistant_budget set analyses=analyses+1 where jour=p_jour;
  update public.assistant_veille set jour_quota=p_jour, analyses_jour=local_total+1
    where user_id=p_user_id and business_id=p_business_id;
  return true;
end $$;
revoke all on function public.reserver_analyse_assistant(date,uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserver_analyse_assistant(date,uuid,uuid) to service_role;
