-- Private prior-school certificates for Grade 9/11 registration applicants.
-- Run once in Supabase SQL Editor; safe to rerun.

create table if not exists public.registration_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  grade_level smallint not null check (grade_level in (9, 11)),
  certificate_path text,
  selection_path text,
  updated_at timestamptz not null default now()
);

alter table public.registration_documents enable row level security;
grant select, insert, update on public.registration_documents to authenticated;

drop policy if exists "Students and admins read registration documents" on public.registration_documents;
create policy "Students and admins read registration documents"
on public.registration_documents for select to authenticated
using (user_id = (select auth.uid()) or public.is_school_admin());

drop policy if exists "Students manage own registration documents" on public.registration_documents;
create policy "Students manage own registration documents"
on public.registration_documents for all to authenticated
using (user_id = (select auth.uid()) and not public.is_school_admin())
with check (user_id = (select auth.uid()) and not public.is_school_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-certificates', 'student-certificates', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=5242880,
  allowed_mime_types=array['application/pdf','image/jpeg','image/png'];

drop policy if exists "Students and admins read student certificates" on storage.objects;
create policy "Students and admins read student certificates"
on storage.objects for select to authenticated
using (bucket_id = 'student-certificates' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_school_admin()));

drop policy if exists "Students upload own certificates" on storage.objects;
create policy "Students upload own certificates"
on storage.objects for insert to authenticated
with check (bucket_id = 'student-certificates' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.is_school_admin());

drop policy if exists "Students update own certificates" on storage.objects;
create policy "Students update own certificates"
on storage.objects for update to authenticated
using (bucket_id = 'student-certificates' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.is_school_admin())
with check (bucket_id = 'student-certificates' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.is_school_admin());

drop policy if exists "Students delete own certificates" on storage.objects;
create policy "Students delete own certificates"
on storage.objects for delete to authenticated
using (bucket_id = 'student-certificates' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.is_school_admin());
