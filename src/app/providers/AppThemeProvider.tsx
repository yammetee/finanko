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
          colorPrimary: "#1677ff",
          colorInfo: "#1677ff",
          colorSuccess: "#52c41a",
          colorError: "#ff4d4f",
          colorWarning: "#faad14",
          colorBgBase: "#141414",
          colorBgContainer: "#1f1f1f",
          colorBgElevated: "#262626",
          colorBorder: "#303030",
          colorBorderSecondary: "#303030",
          colorText: "rgba(255, 255, 255, 0.88)",
          colorTextSecondary: "rgba(255, 255, 255, 0.65)",
          colorTextTertiary: "rgba(255, 255, 255, 0.45)",
          borderRadius: 6,
          borderRadiusLG: 8,
          controlHeight: 40,
          controlHeightSM: 32,
          boxShadowSecondary: "0 8px 24px rgba(0, 0, 0, 0.35)",
          fontFamily: appFontFamily,
        },
        components: {
          Button: {
            primaryShadow: "none",
            dangerShadow: "none",
            fontWeight: 550,
          },
          Input: {
            activeShadow: "0 0 0 2px rgba(22, 119, 255, 0.10)",
          },
          Select: {
            optionSelectedBg: "rgba(22, 119, 255, 0.16)",
          },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
