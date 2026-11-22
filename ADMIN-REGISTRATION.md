# Registration administration controls

This update adds administrator controls to close/reopen student registration and edit an individual student's saved form data.

## Required Supabase setup

1. Open the Supabase SQL Editor for the project configured in `supabase-config.js`.
2. Run the updated `supabase-setup.sql` in full. It is safe to rerun: the new settings table and policies are created idempotently.
3. Confirm each administrator account has trusted `app_metadata.role = 'admin'`.
4. Deploy the site files, including `admin-tools.js` and the updated `supabase-config.js`.

The `registration_settings` row is the source of truth. When an administrator closes registration, row-level security blocks student inserts, updates, and registration-save uploads via the registration upsert, regardless of UI state. The form is also disabled for students. Administrators retain permission to edit registration records while the student portal is closed.

## Admin usage

Sign in at the Staff Portal. On the dashboard, use **Close registration** or **Reopen registration**. Each student row has an **Edit** button that allows editing the display name and the saved registration JSON; the student login ID is intentionally not changed.

Test with non-sensitive accounts: verify a student cannot save while closed, can save after reopening, and that an admin can edit a record in either state. The browser UI requires the database SQL update; without it, the dashboard displays a setup error rather than silently relying on a client-only lock.
