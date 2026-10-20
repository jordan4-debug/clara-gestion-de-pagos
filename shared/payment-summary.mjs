import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";

export function summaryTotals(bills) {
  return bills.reduce(
    (sum, b) => ({
      total: sum.total + (b.amount_cents ?? 0),
      paid: sum.paid + b.paid_cents,
      pending: sum.pending + (b.remaining_cents ?? 0),
      undefined: sum.undefined + Number(b.amount_cents == null),
      overdue: sum.overdue + Number(b.status === "Vencido"),
    }),
    { total: 0, paid: 0, pending: 0, undefined: 0, overdue: 0 },
  );
}

export async function createPaymentSummary(
  bills,
  month,
  generatedAt = new Date(),
) {
  const rows = bills
    .filter((b) => b.month === month)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
  const totals = summaryTotals(rows),
    pdf = await PDFDocument.create();
  pdf.setTitle(`Clara - Resumen de pagos ${month}`);
  pdf.setAuthor("Clara Gestión de Pagos");
  pdf.setCreator("Clara Gestión de Pagos");
  pdf.setProducer("Clara Gestión de Pagos");
  pdf.setLanguage("es-PE");
  pdf.setCreationDate(generatedAt);
  const [font, bold] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const characters = new Set(font.getCharacterSet());
  const clean = (value) =>
    [
      ...String(value ?? "")
        .normalize("NFKC")
        .replace(/\s+/g, " "),
    ]
      .map((c) => (characters.has(c.codePointAt(0)) ? c : "?"))
      .join("");
  const pen = (cents) =>
    cents == null
      ? "Por definir"
      : "S/ " +
        new Intl.NumberFormat("es-PE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(cents / 100);
  const date = (value) =>
    value ? value.slice(0, 10).split("-").reverse().join("/") : "Sin registro";
  const ink = rgb(0.08, 0.19, 0.16),
    green = rgb(0.04, 0.43, 0.33),
    muted = rgb(0.36, 0.44, 0.41),
    line = rgb(0.85, 0.9, 0.87),
    pale = rgb(0.95, 0.98, 0.96);
  const [portraitWidth, portraitHeight] = PageSizes.A4;
  const width = portraitHeight,
    height = portraitWidth,
    margin = 36,
    tableWidth = width - margin * 2;
  const columns = [255, 80, 80, 90, 90, 90, tableWidth - 685];
  let page, y;
  const text = (value, x, top, size = 9, weight = font, color = ink) =>
    page.drawText(clean(value), {
      x,
      y: height - top - size,
      size,
      font: weight,
      color,
    });
  const right = (value, x, top, size = 9, weight = font) =>
    text(
      value,
      x - weight.widthOfTextAtSize(clean(value), size),
      top,
      size,
      weight,
    );
  function wrap(value, maxWidth, size = 9, weight = font) {
    const result = [];
    let part = "";
    for (const character of clean(value)) {
      if (part && weight.widthOfTextAtSize(part + character, size) > maxWidth) {
        result.push(part.trim());
        part = character.trimStart();
      } else part += character;
    }
    if (part || !result.length) result.push(part.trim());
    return result;
  }
  function newPage(first) {
    page = pdf.addPage([width, height]);
    text("CLARA", margin, 27, 12, bold, green);
    text("Gestión de pagos", margin + 52, 29, 9, font, muted);
    text("Resumen mensual de pagos", margin, 55, 22, bold);
    text(
      `Periodo ${month} | ${rows.length} obligaciones | ${totals.overdue} vencidas`,
      margin,
      88,
      10,
      font,
      muted,
    );
    if (first) {
      const cards = [
        ["Importe registrado", pen(totals.total)],
        ["Pagado", pen(totals.paid)],
        ["Pendiente", pen(totals.pending)],
      ];
      cards.forEach(([label, amount], index) => {
        const x = margin + index * (tableWidth / 3 + 4),
          w = tableWidth / 3 - 8;
        page.drawRectangle({
          x,
          y: height - 174,
          width: w,
          height: 58,
          color: pale,
        });
        text(label, x + 12, 125, 9, font, muted);
        text(amount, x + 12, 141, 18, bold, green);
      });
      text(
        totals.undefined
          ? `${totals.undefined} importes por definir, excluidos de los totales.`
          : "Importes del periodo, incluidas las cuotas de préstamos. El capital no se suma de nuevo.",
        margin,
        185,
        9,
        font,
        muted,
      );
      y = 211;
    } else y = 117;
    page.drawRectangle({
      x: margin,
      y: height - y - 29,
      width: tableWidth,
      height: 29,
      color: green,
    });
    let x = margin;
    [
      "Concepto / entidad",
      "Vencimiento",
      "Último pago",
      "Importe",
      "Pagado",
      "Pendiente",
      "Estado",
    ].forEach((label, index) => {
      text(label, x + 8, y + 8, 9, bold, rgb(1, 1, 1));
      x += columns[index];
    });
    y += 29;
  }
  newPage(true);
  if (!rows.length) {
    text(
      "No hay obligaciones registradas para este periodo.",
      margin + 8,
      y + 22,
      11,
    );
  }
  for (const [index, b] of rows.entries()) {
    const names = wrap(b.title, columns[0] - 16, 10, bold),
      entities = wrap(b.supplier, columns[0] - 16);
    const rowHeight = Math.max(45, (names.length + entities.length) * 13 + 16);
    if (y + rowHeight > height - 51) newPage(false);
    if (index % 2 === 0)
      page.drawRectangle({
        x: margin,
        y: height - y - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: rgb(0.98, 0.99, 0.98),
      });
    let top = y + 8;
    names.forEach((value) => {
      text(value, margin + 8, top, 10, bold);
      top += 13;
    });
    entities.forEach((value) => {
      text(value, margin + 8, top, 9, font, muted);
      top += 13;
    });
    let x = margin + columns[0];
    [
      date(b.due_date),
      date(b.last_payment_date),
      pen(b.amount_cents),
      pen(b.paid_cents),
      pen(b.remaining_cents),
      b.status,
    ].forEach((value, column) => {
      const w = columns[column + 1];
      if (column >= 2 && column <= 4) right(value, x + w - 8, y + 11);
      else
        text(
          value,
          x + 8,
          y + 11,
          9,
          column === 5 ? bold : font,
          column === 5 && b.status === "Vencido" ? rgb(0.66, 0.2, 0.2) : ink,
        );
      x += w;
    });
    y += rowHeight;
    page.drawLine({
      start: { x: margin, y: height - y },
      end: { x: width - margin, y: height - y },
      color: line,
      thickness: 0.5,
    });
  }
  const issued = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(generatedAt);
  pdf.getPages().forEach((p, index, pages) => {
    page = p;
    text(
      `Emitido ${issued} (Lima) | Montos en soles (PEN) | Control administrativo`,
      margin,
      height - 30,
      8,
      font,
      muted,
    );
    right(
      `Página ${index + 1} de ${pages.length}`,
      width - margin,
      height - 30,
      8,
    );
  });
  return pdf.save();
}
