"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type ScrollSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
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
}: ScrollSelectProps) {
  const reactId = useId();
  const listId = `scroll-select-${reactId.replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const isControlled = controlledValue !== undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const value = isControlled ? controlledValue : uncontrolled;

  const selected = options.find((option) => option.value === value);
  const label = selected?.label || placeholder;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function commit(next: string) {
    if (!isControlled) setUncontrolled(next);
    onChange?.(next);
    setOpen(false);
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
      }${disabled ? " is-disabled" : ""}`}
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
          if (!disabled) setOpen((current) => !current);
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
        <ul
          id={listId}
          className="scroll-select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={`${option.value}::${option.label}`} role="presentation">
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
      ) : null}
    </div>
  );
}
