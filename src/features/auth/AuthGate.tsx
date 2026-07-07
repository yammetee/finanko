import { Button, Card, Space, Spin, Typography } from "antd";
import { LogIn } from "lucide-react";
import { useEffect } from "react";
import { useI18n } from "../../shared/i18n/i18nContext";
import { isSupabaseConfigured } from "../../shared/api/supabase";
import { useAuthStore } from "./authStore";

const { Text, Title } = Typography;

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { initialize, signInDemo, signInWithGoogle, loading, user } = useAuthStore();
  const { t } = useI18n();
  const currentUser = user();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) {
    return (
      <div className="auth-screen">
        <Spin />
      </div>
    );
  }

  if (currentUser) {
    return children;
  }

  return (
    <div className="auth-screen">
      <Card className="auth-card">
        <Space direction="vertical" size={18} style={{ width: "100%" }}>
          <div>
            <span className="brand-mark">F</span>
            <Title level={2} style={{ marginTop: 18, marginBottom: 6 }}>
              Finanko
            </Title>
            <Text className="muted">
              {t("auth.description")}
            </Text>
          </div>
          <Button
            type="primary"
            size="large"
            block
            icon={<LogIn size={18} />}
            disabled={!isSupabaseConfigured}
            onClick={signInWithGoogle}
          >
            {t("actions.continueGoogle")}
          </Button>
          {!isSupabaseConfigured ? (
            <Button size="large" block onClick={signInDemo}>
              {t("actions.continueDemo")}
            </Button>
          ) : null}
          {!isSupabaseConfigured ? (
            <Text className="muted">
              {t("auth.envHint")}
            </Text>
          ) : null}
        </Space>
      </Card>
    </div>
  );
}
