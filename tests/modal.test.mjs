import { test, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { calculateSchedule } from "../server/loan-schedule.mjs";

// DOM unit tests, without starting or controlling a browser. Only native dialog
// open/close transitions are stubbed; React handlers, state and propagation are real.
const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { url: "https://clara.example/" },
);
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "HTMLInputElement",
  "HTMLDialogElement",
  "FormData",
])
  globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
after(() => dom.window.close());

const { createElement: e, act, useState, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { outputFiles } = buildSync({
  stdin: {
    contents:
      "export { Modal, Field, useModalLock } from './src/components/ui'; export { LoanForm, ScheduleTable } from './src/features/Loans'; export { EntitySelector } from './src/components/EntitySelector'; export { ScrollableTable } from './src/components/ScrollableTable'; export { Cash } from './src/features/Cash'; export { PaymentFlow } from './src/features/PaymentFlow';",
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  packages: "external",
});
const module = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const { Modal, useModalLock, EntitySelector } = module.exports;
const { LoanForm, ScrollableTable, Cash, PaymentFlow } = module.exports;

async function mounted(t) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => {
    await act(() => root.unmount());
    container.remove();
  });
  return {
    container,
    render: async (element) =>
      act(() => root.render(e(StrictMode, null, element))),
  };
}
const click = async (node) =>
  act(() =>
    node.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
    ),
  );
function cancel(dialog) {
  const event = new dom.window.Event("cancel", {
    bubbles: false,
    cancelable: true,
  });
  dialog.dispatchEvent(event);
  assert.equal(
    event.defaultPrevented,
    true,
    "Escape/close request must be canceled",
  );
}

test("Backdrop clicks, dialog padding and Escape preserve entered data; idle explicit close still works", async (t) => {
  const { container, render } = await mounted(t);
  let closes = 0;
  await render(
    e(
      Modal,
      { title: "Registrar préstamo", onClose: () => closes++ },
      e("input", { defaultValue: "Contrato histórico ingresado" }),
    ),
  );
  const dialog = container.querySelector("dialog");
  assert.equal(dialog.getAttribute("closedby"), "none");
  await click(dialog);
  await click(container.querySelector("header"));
  cancel(dialog);
  assert.equal(closes, 0);
  assert.equal(dialog.open, true);
  assert.equal(
    container.querySelector("input").value,
    "Contrato histórico ingresado",
  );
  await click(container.querySelector('[aria-label="Cerrar ventana"]'));
  assert.equal(closes, 1);
});

test("Saving locks X, explicit Cancel, navigation and duplicate submits, then unlocks when it finishes", async (t) => {
  const { container, render } = await mounted(t);
  let actions = 0;
  const screen = (busy) =>
    e(
      Modal,
      { title: "Guardar recibo", busy, onClose: () => actions++ },
      e(
        "form",
        {
          onSubmit: (event) => {
            event.preventDefault();
            actions++;
          },
        },
        e(
          "button",
          { type: "button", "data-cancel": true, onClick: () => actions++ },
          "Cancelar",
        ),
        e("a", { href: "#otro", onClick: () => actions++ }, "Otro recibo"),
      ),
    );
  await render(screen(true));
  const dialog = container.querySelector("dialog");
  assert.equal(dialog.getAttribute("aria-busy"), "true");
  assert.equal(
    container.querySelector('[aria-label="Cerrar ventana"]').disabled,
    true,
  );
  await click(container.querySelector('[aria-label="Cerrar ventana"]'));
  await click(container.querySelector("[data-cancel]"));
  await click(container.querySelector("a"));
  await act(() =>
    container
      .querySelector("form")
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  cancel(dialog);
  assert.equal(actions, 0);
  await render(screen(false));
  assert.equal(
    container.querySelector('[aria-label="Cerrar ventana"]').disabled,
    false,
  );
  await click(container.querySelector("[data-cancel]"));
  assert.equal(actions, 1);
});

test("Independent nested operations keep their containing modal locked until every operation finishes", async (t) => {
  const { container, render } = await mounted(t);
  let closes = 0;
  function Operation({ busy }) {
    useModalLock(busy);
    return null;
  }
  const screen = (first, second) =>
    e(
      Modal,
      { title: "Detalle del pago", onClose: () => closes++ },
      e(Operation, { key: "payment", busy: first }),
      e(Operation, { key: "proof", busy: second }),
    );
  await render(screen(true, true));
  const close = () => container.querySelector('[aria-label="Cerrar ventana"]');
  assert.equal(close().disabled, true);
  await render(screen(false, true));
  assert.equal(close().disabled, true);
  await click(close());
  assert.equal(closes, 0);
  await render(screen(false, false));
  assert.equal(close().disabled, false);
  await click(close());
  assert.equal(closes, 1);
});

test("A failed save retains form values and restores explicit cancellation without accidental dismissal", async (t) => {
  const { container, render } = await mounted(t);
  let rejectSave,
    closes = 0;
  const save = new Promise((_, reject) => {
    rejectSave = reject;
  });
  function Screen() {
    const [busy, setBusy] = useState(false),
      [error, setError] = useState("");
    return e(
      Modal,
      { title: "Guardar préstamo", busy, onClose: () => closes++ },
      e(
        "form",
        {
          onSubmit: async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await save;
            } catch {
              setError("Reintenta el guardado");
            } finally {
              setBusy(false);
            }
          },
        },
        e("input", { defaultValue: "Contrato que se conserva" }),
        e("p", { role: "alert" }, error),
      ),
    );
  }
  await render(e(Screen));
  await act(() =>
    container
      .querySelector("form")
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(
    container.querySelector('[aria-label="Cerrar ventana"]').disabled,
    true,
  );
  await click(container.querySelector("dialog"));
  await act(async () => {
    rejectSave(new Error("Solicitud fallida"));
    await save.catch(() => {});
  });
  assert.equal(
    container.querySelector("input").value,
    "Contrato que se conserva",
  );
  assert.equal(
    container.querySelector('[role="alert"]').textContent,
    "Reintenta el guardado",
  );
  assert.equal(
    container.querySelector('[aria-label="Cerrar ventana"]').disabled,
    false,
  );
  assert.equal(closes, 0);
});

test("Saving an actual inline entity locks its parent form and preserves the chosen entity and draft", async (t) => {
  const { container, render } = await mounted(t);
  const originalFetch = globalThis.fetch;
  let finish;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let closes = 0;
  await render(
    e(
      Modal,
      { title: "Registrar recibo", onClose: () => closes++ },
      e(
        "form",
        null,
        e("input", {
          name: "draft",
          defaultValue: "Recibo histórico sin perder",
        }),
        e(EntitySelector, { suppliers: [] }),
      ),
    ),
  );
  const selector = container.querySelector('select[name="supplier_id"]');
  await act(() => {
    selector.value = "new";
    selector.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const name = container.querySelector(".inline-entity input");
  await act(() => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    ).set.call(name, "Entidad nueva de prueba");
    name.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const saveButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Guardar y seleccionar",
  );
  assert.equal(saveButton.disabled, false);
  await click(saveButton);
  assert.equal(
    container.querySelector('[aria-label="Cerrar ventana"]').disabled,
    true,
  );
  await click(container.querySelector("dialog"));
  assert.equal(closes, 0);
  await act(() =>
    finish(
      new Response(
        JSON.stringify({
          id: 99,
          name: "Entidad nueva de prueba",
          category: "Servicios",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  assert.equal(
    container.querySelector('[aria-label="Cerrar ventana"]').disabled,
    false,
  );
  assert.equal(selector.value, "99");
  assert.equal(
    container.querySelector('input[name="draft"]').value,
    "Recibo histórico sin perder",
  );
});

test("Loan form previews and saves the textual annual rate and historical first due date, retaining the draft while saving", async (t) => {
  const { container, render } = await mounted(t);
  const originalFetch = globalThis.fetch;
  let previewInput,
    savedInput,
    finish,
    saved = 0,
    closed = 0;
  globalThis.fetch = (path, options) => {
    const input = JSON.parse(options.body);
    if (path === "/api/loans/preview") {
      previewInput = input;
      return Promise.resolve(
        new Response(JSON.stringify(calculateSchedule(input)), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    assert.equal(path, "/api/loans");
    savedInput = input;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  await render(
    e(LoanForm, {
      suppliers: [{ id: 1, name: "BCP", category: "Préstamos" }],
      onClose: () => closed++,
      onSaved: () => saved++,
    }),
  );
  await act(() => {
    for (const [name, value] of Object.entries({
      title: "Contrato BCP histórico",
      principal: "36000.00",
      annual_interest_percent: "17.02",
      first_due_date: "2024-04-04",
      count: "24",
    })) {
      const input = container.querySelector(`input[name="${name}"]`);
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    }
    const selector = container.querySelector('select[name="supplier_id"]');
    selector.value = "1";
    selector.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  assert.equal(previewInput.annual_interest_percent, "17.02");
  assert.equal(previewInput.first_due_date, "2024-04-04");
  assert.equal(previewInput.disbursement_date, undefined);
  assert.ok(container.querySelector(".calculated-schedule"));
  assert.equal(
    container.querySelector('button[type="submit"]').disabled,
    false,
  );
  await act(() =>
    container
      .querySelector("form")
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(savedInput.first_due_date, "2024-04-04");
  assert.equal(savedInput.annual_interest_percent, "17.02");
  assert.equal(savedInput.supplier_id, 1);
  assert.equal(
    container.querySelector('[aria-label="Cerrar ventana"]').disabled,
    true,
  );
  await click(container.querySelector("dialog"));
  cancel(container.querySelector("dialog"));
  assert.equal(closed, 0);
  assert.equal(saved, 0);
  await act(async () => {
    finish(
      new Response(JSON.stringify({ id: 42 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  assert.equal(saved, 1);
});

test("Top scrollbar and arrow controls move the schedule both ways without visiting its last row", async (t) => {
  const { container, render } = await mounted(t);
  await render(
    e(
      ScrollableTable,
      { label: "Cronograma de cuotas" },
      e(
        "table",
        null,
        e("tbody", null, e("tr", null, e("td", null, "Última columna"))),
      ),
    ),
  );
  const body = container.querySelector(".scrollable-table-body"),
    top = container.querySelector(".table-scroll-top");
  Object.defineProperty(body, "clientWidth", {
    configurable: true,
    value: 300,
  });
  Object.defineProperty(body, "scrollWidth", {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(top, "clientWidth", { configurable: true, value: 220 });
  await act(() => window.dispatchEvent(new dom.window.Event("resize")));
  assert.equal(top.firstElementChild.style.width, "920px");
  const left = container.querySelector(
      '[aria-label="Mover tabla a la izquierda"]',
    ),
    right = container.querySelector('[aria-label="Mover tabla a la derecha"]');
  assert.equal(left.disabled, true);
  assert.equal(right.disabled, false);
  await click(right);
  assert.equal(body.scrollLeft, 210);
  assert.equal(top.scrollLeft, 210);
  await act(() => {
    top.scrollLeft = 700;
    top.dispatchEvent(new dom.window.Event("scroll"));
  });
  assert.equal(body.scrollLeft, 700);
  assert.equal(right.disabled, true);
  await click(left);
  assert.equal(body.scrollLeft, 490);
  assert.equal(top.scrollLeft, 490);
  assert.equal(
    container.firstElementChild.firstElementChild.className,
    "table-scroll-controls",
  );
});

test("Assistant defaults to the manager fund for transfers and explicitly selects other funds when needed", async (t) => {
  const { container, render } = await mounted(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ balance_cents: 1000, people: [] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  await render(
    e(PaymentFlow, {
      bill: { id: 1, remaining_cents: 2000 },
      user: { id: 2, role: "assistant" },
      onChanged: () => {},
      notify: () => {},
    }),
  );
  const selectors = container.querySelectorAll("select");
  assert.equal(selectors[0].value, "Transferencia");
  assert.equal(selectors[1].value, "manager_funds");
  assert.equal(container.querySelector('button[type="submit"]').disabled, true);
  assert.ok(container.textContent.includes("El fondo entregado no alcanza"));
  await act(() => {
    selectors[1].value = "other_funds";
    selectors[1].dispatchEvent(
      new dom.window.Event("change", { bubbles: true }),
    );
  });
  assert.equal(
    container.querySelector('button[type="submit"]').disabled,
    false,
  );
  assert.ok(container.textContent.includes("cargo S/ 0.00"));
});

test("Cash view refreshes team payments on focus, reconciles cards and displays proof links without duplicating events", async (t) => {
  const { container, render } = await mounted(t);
  const originalFetch = globalThis.fetch;
  let updated = false,
    selected = null;
  const event = {
    id: 1,
    bill_id: 5,
    title: "Luz",
    supplier: "Hidrandina",
    actor: "Asistente1",
    amount_cents: 20000,
    method: "Plin",
    funding_source: "manager_funds",
    fund_spent_cents: 20000,
    holder: "Asistente1",
    balance_after_cents: 30000,
    receipt_id: 10,
    reconciled: true,
    payment_date: "2026-10-21",
    created_at: "2026-10-21T15:00:00Z",
  };
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          balance_cents: updated ? 30000 : 50000,
          people: [
            {
              id: 2,
              name: "Asistente1",
              active: 1,
              balance_cents: updated ? 30000 : 50000,
            },
          ],
          totals: { delivered: 50000, spent: updated ? 20000 : 0, returned: 0 },
          reconciliation: {
            opening_cents: 0,
            closing_cents: updated ? 30000 : 50000,
          },
          movements: [],
          payment_activity: updated ? [event] : [],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  await render(
    e(Cash, {
      user: { id: 1, role: "owner" },
      month: "2026-10",
      refreshKey: null,
      onChanged: () => {},
      onSelect: (id) => {
        selected = id;
      },
    }),
  );
  assert.equal(container.querySelectorAll(".cash-payment-event").length, 0);
  updated = true;
  await act(async () => {
    window.dispatchEvent(new dom.window.Event("focus"));
  });
  assert.equal(container.querySelectorAll(".cash-payment-event").length, 1);
  const message = container.querySelector(".cash-payment-event").textContent;
  for (const fragment of [
    "Asistente1",
    "pagó",
    "200.00",
    "Gastado del fondo",
    "300.00",
    "Plin",
    "Hidrandina",
  ])
    assert.ok(message.includes(fragment), fragment);
  assert.equal(
    container.querySelector('[role="log"]').getAttribute("aria-live"),
    "polite",
  );
  assert.equal(
    container.querySelector(".cash-payment-event a").getAttribute("href"),
    "/api/receipts/10",
  );
  await click(container.querySelector(".cash-payment-event button"));
  assert.equal(selected, 5);
  await act(async () => {
    window.dispatchEvent(new dom.window.Event("focus"));
  });
  assert.equal(container.querySelectorAll(".cash-payment-event").length, 1);
});

test("The active stylesheet cascade colors titles, field labels and every loan schedule header green", () => {
  const view = new JSDOM(
    '<body><h1>Página</h1><div class="modal-head"><h2>Préstamo</h2></div><div class="loan-preview"><h3>Vista previa</h3></div><label class="field"><span>Capital</span><input></label><table class="report-table calculated-schedule"><thead><tr>' +
      [
        "Cuota",
        "Vencimiento",
        "Tipo",
        "Saldo inicial",
        "Interés",
        "Amortización",
        "Cuota a pagar",
        "Saldo final",
      ]
        .map((label) => `<th>${label}</th>`)
        .join("") +
      "</tr></thead></table></body>",
  );
  try {
    const table = view.window.document.querySelector("table");
    const viewport = view.window.document.createElement("div");
    viewport.className = "scrollable-table-body";
    table.replaceWith(viewport);
    viewport.append(table);
    const preview = view.window.document.querySelector(".loan-preview");
    const dialog = view.window.document.createElement("dialog");
    dialog.className = "modal wide";
    preview.replaceWith(dialog);
    dialog.append(preview);
    for (const file of [
      "src/styles.css",
      "src/white.css",
      "src/workflow.css",
    ]) {
      const style = view.window.document.createElement("style");
      style.textContent = readFileSync(file, "utf8");
      view.window.document.head.append(style);
    }
    assert.equal(
      view.window
        .getComputedStyle(view.window.document.documentElement)
        .getPropertyValue("--green")
        .trim(),
      "#087c5a",
    );
    for (const element of view.window.document.querySelectorAll(
      "h1,h2,h3,.field>span,thead th",
    ))
      assert.ok(
        ["var(--green)", "rgb(8, 124, 90)"].includes(
          view.window.getComputedStyle(element).color,
        ),
        element.textContent,
      );
    assert.equal(view.window.getComputedStyle(viewport).overflow, "auto");
    assert.ok(
      view.window.getComputedStyle(viewport).maxHeight.includes("52dvh"),
    );
    assert.equal(
      view.window.getComputedStyle(table.querySelector("th")).position,
      "sticky",
    );
    assert.equal(
      view.window.getComputedStyle(dialog).width,
      `${Math.min(1120, view.window.innerWidth - 28)}px`,
    );
  } finally {
    view.window.close();
  }
});
