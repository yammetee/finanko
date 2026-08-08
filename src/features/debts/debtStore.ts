import { create } from "zustand";
import { buildDebtProjection } from "./debtMath";
import { deleteDebt, deleteDebtGroup, deleteDebtPayment, loadDebtData, saveDebtData } from "./debtRepository";
import type { Debt, DebtEvent, DebtGroup, DebtPayment, DebtReconciliation, DebtSnapshot } from "./debtTypes";

type LoadState = "idle" | "loading" | "ready" | "error";

interface DebtState extends DebtSnapshot {
  ownerId: string | null;
  loadState: LoadState;
  initialize: (ownerId: string) => Promise<void>;
  reset: () => void;
  saveGroup: (value: Omit<DebtGroup, "id"> & { id?: string }) => Promise<DebtGroup>;
  saveDebt: (value: Omit<Debt, "id"> & { id?: string }) => Promise<Debt>;
  savePayment: (value: Omit<DebtPayment, "id" | "sequence" | "type"> & { id?: string }) => Promise<DebtPayment>;
  saveReconciliation: (value: Omit<DebtReconciliation, "id" | "sequence" | "type"> & { id?: string }) => Promise<DebtReconciliation>;
  deleteGroup: (id: string) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
}

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const empty = (): DebtSnapshot => ({ groups: [], debts: [], events: [] });
let debtSessionVersion = 0;

function normalizedTimestamp(value: string) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("debt_date_invalid");
  return `${date}T12:00:00.000Z`;
}

function eventSequence(events: DebtEvent[], occurredAt: string, existing?: DebtEvent) {
  if (existing) return existing.sequence;
  return events.filter((value) => value.occurredAt === occurredAt).reduce((maximum, value) => Math.max(maximum, value.sequence), -1) + 1;
}

function projectSnapshot(snapshot: DebtSnapshot) {
  return {
    ...snapshot,
    debts: snapshot.debts.map((debt) => ({ ...debt, status: buildDebtProjection(debt, snapshot.events).status })),
  };
}

export const useDebtStore = create<DebtState>()((set, get) => ({
  ownerId: null,
  ...empty(),
  loadState: "idle",
  reset: () => {
    debtSessionVersion += 1;
    set({ ownerId: null, ...empty(), loadState: "idle" });
  },
  initialize: async (ownerId) => {
    const version = ++debtSessionVersion;
    set({ ownerId, ...empty(), loadState: "loading" });
    try {
      const snapshot = projectSnapshot(await loadDebtData(ownerId));
      if (version !== debtSessionVersion || get().ownerId !== ownerId) return;
      set({ ...snapshot, loadState: "ready" });
    } catch {
      if (version === debtSessionVersion && get().ownerId === ownerId) set({ loadState: "error" });
    }
  },
  saveGroup: async (input) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("debt_owner_required");
    const value = { ...input, id: input.id ?? uid("debt-group") };
    const snapshot = { groups: [...get().groups.filter((entry) => entry.id !== value.id), value], debts: get().debts, events: get().events };
    await saveDebtData(ownerId, snapshot);
    if (get().ownerId === ownerId) set({ groups: snapshot.groups });
    return value;
  },
  saveDebt: async (input) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("debt_owner_required");
    const value = { ...input, id: input.id ?? uid("debt") };
    const snapshot = projectSnapshot({ groups: get().groups, debts: [...get().debts.filter((entry) => entry.id !== value.id), value], events: get().events });
    await saveDebtData(ownerId, snapshot);
    if (get().ownerId === ownerId) set({ debts: snapshot.debts });
    return value;
  },
  savePayment: async (input) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("debt_owner_required");
    const existing = input.id ? get().events.find((entry) => entry.id === input.id) : undefined;
    const occurredAt = normalizedTimestamp(input.occurredAt);
    const preserved = existing?.occurredAt === occurredAt ? existing : undefined;
    const value: DebtPayment = { ...input, id: input.id ?? uid("debt-payment"), type: "payment", occurredAt, sequence: eventSequence(get().events.filter((event) => event.id !== existing?.id), occurredAt, preserved) };
    const snapshot = projectSnapshot({ groups: get().groups, debts: get().debts, events: [...get().events.filter((entry) => entry.id !== value.id), value] });
    await saveDebtData(ownerId, snapshot);
    if (get().ownerId === ownerId) set({ debts: snapshot.debts, events: snapshot.events });
    return value;
  },
  saveReconciliation: async (input) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("debt_owner_required");
    const existing = input.id ? get().events.find((entry) => entry.id === input.id) : undefined;
    const occurredAt = normalizedTimestamp(input.occurredAt);
    const preserved = existing?.occurredAt === occurredAt ? existing : undefined;
    const value: DebtReconciliation = { ...input, id: input.id ?? uid("debt-reconciliation"), type: "reconciliation", occurredAt, sequence: eventSequence(get().events.filter((event) => event.id !== existing?.id), occurredAt, preserved) };
    const snapshot = projectSnapshot({ groups: get().groups, debts: get().debts, events: [...get().events.filter((entry) => entry.id !== value.id), value] });
    await saveDebtData(ownerId, snapshot);
    if (get().ownerId === ownerId) set({ debts: snapshot.debts, events: snapshot.events });
    return value;
  },
  deleteGroup: async (id) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("debt_owner_required");
    await deleteDebtGroup(ownerId, id);
    if (get().ownerId === ownerId) await get().initialize(ownerId);
  },
  deleteDebt: async (id) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("debt_owner_required");
    await deleteDebt(ownerId, id);
    if (get().ownerId === ownerId) await get().initialize(ownerId);
  },
  deleteEvent: async (id) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("debt_owner_required");
    const snapshot = projectSnapshot({ groups: get().groups, debts: get().debts, events: get().events.filter((entry) => entry.id !== id) });
    await deleteDebtPayment(ownerId, id, snapshot);
    if (get().ownerId === ownerId) set({ debts: snapshot.debts, events: snapshot.events });
  },
}));
