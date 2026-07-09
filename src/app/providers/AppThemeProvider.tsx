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
          colorPrimary: "#4fb6e8",
          colorInfo: "#4fb6e8",
          colorSuccess: "#5fd38a",
          colorError: "#f07f86",
          colorWarning: "#e8b94c",
          colorBgBase: "#070d12",
          colorBgContainer: "#101820",
          colorBgElevated: "#142230",
          colorBorder: "#233747",
          colorText: "#edf4f8",
          colorTextSecondary: "#b7c4ce",
          colorTextTertiary: "#91a2af",
          borderRadius: 8,
          fontFamily: appFontFamily,
        },
        components: {
          Card: {
            colorBgContainer: "#101820",
            headerBg: "#101820",
          },
          Layout: {
            bodyBg: "#070d12",
            siderBg: "#0b151e",
          },
          Menu: {
            itemSelectedBg: "#0d3850",
            itemSelectedColor: "#f0f9ff",
            itemHoverBg: "#112838",
          },
          Segmented: {
            itemSelectedBg: "#123b55",
          },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
