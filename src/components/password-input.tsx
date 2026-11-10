"use client";

import { useId, useState, type InputHTMLAttributes, type Ref } from "react";

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  inputRef?: Ref<HTMLInputElement>;
};

export function PasswordInput({
  inputRef,
  className,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const labelId = useId();

  return (
    <div className={`password-field${className ? ` ${className}` : ""}`}>
      <input
        {...props}
        ref={inputRef}
        type={visible ? "text" : "password"}
        className="password-field-input"
      />
      <button
        type="button"
        className="password-eye"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setVisible((v) => !v);
        }}
        aria-pressed={visible}
        aria-labelledby={labelId}
        tabIndex={-1}
        disabled={props.disabled}
      >
        <span id={labelId} className="sr-only">
          {visible ? "Hide password" : "Show password"}
        </span>
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-1.7 2.5" />
      <path d="M6.1 6.1C3.9 7.6 2.5 9.7 2 12c0 0 3.5 7 10 7a10.8 10.8 0 0 0 4.4-.9" />
    </svg>
  );
}
