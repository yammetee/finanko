import AntApp from "antd/es/app";
import ConfigProvider from "antd/es/config-provider";
import theme from "antd/es/theme";
import type { PropsWithChildren } from "react";

const appFontFamily =
  'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function AppThemeProvider({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#a1dccb",
          colorInfo: "#a1dccb",
          colorSuccess: "#a1dccb",
          colorError: "#ff8c88",
          colorWarning: "#e2bd71",
          colorBgBase: "#080a0a",
          colorBgContainer: "#111413",
          colorBgElevated: "#171b19",
          colorBorder: "rgba(255, 255, 255, 0.10)",
          colorBorderSecondary: "rgba(255, 255, 255, 0.07)",
          colorText: "#f5f7f6",
          colorTextSecondary: "#bac1be",
          colorTextTertiary: "#929b97",
          borderRadius: 10,
          borderRadiusLG: 12,
          controlHeight: 44,
          controlHeightSM: 36,
          boxShadowSecondary: "0 20px 60px rgba(0, 0, 0, 0.32)",
          fontFamily: appFontFamily,
        },
        components: {
          Button: {
            primaryShadow: "none",
            dangerShadow: "none",
            fontWeight: 550,
          },
          Input: {
            activeShadow: "0 0 0 2px rgba(161, 220, 203, 0.10)",
          },
          Select: {
            optionSelectedBg: "rgba(161, 220, 203, 0.13)",
          },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
