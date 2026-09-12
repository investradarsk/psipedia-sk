import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/foundation-schema.ts"],
  dialect: "sqlite",
});
