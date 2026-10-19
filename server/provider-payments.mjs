export function providerPayment(supplier) {
  const gateway =
    supplier.payment_gateway || (supplier.portal ? "portal" : "manual");
  const url = supplier.payment_url || supplier.portal || "";
  const methods =
    supplier.payment_methods ||
    (url
      ? ["Portal de entidad", "Transferencia", "Ventanilla", "Otro"]
      : ["Transferencia", "Yape", "Plin", "Ventanilla", "Otro"]);
  return {
    gateway,
    url,
    methods,
    recipient: supplier.name,
    integrated_enabled: false,
  };
}
export function assertProviderMethod(state, bill, method) {
  const supplier = state.suppliers.find((s) => s.id === bill.supplier_id);
  if (!providerPayment(supplier).methods.includes(method))
    throw Object.assign(
      new Error("Este método no está habilitado para el proveedor."),
      { status: 400 },
    );
}
