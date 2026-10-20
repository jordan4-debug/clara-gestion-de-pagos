import { useState } from "react";
import { decimalCents, decimalText } from "../../shared/expenses.mjs";
export function MoneyInput({
  name,
  cents = null,
  readOnly = false,
  required = true,
}: {
  name: string;
  cents?: number | null;
  readOnly?: boolean;
  required?: boolean;
}) {
  const [value, setValue] = useState(decimalText(cents));
  return (
    <input
      name={name}
      type="text"
      inputMode="decimal"
      readOnly={readOnly}
      required={required}
      value={value}
      placeholder="0.00"
      onChange={(e) => {
        setValue(e.target.value);
        e.currentTarget.setCustomValidity("");
      }}
      onBlur={(e) => {
        try {
          const amount = decimalCents(value);
          if (amount != null) setValue(decimalText(amount));
          e.currentTarget.setCustomValidity("");
        } catch (error) {
          e.currentTarget.setCustomValidity((error as Error).message);
        }
      }}
    />
  );
}
