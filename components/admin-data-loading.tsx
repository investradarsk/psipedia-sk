export function AdminDataLoading({ label }: { label: string }) {
  return (
    <section className="admin-panel" role="status" aria-busy="true">
      <p>{label}: načítavajú sa údaje…</p>
    </section>
  );
}
