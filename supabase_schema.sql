
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
  end_date date,
  event_time time,
  all_day boolean default true,
  type text default 'Exhibition',
  visibility text default 'Public',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now()
);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  employee_name text,
  leave_type text not null default 'Paid Time Off',
  start_date date not null,
  end_date date not null,
  days numeric default 1,
  reason text,
  status text default 'Pending',
  created_at timestamptz default now()
);

create table if not exists leave_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  employee_name text,
  paid_time_off_days numeric default 0,
  paid_sick_leave_days numeric default 0,
  updated_at timestamptz default now()
);

alter table calendar_events add column if not exists end_date date;
alter table calendar_events add column if not exists all_day boolean default true;
alter table calendar_events add column if not exists created_by_name text;
alter table tasks add column if not exists assignee_id uuid references auth.users(id) on delete set null;
alter table profiles add column if not exists phone text;
alter table leave_requests add column if not exists days numeric default 1;
alter table leave_balances add column if not exists paid_time_off_days numeric default 0;
alter table leave_balances add column if not exists paid_sick_leave_days numeric default 0;

alter table profiles enable row level security;
alter table attendance_records enable row level security;
alter table tasks enable row level security;
alter table calendar_events enable row level security;
alter table leave_requests enable row level security;
alter table leave_balances enable row level security;

drop policy if exists "profiles_all_authenticated" on profiles;
drop policy if exists "attendance_all_authenticated" on attendance_records;
drop policy if exists "tasks_all_authenticated" on tasks;
drop policy if exists "calendar_all_authenticated" on calendar_events;
drop policy if exists "leave_all_authenticated" on leave_requests;
drop policy if exists "leave_balances_all_authenticated" on leave_balances;

create policy "profiles_all_authenticated" on profiles for all using (true) with check (true);
create policy "attendance_all_authenticated" on attendance_records for all using (true) with check (true);
create policy "tasks_all_authenticated" on tasks for all using (true) with check (true);
create policy "calendar_all_authenticated" on calendar_events for all using (true) with check (true);
create policy "leave_all_authenticated" on leave_requests for all using (true) with check (true);
create policy "leave_balances_all_authenticated" on leave_balances for all using (true) with check (true);


create table if not exists installed_products (
  id uuid primary key default gen_random_uuid(),
  product_category text,
  product_model text,
  serial_number text unique,
  customer_name text,
  customer_type text,
  dealer_name text,
  address text,
  city text,
  state text,
  zip_code text,
  ship_date date,
  install_date date,
  warranty_start date,
  warranty_end date,
  status text default 'Installed',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now()
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  product_category text,
  product_model text,
  serial_number text unique,
  location text default 'Anaheim Warehouse',
  condition text default 'New',
  status text default 'Available',
  received_date date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists product_shipments (
  id uuid primary key default gen_random_uuid(),
  po_number text,
  invoice_number text,
  customer_name text,
  product_model text,
  serial_number text,
  shipment_status text default 'PO Received',
  payment_status text default 'Pending',
  carrier text,
  tracking_number text,
  bol_number text,
  ltl_scheduled_date date,
  ship_date date,
  delivery_date date,
  state text,
  city text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now()
);

alter table installed_products enable row level security;
alter table inventory_items enable row level security;
alter table product_shipments enable row level security;

drop policy if exists "installed_products_all_authenticated" on installed_products;
drop policy if exists "inventory_items_all_authenticated" on inventory_items;
drop policy if exists "product_shipments_all_authenticated" on product_shipments;

create policy "installed_products_all_authenticated" on installed_products for all using (true) with check (true);
create policy "inventory_items_all_authenticated" on inventory_items for all using (true) with check (true);
create policy "product_shipments_all_authenticated" on product_shipments for all using (true) with check (true);


alter table attendance_records add column if not exists start_ip_address text;
alter table attendance_records add column if not exists end_ip_address text;
alter table attendance_records add column if not exists start_latitude numeric;
alter table attendance_records add column if not exists start_longitude numeric;
alter table attendance_records add column if not exists end_latitude numeric;
alter table attendance_records add column if not exists end_longitude numeric;
alter table attendance_records add column if not exists start_location_accuracy numeric;
alter table attendance_records add column if not exists end_location_accuracy numeric;
alter table attendance_records add column if not exists start_user_agent text;
alter table attendance_records add column if not exists end_user_agent text;
