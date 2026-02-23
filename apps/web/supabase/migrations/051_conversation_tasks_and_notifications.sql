-- Migration 051: Conversation task support
-- Adds "task" conversation type for AM/admin-assigned tasks to seekers.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'conversation_type'
      and e.enumlabel = 'task'
  ) then
    alter type public.conversation_type add value 'task';
  end if;
end
$$;

comment on column public.conversations.conversation_type is
  'general = info/chat, application_question = forwarded application questions, task = actionable work item from AM/admin';
