import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadCapitalData, saveCapitalData, saveCapitalHistory, saveCapitalValuation, deleteCapitalGroup, deleteCapitalItem, deleteCapitalEvent, loadMarketHistory, loadMarketQuotes } = vi.hoisted(() => ({ loadCapitalData: vi.fn(), saveCapitalData: vi.fn(), saveCapitalHistory: vi.fn(), saveCapitalValuation: vi.fn(), deleteCapitalGroup: vi.fn(), deleteCapitalItem: vi.fn(), deleteCapitalEvent: vi.fn(), loadMarketHistory: vi.fn().mockResolvedValue([]), loadMarketQuotes: vi.fn() }));
vi.mock("./capitalRepository", () => ({ loadCapitalData, saveCapitalData, saveCapitalHistory, saveCapitalValuation, deleteCapitalGroup, deleteCapitalItem, deleteCapitalEvent }));
vi.mock("./marketRepository", () => ({ loadMarketHistory, loadMarketQuotes }));

import { useCapitalStore } from "./capitalStore";

describe("capital store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCapitalStore.setState({ ownerId: "user-a", groups: [], items: [], events: [], quotes: {}, quoteHistory: [], valuations: [], quotesLoading: false, unavailableQuoteItemIds: [], historyLoading: false, historyPending: false, loadState: "ready" });
  });

  it("saves an item and its opening event in one repository call", async () => {
    const item = await useCapitalStore.getState().saveOpeningPosition({ groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", manualPrice: "70000" }, "0.1", "5000", "2026-08-08T12:00:00.000Z");
    expect(saveCapitalData).toHaveBeenCalledOnce();
    expect(saveCapitalData).toHaveBeenCalledWith("user-a", { items: [item], events: [expect.objectContaining({ itemId: item.id, type: "buy", quantity: "0.1", amount: "5000" })] });
    expect(useCapitalStore.getState().events).toHaveLength(1);
  });

  it("physically deletes a group through the repository and reloads state", async () => {
    loadCapitalData.mockResolvedValue({ groups: [], items: [], events: [], latestQuotes: [], quoteHistory: [], valuations: [] });
    useCapitalStore.setState({ groups: [{ id: "group", name: "Portfolio" }] });
    await useCapitalStore.getState().deleteGroup("group");
    expect(deleteCapitalGroup).toHaveBeenCalledWith("user-a", "group");
    expect(useCapitalStore.getState().groups).toEqual([]);
  });

  it("keeps capital usable and marks missing quotes when refresh fails", async () => {
    loadMarketQuotes.mockRejectedValueOnce(new Error("offline"));
    useCapitalStore.setState({ items: [{ id: "btc", groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", symbol: "BTC" }] });
    await expect(useCapitalStore.getState().refreshQuotes()).resolves.toBeUndefined();
    expect(useCapitalStore.getState()).toMatchObject({ quotesLoading: false, unavailableQuoteItemIds: ["btc"] });
  });

  it("records unresolved instruments when a quote response omits them", async () => {
    loadMarketQuotes.mockResolvedValueOnce([]);
    useCapitalStore.setState({ items: [{ id: "btc", groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", symbol: "BTC" }] });
    await useCapitalStore.getState().refreshQuotes();
    expect(useCapitalStore.getState().unavailableQuoteItemIds).toEqual(["btc"]);
  });

  it("contains capital initialization failures instead of rejecting into the expense shell", async () => {
    loadCapitalData.mockRejectedValueOnce(new Error("capital offline"));
    await expect(useCapitalStore.getState().initialize("user-a")).resolves.toBeUndefined();
    expect(useCapitalStore.getState().loadState).toBe("error");
  });

  it("clears the previous owner's capital before loading another account", async () => {
    let resolveLoad!: (value: { groups: never[]; items: never[]; events: never[] }) => void;
    loadCapitalData.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }));
    useCapitalStore.setState({ ownerId: "user-a", groups: [{ id: "private-a", name: "Private A" }] });

    const loading = useCapitalStore.getState().initialize("user-b");
    expect(useCapitalStore.getState()).toMatchObject({ ownerId: "user-b", groups: [], loadState: "loading" });
    useCapitalStore.getState().reset();
    resolveLoad({ groups: [], items: [], events: [] });
    await loading;

    expect(useCapitalStore.getState()).toMatchObject({ ownerId: null, groups: [], loadState: "idle" });
  });

  it("rebuilds missing history after loading confirmed capital events", async () => {
    loadCapitalData.mockResolvedValueOnce({
      groups: [{ id: "group", name: "Portfolio" }],
      items: [{ id: "cash", groupId: "group", name: "Cash", type: "cash", quoteCurrency: "USD", manualPrice: "1" }],
      events: [{ id: "deposit", itemId: "cash", type: "deposit", status: "confirmed", occurredAt: "2026-01-01T10:00:00.000Z", amount: "100", currency: "USD", source: "manual" }],
      valuations: [], quoteHistory: [], latestQuotes: [],
    });

    await useCapitalStore.getState().initialize("user-a");
    await vi.waitFor(() => expect(saveCapitalHistory).toHaveBeenCalled());

    expect(saveCapitalHistory).toHaveBeenCalledWith("user-a", [], [{ date: "2026-01-01", totalUsd: "100" }]);
  });

  it("persists proportional cost basis when transferring a market asset", async () => {
    useCapitalStore.setState({
      items: [
        { id: "btc-a", groupId: "group", name: "BTC A", type: "crypto", quoteCurrency: "USD", symbol: "BTC" },
        { id: "btc-b", groupId: "group", name: "BTC B", type: "crypto", quoteCurrency: "USD", symbol: "BTC" },
      ],
      events: [{ id: "buy", itemId: "btc-a", type: "buy", status: "confirmed", occurredAt: "2026-01-01T12:00:00.000Z", quantity: "2", amount: "100", currency: "USD", source: "manual" }],
    });

    await useCapitalStore.getState().saveEvent({
      itemId: "btc-a", relatedItemId: "btc-b", type: "transfer", status: "confirmed",
      occurredAt: "2026-02-01T12:00:00.000Z", quantity: "0.5", currency: "USD", source: "manual",
    });

    expect(saveCapitalData).toHaveBeenLastCalledWith("user-a", { events: [expect.objectContaining({ quantity: "0.5", amount: "25", currency: "USD" })] });
  });

  it("persists same-day manual events in insertion order instead of id order", async () => {
    useCapitalStore.setState({
      items: [{ id: "btc", groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", symbol: "BTC" }],
    });

    await useCapitalStore.getState().saveEvent({
      id: "z-buy", itemId: "btc", type: "buy", status: "confirmed",
      occurredAt: "2026-08-08T15:00:00.000Z", quantity: "1", amount: "100", currency: "USD", source: "manual",
    });
    await useCapitalStore.getState().saveEvent({
      id: "a-sell", itemId: "btc", type: "sell", status: "confirmed",
      occurredAt: "2026-08-08T15:00:00.000Z", quantity: "1", amount: "120", currency: "USD", source: "manual",
    });

    const [buy, sale] = useCapitalStore.getState().events;
    expect(buy.occurredAt).toBe("2026-08-08T15:00:00.000Z");
    expect(sale.occurredAt).toBe("2026-08-08T15:00:00.001Z");
  });

  it("rejects a sale that exceeds the available position before persistence", async () => {
    useCapitalStore.setState({
      items: [{ id: "btc", groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", symbol: "BTC" }],
      events: [{ id: "buy", itemId: "btc", type: "buy", status: "confirmed", occurredAt: "2026-01-01T10:00:00.000Z", quantity: "1", amount: "100", currency: "USD", source: "manual" }],
    });

    await expect(useCapitalStore.getState().saveEvent({
      itemId: "btc", type: "sell", status: "confirmed", occurredAt: "2026-02-01",
      quantity: "2", amount: "250", currency: "USD", source: "manual",
    })).rejects.toThrow("capital_sell_exceeds_balance");
    expect(saveCapitalData).not.toHaveBeenCalled();
  });

  it("rejects a market withdrawal that exceeds the available position", async () => {
    useCapitalStore.setState({
      items: [{ id: "btc", groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", symbol: "BTC" }],
      events: [{ id: "buy", itemId: "btc", type: "buy", status: "confirmed", occurredAt: "2026-01-01T10:00:00.000Z", quantity: "1", amount: "100", currency: "USD", source: "manual" }],
    });

    await expect(useCapitalStore.getState().saveEvent({
      itemId: "btc", type: "withdrawal", status: "confirmed", occurredAt: "2026-02-01",
      quantity: "2", currency: "USD", source: "manual",
    })).rejects.toThrow("capital_withdrawal_exceeds_balance");
    expect(saveCapitalData).not.toHaveBeenCalled();
  });

  it("recalculates later transfer cost basis after editing an earlier purchase", async () => {
    useCapitalStore.setState({
      items: [
        { id: "btc-a", groupId: "group", name: "BTC A", type: "crypto", quoteCurrency: "USD", symbol: "BTC" },
        { id: "btc-b", groupId: "group", name: "BTC B", type: "crypto", quoteCurrency: "USD", symbol: "BTC" },
      ],
      events: [
        { id: "buy", itemId: "btc-a", type: "buy", status: "confirmed", occurredAt: "2026-01-01T10:00:00.000Z", quantity: "2", amount: "100", currency: "USD", source: "manual" },
        { id: "transfer", itemId: "btc-a", relatedItemId: "btc-b", type: "transfer", status: "confirmed", occurredAt: "2026-02-01T10:00:00.000Z", quantity: "1", amount: "50", currency: "USD", source: "manual" },
      ],
    });

    await useCapitalStore.getState().saveEvent({
      id: "buy", itemId: "btc-a", type: "buy", status: "confirmed", occurredAt: "2026-01-01",
      quantity: "2", amount: "200", currency: "USD", source: "manual",
    });

    expect(saveCapitalData).toHaveBeenCalledWith("user-a", { events: expect.arrayContaining([
      expect.objectContaining({ id: "buy", amount: "200" }),
      expect.objectContaining({ id: "transfer", amount: "100" }),
    ]) });
    expect(useCapitalStore.getState().events.find((event) => event.id === "transfer")?.amount).toBe("100");
  });

  it("recalculates transfers atomically when deleting an earlier event", async () => {
    useCapitalStore.setState({
      items: [
        { id: "btc-a", groupId: "group", name: "BTC A", type: "crypto", quoteCurrency: "USD", symbol: "BTC" },
        { id: "btc-b", groupId: "group", name: "BTC B", type: "crypto", quoteCurrency: "USD", symbol: "BTC" },
      ],
      events: [
        { id: "buy-one", itemId: "btc-a", type: "buy", status: "confirmed", occurredAt: "2026-01-01T10:00:00.000Z", quantity: "2", amount: "100", currency: "USD", source: "manual" },
        { id: "buy-two", itemId: "btc-a", type: "buy", status: "confirmed", occurredAt: "2026-01-02T10:00:00.000Z", quantity: "2", amount: "300", currency: "USD", source: "manual" },
        { id: "transfer", itemId: "btc-a", relatedItemId: "btc-b", type: "transfer", status: "confirmed", occurredAt: "2026-02-01T10:00:00.000Z", quantity: "1", amount: "100", currency: "USD", source: "manual" },
      ],
    });

    await useCapitalStore.getState().deleteEvent("buy-one");

    expect(deleteCapitalEvent).toHaveBeenCalledWith("user-a", "buy-one", [expect.objectContaining({ id: "transfer", amount: "150" })]);
    expect(useCapitalStore.getState().events.find((event) => event.id === "transfer")?.amount).toBe("150");
  });

  it("does not report a failed delete after the event was removed but history refresh failed", async () => {
    useCapitalStore.setState({
      items: [{ id: "cash", groupId: "group", name: "Cash", type: "cash", quoteCurrency: "USD", manualPrice: "1" }],
      events: [
        { id: "old", itemId: "cash", type: "deposit", status: "confirmed", occurredAt: "2026-01-01T10:00:00.000Z", amount: "10", currency: "USD", source: "manual" },
        { id: "kept", itemId: "cash", type: "deposit", status: "confirmed", occurredAt: "2026-02-01T10:00:00.000Z", amount: "20", currency: "USD", source: "manual" },
      ],
    });
    saveCapitalHistory.mockRejectedValueOnce(new Error("offline"));

    await expect(useCapitalStore.getState().deleteEvent("old")).resolves.toBeUndefined();
    expect(deleteCapitalEvent).toHaveBeenCalledWith("user-a", "old", []);
    expect(useCapitalStore.getState().events.map((event) => event.id)).toEqual(["kept"]);
  });

  it("does not reinvest manual interest that is credited to another item", async () => {
    useCapitalStore.setState({
      items: [
        { id: "deposit", groupId: "group", name: "Deposit", type: "deposit", quoteCurrency: "USD", manualPrice: "1" },
        { id: "cash", groupId: "group", name: "Cash", type: "cash", quoteCurrency: "USD", manualPrice: "1" },
      ],
    });

    await useCapitalStore.getState().saveEvent({
      itemId: "deposit", relatedItemId: "cash", type: "interest", status: "confirmed", occurredAt: "2026-02-01",
      amount: "10", currency: "USD", source: "manual", reinvest: true,
    });

    expect(saveCapitalData).toHaveBeenCalledWith("user-a", { events: [expect.objectContaining({ reinvest: false })] });
  });

  it("rejects an edit that would make a later sale exceed the position", async () => {
    useCapitalStore.setState({
      items: [{ id: "btc", groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", symbol: "BTC" }],
      events: [
        { id: "buy", itemId: "btc", type: "buy", status: "confirmed", occurredAt: "2026-01-01T10:00:00.000Z", quantity: "2", amount: "200", currency: "USD", source: "manual" },
        { id: "sell", itemId: "btc", type: "sell", status: "confirmed", occurredAt: "2026-02-01T10:00:00.000Z", quantity: "1.5", amount: "180", currency: "USD", source: "manual" },
      ],
    });

    await expect(useCapitalStore.getState().saveEvent({
      id: "buy", itemId: "btc", type: "buy", status: "confirmed", occurredAt: "2026-01-01",
      quantity: "1", amount: "100", currency: "USD", source: "manual",
    })).rejects.toThrow("capital_sell_exceeds_balance");
    expect(saveCapitalData).not.toHaveBeenCalled();
  });

  it("preserves an event time while editing it on the same date", async () => {
    useCapitalStore.setState({
      items: [{ id: "btc", groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", symbol: "BTC" }],
      events: [{ id: "buy", itemId: "btc", type: "buy", status: "confirmed", occurredAt: "2026-01-01T09:17:31.555Z", quantity: "1", amount: "100", currency: "USD", source: "manual" }],
    });

    await useCapitalStore.getState().saveEvent({
      id: "buy", itemId: "btc", type: "buy", status: "confirmed", occurredAt: "2026-01-01",
      quantity: "2", amount: "200", currency: "USD", source: "manual",
    });

    expect(useCapitalStore.getState().events[0].occurredAt).toBe("2026-01-01T09:17:31.555Z");
  });

  it("creates the next due interest event after the current one is ignored", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
    useCapitalStore.setState({
      items: [{
        id: "deposit", groupId: "group", name: "Deposit", type: "deposit", quoteCurrency: "USD", manualPrice: "1",
        annualInterestRate: "0.12", interestCadence: "monthly", interestEffectiveFrom: "2026-01-01", interestCompounding: true,
      }],
      events: [
        { id: "opening", itemId: "deposit", type: "deposit", status: "confirmed", occurredAt: "2026-01-01T09:00:00.000Z", amount: "1000", currency: "USD", source: "manual" },
        { id: "february", itemId: "deposit", type: "interest", status: "expected", occurredAt: "2026-02-01T00:00:00.000Z", amount: "10", currency: "USD", source: "automatic", externalProvider: "finanko_interest", externalId: "deposit:2026-02-01" },
      ],
    });

    try {
      await useCapitalStore.getState().setEventStatus("february", "ignored");
      await vi.waitFor(() => expect(useCapitalStore.getState().events.some((event) => event.externalId === "deposit:2026-03-01")).toBe(true));

      expect(saveCapitalData).toHaveBeenCalledWith("user-a", { events: [expect.objectContaining({ id: "february", status: "ignored" })] });
      expect(saveCapitalData).toHaveBeenCalledWith("user-a", { events: [expect.objectContaining({ externalId: "deposit:2026-03-01", status: "expected" })] });
      expect(useCapitalStore.getState().events.filter((event) => event.externalId === "deposit:2026-03-01")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves transfers between money items with different currencies", async () => {
    useCapitalStore.setState({
      items: [
        { id: "usd", groupId: "group", name: "USD", type: "cash", quoteCurrency: "USD" },
        { id: "rub", groupId: "group", name: "RUB", type: "cash", quoteCurrency: "RUB" },
      ],
      events: [{ id: "deposit", itemId: "usd", type: "deposit", status: "confirmed", occurredAt: "2026-01-01T10:00:00.000Z", amount: "100", currency: "USD", source: "manual" }],
    });

    await useCapitalStore.getState().saveEvent({
      itemId: "usd", relatedItemId: "rub", type: "transfer", status: "confirmed",
      occurredAt: "2026-02-01", amount: "10", currency: "USD", source: "manual",
    });
    expect(saveCapitalData).toHaveBeenCalledWith("user-a", { events: [expect.objectContaining({ itemId: "usd", relatedItemId: "rub", amount: "10", currency: "USD" })] });
  });

  it("rejects a money transfer amount expressed in another currency", async () => {
    useCapitalStore.setState({
      items: [
        { id: "usd-a", groupId: "group", name: "USD A", type: "cash", quoteCurrency: "USD" },
        { id: "usd-b", groupId: "group", name: "USD B", type: "cash", quoteCurrency: "USD" },
      ],
      events: [{ id: "deposit", itemId: "usd-a", type: "deposit", status: "confirmed", occurredAt: "2026-01-01T10:00:00.000Z", amount: "100", currency: "USD", source: "manual" }],
    });

    await expect(useCapitalStore.getState().saveEvent({
      itemId: "usd-a", relatedItemId: "usd-b", type: "transfer", status: "confirmed",
      occurredAt: "2026-02-01", amount: "10", currency: "RUB", source: "manual",
    })).rejects.toThrow("capital_transfer_destination_invalid");
    expect(saveCapitalData).not.toHaveBeenCalled();
  });
});
