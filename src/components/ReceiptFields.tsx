import { useState, useRef, useEffect } from "react";
import { Field } from "./ui";
import { receiptFormats, receiptError } from "../../shared/expenses.mjs";
export function ReceiptFields({
  defaultFormat = "alphanumeric",
  format: selectedFormat,
  onFormatChange,
}: {
  defaultFormat?: string;
  format?: string;
  onFormatChange?: (format: string) => void;
}) {
  const [localFormat, setFormat] = useState(defaultFormat),
    [number, setNumber] = useState("");
  const format = selectedFormat ?? localFormat;
  const numberRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    numberRef.current?.setCustomValidity("");
  }, [format]);
  const rules =
    receiptFormats[format as keyof typeof receiptFormats] ||
    receiptFormats.alphanumeric;
  const error = number ? receiptError(number, format) : "";
  return (
    <div className="form-grid">
      <Field label="Formato del número de recibo">
        <select
          name="receipt_format"
          value={format}
          onChange={(e) => {
            setFormat(e.target.value);
            onFormatChange?.(e.target.value);
            numberRef.current?.setCustomValidity("");
          }}
        >
          {Object.entries(receiptFormats).map(([id, rule]) => (
            <option key={id} value={id}>
              {rule.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Número de recibo" hint={error || rules.hint}>
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
