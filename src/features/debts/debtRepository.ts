import { requireSupabaseClient } from "../../shared/api/supabase";
import { buildDebtProjection } from "./debtMath";
import type { Debt, DebtEvent, DebtGroup, DebtSnapshot } from "./debtTypes";

type Row = Record<string, unknown>;

const optional = (value: unknown) => value === null || value === undefined ? undefined : String(value);

function group(row: Row): DebtGroup {
  return { id: String(row.id), name: String(row.name) };
}

function debt(row: Row): Debt {
  return {
    id: String(row.id), groupId: String(row.group_id), name: String(row.name), lender: optional(row.lender),
    loanType: row.loan_type as Debt["loanType"], currency: row.currency as Debt["currency"],
    principalBalance: String(row.principal_balance), annualRate: String(row.annual_rate),
    requiredPayment: String(row.required_payment), balanceDate: String(row.balance_date),
    nextPaymentDate: String(row.next_payment_date), remainingPayments: Number(row.remaining_payments),
    status: row.status as Debt["status"],
  };
}

function event(row: Row): DebtEvent {
  const base = {
    id: String(row.id), debtId: String(row.debt_id), occurredAt: new Date(String(row.occurred_at)).toISOString(),
    sequence: Number(row.event_sequence),
  };
  return row.event_type === "reconciliation"
    ? { ...base, type: "reconciliation", principalBalance: String(row.reconciled_principal) }
    : { ...base, type: "payment", amount: String(row.amount), strategy: row.strategy as Extract<DebtEvent, { type: "payment" }>["strategy"] };
}

export function deserializeDebtSnapshot(data: unknown): DebtSnapshot {
  const snapshot = (data ?? {}) as Record<string, Row[]>;
  return {
    groups: (snapshot.groups ?? []).map(group),
    debts: (snapshot.debts ?? []).map(debt),
    events: (snapshot.payments ?? []).map(event),
  };
}

const DEBT_EVENT_PAGE_SIZE = 500;

async function loadDebtEvents(ownerId: string) {
  const supabase = await requireSupabaseClient();
  const rows: Row[] = [];
  let cursor: { occurredAt: string; sequence: number; id: string } | undefined;
  do {
    const { data, error } = await supabase.rpc("get_debt_payments_page", {
      expected_owner_id: ownerId,
      cursor_occurred_at: cursor?.occurredAt ?? null,
      cursor_sequence: cursor?.sequence ?? null,
      cursor_id: cursor?.id ?? null,
      page_size: DEBT_EVENT_PAGE_SIZE,
    });
    if (error) throw error;
    const page = (Array.isArray(data) ? data : []) as Row[];
    rows.push(...page);
    const last = page[page.length - 1];
    cursor = page.length === DEBT_EVENT_PAGE_SIZE && last
      ? { occurredAt: String(last.occurred_at), sequence: Number(last.event_sequence), id: String(last.id) }
      : undefined;
  } while (cursor);
  return rows.map(event);
}

function serializeDebtEvents(debts: Debt[], events: DebtEvent[]) {
  return events.map((entry) => {
    const debtValue = debts.find((value) => value.id === entry.debtId);
    if (!debtValue) throw new Error("debt_event_without_debt");
    const ordered = events.filter((value) => value.debtId === entry.debtId).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.sequence - right.sequence || left.id.localeCompare(right.id));
    const index = ordered.findIndex((value) => value.id === entry.id);
    const projection = buildDebtProjection(debtValue, ordered.slice(0, index + 1), entry.occurredAt.slice(0, 10));
    const payment = entry.type === "payment" ? projection.payments.find((value) => value.eventId === entry.id) : undefined;
    return {
      id: entry.id, debt_id: entry.debtId, event_type: entry.type, occurred_at: entry.occurredAt,
      event_sequence: entry.sequence, amount: entry.type === "payment" ? entry.amount : null,
      strategy: entry.type === "payment" ? entry.strategy : null,
      reconciled_principal: entry.type === "reconciliation" ? entry.principalBalance : null,
      interest_amount: payment?.interest ?? null, scheduled_principal: payment?.scheduledPrincipal ?? null,
      early_principal: payment?.earlyPrincipal ?? null, principal_after: projection.principal,
      required_payment_after: projection.requiredPayment, remaining_payments_after: projection.remainingPayments,
    };
  });
}

export function serializeDebtSnapshot(snapshot: DebtSnapshot) {
  const events = serializeDebtEvents(snapshot.debts, snapshot.events);
  const statusById = new Map(snapshot.debts.map((value) => [value.id, buildDebtProjection(value, snapshot.events).status]));
  return {
    groups: snapshot.groups.map((value) => ({ id: value.id, name: value.name })),
    debts: snapshot.debts.map((value) => ({
      id: value.id, group_id: value.groupId, name: value.name, lender: value.lender ?? null,
      loan_type: value.loanType, currency: value.currency, principal_balance: value.principalBalance,
      annual_rate: value.annualRate, required_payment: value.requiredPayment, balance_date: value.balanceDate,
      next_payment_date: value.nextPaymentDate, remaining_payments: value.remainingPayments,
      status: statusById.get(value.id) ?? value.status,
    })),
    payments: events,
  };
}

export async function loadDebtData(ownerId: string) {
  const supabase = await requireSupabaseClient();
  const [{ data, error }, events] = await Promise.all([
    supabase.rpc("get_debt_snapshot", { expected_owner_id: ownerId }),
    loadDebtEvents(ownerId),
  ]);
  if (error) throw error;
  return { ...deserializeDebtSnapshot(data), events };
}

export async function saveDebtData(ownerId: string, snapshot: DebtSnapshot) {
  const supabase = await requireSupabaseClient();
  const { error } = await supabase.rpc("save_debt_snapshot", { expected_owner_id: ownerId, debt_data: serializeDebtSnapshot(snapshot) });
  if (error) throw error;
}

async function deleteRecord(rpc: "delete_debt_group" | "delete_debt", ownerId: string, id: string) {
  const supabase = await requireSupabaseClient();
  const { error } = await supabase.rpc(rpc, { expected_owner_id: ownerId, target_id: id });
  if (error) throw error;
}

export const deleteDebtGroup = (ownerId: string, id: string) => deleteRecord("delete_debt_group", ownerId, id);
export const deleteDebt = (ownerId: string, id: string) => deleteRecord("delete_debt", ownerId, id);

export async function deleteDebtPayment(ownerId: string, id: string, snapshot: DebtSnapshot) {
  const supabase = await requireSupabaseClient();
  const replacementRows = serializeDebtSnapshot(snapshot).payments;
  const { error } = await supabase.rpc("delete_debt_payment", { expected_owner_id: ownerId, target_id: id, replacement_rows: replacementRows });
  if (error) throw error;
}
