import { useCallback, useEffect, useRef, useState } from "react";
import { loadFinancialSummary, type FinancialSummary } from "./financialSummaryRepository";

const emptySummary = (): FinancialSummary => ({ debtTotals: {} });

export function useFinancialSummary(ownerId?: string) {
  const requestVersion = useRef(0);
  const capitalOverride = useRef<string | undefined>(undefined);
  const [summary, setSummary] = useState<FinancialSummary>(emptySummary);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!ownerId) return;
    const version = ++requestVersion.current;
    try {
      const next = await loadFinancialSummary(ownerId);
      if (version === requestVersion.current) {
        setSummary(capitalOverride.current === undefined ? next : { ...next, capitalTotalUsd: capitalOverride.current });
        setLoaded(true);
      }
    } catch {
      if (version === requestVersion.current) { setSummary(emptySummary()); setLoaded(false); }
    }
  }, [ownerId]);
  const updateCapitalTotal = useCallback((capitalTotalUsd: string) => {
    capitalOverride.current = capitalTotalUsd;
    setSummary((current) => ({ ...current, capitalTotalUsd }));
  }, []);

  useEffect(() => {
    requestVersion.current += 1;
    capitalOverride.current = undefined;
    setSummary(emptySummary());
    setLoaded(false);
    if (ownerId) void refresh();
    return () => { requestVersion.current += 1; };
  }, [ownerId, refresh]);

  return { summary, loaded, refresh, updateCapitalTotal };
}
