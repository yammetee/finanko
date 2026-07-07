import { App as AntApp, ConfigProvider, theme } from "antd";
import type { PropsWithChildren } from "react";

export function AppThemeProvider({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#6fbfe6",
          colorBgBase: "#080a0d",
          colorBgContainer: "#101418",
          colorBorder: "#1d2836",
          borderRadius: 8,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        components: {
          Card: {
            colorBgContainer: "#101418",
            headerBg: "#101418",
          },
          Layout: {
            bodyBg: "#080a0d",
            siderBg: "#0b0f14",
          },
          Menu: {
            itemSelectedBg: "#10273a",
            itemSelectedColor: "#d8f2ff",
            itemHoverBg: "#101923",
          },
          Segmented: {
            itemSelectedBg: "#18334a",
          },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
