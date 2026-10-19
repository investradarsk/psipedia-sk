import { notFound } from "next/navigation";
import { AdminEventEditor } from "@/components/admin-event-editor";

// Development-only visual acceptance fixture. Never queries or writes live data.
// API writes during E2E must be explicitly mocked in Playwright.
export default function EventEditorV3PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main style={{ maxWidth: 1440, margin: "0 auto", padding: "0.5rem" }}>
      <AdminEventEditor />
    </main>
  );
}
