import { defineConfig } from "vite";
import path from "node:path";

// Standalone real-React component harness; next/link and navigation are inert.
// It never starts the application's Cloudflare/D1 runtime.
export default defineConfig({
  root: process.cwd(),
  resolve: { alias: [{ find: /^@\//, replacement: path.resolve(process.cwd()) + "/" }] },
  plugins: [{
    name: "isolated-next-router-stubs",
    enforce: "pre",
    resolveId(source) {
      if (source === "next/link") return "\0fixture-next-link";
      if (source === "next/navigation") return "\0fixture-next-navigation";
    },
    load(id) {
      if (id === "\0fixture-next-link") return 'import { jsx } from "react/jsx-runtime"; export default function Link({href,...props}){ return jsx("a",{...props,href}); }';
      if (id === "\0fixture-next-navigation") return 'export function useRouter(){ return {refresh(){ /* fixture keeps props stable */ }}; } export function useSearchParams(){ return new URLSearchParams(window.location.search); }';
    },
  }],
  server: { host: "127.0.0.1", port: 5175, strictPort: true },
});
