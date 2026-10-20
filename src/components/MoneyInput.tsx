import { useState, useId } from "react";
import {
  decimalCents,
  decimalText,
  moneyPattern,
  validMoneyDraft,
  moneyInputMessage,
} from "../../shared/expenses.mjs";
const acceptsInsertion = (input: HTMLInputElement, text: string) =>
  validMoneyDraft(
    input.value.slice(0, input.selectionStart ?? input.value.length) +
      text +
      input.value.slice(input.selectionEnd ?? input.value.length),
  );
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
  const [value, setValue] = useState(decimalText(cents)),
    [message, setMessage] = useState("");
  const messageId = useId();
  return (
    <>
      <input
        name={name}
        type="text"
        inputMode="decimal"
        data-money-input="true"
        pattern={moneyPattern}
        title="Solo números y punto decimal. Ejemplo: 100.00"
        autoComplete="off"
        aria-describedby={message ? messageId : undefined}
        readOnly={readOnly}
        required={required}
        value={value}
        placeholder="0.00"
        onKeyDown={(e) => {
          if (
            !readOnly &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            e.key.length === 1 &&
            !acceptsInsertion(e.currentTarget, e.key)
          ) {
            e.preventDefault();
            setMessage(moneyInputMessage);
          }
        }}
        onBeforeInput={(e) => {
          const text = (e.nativeEvent as InputEvent).data;
          if (!readOnly && text && !acceptsInsertion(e.currentTarget, text)) {
            e.preventDefault();
            setMessage(moneyInputMessage);
          }
        }}
        onChange={(e) => {
          const next = e.target.value;
          if (!validMoneyDraft(next)) {
            e.stopPropagation();
            setMessage(moneyInputMessage);
            return;
          }
          setValue(next.startsWith(".") ? `0${next}` : next);
          setMessage("");
          e.currentTarget.setCustomValidity("");
        }}
        onPaste={(e) => {
          if (readOnly) return;
          if (
            !acceptsInsertion(e.currentTarget, e.clipboardData.getData("text"))
          ) {
            e.preventDefault();
            setMessage(moneyInputMessage);
          }
        }}
        onDrop={(e) => {
          if (
            !readOnly &&
            !acceptsInsertion(e.currentTarget, e.dataTransfer.getData("text"))
          ) {
            e.preventDefault();
            setMessage(moneyInputMessage);
          }
        }}
        onBlur={(e) => {
          try {
            const amount = decimalCents(
              value.endsWith(".") ? value.slice(0, -1) : value,
            );
            if (amount != null) setValue(decimalText(amount));
            setMessage("");
            e.currentTarget.setCustomValidity("");
          } catch (error) {
            const text = (error as Error).message;
            setMessage(text);
            e.currentTarget.setCustomValidity(text);
          }
        }}
      />
      {message ? (
        <small id={messageId} className="money-input-error" role="status">
          {message}
        </small>
      ) : null}
    </>
  );
}
