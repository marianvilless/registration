# Supabase setup

The site now uses Supabase Auth, a Postgres `registrations` table, and a private Storage bucket for fee receipts. It no longer stores registration records in browser local storage. Do not enter real student information until this setup is complete and verified.

## 1. Create/configure the Supabase project

1. Create a Supabase project and open **SQL Editor**.
2. Run the contents of [`supabase-setup.sql`](supabase-setup.sql).
3. In **Project Settings → API**, copy the Project URL and the public anon/publishable key into `supabase-config.js`.
4. Never use a `service_role` or secret key in this static website. The publishable/anon key is safe to expose only because Row Level Security and Storage policies are enabled.
5. Set the site's allowed URL/redirect settings in **Authentication → URL Configuration** for the deployed website origin.

## 2. Create student accounts

The student sign-in converts the ID to a fixed email alias: `lowercase-student-id@students.marianville.edu.pg`. For example, `MSS-2026-001` signs in as `mss-2026-001@students.marianville.edu.pg`.

A trusted administrator creates each student in **Authentication → Users** using that exact email alias and a unique password supplied securely to the student. Since these are login aliases rather than mailboxes, create/confirm accounts through the trusted Supabase dashboard or a secure server-side admin process; do not expose the Supabase admin API key in the browser. Enable email confirmation only if the alias addresses can receive confirmation email.

## 3. Create administrator accounts

Create a separate Auth user for each staff administrator, with an email they control. Set the user's **app metadata** to include `{ "role": "admin" }` using a trusted server-side process / Supabase Admin API. This must be app metadata (not user-editable user metadata), because the database policies use the signed JWT claim. Never grant the role from frontend code or expose the service-role key. After changing app metadata, have the admin sign out and back in so a fresh access token includes the role.

## 4. Deploy and test

Host the files on HTTPS (for example GitHub Pages), then test with non-sensitive sample accounts:

- A student can sign in, save/update only their own record, and upload a JPG/PNG/PDF receipt (max 5 MB).
- A student cannot read another student's registration or receipt.
- An administrator with `app_metadata.role=admin` can view all registration records and open receipt links. Receipt URLs are signed for five minutes and the bucket is private.
- An unprivileged user cannot access the admin list.

The `registrations` table keeps each form in `form_data` JSONB. Student ID, display name, private receipt path and timestamps are separate columns. The schema includes RLS policies for ownership and administrator read access. Review privacy, retention, access, and applicable student-data obligations with the school before production use.
