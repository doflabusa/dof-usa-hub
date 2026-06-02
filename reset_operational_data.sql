-- DOF USA HUB operational data reset
-- This keeps user accounts and profiles.
-- Run this in Supabase SQL Editor when you are ready to remove test/demo operational data.

truncate table
  support_history,
  product_shipments,
  inventory_items,
  installed_products,
  leave_balances,
  leave_requests,
  calendar_events,
  tasks,
  attendance_records
restart identity cascade;

-- Users are preserved:
-- auth.users is NOT touched.
-- profiles is NOT touched.
