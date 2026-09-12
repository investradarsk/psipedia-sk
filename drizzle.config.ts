import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/adoption-schema.ts"],
  dialect: "sqlite",
});
