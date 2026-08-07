-- DESTRUCTIVE REVIEW-ONLY RESET FOR THE CURRENT FINANKO SUPABASE PROJECT.
--
-- Exact writable scope:
--   1. Finanko-owned schema `finanko_private` (dropped and rebuilt by schema.sql).
--   2. Non-extension-owned objects in `public` (removed before schema.sql).
--
-- Explicitly untouched Supabase-managed schemas include `auth`, `storage`,
-- `extensions`, `realtime`, `vault`, `graphql`, `graphql_public`,
-- `supabase_functions`, and `supabase_migrations`. Extension-owned objects that
-- happen to live in `public` are also excluded from the drop queries.
--
-- Back up the project and review this exact scope before execution. Inspect the
-- NOTICE output before applying schema.sql. Application code never runs this file.

begin;

drop schema if exists finanko_private cascade;

do $$
declare
  target record;
begin
  for target in
    select
      relation.oid,
      relation.relkind,
      namespace.nspname as schema_name,
      relation.relname as object_name
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('v', 'm')
      and not exists (
        select 1
        from pg_depend as dependency
        where dependency.classid = 'pg_class'::regclass
          and dependency.objid = relation.oid
          and dependency.deptype = 'e'
      )
    order by relation.relkind, relation.relname
  loop
    raise notice 'Dropping public view-like object %.%', target.schema_name, target.object_name;
    execute format(
      'drop %s if exists %I.%I cascade',
      case target.relkind when 'm' then 'materialized view' else 'view' end,
      target.schema_name,
      target.object_name
    );
  end loop;
end;
$$;

do $$
declare
  target record;
begin
  for target in
    select
      routine.oid,
      routine.prokind,
      namespace.nspname as schema_name,
      routine.proname as object_name,
      pg_get_function_identity_arguments(routine.oid) as identity_arguments
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and not exists (
        select 1
        from pg_depend as dependency
        where dependency.classid = 'pg_proc'::regclass
          and dependency.objid = routine.oid
          and dependency.deptype = 'e'
      )
    order by routine.proname, routine.oid
  loop
    raise notice 'Dropping public routine %.%(%)', target.schema_name, target.object_name, target.identity_arguments;
    execute format(
      'drop %s if exists %I.%I(%s) cascade',
      case target.prokind when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end,
      target.schema_name,
      target.object_name,
      target.identity_arguments
    );
  end loop;
end;
$$;

do $$
declare
  target record;
begin
  for target in
    select
      relation.oid,
      relation.relkind,
      namespace.nspname as schema_name,
      relation.relname as object_name
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p', 'f', 'S')
      and not exists (
        select 1
        from pg_depend as dependency
        where dependency.classid = 'pg_class'::regclass
          and dependency.objid = relation.oid
          and dependency.deptype = 'e'
      )
    order by relation.relkind, relation.relname
  loop
    raise notice 'Dropping public relation %.%', target.schema_name, target.object_name;
    execute format(
      'drop %s if exists %I.%I cascade',
      case target.relkind
        when 'S' then 'sequence'
        when 'f' then 'foreign table'
        else 'table'
      end,
      target.schema_name,
      target.object_name
    );
  end loop;
end;
$$;

do $$
declare
  target record;
begin
  for target in
    select
      data_type.oid,
      data_type.typtype,
      namespace.nspname as schema_name,
      data_type.typname as object_name
    from pg_type as data_type
    join pg_namespace as namespace on namespace.oid = data_type.typnamespace
    where namespace.nspname = 'public'
      and data_type.typtype in ('c', 'd', 'e', 'm', 'r')
      and data_type.typisdefined
      and not exists (
        select 1
        from pg_depend as dependency
        where dependency.classid = 'pg_type'::regclass
          and dependency.objid = data_type.oid
          and dependency.deptype = 'e'
      )
    order by data_type.typname
  loop
    raise notice 'Dropping public type %.%', target.schema_name, target.object_name;
    execute format(
      'drop %s if exists %I.%I cascade',
      case target.typtype when 'd' then 'domain' else 'type' end,
      target.schema_name,
      target.object_name
    );
  end loop;
end;
$$;

commit;

-- After this transaction succeeds, apply supabase/schema.sql as the rebuild step.
