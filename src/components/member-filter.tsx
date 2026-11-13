"use client";

/** Name/email filter with a mobile clear control (desktop keeps the native search X). */
export function MemberFilter({
  value,
  onChange,
  placeholder = "Filter members…",
  label = "Filter members",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const hasQuery = value.trim().length > 0;

  return (
    <div className={hasQuery ? "filter-bar is-filtering" : "filter-bar"}>
      <label className="filter">
        <span className="sr-only">{label}</span>
        <span className="filter-field">
          <input
            type="search"
            value={value}
            placeholder={placeholder}
            className="filter-input"
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => onChange(e.target.value)}
          />
          {hasQuery ? (
            <button
              type="button"
              className="filter-clear"
              aria-label="Clear filter"
              onClick={() => onChange("")}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </span>
      </label>
    </div>
  );
}
