export function PageFallback({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="btn-spinner" aria-hidden />
      {label}
    </div>
  );
}
