/** Display only measurements present in the source; keep its original explanation available. */
export function breedComparisonValue(value: string, kind?: "weight" | "lifespan") {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return { summary: "Neuvedené", explanation: "" };
  if (text.length <= 70) return { summary: text, explanation: "" };
  if (kind === "weight" && /(?:štandard|FCI).{0,60}neurčuje/iu.test(text)) {
    return { summary: "Hmotnosť nie je v štandarde určená", explanation: text };
  }
  if (kind) {
    const unit = kind === "weight" ? "kg" : "(?:rokov|roky|roka|rok)";
    const measured = new RegExp(
      `\\d+(?:[.,]\\d+)?(?:\\s*(?:[–—-]|až)\\s*\\d+(?:[.,]\\d+)?)?\\s*${unit}(?![\\p{L}])`,
      "giu",
    );
    const values = [...text.matchAll(measured)].map((match) => match[0]);
    if (values.length) {
      const approximate = /orientač|približ|zvyčajne/iu.test(text) ? "Orientačne " : "";
      return { summary: approximate + [...new Set(values)].join(" / "), explanation: text };
    }
  }
  // Do not cut prose mid-word, nor fabricate a measurement when none was supplied.
  return { summary: "Pozrieť podrobnosti", explanation: text };
}
