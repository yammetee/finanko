import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { handler as aiHandler } from "./api/ai";
import { handler as marketHandler } from "./api/market";

function localApiPlugin(): Plugin {
  return {
    name: "evenkvit-local-api",
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

function inlineEntryCssPlugin(): Plugin {
  return {
    name: "evenkvit-inline-entry-css",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((output) => output.type === "asset" && output.fileName === "index.html");
      if (!html || html.type !== "asset") return;
      let source = String(html.source);
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "asset" || !fileName.endsWith(".css")) continue;
        const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const stylesheet = new RegExp(`<link rel="stylesheet"[^>]*href="/${escapedFileName}"[^>]*>`);
        if (!stylesheet.test(source)) continue;
        source = source.replace(stylesheet, `<style>${String(output.source)}</style>`);
        delete bundle[fileName];
      }
      html.source = source;
    },
  };
}

function apiPreconnectPlugin(apiUrl?: string): Plugin {
  return {
    name: "evenkvit-api-preconnect",
    transformIndexHtml(html) {
      if (!apiUrl) return html;
      const origin = new URL(apiUrl).origin;
      return {
        html,
        tags: [{ tag: "link", attrs: { rel: "preconnect", href: origin, crossorigin: "" }, injectTo: "head" }],
      };
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
    plugins: [react(), localApiPlugin(), apiPreconnectPlugin(env.NEXT_PUBLIC_SUPABASE_URL), inlineEntryCssPlugin()],
    build: {
      minify: "esbuild",
      sourcemap: true,
      target: "es2022",
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("lucide-react")) return "icons";
          },
        },
      },
    },
  };
});
