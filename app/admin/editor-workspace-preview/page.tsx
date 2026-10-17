import { notFound } from "next/navigation";
import { AdminEditorWorkspaceDemo } from "@/components/admin-editor-workspace-demo";

export const dynamic = "force-dynamic";

// A development-only playground; unavailable in production and preview builds.
export default function EditorWorkspacePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main id="obsah"><AdminEditorWorkspaceDemo /></main>;
}
