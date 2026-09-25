-- Admin account-management pages (app/dashboard/admin/staff,students,parents)
-- need to list every profile by role -- profiles_self (0001_init.sql) only
-- lets a user read their own row. Add an admin-only read-all policy;
-- writes still go exclusively through accountAdmin.ts's admin client.

create policy profiles_admin_read_all on profiles for select to public
  using (is_admin());
