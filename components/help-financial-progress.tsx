import { formatHelpAmount, helpFinancials, helpProgress, type HelpCase } from "@/lib/help";
import styles from "./help-public.module.css";

/** Shared amounts and progress for fundraiser cards and their detail. */
export function HelpFinancialProgress({
  item,
  compact = false,
}: {
  item: HelpCase | Pick<HelpCase, "category" | "goalAmount" | "raisedAmount">;
  compact?: boolean;
}) {
  const amounts = helpFinancials(item);
  if (!amounts) return null;
  const progress = helpProgress(amounts);
  return (
    <div className={compact ? undefined : styles.progress} data-help-financial-progress>
      <div className={compact ? styles.amounts : styles.progressNumbers}>
        {amounts.raisedAmount !== null ? (
          <span>
            Vyzbierané <strong>{formatHelpAmount(amounts.raisedAmount)}</strong>
          </span>
        ) : null}
        {amounts.goalAmount !== null ? (
          <span>
            Cieľ <strong>{formatHelpAmount(amounts.goalAmount)}</strong>
          </span>
        ) : null}
      </div>
      {progress !== null ? (
        <div className={compact ? styles.progress : undefined}>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Priebeh zbierky"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p>{progress} % cieľa</p>
        </div>
      ) : null}
    </div>
  );
}
