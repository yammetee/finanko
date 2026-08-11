import { useEffect } from "react";
import type { DisplayCurrency } from "../../shared/ui/CurrencySwitcher";
import { FeaturePageState } from "../../shared/ui/FeaturePageState";
import { DebtPage } from "./DebtPage";
import { useDebtStore } from "./debtStore";

interface Props {
  userId: string;
  ratesVersion: number;
  currencyMode: DisplayCurrency;
  onCurrencyChange: (value: DisplayCurrency) => void;
  onSummaryChanged: () => Promise<void>;
}

export function DebtRoute(props: Props) {
  const ownerId = useDebtStore((state) => state.ownerId);
  const loadState = useDebtStore((state) => state.loadState);
  const initialize = useDebtStore((state) => state.initialize);

  useEffect(() => {
    void initialize(props.userId);
  }, [initialize, props.userId]);

  if (ownerId !== props.userId || loadState === "idle" || loadState === "loading") return <FeaturePageState />;
  if (loadState === "error") return <FeaturePageState error onRetry={() => void initialize(props.userId)} />;
  return <DebtPage ratesVersion={props.ratesVersion} currencyMode={props.currencyMode} onCurrencyChange={props.onCurrencyChange} onDataChanged={props.onSummaryChanged} />;
}
