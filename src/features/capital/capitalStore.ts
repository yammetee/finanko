import { create } from "zustand";
import { loadCapitalData, saveCapitalData, saveCapitalHistory, saveCapitalValuation } from "./capitalRepository";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalQuote, CapitalSnapshot, CapitalValuation } from "./capitalTypes";
import { loadMarketHistory, loadMarketQuotes } from "./marketRepository";
import { getCapitalTotalUsd } from "./capitalView";
import { buildExpectedInterestEvents } from "./interestRules";
import { rebuildCapitalHistory } from "./capitalHistory";

type LoadState = "idle" | "loading" | "ready" | "error";
interface CapitalState extends CapitalSnapshot {
  quotes: Record<string, CapitalQuote>;
  valuations: CapitalValuation[];
  quoteHistory: CapitalQuote[];
  historyLoading: boolean;
  historyPending: boolean;
  quotesLoading: boolean;
  quotesPartial: boolean;
  quotesError?: string;
  loadState: LoadState;
  error?: string;
  initialize: () => Promise<void>;
  saveGroup: (value: Omit<CapitalGroup, "id"> & { id?: string }) => Promise<CapitalGroup>;
  saveItem: (value: Omit<CapitalItem, "id"> & { id?: string }) => Promise<CapitalItem>;
  saveOpeningPosition: (item: Omit<CapitalItem, "id">, quantity: string, invested: string, occurredAt: string) => Promise<CapitalItem>;
  saveEvent: (value: Omit<CapitalEvent, "id"> & { id?: string }) => Promise<CapitalEvent>;
  archiveGroup: (id: string) => Promise<void>;
  archiveItem: (id: string) => Promise<void>;
  voidEvent: (id: string) => Promise<void>;
  setEventStatus: (id: string, status: CapitalEvent["status"]) => Promise<void>;
  refreshQuotes: () => Promise<void>;
  rebuildHistory: () => Promise<void>;
}

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
async function persistCurrentValuation(quotes: CapitalQuote[] = []) {
  const state = useCapitalStore.getState();
  const totalUsd = getCapitalTotalUsd(state.items, state.events, state.quotes);
  await saveCapitalValuation(quotes, totalUsd);
  const date = new Date().toISOString().slice(0, 10);
  useCapitalStore.setState((current) => ({ valuations: [...current.valuations.filter((value) => value.date !== date), { date, totalUsd }] }));
}
async function generateExpectedInterest() {
  const state = useCapitalStore.getState();
  const expected = buildExpectedInterestEvents(state.items, state.events);
  if (!expected.length) return;
  await saveCapitalData({ events: expected });
  useCapitalStore.setState((current) => ({ events: [...current.events, ...expected] }));
}

export const useCapitalStore = create<CapitalState>()((set) => ({
  groups: [], items: [], events: [], quotes: {}, quoteHistory: [], valuations: [], quotesLoading: false, quotesPartial: false, historyLoading: false, historyPending: false, loadState: "idle",
  initialize: async () => {
    set({ loadState: "loading", error: undefined });
    try {
      const snapshot = await loadCapitalData();
      const expected = buildExpectedInterestEvents(snapshot.items, snapshot.events);
      if (expected.length) await saveCapitalData({ events: expected });
      set({ groups: snapshot.groups, items: snapshot.items, events: [...snapshot.events, ...expected], quoteHistory: snapshot.quoteHistory ?? [], valuations: snapshot.valuations ?? [], quotes: Object.fromEntries((snapshot.latestQuotes ?? []).map((quote) => [quote.itemId, quote])), loadState: "ready" });
    }
    catch (error) { set({ loadState: "error", error: error instanceof Error ? error.message : "Capital load failed" }); }
  },
  saveGroup: async (input) => {
    const value = { ...input, id: input.id ?? uid("capital-group") };
    await saveCapitalData({ groups: [value] });
    set((state) => ({ groups: [...state.groups.filter((entry) => entry.id !== value.id), value] }));
    return value;
  },
  saveItem: async (input) => {
    const value = { ...input, id: input.id ?? uid("capital-item") };
    await saveCapitalData({ items: [value] });
    set((state) => ({ items: [...state.items.filter((entry) => entry.id !== value.id), value] }));
    void persistCurrentValuation().catch(() => undefined);
    void generateExpectedInterest().catch(() => undefined);
    void useCapitalStore.getState().rebuildHistory().catch(() => undefined);
    return value;
  },
  saveOpeningPosition: async (input, quantity, invested, occurredAt) => {
    const item = { ...input, id: uid("capital-item") };
    const event: CapitalEvent = { id: uid("capital-event"), itemId: item.id, type: item.type === "cash" || item.type === "deposit" ? "deposit" : "buy", status: "confirmed", occurredAt, quantity: quantity || undefined, amount: invested, currency: item.quoteCurrency, source: "manual", notes: "Opening position" };
    await saveCapitalData({ items: [item], events: [event] });
    set((state) => ({ items: [...state.items, item], events: [...state.events, event] }));
    void persistCurrentValuation().catch(() => undefined);
    void useCapitalStore.getState().rebuildHistory().catch(() => undefined);
    void generateExpectedInterest().catch(() => undefined);
    return item;
  },
  saveEvent: async (input) => {
    const value = { ...input, id: input.id ?? uid("capital-event") };
    await saveCapitalData({ events: [value] });
    set((state) => ({ events: [...state.events.filter((entry) => entry.id !== value.id), value] }));
    void persistCurrentValuation().catch(() => undefined);
    void useCapitalStore.getState().rebuildHistory().catch(() => undefined);
    return value;
  },
  archiveGroup: async (id) => {
    const current = useCapitalStore.getState();
    const value = current.groups.find((entry) => entry.id === id);
    if (!value) return;
    const previousArchive = value.archivedAt;
    const updated = { ...value, archivedAt: previousArchive ? undefined : new Date().toISOString() };
    const items = current.items.filter((entry) => entry.groupId === id && (previousArchive ? entry.archivedAt === previousArchive : !entry.archivedAt)).map((entry) => ({ ...entry, archivedAt: updated.archivedAt }));
    await saveCapitalData({ groups: [updated], items });
    const changedIds = new Set(items.map((entry) => entry.id));
    set((state) => ({ groups: state.groups.map((entry) => entry.id === id ? updated : entry), items: state.items.map((entry) => changedIds.has(entry.id) ? { ...entry, archivedAt: updated.archivedAt } : entry) }));
    void persistCurrentValuation().catch(() => undefined);
    void useCapitalStore.getState().rebuildHistory().catch(() => undefined);
  },
  archiveItem: async (id) => {
    const value = useCapitalStore.getState().items.find((entry) => entry.id === id);
    if (!value) return;
    const updated = { ...value, archivedAt: value.archivedAt ? undefined : new Date().toISOString() };
    await saveCapitalData({ items: [updated] });
    set((state) => ({ items: state.items.map((entry) => entry.id === id ? updated : entry) }));
    void persistCurrentValuation().catch(() => undefined);
    void useCapitalStore.getState().rebuildHistory().catch(() => undefined);
  },
  voidEvent: async (id) => {
    const value = useCapitalStore.getState().events.find((entry) => entry.id === id);
    if (!value) return;
    await saveCapitalData({ events: [{ ...value, deletedAt: new Date().toISOString() }] });
    set((state) => ({ events: state.events.filter((entry) => entry.id !== id) }));
    void persistCurrentValuation().catch(() => undefined);
    void useCapitalStore.getState().rebuildHistory().catch(() => undefined);
  },
  setEventStatus: async (id, status) => {
    const value = useCapitalStore.getState().events.find((entry) => entry.id === id);
    if (!value) return;
    const updated = { ...value, status };
    await saveCapitalData({ events: [updated] });
    set((state) => ({ events: state.events.map((entry) => entry.id === id ? updated : entry) }));
    void persistCurrentValuation().catch(() => undefined);
    void useCapitalStore.getState().rebuildHistory().catch(() => undefined);
    if (status === "confirmed") void generateExpectedInterest().catch(() => undefined);
  },
  refreshQuotes: async () => {
    set({ quotesLoading: true, quotesError: undefined });
    try {
      const marketItems = useCapitalStore.getState().items.filter((item) => !item.archivedAt && item.symbol && (item.type === "stock" || item.type === "fund" || item.type === "crypto"));
      const quotes = await loadMarketQuotes(marketItems);
      const current = useCapitalStore.getState();
      const merged = { ...current.quotes, ...Object.fromEntries(quotes.map((quote) => [quote.itemId, quote])) };
      const totalUsd = getCapitalTotalUsd(current.items, current.events, merged);
      await saveCapitalValuation(quotes, totalUsd);
      const today = new Date().toISOString().slice(0, 10);
      const resolved = new Set(quotes.map((quote) => quote.itemId));
      set((state) => ({ quotes: merged, quotesPartial: marketItems.some((item) => !resolved.has(item.id)), valuations: [...state.valuations.filter((value) => value.date !== today), { date: today, totalUsd }] }));
    } catch {
      set({ quotesError: "Market quotes unavailable" });
    } finally { set({ quotesLoading: false }); }
  },
  rebuildHistory: async () => {
    if (useCapitalStore.getState().historyLoading) {
      set({ historyPending: true });
      return;
    }
    set({ historyLoading: true, historyPending: false });
    try {
      const current = useCapitalStore.getState();
      const startDate = current.events.filter((event) => event.status === "confirmed" && !event.deletedAt).map((event) => event.occurredAt.slice(0, 10)).sort()[0];
      if (!startDate) return;
      const fetched = await loadMarketHistory(current.items, startDate).catch(() => []);
      const keyed = new Map([...current.quoteHistory, ...fetched].map((quote) => [`${quote.itemId}:${quote.provider}:${quote.quotedAt}`, quote]));
      const history = [...keyed.values()];
      const values = rebuildCapitalHistory(current.items, current.events, history);
      await saveCapitalHistory(fetched, values);
      set({ quoteHistory: history, valuations: values });
    } finally {
      const pending = useCapitalStore.getState().historyPending;
      set({ historyLoading: false, historyPending: false });
      if (pending) void useCapitalStore.getState().rebuildHistory().catch(() => undefined);
    }
  },
}));
