import "@ant-design/v5-patch-for-react-19";
import ConfigProvider from "antd/es/config-provider";
import darkAlgorithm from "antd/es/theme/themes/dark";
import type { PropsWithChildren } from "react";

const appFontFamily =
  'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function AppThemeProvider({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      theme={{
        algorithm: darkAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          colorInfo: "#1677ff",
          colorSuccess: "#52c41a",
          colorError: "#ff4d4f",
          colorWarning: "#faad14",
          colorBgBase: "#111213",
          colorBgContainer: "#191a1c",
          colorBgElevated: "#202225",
          colorBorder: "#292b2f",
          colorBorderSecondary: "#292b2f",
          colorText: "rgba(255, 255, 255, 0.92)",
          colorTextSecondary: "rgba(255, 255, 255, 0.72)",
          colorTextTertiary: "rgba(255, 255, 255, 0.52)",
          borderRadius: 6,
          borderRadiusLG: 8,
          controlHeight: 40,
          controlHeightSM: 32,
          boxShadowSecondary: "0 8px 24px rgba(0, 0, 0, 0.35)",
          fontFamily: appFontFamily,
        },
        components: {
          Input: {
            activeShadow: "0 0 0 2px rgba(22, 119, 255, 0.10)",
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
