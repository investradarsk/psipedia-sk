import { permanentRedirect } from "next/navigation";

export default function LegacyNewsLandingPage() {
  permanentRedirect("/clanky");
}
