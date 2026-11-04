import { useEffect } from "react";
// Test boundary only: never load Cloudflare or permit a real authentication request.
export function PartnerTurnstile({ onToken }: { onToken: (value: string) => void }) {
  useEffect(() => {
    onToken("isolated-test-token");
  }, [onToken]);
  return <span data-fixture-security-check>Overenie v izolovanom teste</span>;
}
