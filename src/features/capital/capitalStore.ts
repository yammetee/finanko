import { create } from "zustand";
import { uid } from "../../shared/lib/id";
import type { LoadState } from "../../shared/types/loadState";
import { deleteCapitalEvent, deleteCapitalGroup, deleteCapitalItem, loadCapitalData, saveCapitalData, saveCapitalValuation } from "./capitalRepository";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalQuote, CapitalSnapshot, CapitalValuation } from "./capitalTypes";
import { loadMarketQuotes } from "./marketRepository";
import { getCapitalTotalUsd } from "./capitalView";
import { convertCapitalMoney } from "./capitalCurrency";
import { capitalEventTimestamp, compareCapitalEvents } from "./capitalEventTime";
import { buildExpectedInterestEvents } from "./interestRules";
import { addTransferCostBasis, assertCapitalOutflowsWithinBalance } from "./capitalMath";
import { isCapitalEventTypeAllowed } from "./capitalEventRules";

interface CapitalState extends Pick<CapitalSnapshot, "groups" | "items" | "events"> {
  ownerId: string | null;
  quotes: Record<string, CapitalQuote>;
  valuations: CapitalValuation[];
  quotesLoading: boolean;
  unavailableQuoteItemIds: string[];
  loadState: LoadState;
  initialize: (ownerId: string) => Promise<void>;
  saveGroup: (value: Omit<CapitalGroup, "id"> & { id?: string }) => Promise<CapitalGroup>;
  saveItem: (value: Omit<CapitalItem, "id"> & { id?: string }) => Promise<CapitalItem>;
  saveOpeningPosition: (item: Omit<CapitalItem, "id">, quantity: string, invested: string, occurredAt: string) => Promise<CapitalItem>;
  saveEvent: (value: Omit<CapitalEvent, "id"> & { id?: string }) => Promise<CapitalEvent>;
  deleteGroup: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  setEventStatus: (id: string, status: CapitalEvent["status"]) => Promise<void>;
  refreshMarketData: () => Promise<void>;
}

const utcDate = (value = new Date()) => value.toISOString().slice(0, 10);
let capitalSessionVersion = 0;
const emptyCapitalState = () => ({
  groups: [], items: [], events: [], quotes: {}, valuations: [],
  quotesLoading: false, unavailableQuoteItemIds: [],
});
const isMarketItem = (item: CapitalItem) => item.type === "stock" || item.type === "fund" || item.type === "crypto";
const convertEventsToCurrency = (events: CapitalEvent[], currency: CapitalItem["quoteCurrency"]) => events.map((event) => {
  if (event.currency === currency) return event;
  const convert = (value?: string) => value === undefined ? undefined : convertCapitalMoney(value, event.currency, currency, event.occurredAt);
  return { ...event, amount: convert(event.amount), fee: convert(event.fee), tax: convert(event.tax), currency };
});
function normalizeCapitalEventSequence(events: CapitalEvent[], items: CapitalItem[]) {
  let normalized = [...events];
  const transfers = events.filter((event) => event.status === "confirmed" && event.type === "transfer" && event.quantity).sort(compareCapitalEvents);
  for (const transfer of transfers) {
    const source = items.find((item) => item.id === transfer.itemId);
    if (!source || !isMarketItem(source)) continue;
    const value = addTransferCostBasis({ ...transfer, amount: undefined, currency: source.quoteCurrency }, convertEventsToCurrency(normalized, source.quoteCurrency));
    normalized = normalized.map((event) => event.id === value.id ? value : event);
  }
  assertCapitalOutflowsWithinBalance(normalized, items.filter(isMarketItem).map((item) => item.id));
  return normalized;
}
const changedCapitalEvents = (before: CapitalEvent[], after: CapitalEvent[], requiredId?: string) => {
  const previous = new Map(before.map((event) => [event.id, event]));
  return after.filter((event) => event.id === requiredId || previous.get(event.id)?.amount !== event.amount || previous.get(event.id)?.status !== event.status);
};
export function createOpeningPositionRecords(input: Omit<CapitalItem, "id">, quantity: string, invested: string, occurredAt: string, events: CapitalEvent[] = []) {
  const item = { ...input, id: uid("capital-item") };
  const event: CapitalEvent = { id: uid("capital-event"), itemId: item.id, type: item.type === "cash" || item.type === "deposit" ? "deposit" : "buy", status: "confirmed", occurredAt: capitalEventTimestamp(occurredAt, { events }), quantity: quantity || undefined, amount: invested, currency: item.quoteCurrency, source: "manual" };
  return { item, event };
}
async function generateExpectedInterest() {
  const state = useCapitalStore.getState();
  const ownerId = state.ownerId;
  if (!ownerId) return;
  const expected = buildExpectedInterestEvents(state.items, state.events);
  if (!expected.length) return;
  await saveCapitalData(ownerId, { events: expected });
  if (useCapitalStore.getState().ownerId !== ownerId) return;
  const expectedIds = new Set(expected.map((event) => event.id));
  useCapitalStore.setState((current) => ({ events: [...current.events.filter((event) => !expectedIds.has(event.id)), ...expected] }));
}

export const useCapitalStore = create<CapitalState>()((set, get) => ({
  ownerId: null, ...emptyCapitalState(), loadState: "idle",
  initialize: async (targetOwnerId) => {
    const version = ++capitalSessionVersion;
    set({ ownerId: targetOwnerId, ...emptyCapitalState(), loadState: "loading" });
    try {
      const snapshot = await loadCapitalData(targetOwnerId);
      if (version !== capitalSessionVersion || get().ownerId !== targetOwnerId) return;
      const expected = buildExpectedInterestEvents(snapshot.items, snapshot.events);
      const events = [...snapshot.events, ...expected];
      set({ groups: snapshot.groups, items: snapshot.items, events, valuations: snapshot.valuations ?? [], quotes: {}, loadState: "ready" });
    }
    catch { if (version === capitalSessionVersion && get().ownerId === targetOwnerId) set({ loadState: "error" }); }
  },
  saveGroup: async (input) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("capital_owner_required");
    const value = { ...input, id: input.id ?? uid("capital-group") };
    await saveCapitalData(ownerId, { groups: [value] });
    if (get().ownerId !== ownerId) return value;
    set((state) => ({ groups: [...state.groups.filter((entry) => entry.id !== value.id), value] }));
    return value;
  },
  saveItem: async (input) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("capital_owner_required");
    const value = { ...input, id: input.id ?? uid("capital-item") };
    await saveCapitalData(ownerId, { items: [value] });
    if (get().ownerId !== ownerId) return value;
    set((state) => ({ items: [...state.items.filter((entry) => entry.id !== value.id), value] }));
    await generateExpectedInterest();
    return value;
  },
  saveOpeningPosition: async (input, quantity, invested, occurredAt) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("capital_owner_required");
    const { item, event } = createOpeningPositionRecords(input, quantity, invested, occurredAt, get().events);
    await saveCapitalData(ownerId, { items: [item], events: [event] });
    if (get().ownerId !== ownerId) return item;
    set((state) => ({ items: [...state.items, item], events: [...state.events, event] }));
    await generateExpectedInterest();
    return item;
  },
  saveEvent: async (input) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("capital_owner_required");
    const currentEvents = get().events;
    const existingEvent = input.id ? currentEvents.find((event) => event.id === input.id) : undefined;
    const initialDraft = {
      ...input,
      reinvest: input.type === "interest" && input.relatedItemId ? false : input.reinvest,
      id: input.id ?? uid("capital-event"),
      occurredAt: capitalEventTimestamp(input.occurredAt, { events: currentEvents, existingEvent }),
    };
    const sourceItem = get().items.find((item) => item.id === initialDraft.itemId);
    if (!sourceItem || !isCapitalEventTypeAllowed(sourceItem.type, initialDraft.type)) throw new Error("capital_event_type_invalid");
    const relatedItem = initialDraft.relatedItemId ? get().items.find((item) => item.id === initialDraft.relatedItemId) : undefined;
    if (initialDraft.type === "transfer" && (!relatedItem || relatedItem.id === sourceItem.id || initialDraft.currency !== sourceItem.quoteCurrency || (sourceItem.type === "cash" || sourceItem.type === "deposit"
      ? relatedItem.type !== "cash" && relatedItem.type !== "deposit"
      : relatedItem.quoteCurrency !== sourceItem.quoteCurrency || relatedItem.type !== sourceItem.type || relatedItem.symbol !== sourceItem.symbol))) throw new Error("capital_transfer_destination_invalid");
    const proposedEvents = [...currentEvents.filter((event) => event.id !== initialDraft.id), initialDraft];
    const normalizedEvents = normalizeCapitalEventSequence(proposedEvents, get().items);
    const value = normalizedEvents.find((event) => event.id === initialDraft.id)!;
    await saveCapitalData(ownerId, { events: changedCapitalEvents(currentEvents, normalizedEvents, value.id) });
    if (get().ownerId !== ownerId) return value;
    set({ events: normalizedEvents });
    return value;
  },
  deleteGroup: async (id) => { const ownerId = get().ownerId; if (!ownerId) throw new Error("capital_owner_required"); await deleteCapitalGroup(ownerId, id); if (get().ownerId !== ownerId) return; await get().initialize(ownerId); },
  deleteItem: async (id) => { const ownerId = get().ownerId; if (!ownerId) throw new Error("capital_owner_required"); await deleteCapitalItem(ownerId, id); if (get().ownerId !== ownerId) return; await get().initialize(ownerId); },
  deleteEvent: async (id) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("capital_owner_required");
    const currentEvents = get().events;
    const normalizedEvents = normalizeCapitalEventSequence(currentEvents.filter((event) => event.id !== id), get().items);
    await deleteCapitalEvent(ownerId, id, changedCapitalEvents(currentEvents, normalizedEvents));
    if (get().ownerId !== ownerId) return;
    set({ events: normalizedEvents });
  },
  setEventStatus: async (id, status) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error("capital_owner_required");
    const value = useCapitalStore.getState().events.find((entry) => entry.id === id);
    if (!value) return;
    const updated = { ...value, status };
    const currentEvents = get().events;
    const normalizedEvents = normalizeCapitalEventSequence(currentEvents.map((entry) => entry.id === id ? updated : entry), get().items);
    await saveCapitalData(ownerId, { events: changedCapitalEvents(currentEvents, normalizedEvents, id) });
    if (get().ownerId !== ownerId) return;
    set({ events: normalizedEvents });
    if (status !== "expected") await generateExpectedInterest();
  },
  refreshMarketData: async () => {
    if (get().quotesLoading) return;
    const ownerId = get().ownerId;
    if (!ownerId) return;
    const current = get();
    const marketItems = current.items.filter((item) => item.symbol && isMarketItem(item));
    if (!marketItems.length) return;
    set({ quotesLoading: true });
    try {
      let quotes: CapitalQuote[];
      try {
        quotes = await loadMarketQuotes(marketItems);
      } catch (error) {
        if (get().ownerId === ownerId) set({ quotes: {}, unavailableQuoteItemIds: marketItems.map((item) => item.id) });
        throw error;
      }
      if (get().ownerId !== ownerId) return;
      const currentQuotes = Object.fromEntries(quotes.map((quote) => [quote.itemId, quote]));
      const totalUsd = getCapitalTotalUsd(current.items, current.events, currentQuotes);
      const today = utcDate();
      const resolved = new Set(quotes.map((quote) => quote.itemId));
      const unavailableQuoteItemIds = marketItems.filter((item) => !resolved.has(item.id)).map((item) => item.id);
      const valuations = [...current.valuations.filter((value) => value.date !== today), { date: today, totalUsd }];
      set({ quotes: currentQuotes, unavailableQuoteItemIds, valuations });
      await saveCapitalValuation(ownerId, totalUsd);
      if (get().ownerId !== ownerId) return;
    } finally {
      if (get().ownerId === ownerId) set({ quotesLoading: false });
    }
  },
}));
