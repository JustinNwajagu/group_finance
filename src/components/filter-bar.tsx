"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function FilterBar({
  placeholder,
  param = "q",
  /** Debounce for non-empty queries (ms). Clears always commit immediately. */
  debounceMs = 250,
}: {
  placeholder: string;
  param?: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const urlValue = searchParams.get(param) ?? "";
  const [value, setValue] = useState(urlValue);
  const focusedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  // Sync from the URL when it changes externally (back/forward), not while typing.
  useEffect(() => {
    if (!focusedRef.current) setValue(urlValue);
  }, [urlValue]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function commit(next: string) {
    const seq = ++seqRef.current;
    const trimmed = next.trim();
    startTransition(() => {
      // Drop superseded navigations so a slow search cannot overwrite a clear.
      if (seq !== seqRef.current) return;
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (trimmed) params.set(param, trimmed);
      else params.delete(param);
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      router.replace(href, { scroll: false });
    });
  }

  return (
    <label className={`filter ${pending ? "is-pending" : ""}`}>
      <span className="sr-only">Filter</span>
      <input
        type="search"
        name={param}
        value={value}
        placeholder={placeholder}
        className="filter-input"
        autoComplete="off"
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          // Snap to committed URL value after blur.
          setValue(urlValue);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          // Empty query: restore the full list immediately (no debounce wait).
          if (!next.trim()) {
            commit("");
            return;
          }
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            commit(next);
          }, debounceMs);
        }}
      />
    </label>
  );
}
