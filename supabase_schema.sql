
alter table calendar_events add column if not exists all_day boolean default false;
alter table calendar_events add column if not exists end_date date;
alter table tasks add column if not exists assignee_id uuid references auth.users(id) on delete set null;
alter table profiles add column if not exists phone text;

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  employee_name text,
  leave_type text not null default 'PTO',
  start_date date not null,
  end_date date not null,
  reason text,
  status text default 'Pending',
  created_at timestamptz default now()
);

alter table leave_requests enable row level security;

drop policy if exists "profiles_select_own_or_admin" on profiles;
drop policy if exists "profiles_insert_self" on profiles;
drop policy if exists "profiles_update_own_or_admin" on profiles;
drop policy if exists "profiles_all_authenticated" on profiles;

drop policy if exists "attendance_select_own_or_admin" on attendance_records;
drop policy if exists "attendance_insert_own" on attendance_records;
drop policy if exists "attendance_update_own_or_admin" on attendance_records;
drop policy if exists "attendance_all_authenticated" on attendance_records;

drop policy if exists "tasks_all_authenticated" on tasks;
drop policy if exists "calendar_all_authenticated" on calendar_events;
drop policy if exists "fieldwork_select_own_or_admin" on field_work_records;
drop policy if exists "fieldwork_insert_own" on field_work_records;
drop policy if exists "fieldwork_all_authenticated" on field_work_records;
drop policy if exists "leave_all_authenticated" on leave_requests;

create policy "profiles_all_authenticated" on profiles for all using (true) with check (true);
create policy "attendance_all_authenticated" on attendance_records for all using (true) with check (true);
create policy "tasks_all_authenticated" on tasks for all using (true) with check (true);
create policy "calendar_all_authenticated" on calendar_events for all using (true) with check (true);
create policy "fieldwork_all_authenticated" on field_work_records for all using (true) with check (true);
create policy "leave_all_authenticated" on leave_requests for all using (true) with check (true);


alter table calendar_events add column if not exists created_by_name text;

create table if not exists leave_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  employee_name text,
  paid_time_off_hours numeric default 0,
  paid_sick_leave_hours numeric default 0,
  updated_at timestamptz default now()
);

alter table leave_balances enable row level security;

drop policy if exists "leave_balances_all_authenticated" on leave_balances;

create policy "leave_balances_all_authenticated"
on leave_balances for all
using (true)
with check (true);
