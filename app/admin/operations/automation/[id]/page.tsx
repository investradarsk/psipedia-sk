import { redirect } from "next/navigation";

// Legacy automation review screens were retired together with their write APIs.
// Historical records remain stored in D1 for audit and possible later export.
export default function RetiredLegacyAutomationReview() {
  redirect("/admin/automatizacie-gemini");
}
