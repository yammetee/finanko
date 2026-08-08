import { create } from "zustand";
import { loadCapitalData, saveCapitalData } from "./capitalRepository";
import type { CapitalEvent, CapitalGroup, CapitalItem, CapitalQuote, CapitalSnapshot } from "./capitalTypes";
import { loadMarketQuotes } from "./marketRepository";

type LoadState = "idle" | "loading" | "ready" | "error";
interface CapitalState extends CapitalSnapshot {
  quotes: Record<string, CapitalQuote>;
  quotesLoading: boolean;
  loadState: LoadState;
  error?: string;
  initialize: () => Promise<void>;
  saveGroup: (value: Omit<CapitalGroup, "id"> & { id?: string }) => Promise<CapitalGroup>;
  saveItem: (value: Omit<CapitalItem, "id"> & { id?: string }) => Promise<CapitalItem>;
  saveEvent: (value: Omit<CapitalEvent, "id"> & { id?: string }) => Promise<CapitalEvent>;
  archiveGroup: (id: string) => Promise<void>;
  archiveItem: (id: string) => Promise<void>;
  voidEvent: (id: string) => Promise<void>;
  setEventStatus: (id: string, status: CapitalEvent["status"]) => Promise<void>;
  refreshQuotes: () => Promise<void>;
}

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export const useCapitalStore = create<CapitalState>()((set) => ({
  groups: [], items: [], events: [], quotes: {}, quotesLoading: false, loadState: "idle",
  initialize: async () => {
    set({ loadState: "loading", error: undefined });
    try { set({ ...(await loadCapitalData()), loadState: "ready" }); }
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
    return value;
  },
  saveEvent: async (input) => {
    const value = { ...input, id: input.id ?? uid("capital-event") };
    await saveCapitalData({ events: [value] });
    set((state) => ({ events: [...state.events.filter((entry) => entry.id !== value.id), value] }));
    return value;
  },
  archiveGroup: async (id) => {
    const current = useCapitalStore.getState();
    const value = current.groups.find((entry) => entry.id === id);
    if (!value) return;
    const updated = { ...value, archivedAt: value.archivedAt ? undefined : new Date().toISOString() };
    const items = current.items.filter((entry) => entry.groupId === id).map((entry) => ({ ...entry, archivedAt: updated.archivedAt }));
    await saveCapitalData({ groups: [updated], items });
    set((state) => ({ groups: state.groups.map((entry) => entry.id === id ? updated : entry), items: state.items.map((entry) => entry.groupId === id ? { ...entry, archivedAt: updated.archivedAt } : entry) }));
  },
  archiveItem: async (id) => {
    const value = useCapitalStore.getState().items.find((entry) => entry.id === id);
    if (!value) return;
    const updated = { ...value, archivedAt: value.archivedAt ? undefined : new Date().toISOString() };
    await saveCapitalData({ items: [updated] });
    set((state) => ({ items: state.items.map((entry) => entry.id === id ? updated : entry) }));
  },
  voidEvent: async (id) => {
    const value = useCapitalStore.getState().events.find((entry) => entry.id === id);
    if (!value) return;
    await saveCapitalData({ events: [{ ...value, deletedAt: new Date().toISOString() }] });
    set((state) => ({ events: state.events.filter((entry) => entry.id !== id) }));
  },
  setEventStatus: async (id, status) => {
    const value = useCapitalStore.getState().events.find((entry) => entry.id === id);
    if (!value) return;
    const updated = { ...value, status };
    await saveCapitalData({ events: [updated] });
    set((state) => ({ events: state.events.map((entry) => entry.id === id ? updated : entry) }));
  },
  refreshQuotes: async () => {
    set({ quotesLoading: true });
    try {
      const quotes = await loadMarketQuotes(useCapitalStore.getState().items);
      set((state) => ({ quotes: { ...state.quotes, ...Object.fromEntries(quotes.map((quote) => [quote.itemId, quote])) } }));
    } finally { set({ quotesLoading: false }); }
  },
}));
