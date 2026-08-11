import { useEffect } from "react";
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
  const initialize = useCapitalStore((state) => state.initialize);

  useEffect(() => {
    void initialize(userId);
  }, [initialize, userId]);

  if (ownerId !== userId || loadState === "idle" || loadState === "loading") return <FeaturePageState />;
  if (loadState === "error") return <FeaturePageState error onRetry={() => void initialize(userId)} />;
  return <CapitalPage ratesVersion={props.ratesVersion} debtTotalUsd={props.debtTotalUsd} currencyMode={props.currencyMode} onCurrencyChange={props.onCurrencyChange} onCapitalTotalChanged={onCapitalTotalChanged} />;
}
