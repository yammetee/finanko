import { useI18n } from "../i18n/i18nContext";

export function FeaturePageState({ error = false, onRetry }: { error?: boolean; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <section className="feature-page-state" aria-live="polite">
      {error ? (
        <>
          <p>{t("feedback.sectionLoadFailed")}</p>
          {onRetry ? <button type="button" onClick={onRetry}>{t("actions.retry")}</button> : null}
        </>
      ) : <div className="auth-loader" aria-label={t("feedback.loading")} />}
    </section>
  );
}
