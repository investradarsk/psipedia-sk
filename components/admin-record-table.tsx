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
import styles from "./admin-record-table.module.css";

export type AdminRecordColumn<T> = {
  id: string;
  label: string;
  cell: (record: T) => ReactNode;
  sortValue?: (record: T) => string | number;
  width?: number;
  initiallyHidden?: boolean;
};

export type AdminRecordTableSelection<T> = {
  /** Only IDs visible on this page are selectable. Never imply cross-page selection. */
  selectedIds: readonly number[];
  onChange: (ids: number[]) => void;
  labelForRow?: (record: T) => string;
  disabled?: boolean;
};

/** Read-first grid; optional selection delegates writes to the domain's existing bulk API. */
export function AdminRecordTable<T extends { id: number }>({
  rows,
  columns,
  label,
  busy = false,
  selection,
}: {
  rows: T[];
  columns: AdminRecordColumn<T>[];
  label: string;
  busy?: boolean;
  selection?: AdminRecordTableSelection<T>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(columns.filter((column) => column.initiallyHidden).map((column) => [column.id, false])),
  );

  const selectedIds = selection?.selectedIds;
  const rowSelection = useMemo<RowSelectionState>(() => {
    const visibleIds = new Set(rows.map(row => row.id));
    return Object.fromEntries((selectedIds ?? []).filter(id => visibleIds.has(id)).map(id => [String(id), true]));
  }, [rows, selectedIds]);

  const definitions = useMemo<ColumnDef<T>[]>(() => [
    ...(selection ? [{
      id: "__select",
      header: ({ table }: { table: Table<T> }) => (
        <BulkSelectionCheckbox
          className={styles.selectionCheck}
          label={"Označiť všetky záznamy na tejto strane: " + label}
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          disabled={busy || selection.disabled || !rows.length}
          onChange={checked => table.toggleAllPageRowsSelected(checked)}
        />
      ),
      cell: ({ row }: { row: Row<T> }) => (
        <BulkSelectionCheckbox
          className={styles.selectionCheck}
          label={selection.labelForRow?.(row.original) ?? ("Označiť záznam " + row.original.id)}
          checked={row.getIsSelected()}
          disabled={busy || selection.disabled}
          onChange={checked => row.toggleSelected(checked)}
        />
      ),
      enableSorting: false,
      enableResizing: false,
      size: 64,
      minSize: 64,
    } as ColumnDef<T>] : []),
    ...columns.map((column) => ({
    id: column.id,
    header: column.label,
    accessorFn: (record: T) => column.sortValue ? column.sortValue(record) : "",
    cell: ({ row }: CellContext<T, unknown>) => column.cell(row.original),
    enableSorting: Boolean(column.sortValue),
    size: column.width ?? 165,
    minSize: 85,
  })),
  ], [columns, selection, label, busy, rows.length]);

  const table = useReactTable({
    data: rows,
    columns: definitions,
    state: { sorting, columnVisibility: visibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    enableRowSelection: Boolean(selection) && !busy && !selection?.disabled,
    onRowSelectionChange: updater => {
      if (!selection || busy || selection.disabled) return;
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      selection.onChange(rows.filter(record => next[String(record.id)]).map(record => record.id));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (record) => String(record.id),
    columnResizeMode: "onChange",
  });

  return (
    <div className={styles.workspace} aria-busy={busy}>
      <div className={styles.toolbar}>
        <div className={styles.tableIntro}>
          <strong>{label}</strong>
          <span>{rows.length} záznamov na tejto strane · zoradenie platí len pre túto stranu</span>
        </div>
        <details className={styles.columnPicker}>
          <summary>Stĺpce</summary>
          <div className={styles.columnPickerMenu}>
            {table.getAllLeafColumns().map((column) => (
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
        <table className={styles.table} style={{ width: Math.max(table.getTotalSize(), 820) }}>
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} scope="col" style={{ width: header.getSize() }}>
                    <div className={styles.heading}>
                      {header.column.getCanSort() ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()} aria-label={"Zoradiť podľa: " + String(header.column.columnDef.header)}>
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
              <tr key={row.id} data-testid="admin-record-row">
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
