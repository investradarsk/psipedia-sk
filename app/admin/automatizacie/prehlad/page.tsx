import { redirect } from "next/navigation";

// Compatibility redirect: the legacy Tavily automation UI was retired.
// Only Gemini and the new data-quality workflow remain in the admin.
export default function RetiredLegacyAutomationPage() {
  redirect("/admin/automatizacie-gemini");
}
