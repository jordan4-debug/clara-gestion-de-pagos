# Proveedores y canales de pago

Los proveedores de ejemplo incluyen Hidrandina, Sedalib, SATT y Caja Trujillo. Movistar y SUNAT se mantienen como entidades de alcance nacional. La inmobiliaria de ejemplo está identificada como ficticia.

| Entidad       | Canal de referencia                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hidrandina    | [Oficina Virtual Distriluz](https://servicios.distriluz.com.pe/OficinaVirtual/) · [guía institucional](https://www.gob.pe/32599-acceder-a-la-oficina-virtual-de-hidrandina-distriluz) |
| Sedalib       | [Oficina virtual](https://oficinavirtual.sedalib.com.pe/login)                                                                                                                        |
| SATT          | [Pagos en línea](https://digital.satt.gob.pe/pagos/) · [guía institucional](https://www.gob.pe/53495-realizar-pagos-en-linea-satt)                                                    |
| Caja Trujillo | [Página institucional](https://www.cajatrujillo.com.pe/), informativa; no se declara como checkout integrado                                                                          |

Los portales pertenecen a cada entidad y sus métodos dependen de sus condiciones. Clara abre el sitio oficial en otra pestaña; no captura sus contraseñas ni verifica movimientos bancarios. Los métodos se configuran según la relación real con el proveedor y no se debe suponer que todas las entidades aceptan Yape o Plin.

La migración 0004 cambia únicamente los nombres de proveedores originales de ejemplo y elimina sus datos bancarios antiguos para no confundir el destino. Mantiene obligaciones, importes, comprobantes, proveedores personalizados e historial. No introduce números de cuenta de entidades reales.

La integración Izipay está pendiente. La selección de su canal no activa cobros, y no hay QR generado por Clara. La siguiente etapa requiere validar credenciales, notificaciones, conciliación y las condiciones del comercio según la [documentación oficial](https://developers.izipay.pe/getting-started/).
