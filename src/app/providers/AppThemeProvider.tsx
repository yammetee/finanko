import AntApp from "antd/es/app";
import ConfigProvider from "antd/es/config-provider";
import theme from "antd/es/theme";
import type { PropsWithChildren } from "react";

const appFontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function AppThemeProvider({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#38b6f0",
          colorInfo: "#38b6f0",
          colorSuccess: "#48dc88",
          colorError: "#ff7180",
          colorWarning: "#f4bd45",
          colorBgBase: "#04080c",
          colorBgContainer: "#0b141c",
          colorBgElevated: "#101e29",
          colorBorder: "#1c3443",
          colorBorderSecondary: "#162a37",
          colorText: "#eef7fb",
          colorTextSecondary: "#b4c4ce",
          colorTextTertiary: "#8195a2",
          borderRadius: 10,
          borderRadiusLG: 12,
          controlHeight: 36,
          controlHeightSM: 30,
          boxShadowSecondary: "0 18px 48px rgba(0, 0, 0, 0.38)",
          fontFamily: appFontFamily,
        },
        components: {
          Button: {
            primaryShadow: "none",
            dangerShadow: "none",
            fontWeight: 550,
          },
          Card: {
            colorBgContainer: "#0b141c",
            headerBg: "#0b141c",
            headerFontSize: 15,
          },
          Drawer: {
            colorBgElevated: "#0e1b26",
          },
          Input: {
            activeShadow: "0 0 0 2px rgba(56, 182, 240, 0.12)",
          },
          Layout: {
            bodyBg: "#04080c",
            siderBg: "#081119",
          },
          Menu: {
            itemSelectedBg: "#103b52",
            itemSelectedColor: "#f2fbff",
            itemHoverBg: "#102633",
            itemBorderRadius: 8,
          },
          Segmented: {
            trackBg: "#081119",
            itemSelectedBg: "#10405a",
            itemHoverBg: "#102b3b",
          },
          Table: {
            headerBg: "#0f1b25",
            rowHoverBg: "#0e1d27",
          },
          Select: {
            optionSelectedBg: "#103b52",
          },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
