import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/lost-found-dogs-schema.ts"],
  dialect: "sqlite",
});
