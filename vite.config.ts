import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { handler as aiHandler } from "./api/ai";
import { handler as marketHandler } from "./api/market";

function localApiPlugin(): Plugin {
  return {
    name: "finanko-local-api",
    configureServer(server) {
      const register = (path: string, handler: typeof aiHandler | typeof marketHandler) => server.middlewares.use(path, async (request, response) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const rawBody = Buffer.concat(chunks).toString("utf8");
          const authorization = Array.isArray(request.headers.authorization)
            ? request.headers.authorization[0]
            : request.headers.authorization;
          let statusCode = 200;
          const adapter = {
            status(code: number) { statusCode = code; return adapter; },
            json(payload: unknown) {
              response.statusCode = statusCode;
              response.setHeader("content-type", "application/json");
              response.end(JSON.stringify(payload));
            },
            setHeader(name: string, value: string) { response.setHeader(name, value); },
            end() { response.statusCode = statusCode; response.end(); },
          };
          await handler({
            method: request.method,
            headers: { authorization },
            body: rawBody ? JSON.parse(rawBody) : undefined,
          }, adapter);
        } catch (error) {
          server.config.logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
          if (!response.headersSent) {
            response.statusCode = 500;
            response.setHeader("content-type", "application/json");
          }
          if (!response.writableEnded) response.end(JSON.stringify({ error: "Local API handler failed" }));
        }
      });
      register("/api/ai", aiHandler);
      register("/api/market", marketHandler);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "OPENAI_RECEIPT_MODEL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].forEach((key) => {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  });

  return {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    plugins: [react(), localApiPlugin()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("lucide-react") || id.includes("recharts") || id.includes("react-is")) return "visuals";
          },
        },
      },
    },
  };
});
