import { useCallback, useEffect, useMemo, useRef } from "react";
import type { DisplayCurrency } from "../../shared/ui/CurrencySwitcher";
import { FeaturePageState } from "../../shared/ui/FeaturePageState";
import { CapitalPage } from "./CapitalPage";
import { useCapitalStore } from "./capitalStore";

interface Props {
  userId: string;
  ratesVersion: number;
  debtTotalUsd?: number;
  currencyMode: DisplayCurrency;
  onCurrencyChange: (value: DisplayCurrency) => void;
  onCapitalTotalChanged: (value: string) => void;
}

export function CapitalRoute(props: Props) {
  const { userId, onCapitalTotalChanged } = props;
  const ownerId = useCapitalStore((state) => state.ownerId);
  const loadState = useCapitalStore((state) => state.loadState);
  const items = useCapitalStore((state) => state.items);
  const initialize = useCapitalStore((state) => state.initialize);
  const refreshQuotes = useCapitalStore((state) => state.refreshQuotes);
  const refreshAttemptedKey = useRef<string | null>(null);
  const marketItemKey = useMemo(() => items
    .filter((item) => item.symbol && (item.type === "stock" || item.type === "fund" || item.type === "crypto"))
    .map((item) => `${item.id}:${item.symbol}:${item.primaryProvider ?? ""}:${item.primaryAssetId ?? ""}`)
    .sort()
    .join(":"), [items]);
  const refreshKey = `${userId}:${marketItemKey}`;
  const refreshCurrentQuotes = useCallback(() => {
    if (ownerId !== userId || loadState !== "ready" || !marketItemKey) return;
    void refreshQuotes();
  }, [loadState, marketItemKey, ownerId, refreshQuotes, userId]);

  useEffect(() => {
    if (ownerId !== userId || loadState === "idle") void initialize(userId);
  }, [initialize, loadState, ownerId, userId]);

  useEffect(() => {
    if (ownerId !== userId || loadState !== "ready" || !marketItemKey || refreshAttemptedKey.current === refreshKey) return;
    refreshAttemptedKey.current = refreshKey;
    refreshCurrentQuotes();
  }, [loadState, marketItemKey, ownerId, refreshCurrentQuotes, refreshKey, userId]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshCurrentQuotes();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [refreshCurrentQuotes]);

  if (ownerId !== userId || loadState === "idle" || loadState === "loading") return <FeaturePageState />;
  if (loadState === "error") return <FeaturePageState error onRetry={() => void initialize(userId)} />;
  return <CapitalPage ratesVersion={props.ratesVersion} debtTotalUsd={props.debtTotalUsd} currencyMode={props.currencyMode} onCurrencyChange={props.onCurrencyChange} onCapitalTotalChanged={onCapitalTotalChanged} />;
}
