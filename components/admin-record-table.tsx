"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
  type Table,
  type Row,
  type CellContext,
} from "@tanstack/react-table";
import { BulkSelectionCheckbox } from "./admin-bulk-selection";
import { AdminRecordId } from "./admin-record-id";
import styles from "./admin-record-table.module.css";

export type AdminRecordColumn<T> = {
  id: string;
  label: string;
  cell: (record: T) => ReactNode;
  sortValue?: (record: T) => string | number;
  width?: number;
  initiallyHidden?: boolean;
};

/** Controlled sorting for data sets paginated by the backend. Never reorder only a visible slice. */
export type AdminRecordServerSorting = {
  id: string;
  desc: boolean;
  allowedIds: readonly string[];
  onChange: (next: { id: string; desc: boolean }) => void;
};

export type AdminRecordTableSelection<T> = {
  /** Only IDs visible on this page are selectable. Never imply cross-page selection. */
  selectedIds: readonly number[];
  onChange: (ids: number[]) => void;
  labelForRow?: (record: T) => string;
  selectAllLabel?: string;
  rowInputDataAttribute?: `data-${string}`;
  disabled?: boolean;
};

// All Admin list pages have bounded server pagination. A stable ID keeps
// selection and the TanStack row cache aligned across local state changes.
function recordRowId<T extends { id: number }>(record: T) { return String(record.id); }
// Most list views do not enable bulk selection. Keep a stable empty state so
// TanStack need not reconcile selection or regenerate row models for those views.
const EMPTY_ROW_SELECTION: RowSelectionState = {};

/** Read-first grid; optional selection delegates writes to the domain's existing bulk API. */
export function AdminRecordTable<T extends { id: number }>({
  rows,
  columns,
  label,
  busy = false,
  selection,
  stretch = false,
  serverSorted = false,
  serverSorting,
  density = "compact",
  rowDataAttribute,
}: {
  rows: T[];
  columns: AdminRecordColumn<T>[];
  label: string;
  busy?: boolean;
  selection?: AdminRecordTableSelection<T>;
  /** Opt in to filling available desktop width, while preserving horizontal scrolling. */
  stretch?: boolean;
  /** Server already sorted the entire result set before pagination. */
  serverSorted?: boolean;
  /** Controlled whole-result sorting; parent reloads page 1 with a server ORDER BY. */
  serverSorting?: AdminRecordServerSorting;
  density?: "compact" | "comfortable";
  /** Optional stable data attribute for module-specific selectors and E2E tests. */
  rowDataAttribute?: `data-${string}`;
}) {
  // Table<T> is invariant; cache typed factories per instance, not as
  // module-level unknown factories that can break TypeScript generics.
  const coreRowModel = useMemo(() => getCoreRowModel<T>(), []);
  const clientSortedRowModel = useMemo(() => getSortedRowModel<T>(), []);
  const [clientSorting, setClientSorting] = useState<SortingState>([]);
  const controlledSortId = serverSorting?.id;
  const controlledSortDesc = serverSorting?.desc;
  const sorting = useMemo<SortingState>(() => controlledSortId !== undefined
    ? [{ id: controlledSortId, desc: Boolean(controlledSortDesc) }]
    : clientSorting, [clientSorting, controlledSortId, controlledSortDesc]);
  const [visibility, setVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(columns.filter((column) => column.initiallyHidden).map((column) => [column.id, false])),
  );

  const selectedIds = selection?.selectedIds;
  // The listing's bulk selection IDs are often reconstructed on each parent
  // render. Equal page selections must share the same TanStack state object.
  const selectedIdsKey = selectedIds?.join(",") ?? "";
  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!selectedIdsKey) return EMPTY_ROW_SELECTION;
    const visibleIds = new Set(rows.map(row => row.id));
    return Object.fromEntries(selectedIdsKey.split(",").map(Number)
      .filter(id => visibleIds.has(id)).map(id => [String(id), true]));
  }, [rows, selectedIdsKey]);

  // Memoize columns by the selection options that affect their rendering,
  // not the parent's frequently recreated selection wrapper / selected IDs.
  // Keep callbacks in the dependency list: never render stale disabled/label UI.
  const selectionEnabled = Boolean(selection);
  const selectionDisabled = selection?.disabled;
  const selectionRowLabel = selection?.labelForRow;
  const selectionAllLabel = selection?.selectAllLabel;
  const selectionRowInputDataAttribute = selection?.rowInputDataAttribute;

  const definitions = useMemo<ColumnDef<T>[]>(() => [
    ...(selectionEnabled ? [{
      id: "__select",
      header: ({ table }: { table: Table<T> }) => (
        <BulkSelectionCheckbox
          className={styles.selectionCheck}
          label={selectionAllLabel ?? ("Označiť všetky záznamy na tejto strane: " + label)}
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          disabled={busy || selectionDisabled || !rows.length}
          onChange={checked => table.toggleAllPageRowsSelected(checked)}
        />
      ),
      cell: ({ row }: { row: Row<T> }) => (
        <BulkSelectionCheckbox
          className={styles.selectionCheck}
          label={selectionRowLabel?.(row.original) ?? ("Označiť záznam " + row.original.id)}
          inputDataAttribute={selectionRowInputDataAttribute}
          checked={row.getIsSelected()}
          disabled={busy || selectionDisabled}
          onChange={checked => row.toggleSelected(checked)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      size: 64,
      minSize: 64,
    } as ColumnDef<T>] : []),
    // Always display the stable ID in every shared Admin table.
    ...(columns.some(column => column.id === "__recordId" || column.id === "id") ? [] : [{
      id: "__recordId",
      header: "ID",
      accessorFn: (record: T) => record.id,
      cell: ({ row }: CellContext<T, unknown>) => <AdminRecordId id={row.original.id} compact />,
      enableSorting: serverSorting ? serverSorting.allowedIds.includes("__recordId") : !serverSorted,
      enableHiding: false,
      size: 109,
      minSize: 96,
    } as ColumnDef<T>]),
    ...columns.map((column) => ({
    id: column.id,
    header: column.label,
    accessorFn: (record: T) => column.sortValue ? column.sortValue(record) : "",
    cell: ({ row }: CellContext<T, unknown>) => column.cell(row.original),
    enableSorting: Boolean(column.sortValue) && (serverSorting
      ? serverSorting.allowedIds.includes(column.id)
      : !serverSorted),
    size: column.width ?? 165,
    minSize: 85,
  })),
  ], [columns, selectionEnabled, selectionDisabled, selectionRowLabel, selectionAllLabel,
    selectionRowInputDataAttribute, label, busy, rows.length, serverSorted, serverSorting]);

  const table = useReactTable({
    data: rows,
    columns: definitions,
    state: { sorting, columnVisibility: visibility, rowSelection },
    onSortingChange: updater => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (serverSorting) {
        const first = next[0];
        if (first && serverSorting.allowedIds.includes(first.id)) {
          serverSorting.onChange({ id: first.id, desc: first.desc });
        }
      } else {
        setClientSorting(next);
      }
    },
    // Never sort a single visible page again when SQL owns whole-result order.
    manualSorting: serverSorted || Boolean(serverSorting),
    enableSortingRemoval: false,
    sortDescFirst: false,
    onColumnVisibilityChange: setVisibility,
    enableRowSelection: Boolean(selection) && !busy && !selection?.disabled,
    onRowSelectionChange: updater => {
      if (!selection || busy || selection.disabled) return;
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      selection.onChange(rows.filter(record => next[String(record.id)]).map(record => record.id));
    },
    getCoreRowModel: coreRowModel,
    getSortedRowModel: serverSorted || serverSorting ? undefined : clientSortedRowModel,
    getRowId: recordRowId,
    // "onChange" re-renders all cells for every pointermove, especially slow
    // on iOS. "onEnd" keeps the resize affordance and commits once on release.
    columnResizeMode: "onEnd",
  });

  return (
    <div className={styles.workspace} data-density={density} aria-busy={busy}>
      <div className={styles.toolbar}>
        <div className={styles.tableIntro}>
          <strong>{label}</strong>
          <span>{rows.length} záznamov na tejto strane · {serverSorting || serverSorted ? "zoradenie platí pre celý zoznam" : "zoradenie platí len pre túto stranu"}</span>
        </div>
        <details className={styles.columnPicker}>
          <summary>Stĺpce</summary>
          <div className={styles.columnPickerMenu}>
            {table.getAllLeafColumns().filter(column => column.getCanHide()).map((column) => (
              <label key={column.id}>
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                />
                {String(column.columnDef.header)}
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className={styles.scroll} role="region" aria-label={label + " – tabuľka"} tabIndex={0}>
        <table className={styles.table} style={{ width: stretch ? `max(100%, ${Math.max(table.getTotalSize(), 820)}px)` : Math.max(table.getTotalSize(), 820) }}>
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    style={{ width: header.getSize() }}
                    aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none"}
                  >
                    <div className={styles.heading}>
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={"Zoradiť podľa " + String(header.column.columnDef.header) + (header.column.getIsSorted() === "asc" ? " zostupne" : " vzostupne")}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span aria-hidden="true">{header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : " ↕"}</span>
                        </button>
                      ) : <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>}
                    </div>
                    {header.column.getCanResize() && <div
                      role="separator"
                      aria-label={"Zmeniť šírku stĺpca " + String(header.column.columnDef.header)}
                      aria-orientation="vertical"
                      className={styles.resizeHandle}
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                    />}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} data-testid="admin-record-row"
                {...(rowDataAttribute ? { [rowDataAttribute]: "" } : {})}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
