# Responsabilidades y flujo mensual

Clara permite a una persona responsable consultar sus deudas y delegar su registro y pago a un asistente. No se presume un sector comercial específico.

| Acción                                                            | Propietario                                     | Asistente                         |
| ----------------------------------------------------------------- | ----------------------------------------------- | --------------------------------- |
| Consultar deudas por mes y sus documentos                         | Sí                                              | Sí                                |
| Registrar recibos, definir montos y corregir vencimientos o notas | No                                              | Sí                                |
| Registrar préstamos y generar sus cuotas                          | No                                              | Sí                                |
| Consultar préstamos y abrir sus cuotas                            | Sí                                              | Sí                                |
| Registrar un pago externo con constancia                          | No; operación del asistente                     | Sí, operación habitual            |
| Revisar u observar constancias                                    | Sí                                              | No                                |
| Corregir una constancia observada                                 | Sí                                              | Solo propias o antiguas sin autor |
| Configurar entidades, destinos y métodos                          | Sí                                              | No                                |
| Registrar entregas de efectivo                                    | Sí                                              | No                                |
| Consultar efectivo                                                | Todos los asistentes del mismo ámbito de acceso | Solo el propio                    |
| Registrar devoluciones de efectivo                                | Sí                                              | Solo el propio                    |
| Administrar integrantes                                           | Propietario privado                             | No                                |

## Operación normal

1. El propietario ingresa al **Resumen ejecutivo** y el asistente a **Deudas del mes**. El selector y las flechas permiten consultar otros meses sin cambiar de pantalla.
2. El asistente pulsa **Registrar recibo**, completa concepto, entidad, monto y vencimiento y adjunta el recibo original. Las notas son opcionales.
3. El importe queda fijo. El asistente puede corregir vencimiento y notas mientras exista un pendiente. El propietario consulta los registros y no realiza el alta de recibos ni de préstamos.
4. Al abrir una deuda se puede consultar su recibo original, elegir el método y utilizar el canal de la entidad. No hay autorización previa obligatoria.
5. Tras pagar, se registra el importe pendiente, operación o número de constancia y el comprobante. La API admite abonos parciales; el formulario ofrece el pendiente completo sin cambiar el monto original.
6. El propietario compara recibo y constancia en el mismo detalle. Puede revisar u observar; las correcciones conservan archivos anteriores e importes.

## Totales

La pantalla principal muestra el total conocido de obligaciones del mes, los abonos de esas mismas obligaciones y el pendiente que disminuye al registrar pagos. Un pago realizado en otro mes sigue descontándose de la obligación correspondiente. Los importes por definir se indican y no se suman como un monto conocido.

Los reportes técnicos conservan su criterio por fecha de registro; no se confunden con el balance de obligaciones de la pantalla mensual.

## Efectivo

El propietario registra una entrega física al asistente. En **Control de efectivo**, ambos ven entregado, utilizado, devuelto y por rendir. El saldo por rendir incluye meses anteriores; los movimientos se filtran por mes. El asistente solo ve y usa su dinero a cargo.

Dentro de una deuda se elige **Efectivo** y se guarda la constancia del pago. El descuento de efectivo y el abono se registran conjuntamente. La aplicación rechaza fondos insuficientes, operaciones repetidas y devoluciones superiores al efectivo disponible. El propietario configura y supervisa el efectivo; el asistente registra los pagos.

## Navegación

La navegación principal contiene Deudas del mes, Préstamos, Control de efectivo y Configuración/Mi cuenta. Las entidades y los accesos del equipo se administran desde secciones desplegables de Configuración del propietario. No aparecen menús independientes de Historial, Proveedores o Recurrentes. Los registros antiguos, plantillas y eventos internos se conservan.

## Fechas y préstamos

Un pago vence al terminar su fecha en horario de Lima. Los préstamos generan cuotas mensuales ajustadas a meses cortos; el sistema registra importes del contrato y no calcula intereses. El asistente registra el préstamo y el propietario consulta su cronograma.

## Acceso y límites

La demostración pública sigue activa hasta configurar cuentas privadas y cambiar `DEMO_MODE` a `false`. Las cuentas de demostración no administran usuarios privados. Los avisos son internos; no hay envío de correo o WhatsApp ni recuperación automática de contraseña.

Hay un espacio de negocio compartido, con documento D1 protegido mediante revisión optimista, archivos de hasta 5 MiB, máximo de 30 préstamos, 300 obligaciones y 500 movimientos de efectivo. El registro documental no verifica una transferencia bancaria ni detecta falsificaciones. La integración de pagos reales sigue pendiente.

## Simulación bancaria académica

El propietario configura saldo inicial y cuenta de origen ficticia por mes desde Resumen ejecutivo. El asistente abre una deuda con original y número, pulsa Pagar en prueba y confirma. La operación comprueba fondos, guarda un voucher interno y actualiza el pendiente conjuntamente. Los reintentos no duplican descuentos. Los pagos externos permanecen como recorrido opcional separado. Ver [cobertura y reglas de los totales](COBERTURA-REQUISITOS.md).
