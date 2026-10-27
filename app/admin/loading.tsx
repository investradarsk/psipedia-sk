import { AdminDataLoading } from "@/components/admin-data-loading";

export default function AdminLoading() {
  return (
    <main id="obsah" className="admin-root">
      <div className="admin-shell shell">
        <AdminDataLoading label="Administrácia" />
      </div>
    </main>
  );
}
