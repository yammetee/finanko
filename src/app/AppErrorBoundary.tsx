/* eslint-disable react-refresh/only-export-components -- React error boundaries require a class component. */
import { Component, type ReactNode } from "react";
import { useI18n } from "../shared/i18n/i18nContext";

function AppErrorFallback() {
  const { t } = useI18n();
  return (
    <main className="auth-screen">
      <section className="feature-page-state" role="alert">
        <p>{t("feedback.sectionLoadFailed")}</p>
        <button type="button" onClick={() => window.location.reload()}>{t("actions.retry")}</button>
      </section>
    </main>
  );
}

interface Props { children: ReactNode }
interface State { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <AppErrorFallback /> : this.props.children;
  }
}
