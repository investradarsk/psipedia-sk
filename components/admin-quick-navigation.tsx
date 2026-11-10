"use client";

// Search dependencies (Fuse.js and Radix Dialog) are only needed when the
// command palette opens, not on every authenticated admin navigation.
import dynamic from "next/dynamic";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./admin-quick-navigation.module.css";

const AdminQuickNavigationDialog = dynamic(
  () => import("./admin-quick-navigation-dialog").then(module => module.AdminQuickNavigationDialog),
  { ssr: false },
);

export function AdminQuickNavigation() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(current => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label="Hľadať v celej administrácii"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-admin-quick-nav-trigger
        onClick={() => setOpen(true)}
      >
        <Search size={16} aria-hidden="true" />
        <span>Hľadať profil, ID, článok, funkciu…</span>
        <kbd>Ctrl K</kbd>
      </button>
      {open && <AdminQuickNavigationDialog open={open} onOpenChange={changeOpen} />}
    </>
  );
}
