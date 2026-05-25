
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  phone text,
  role text default 'employee',
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  employee_name text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  local_timezone text,
  hq_timezone text default 'America/Los_Angeles',
  location_text text,
  status text default 'checked_in',
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assignee_id uuid references auth.users(id) on delete set null,
  assignee_name text,
  priority text default 'Medium',
  due_date date,
  status text default 'To Do',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  event_time time,
  all_day boolean default false,
  type text default 'Company',
  visibility text default 'Public',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists field_work_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  employee_name text,
  customer_name text,
  location_text text,
  purpose text,
  local_timezone text,
  check_in_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table attendance_records enable row level security;
alter table tasks enable row level security;
alter table calendar_events enable row level security;
alter table field_work_records enable row level security;

drop policy if exists "profiles_all_authenticated" on profiles;
drop policy if exists "attendance_all_authenticated" on attendance_records;
drop policy if exists "tasks_all_authenticated" on tasks;
drop policy if exists "calendar_all_authenticated" on calendar_events;
drop policy if exists "fieldwork_all_authenticated" on field_work_records;

create policy "profiles_all_authenticated" on profiles
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "attendance_all_authenticated" on attendance_records
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "tasks_all_authenticated" on tasks
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "calendar_all_authenticated" on calendar_events
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "fieldwork_all_authenticated" on field_work_records
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
