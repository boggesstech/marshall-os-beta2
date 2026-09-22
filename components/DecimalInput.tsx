"use client";

import { InputHTMLAttributes, useState } from "react";

type DecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "inputMode"> & {
  value: number | string | undefined;
  onValueChange: (value: number) => void;
};

function parseDecimal(raw: string) {
  if (!raw.trim() || raw === "." || raw === "-" || raw === "-.") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export default function DecimalInput({ value, onValueChange, onBlur, onFocus, ...props }: DecimalInputProps) {
  const [text, setText] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const displayValue = focused ? text : value ?? "";

  return (
    <input
      {...props}
      inputMode="decimal"
      value={displayValue}
      onFocus={(event) => {
        setFocused(true);
        setText(value ?? "");
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        setText(value ?? "");
        onBlur?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        const parsed = parseDecimal(raw);
        if (parsed !== null) onValueChange(parsed);
      }}
    />
  );
}
