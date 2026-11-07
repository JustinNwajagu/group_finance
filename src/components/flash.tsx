export function Flash({
  ok,
  error,
  messages,
}: {
  ok?: string;
  error?: string;
  messages: Record<string, string>;
}) {
  if (error) {
    return (
      <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
        {error}
      </p>
    );
  }
  if (ok && messages[ok]) {
    return (
      <p className="form-ok" role="status" style={{ marginBottom: "1rem" }}>
        {messages[ok]}
      </p>
    );
  }
  return null;
}
