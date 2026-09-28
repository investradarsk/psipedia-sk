"use client";

import { useMemo, useState } from "react";

const pace = { small: 4, medium: 5, large: 6, giant: 7 } as const;

export function DogAgeCalculator() {
  const [age, setAge] = useState(4);
  const [size, setSize] = useState<keyof typeof pace>("large");

  const humanAge = useMemo(() => {
    if (age <= 1) return Math.round(age * 15);
    if (age <= 2) return Math.round(15 + (age - 1) * 9);
    return Math.round(24 + (age - 2) * pace[size]);
  }, [age, size]);

  return (
    <div className="age-calculator">
      <div className="calculator-controls">
        <label>
          Vek psa
          <span><b>{age}</b> {age === 1 ? "rok" : age > 1 && age < 5 ? "roky" : "rokov"}</span>
          <input
            type="range"
            min="0.5"
            max="18"
            step="0.5"
            value={age}
            onChange={(event) => setAge(Number(event.target.value))}
            aria-label="Vek psa v rokoch"
          />
        </label>
        <label>
          Veľkosť v dospelosti
          <select value={size} onChange={(event) => setSize(event.target.value as keyof typeof pace)}>
            <option value="small">Malý – do 10 kg</option>
            <option value="medium">Stredný – 10 až 25 kg</option>
            <option value="large">Veľký – 25 až 40 kg</option>
            <option value="giant">Obrí – nad 40 kg</option>
          </select>
        </label>
      </div>
      <div className="calculator-result" aria-live="polite">
        <span>Približne</span>
        <strong>{humanAge}</strong>
        <span>ľudských rokov</span>
      </div>
      <p>Orientačný prepočet. Starnutie ovplyvňuje plemeno, veľkosť, kondícia aj zdravotný stav.</p>
    </div>
  );
}
