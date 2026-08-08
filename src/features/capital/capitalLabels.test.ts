import { describe, expect, it } from "vitest";
import { getCapitalCadenceLabel, getCapitalEventLabel, getCapitalItemLabel } from "./capitalLabels";

describe("capital display labels", () => {
  it("keeps stored values independent from localized labels", () => {
    expect(getCapitalEventLabel("withdrawal", "ru")).toBe("Вывод");
    expect(getCapitalItemLabel("deposit", "ru")).toBe("Вклад");
    expect(getCapitalCadenceLabel("quarterly", "en")).toBe("Quarterly");
  });
});
