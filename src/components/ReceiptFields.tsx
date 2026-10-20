import { useState, useRef, useEffect } from "react";
import { Field } from "./ui";
import { receiptFormats, receiptError } from "../../shared/expenses.mjs";
export function ReceiptFields({
  defaultFormat = "alphanumeric",
  format: selectedFormat,
}: {
  defaultFormat?: string;
  format?: string;
}) {
  const [number, setNumber] = useState("");
  const format = selectedFormat ?? defaultFormat;
  const numberRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    numberRef.current?.setCustomValidity("");
  }, [format]);
  const rules =
    receiptFormats[format as keyof typeof receiptFormats] ||
    receiptFormats.alphanumeric;
  const error = number ? receiptError(number, format) : "";
  return (
    <div className="receipt-number-field">
      <input type="hidden" name="receipt_format" value={format} />
      <Field
        label="Número de recibo"
        hint={error || "Ingresa el número tal como aparece en el documento."}
      >
        <input
          ref={numberRef}
          name="invoice_number"
          type="text"
          inputMode={format === "numeric" ? "numeric" : "text"}
          autoComplete="off"
          spellCheck={false}
          pattern={rules.pattern}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onInvalid={(e) =>
            e.currentTarget.setCustomValidity(
              receiptError(e.currentTarget.value, format),
            )
          }
          onInput={(e) => e.currentTarget.setCustomValidity("")}
          aria-invalid={!!error}
          required
          placeholder={format === "numeric" ? "000012345" : "F001-000123"}
        />
      </Field>
    </div>
  );
}
