import { describe, expect, it } from "vitest";
import { getCapitalEventTypes } from "./capitalEventRules";

describe("capital event rules", () => {
  it("offers only meaningful operations for money, securities, and crypto", () => {
    expect(getCapitalEventTypes("cash")).toEqual(["deposit", "withdrawal", "transfer", "interest", "fee", "tax", "adjustment"]);
    expect(getCapitalEventTypes("stock")).toContain("dividend");
    expect(getCapitalEventTypes("stock")).not.toContain("staking");
    expect(getCapitalEventTypes("crypto")).toContain("staking");
    expect(getCapitalEventTypes("crypto")).not.toContain("dividend");
  });
});
