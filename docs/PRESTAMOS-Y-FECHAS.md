# Préstamos calculados y fechas históricas

Condiciones confirmadas para Clara el 21 de octubre de 2026: el porcentaje representa el **interés total de todo el préstamo**, aplicado una sola vez al capital. El calendario es mensual, conservando el día del desembolso. Estas condiciones difieren del ejemplo del profesor, que avanza 30 días y cuyo primer interés corresponde al 17.02 % anual dividido entre 12.

## Entradas y cálculo

El asistente registra capital en soles, porcentaje total con hasta dos decimales (0 a 1000 %), desembolso, plazo entero de 1 a 120 cuotas y meses dobles (enero a diciembre). Los meses elegidos se repiten cada año. No se solicitan importes manuales de cuota ni de última cuota.

El servidor, en `server/loan-schedule.mjs`, calcula y vuelve a comprobar el cronograma al guardar:

1. Interés total = capital × porcentaje / 100, redondeado una sola vez al céntimo más próximo; medio céntimo se redondea hacia arriba.
2. Total a pagar = capital + interés total.
3. Cada cuota normal representa una unidad y cada doble, dos unidades. La cuota normal de referencia es total / unidades, truncada al céntimo para no consumir todo el contrato antes de la última cuota. Las cuotas dobles equivalen exactamente a dos normales, salvo el ajuste final.
4. La última cuota cobra exactamente el total menos las cuotas anteriores. Absorbe los céntimos restantes, también cuando cae en un mes doble.
5. El interés acumulado de cada fila se calcula proporcionalmente al importe acumulado de las cuotas, redondeado al céntimo. El interés de la fila es la diferencia respecto al acumulado anterior. Así, la suma de intereses coincide exactamente con el interés total.
6. Amortización = cuota − interés; saldo final de capital = saldo inicial − amortización. Cada saldo inicial es el saldo final anterior. La amortización acumulada coincide con el capital y la última fila cierra en S/0.00.

Las multiplicaciones y divisiones monetarias usan enteros `BigInt`; se persisten céntimos enteros JSON, nunca fracciones de céntimo. Se rechazan cronogramas con cuota no positiva, amortización no positiva o cuotas superiores al límite vigente de S/1,000,000.00 por operación. No se aceptan cuotas, totales ni filas de cronograma enviados por el cliente.

El interés se reparte proporcionalmente porque se conoce el porcentaje total, sin una tasa periódica pactada. No es una TEA, TNA ni TCEA. No incluye seguros, comisiones, mora o ajustes bancarios. Los contratos reales deben contrastarse con el cronograma emitido por la entidad. La [SBS distingue el reparto del interés total de la aplicación de una tasa anual sobre saldos](https://www.sbs.gob.pe/Portals/0/jer/opinion_proy_leg/2022/junio/1-OFICIO-N-22484-2022-SBS-PL-1564.pdf).

## Ejemplo de aceptación

Capital S/36,000.00; interés total 17.02 %; desembolso 05/03/2026; 24 cuotas; julio y diciembre dobles:

| Resultado                     | Importe / fecha         |
| ----------------------------- | ----------------------- |
| Interés total                 | S/6,127.20              |
| Total del cronograma          | S/42,127.20             |
| Cuota normal de referencia    | S/1,504.54              |
| Cuota doble, sin ajuste final | S/3,009.08              |
| Primera cuota                 | 05/04/2026              |
| Última cuota                  | 05/03/2028 · S/1,504.62 |
| Saldo final de capital        | S/0.00                  |

Este ejemplo es el resultado de las condiciones confirmadas; no reproduce los importes de la foto del BCP. Para desembolsos el día 31, febrero usa el 28 o 29 y marzo recupera el 31. Se emplean meses calendario, sin saltos por zona horaria ni periodos de 30 días.

## Fechas históricas e integridad

- Recibos, desembolsos y selector de mes: rango 1900–2099, sin mínimo relativo al día actual. El cronograma debe terminar dentro del rango.
- Se permite corregir el vencimiento de recibos antiguos respetando su fecha de emisión. Los vencimientos de las nuevas cuotas calculadas pertenecen al contrato y no se cambian por separado.
- Emisión, pagos y movimientos de efectivo ya realizados admiten fechas anteriores, pero no futuras. La emisión no puede superar el vencimiento.
- Un préstamo histórico genera sus cuotas sin marcarlas pagadas automáticamente. Las vencidas permanecen vencidas hasta registrar sus pagos con original y constancia.
- Efectivo: la entrega o devolución tiene su fecha efectiva. El pago en efectivo usa su fecha de pago para el movimiento relacionado. Los reportes calculan apertura, movimientos y cierre por esas fechas. Se comprueba el saldo por día: no se puede justificar un gasto pasado con una entrega posterior. Dentro del mismo día no se presume un horario de operación que no se ha capturado.
- La fecha real de registro y el actor permanecen en la auditoría; una fecha histórica no falsifica la fecha de creación.
- Los préstamos existentes conservan cuotas, importes, vencimientos, pagos, IDs y documentos. No se reconstruyen en las consultas ni se inventa un desglose que no fue registrado. Los movimientos de efectivo antiguos sin fecha efectiva conservan su fecha de registro en Lima.

## API y publicación

`POST /api/loans/preview` requiere sesión y CSRF; calcula sin guardar. `POST /api/loans` requiere rol asistente, calcula de nuevo y persiste todas las cuotas en una sola escritura con control de revisión. Las referencias duplicadas y la capacidad insuficiente rechazan todo el contrato, sin registros parciales. El gerente consulta el cronograma completo y sus constancias.

Los metadatos nuevos utilizan el documento compartido existente de D1. No se necesita una migración SQL ni cambios a los registros publicados.

Las pruebas incluyen redondeos, interés cero, cuota única, meses dobles, febrero bisiesto, fechas históricas, vista previa sin escrituras, conservación de contratos anteriores, permisos, pagos y cuadre histórico del efectivo. La validación visual interactiva quedó pendiente porque el uso del navegador local está deshabilitado en la configuración de Work; se comprueba el HTML renderizado y la API sin eludir ese bloqueo.
