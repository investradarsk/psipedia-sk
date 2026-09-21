"use client";

export function HorizontalCarouselControls({
  targetId,
  className,
  buttonClassName,
}: {
  targetId: string;
  className?: string;
  buttonClassName?: string;
}) {
  function move(direction: -1 | 1) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const amount = Math.max(260, Math.round(target.clientWidth * 0.82));
    target.scrollBy({ left: amount * direction, behavior: "smooth" });
  }

  return (
    <div className={className} aria-label="Ovládanie carouselu">
      <button
        className={buttonClassName}
        type="button"
        aria-label="Posunúť carousel doľava"
        onClick={() => move(-1)}
      >
        <span aria-hidden="true">←</span>
      </button>
      <button
        className={buttonClassName}
        type="button"
        aria-label="Posunúť carousel doprava"
        onClick={() => move(1)}
      >
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
