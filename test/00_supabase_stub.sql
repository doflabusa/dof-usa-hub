-- Minimal stand-in for the parts of Supabase's environment our SQL depends on:
-- auth schema/users/uid(), roles, and the existing profiles table.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login;
  end if;
end
$$;

grant authenticated to app_user;
grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant all on schema public to postgres;

-- Existing DOF HUB table this module's FKs depend on (trimmed to the
-- columns the pricing module actually references).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text default 'employee',
  status text default 'active',
  created_at timestamptz default now()
);

alter table profiles enable row level security;
drop policy if exists "profiles_all_authenticated" on profiles;
create policy "profiles_all_authenticated" on profiles for all using (true) with check (true);

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema auth to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
