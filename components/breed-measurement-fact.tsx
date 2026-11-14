import { breedComparisonValue } from "@/lib/breed-comparison-values";

type BreedMeasurementKind = "weight" | "lifespan";

/** Reuse the comparison's human-readable measurement/explanation contract on breed profiles. */
export function BreedMeasurementFact({
  kind,
  value,
}: {
  kind: BreedMeasurementKind;
  value: string;
}) {
  const display = breedComparisonValue(value, kind);
  return (
    <span data-breed-measurement-fact={kind}>
      <span>{display.summary}</span>
      {display.explanation ? (
        <details>
          <summary>Zobraziť celú poznámku</summary>
          <span style={{ display: "block", marginTop: 6, fontWeight: 400, overflowWrap: "anywhere", whiteSpace: "normal" }}>
            {display.explanation}
          </span>
        </details>
      ) : null}
    </span>
  );
}
