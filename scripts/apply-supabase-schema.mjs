import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const password = process.env.SUPABASE_PASS;
if (!url || !password) throw new Error("Missing Supabase connection environment variables");

const projectRef = new URL(url).hostname.split(".")[0];
const sql = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const directHost = `db.${projectRef}.supabase.co`;
const dnsResult = await fetch(`https://cloudflare-dns.com/dns-query?name=${directHost}&type=AAAA`, { headers: { accept: "application/dns-json" } }).then((response) => response.json()).catch(() => ({}));
const directIpv6 = dnsResult.Answer?.find((answer) => answer.type === 28)?.data;
const regions = ["eu-central-1", "eu-west-1", "eu-west-2", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "us-east-1", "us-west-1", "us-west-2", "sa-east-1", "ca-central-1", "ap-south-1"];
const candidates = [
  { host: directHost, user: "postgres" },
  ...(directIpv6 ? [{ host: directIpv6, user: "postgres" }] : []),
  ...[0, 1, 2].flatMap((pool) => regions.map((region) => ({ host: `aws-${pool}-${region}.pooler.supabase.com`, user: `postgres.${projectRef}` }))),
];
let client;
let lastError;
for (const candidate of candidates) {
  const attempt = new pg.Client({ ...candidate, port: 5432, database: "postgres", password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5_000 });
  try {
    await attempt.connect();
    client = attempt;
    console.log("Connected through:", candidate.host);
    break;
  } catch (error) {
    lastError = error;
    console.log("Unavailable:", candidate.host, error.code ?? "connection_error");
    await attempt.end().catch(() => undefined);
  }
}
if (!client) throw lastError ?? new Error("No Supabase database endpoint was reachable");
try {
  const legacy = (await client.query("select to_regclass('public.finance_snapshots') is not null as exists")).rows[0].exists;
  const legacyUsers = legacy ? (await client.query("select count(*) from public.finance_snapshots")).rows[0].count : "0";
  console.log("Before migration:", { has_legacy: legacy, legacy_users: legacyUsers });
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  const after = await client.query(`
    select
      (select count(*) from public.portfolios) as portfolios,
      (select count(*) from public.accounts) as accounts,
      (select count(*) from public.categories) as categories,
      (select count(*) from public.transactions) as transactions,
      (select count(*) from public.transaction_items) as transaction_items,
      (select count(*) from public.recurring_rules) as recurring_rules,
      (select count(*) from public.finance_snapshots_legacy_backup) as backed_up_users
  `);
  console.log("After migration:", after.rows[0]);
  const verification = await client.query(`
    with legacy as (
      select user_id,
        jsonb_array_length(coalesce(payload->'state'->'portfolios', '[]'::jsonb)) portfolios,
        jsonb_array_length(coalesce(payload->'state'->'accounts', '[]'::jsonb)) accounts,
        jsonb_array_length(coalesce(payload->'state'->'categories', '[]'::jsonb)) categories,
        jsonb_array_length(coalesce(payload->'state'->'transactions', '[]'::jsonb)) transactions,
        jsonb_array_length(coalesce(payload->'state'->'transactionItems', '[]'::jsonb)) transaction_items,
        jsonb_array_length(coalesce(payload->'state'->'recurringRules', '[]'::jsonb)) recurring_rules
      from public.finance_snapshots_legacy_backup
    )
    select l.user_id,
      l.portfolios = (select count(*) from public.portfolios p where p.owner_id=l.user_id) portfolios_ok,
      l.accounts = (select count(*) from public.accounts a join public.portfolios p on p.id=a.portfolio_id where p.owner_id=l.user_id) accounts_ok,
      l.categories = (select count(*) from public.categories c join public.portfolios p on p.id=c.portfolio_id where p.owner_id=l.user_id) categories_ok,
      l.transactions = (select count(*) from public.transactions t join public.portfolios p on p.id=t.portfolio_id where p.owner_id=l.user_id) transactions_ok,
      l.transaction_items = (select count(*) from public.transaction_items i join public.transactions t on t.id=i.transaction_id join public.portfolios p on p.id=t.portfolio_id where p.owner_id=l.user_id) transaction_items_ok,
      l.recurring_rules = (select count(*) from public.recurring_rules r join public.portfolios p on p.id=r.portfolio_id where p.owner_id=l.user_id) recurring_rules_ok
    from legacy l
  `);
  const mismatches = verification.rows.filter((row) => Object.entries(row).some(([key, value]) => key.endsWith("_ok") && value !== true));
  if (mismatches.length) throw new Error(`Migration verification failed for ${mismatches.length} user(s)`);
  console.log("Verified migrated users:", verification.rowCount);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
