-- Boarding application decision and student-visible allocation details.
-- Run this migration in Supabase SQL Editor after deploying the updated app.

alter table public.boarding_applications drop constraint if exists boarding_applications_allocation_status_check;
alter table public.boarding_applications
  add constraint boarding_applications_allocation_status_check
  check (allocation_status in ('pending', 'allocated', 'waiting_list', 'rejected'));

-- Automatically suggest a grade's default block at application time but leave
-- the decision pending until an administrator assigns a room and approves it.
create or replace function public.allocate_boarding_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_block record;
  occupancy_count integer;
begin
  select b.* into target_block
  from public.dormitory_blocks b
  where lower(b.name) = lower(public.default_block_for_grade(coalesce(new.grade, '')))
  limit 1;

  if target_block.id is not null then
    select count(*) into occupancy_count
    from public.boarding_applications a
    where a.allocated_block_id = target_block.id;

    if target_block.space_limit = 0 or occupancy_count < target_block.space_limit then
      new.allocated_block_id := target_block.id;
      new.allocation_status := 'pending';
    else
      new.allocated_block_id := null;
      new.allocation_status := 'waiting_list';
    end if;
  else
    new.allocated_block_id := null;
    new.allocation_status := 'pending';
  end if;

  new.room_number := null;
  return new;
end;
$$;

drop trigger if exists boarding_auto_allocate on public.boarding_applications;
create trigger boarding_auto_allocate
before insert on public.boarding_applications
for each row execute function public.allocate_boarding_application();
