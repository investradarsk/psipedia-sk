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
} from "@tanstack/react-table";
import styles from "./admin-record-table.module.css";

export type AdminRecordColumn<T> = {
  id: string;
  label: string;
  cell: (record: T) => ReactNode;
  sortValue?: (record: T) => string | number;
  width?: number;
  initiallyHidden?: boolean;
};

/** Read-first grid for existing admin data sources. All writes stay in canonical editors/actions. */
export function AdminRecordTable<T extends { id: number }>({
  rows,
  columns,
  label,
  busy = false,
}: {
  rows: T[];
  columns: AdminRecordColumn<T>[];
  label: string;
  busy?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(columns.filter((column) => column.initiallyHidden).map((column) => [column.id, false])),
  );

  const definitions = useMemo<ColumnDef<T>[]>(() => columns.map((column) => ({
    id: column.id,
    header: column.label,
    accessorFn: (record) => column.sortValue ? column.sortValue(record) : "",
    cell: ({ row }) => column.cell(row.original),
    enableSorting: Boolean(column.sortValue),
    size: column.width ?? 165,
    minSize: 85,
  })), [columns]);

  const table = useReactTable({
    data: rows,
    columns: definitions,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
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
        <table className={styles.table}>
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
              <tr key={row.id}>
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
