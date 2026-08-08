import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadCapitalData, saveCapitalData, saveCapitalHistory, saveCapitalValuation, deleteCapitalGroup, deleteCapitalItem, deleteCapitalEvent, loadMarketHistory, loadMarketQuotes } = vi.hoisted(() => ({ loadCapitalData: vi.fn(), saveCapitalData: vi.fn(), saveCapitalHistory: vi.fn(), saveCapitalValuation: vi.fn(), deleteCapitalGroup: vi.fn(), deleteCapitalItem: vi.fn(), deleteCapitalEvent: vi.fn(), loadMarketHistory: vi.fn().mockResolvedValue([]), loadMarketQuotes: vi.fn() }));
vi.mock("./capitalRepository", () => ({ loadCapitalData, saveCapitalData, saveCapitalHistory, saveCapitalValuation, deleteCapitalGroup, deleteCapitalItem, deleteCapitalEvent }));
vi.mock("./marketRepository", () => ({ loadMarketHistory, loadMarketQuotes }));

import { useCapitalStore } from "./capitalStore";

describe("capital store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCapitalStore.setState({ groups: [], items: [], events: [], quotes: {}, quoteHistory: [], valuations: [], quotesLoading: false, quotesPartial: false, quotesError: false, unavailableQuoteItemIds: [], historyLoading: false, historyPending: false, loadState: "ready" });
  });

  it("saves an item and its opening event in one repository call", async () => {
    const item = await useCapitalStore.getState().saveOpeningPosition({ groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", manualPrice: "70000" }, "0.1", "5000", "2026-08-08T12:00:00.000Z");
    expect(saveCapitalData).toHaveBeenCalledOnce();
    expect(saveCapitalData).toHaveBeenCalledWith({ items: [item], events: [expect.objectContaining({ itemId: item.id, type: "buy", quantity: "0.1", amount: "5000" })] });
    expect(useCapitalStore.getState().events).toHaveLength(1);
  });

  it("physically deletes a group through the repository and reloads state", async () => {
    loadCapitalData.mockResolvedValue({ groups: [], items: [], events: [], latestQuotes: [], quoteHistory: [], valuations: [] });
    useCapitalStore.setState({ groups: [{ id: "group", name: "Portfolio" }] });
    await useCapitalStore.getState().deleteGroup("group");
    expect(deleteCapitalGroup).toHaveBeenCalledWith("group");
    expect(useCapitalStore.getState().groups).toEqual([]);
  });

  it("keeps capital usable and exposes retry state when quote refresh fails", async () => {
    loadMarketQuotes.mockRejectedValueOnce(new Error("offline"));
    useCapitalStore.setState({ items: [{ id: "btc", groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", symbol: "BTC" }] });
    await expect(useCapitalStore.getState().refreshQuotes()).resolves.toBeUndefined();
    expect(useCapitalStore.getState()).toMatchObject({ quotesLoading: false, quotesError: true, unavailableQuoteItemIds: ["btc"] });
  });

  it("marks a successful response as partial when an instrument has no quote", async () => {
    loadMarketQuotes.mockResolvedValueOnce([]);
    useCapitalStore.setState({ items: [{ id: "btc", groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", symbol: "BTC" }] });
    await useCapitalStore.getState().refreshQuotes();
    expect(useCapitalStore.getState().quotesPartial).toBe(true);
    expect(useCapitalStore.getState().unavailableQuoteItemIds).toEqual(["btc"]);
  });

  it("contains capital initialization failures instead of rejecting into the expense shell", async () => {
    loadCapitalData.mockRejectedValueOnce(new Error("capital offline"));
    await expect(useCapitalStore.getState().initialize()).resolves.toBeUndefined();
    expect(useCapitalStore.getState().loadState).toBe("error");
  });
});
