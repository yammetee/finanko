import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveCapitalData, saveCapitalHistory, saveCapitalValuation, loadMarketHistory } = vi.hoisted(() => ({ saveCapitalData: vi.fn(), saveCapitalHistory: vi.fn(), saveCapitalValuation: vi.fn(), loadMarketHistory: vi.fn().mockResolvedValue([]) }));
vi.mock("./capitalRepository", () => ({ loadCapitalData: vi.fn(), saveCapitalData, saveCapitalHistory, saveCapitalValuation }));
vi.mock("./marketRepository", () => ({ loadMarketHistory, loadMarketQuotes: vi.fn() }));

import { useCapitalStore } from "./capitalStore";

describe("capital store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCapitalStore.setState({ groups: [], items: [], events: [], quotes: {}, quoteHistory: [], valuations: [], historyLoading: false, historyPending: false, loadState: "ready" });
  });

  it("saves an item and its opening event in one repository call", async () => {
    const item = await useCapitalStore.getState().saveOpeningPosition({ groupId: "group", name: "Bitcoin", type: "crypto", quoteCurrency: "USD", manualPrice: "70000" }, "0.1", "5000", "2026-08-08T12:00:00.000Z");
    expect(saveCapitalData).toHaveBeenCalledOnce();
    expect(saveCapitalData).toHaveBeenCalledWith({ items: [item], events: [expect.objectContaining({ itemId: item.id, type: "buy", quantity: "0.1", amount: "5000" })] });
    expect(useCapitalStore.getState().events).toHaveLength(1);
  });

  it("restores only items archived together with their group", async () => {
    useCapitalStore.setState({ groups: [{ id: "group", name: "Portfolio", archivedAt: "same" }], items: [{ id: "together", groupId: "group", name: "A", type: "stock", quoteCurrency: "USD", archivedAt: "same" }, { id: "separate", groupId: "group", name: "B", type: "stock", quoteCurrency: "USD", archivedAt: "earlier" }] });
    await useCapitalStore.getState().archiveGroup("group");
    expect(useCapitalStore.getState().items.find((item) => item.id === "together")?.archivedAt).toBeUndefined();
    expect(useCapitalStore.getState().items.find((item) => item.id === "separate")?.archivedAt).toBe("earlier");
  });
});
