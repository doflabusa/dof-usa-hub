create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text default 'employee' check (role in ('admin','manager','employee')),
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

create policy "profiles_select_own_or_admin" on profiles
for select using (auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "profiles_insert_self" on profiles
for insert with check (auth.uid() = id);

create policy "profiles_update_own_or_admin" on profiles
for update using (auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "attendance_select_own_or_admin" on attendance_records
for select using (auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "attendance_insert_own" on attendance_records
for insert with check (auth.uid() = user_id);

create policy "attendance_update_own_or_admin" on attendance_records
for update using (auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "tasks_all_authenticated" on tasks
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "calendar_all_authenticated" on calendar_events
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "fieldwork_select_own_or_admin" on field_work_records
for select using (auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "fieldwork_insert_own" on field_work_records
for insert with check (auth.uid() = user_id);
