import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { resetAuthenticatedStartup, startAuthenticatedStartup } from "./app/authenticatedStartup";
import { useAuthStore } from "./features/auth/authStore";
import "./app/styles.css";

let startupOwnerId: string | null = null;
useAuthStore.subscribe((state) => {
  const ownerId = state.session?.user.id ?? null;
  if (ownerId === startupOwnerId) return;
  startupOwnerId = ownerId;
  if (ownerId) startAuthenticatedStartup(ownerId);
  else resetAuthenticatedStartup();
});

void useAuthStore.getState().initialize().catch(() => undefined);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />,
);
