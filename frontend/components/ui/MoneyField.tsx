"use client";

import {
  type InputHTMLAttributes,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from "react";
import { clsx } from "clsx";
import { Field } from "@/components/ui/Field";
import { formatAmountInput } from "@/lib/format";

type MoneyFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  label?: string;
  value: number | string;
  onChange: (value: number | null) => void;
  error?: string;
};

function toInteger(value: number | string): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
}

function caretAfterDigits(value: string, digitCount: number): number {
  if (digitCount === 0) return 0;

  let seenDigits = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) {
      seenDigits += 1;
      if (seenDigits === digitCount) return index + 1;
    }
  }
  return value.length;
}

export const MoneyField = forwardRef<HTMLInputElement, MoneyFieldProps>(
  function MoneyField(
    { label, value, onChange, error, className, ...props },
    forwardedRef,
  ) {
    const [displayValue, setDisplayValue] = useState(() =>
      formatAmountInput(value),
    );
    const lastCommittedValue = useRef(toInteger(value));

    useEffect(() => {
      const nextValue = toInteger(value);
      if (nextValue !== lastCommittedValue.current) {
        setDisplayValue(formatAmountInput(nextValue));
        lastCommittedValue.current = nextValue;
      }
    }, [value]);

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      const input = event.currentTarget;
      const digitsBeforeCaret = input.value
        .slice(0, input.selectionStart ?? input.value.length)
        .replace(/\D/g, "").length;
      const digits = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
      const nextValue = digits ? Number(digits) : null;
      const nextDisplayValue = formatAmountInput(digits);

      setDisplayValue(nextDisplayValue);
      lastCommittedValue.current = nextValue ?? 0;
      onChange(nextValue);

      requestAnimationFrame(() => {
        const caret = caretAfterDigits(nextDisplayValue, digitsBeforeCaret);
        input.setSelectionRange(caret, caret);
      });
    }

    const inputProps = {
      ...props,
      type: "text" as const,
      inputMode: "numeric" as const,
      value: displayValue,
      onChange: handleChange,
      className,
    };

    return label ? (
      <Field
        {...inputProps}
        label={label}
        error={error}
        ref={forwardedRef}
      />
    ) : (
      <input
        {...inputProps}
        aria-invalid={!!error}
        aria-describedby={error ? `${props.id}-error` : undefined}
        ref={forwardedRef}
        className={clsx(
          "rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-brand",
          error && "border-danger focus:ring-danger",
          className,
        )}
      />
    );
  },
);
