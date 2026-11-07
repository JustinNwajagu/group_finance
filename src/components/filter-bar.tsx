"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function FilterBar({
  placeholder,
  param = "q",
}: {
  placeholder: string;
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const value = searchParams.get(param) ?? "";

  return (
    <label className={`filter ${pending ? "is-pending" : ""}`}>
      <span className="sr-only">Filter</span>
      <input
        type="search"
        name={param}
        defaultValue={value}
        placeholder={placeholder}
        className="filter-input"
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (next.trim()) params.set(param, next);
            else params.delete(param);
            const qs = params.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname);
          });
        }}
      />
    </label>
  );
}
