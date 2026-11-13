"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type ScrollSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** Optional section heading; options keep first-seen group order. */
  group?: string;
  /** Extra text matched by search (defaults to label). */
  searchText?: string;
};

type ScrollSelectProps = {
  name?: string;
  options: ScrollSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  placeholder?: string;
  /** Show a filter field in the open menu (member pickers). */
  searchable?: boolean;
  searchPlaceholder?: string;
};

export function ScrollSelect({
  name,
  options,
  value: controlledValue,
  defaultValue = "",
  onChange,
  required,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  placeholder = "Select…",
  searchable = false,
  searchPlaceholder = "Search…",
}: ScrollSelectProps) {
  const reactId = useId();
  const listId = `scroll-select-${reactId.replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isControlled = controlledValue !== undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const value = isControlled ? controlledValue : uncontrolled;

  const selected = options.find((option) => option.value === value);
  const label = selected?.label || placeholder;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      if (option.disabled && !option.value) return false;
      const haystack = `${option.label} ${option.searchText ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query]);

  const grouped = useMemo(() => {
    const sections: Array<{
      group: string | null;
      options: ScrollSelectOption[];
    }> = [];
    for (const option of filtered) {
      const group = option.group ?? null;
      const last = sections[sections.length - 1];
      if (last && last.group === group) {
        last.options.push(option);
      } else {
        sections.push({ group, options: [option] });
      }
    }
    return sections;
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    if (searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, searchable]);

  function closeMenu() {
    setOpen(false);
    setQuery("");
  }

  function commit(next: string) {
    if (!isControlled) setUncontrolled(next);
    onChange?.(next);
    closeMenu();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`scroll-select${open ? " is-open" : ""}${
        className ? ` ${className}` : ""
      }${disabled ? " is-disabled" : ""}${searchable ? " is-searchable" : ""}`}
    >
      {name ? (
        <input
          type="hidden"
          name={name}
          value={value}
          required={required}
          disabled={disabled}
        />
      ) : null}
      <button
        type="button"
        id={id}
        className="scroll-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            closeMenu();
          } else {
            setOpen(true);
          }
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span
          className={
            selected ? "scroll-select-value" : "scroll-select-value is-placeholder"
          }
        >
          {label}
        </span>
        <span className="scroll-select-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div className="scroll-select-panel">
          {searchable ? (
            <div className="scroll-select-search">
              <input
                ref={searchRef}
                type="search"
                className="scroll-select-search-input"
                value={query}
                placeholder={searchPlaceholder}
                autoComplete="off"
                enterKeyHint="search"
                aria-label={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    closeMenu();
                  }
                }}
              />
            </div>
          ) : null}
          <ul
            id={listId}
            className="scroll-select-menu"
            role="listbox"
            aria-label={ariaLabel}
          >
            {filtered.length === 0 ? (
              <li className="scroll-select-empty" role="presentation">
                No matches.
              </li>
            ) : (
              grouped.map((section) => (
                <li
                  key={section.group ?? "__default"}
                  className="scroll-select-section"
                  role="presentation"
                >
                  {section.group ? (
                    <div className="scroll-select-group" aria-hidden="true">
                      {section.group}
                    </div>
                  ) : null}
                  <ul className="scroll-select-section-list" role="group">
                    {section.options.map((option) => {
                      const isSelected = option.value === value;
                      return (
                        <li
                          key={`${option.value}::${option.label}`}
                          role="presentation"
                        >
                          <button
                            type="button"
                            role="option"
                            className={`scroll-select-option${
                              isSelected ? " is-selected" : ""
                            }`}
                            aria-selected={isSelected}
                            disabled={option.disabled || disabled}
                            onClick={() => {
                              if (!option.disabled) commit(option.value);
                            }}
                          >
                            {option.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
