-- Marianville registration schema for Supabase. Run in Supabase SQL Editor.
-- All registration data is private. Policies authorize each student to their own row;
-- administrators are identified by trusted Supabase Auth app_metadata.role = 'admin'.

create table if not exists public.registrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique,
  student_name text not null default '',
  form_data jsonb not null default '{}'::jsonb,
  receipt_path text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.registrations enable row level security;

create or replace function public.is_school_admin()
returns boolean
language sql stable
as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false) $$;

-- A singleton setting controls whether students may create or update their submissions.
create table if not exists public.registration_settings (
  singleton boolean primary key default true check (singleton),
  is_open boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.registration_settings (singleton, is_open)
values (true, true)
on conflict (singleton) do nothing;
alter table public.registration_settings enable row level security;
grant select, update on public.registration_settings to authenticated;

drop policy if exists "Authenticated can read registration status" on public.registration_settings;
create policy "Authenticated can read registration status"
on public.registration_settings for select to authenticated
using (true);

drop policy if exists "Admins can update registration status" on public.registration_settings;
create policy "Admins can update registration status"
on public.registration_settings for update to authenticated
using (public.is_school_admin())
with check (public.is_school_admin());

create or replace function public.registration_is_open()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select s.is_open from public.registration_settings s where s.singleton = true), true)
$$;
revoke all on function public.registration_is_open() from public;
grant execute on function public.registration_is_open() to authenticated;

drop policy if exists "Student and admin can read registrations" on public.registrations;
create policy "Student and admin can read registrations"
on public.registrations for select to authenticated
using (user_id = (select auth.uid()) or public.is_school_admin());

drop policy if exists "Student can create own registration" on public.registrations;
create policy "Student can create own registration"
on public.registrations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and lower(student_id) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
  and not public.is_school_admin()
  and (select public.registration_is_open())
);

drop policy if exists "Student can update own registration" on public.registrations;
create policy "Student can update own registration"
on public.registrations for update to authenticated
using (user_id = (select auth.uid()) and not public.is_school_admin() and (select public.registration_is_open()))
with check (
  user_id = (select auth.uid())
  and lower(student_id) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
  and not public.is_school_admin()
  and (select public.registration_is_open())
);

-- Admins can correct any registration directly from the admin dashboard, even while closed.
drop policy if exists "Admins can edit registrations" on public.registrations;
create policy "Admins can edit registrations"
on public.registrations for update to authenticated
using (public.is_school_admin())
with check (public.is_school_admin());

grant select, insert, update on public.registrations to authenticated;

-- Private receipt bucket. File size and MIME restrictions are enforced by Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fee-receipts', 'fee-receipts', false, 5242880, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','application/pdf'];

drop policy if exists "Student/admin read fee receipts" on storage.objects;
create policy "Student/admin read fee receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'fee-receipts'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_school_admin()
  )
);

drop policy if exists "Student upload own fee receipts" on storage.objects;
create policy "Student upload own fee receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fee-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.is_school_admin()
);

drop policy if exists "Student replace own fee receipts" on storage.objects;
create policy "Student replace own fee receipts"
on storage.objects for update to authenticated
using (
  bucket_id = 'fee-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.is_school_admin()
)
with check (
  bucket_id = 'fee-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.is_school_admin()
);

drop policy if exists "Student delete own fee receipts" on storage.objects;
create policy "Student delete own fee receipts"
on storage.objects for delete to authenticated
using (
  bucket_id = 'fee-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not public.is_school_admin()
);
