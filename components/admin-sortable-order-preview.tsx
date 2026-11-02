"use client";

import { type ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import styles from "./admin-sortable-order-preview.module.css";

export type AdminOrderPreviewItem = {
  id: string;
  label: string;
  detail?: string;
  icon?: ReactNode;
  visible?: boolean;
};

function SortablePreviewRow({
  item, index, count, onMove, disabled,
}: {
  item: AdminOrderPreviewItem;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  disabled: boolean;
}) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: item.id, disabled });

  return (
    <li ref={setNodeRef} className={styles.card} style={{
      transform: CSS.Transform.toString(transform), transition,
      ...(isDragging ? { position: "relative" as const, zIndex: 3, opacity: 0.65 } : {}),
    }}>
      <button type="button" ref={setActivatorNodeRef}
        className={styles.handle} disabled={disabled}
        aria-label={`Potiahnuť ${item.label} na zmenu poradia`}
        title="Potiahni myšou alebo použi medzerník a šípky"
        {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden="true" />
      </button>
      <span className={styles.number} aria-hidden="true">{index + 1}</span>
      {item.icon && <span className={styles.icon} aria-hidden="true">{item.icon}</span>}
      <span className={styles.identity}>
        <strong>{item.label || "Nepomenovaná položka"}</strong>
        {item.detail && <small>{item.detail}</small>}
      </span>
      {item.visible === false && <span className={styles.hidden}>Skryté</span>}
      <div className={styles.moves}>
        <button type="button" disabled={disabled || index === 0}
          aria-label={`Posunúť ${item.label} vyššie`}
          onClick={() => onMove(index, index - 1)}>↑</button>
        <button type="button" disabled={disabled || index >= count - 1}
          aria-label={`Posunúť ${item.label} nižšie`}
          onClick={() => onMove(index, index + 1)}>↓</button>
      </div>
    </li>
  );
}

/**
 * Reorders an unsaved draft only. The parent owns its canonical data model,
 * validation and explicit save; the preview performs no network requests.
 */
export function AdminSortableOrderPreview({
  title, description, items, onReorder, disabled = false,
}: {
  title: string;
  description: string;
  items: AdminOrderPreviewItem[];
  onReorder: (from: number, to: number) => void;
  disabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(item => item.id);
  function end(event: DragEndEvent) {
    if (disabled || !event.over || event.active.id === event.over.id) return;
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(event.over.id));
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  }
  return (
    <section className={styles.root} aria-label={title} data-admin-sortable-preview>
      <div className={styles.heading}>
        <strong>{title}</strong>
        <p>{description}</p>
        <small>Pracovný náhľad. Presúvanie samo nič nezverejňuje. Ulož v pôvodnom editore.</small>
      </div>
      {items.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className={styles.list}>
              {items.map((item, index) => (
                <SortablePreviewRow key={item.id} item={item} index={index}
                  count={items.length} onMove={onReorder} disabled={disabled} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : <p className={styles.empty}>Zatiaľ tu nie sú žiadne položky na presunutie.</p>}
    </section>
  );
}
