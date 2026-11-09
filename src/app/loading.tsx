export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="btn-spinner" aria-hidden />
      Loading…
    </div>
  );
}
