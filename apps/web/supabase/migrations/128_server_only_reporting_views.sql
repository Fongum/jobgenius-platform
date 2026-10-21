-- 128: Keep five reporting views server-only.
--
-- These views are owned by postgres without security_invoker, so they read their tables with the
-- owner's rights and bypass row-level security. Supabase's default privileges gave anon and
-- authenticated SELECT on them, so anyone with the public API key could read every client's rows
-- through the Data API. Every application reader uses the service role on the server
-- (supabaseAdmin / supabaseServer), so the API roles need no access at all.
--
-- This makes permanent the emergency containment already applied in production (Oct 2026):
-- anon, authenticated and PUBLIC lose every table- and column-level privilege on the five views;
-- service_role keeps SELECT. Nothing else changes: no table, row, policy, view definition, or
-- other object's privileges. Safe to re-run; on a database that already has the containment it
-- changes nothing.
--
-- Aborts, changing nothing, if another view is built on one of these (it would keep serving the
-- same rows) or if an API role could still read one (for example through a role it inherits).
-- It also aborts on an API-callable SECURITY DEFINER function that names one of these views,
-- returns its rows, or is recorded as depending on it. That function screen is a heuristic: a
-- function that builds the name dynamically, or reads the view through another function, is not
-- detected, so API-callable SECURITY DEFINER functions are reviewed separately.
--
-- Note: CREATE OR REPLACE VIEW keeps these privileges; DROP VIEW + CREATE VIEW re-applies the
-- default grants. A later migration that drops and recreates one of these views must repeat this.

begin;

do $$
declare
  targets constant regclass[] := array[
    'public.v_client_delivery_snapshot',
    'public.v_am_tasks',
    'public.v_client_timeline',
    'public.v_outreach_am_metrics',
    'public.v_outreach_pipeline_status'
  ]::regclass[];
  v regclass;
  r text;
  cols text;
  found text;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('jit', 'off', true);

  select string_agg(t::text, ', ') into found
  from unnest(targets) t join pg_class c on c.oid = t
  where c.relkind <> 'v';
  if found is not null then
    raise exception 'not a plain view: %', found;
  end if;

  with recursive deps(oid) as (
    select t::oid from unnest(targets) t
    union
    select rw.ev_class
    from deps
    join pg_depend d on d.refclassid = 'pg_class'::regclass and d.refobjid = deps.oid
                    and d.classid = 'pg_rewrite'::regclass
    join pg_rewrite rw on rw.oid = d.objid
    where rw.ev_class <> deps.oid
  )
  select string_agg(oid::regclass::text, ', ') into found
  from deps where oid <> all (targets::oid[]);
  if found is not null then
    raise exception 'view(s) built on a server-only view, review first: %', found;
  end if;

  foreach v in array targets loop
    execute format('revoke all on table %s from public, anon, authenticated', v);
    select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute where attrelid = v and attnum > 0 and not attisdropped;
    execute format('revoke all (%s) on table %s from public, anon, authenticated', cols, v);
    execute format('grant select on table %s to service_role', v);
  end loop;

  foreach v in array targets loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, v, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or has_any_column_privilege(r, v, 'SELECT, INSERT, UPDATE, REFERENCES') then
        raise exception '% still holds a privilege on % (check inherited roles and other grants)', r, v;
      end if;
    end loop;
    if not has_table_privilege('service_role', v, 'SELECT') then
      raise exception 'service_role cannot SELECT %', v;
    end if;
  end loop;

  select string_agg(p.oid::regprocedure::text, ', ') into found
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prosecdef
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and (p.prosrc ~* (select string_agg(c.relname, '|') from pg_class c where c.oid = any (targets::oid[]))
         or p.prorettype in (select c.reltype from pg_class c where c.oid = any (targets::oid[]))
         or exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                      and d.refclassid = 'pg_class'::regclass and d.refobjid = any (targets::oid[])));
  if found is not null then
    raise exception 'API-callable SECURITY DEFINER function(s) read a server-only view: %', found;
  end if;
end;
$$;

commit;
