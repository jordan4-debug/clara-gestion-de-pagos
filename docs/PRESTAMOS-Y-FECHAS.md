# Préstamos: método francés y fechas históricas

La arquitectura sigue siendo React/TypeScript, API JavaScript en Cloudflare Pages y almacenamiento D1. El cambio de fórmula se aplica a los contratos nuevos; los contratos existentes conservan sus importes y su método registrado, incluidos los anteriores de interés total fijo.

## Entradas

Capital en soles, tasa anual nominal como texto decimal de hasta dos cifras decimales (0 a 1000 %), primer vencimiento, plazo de 1 a 120 cuotas y meses con cuota doble. La etiqueta **Fecha de vencimiento** identifica la primera cuota; no se suma un mes a esa fecha. Los meses dobles se repiten cada año y solo afectan las cuotas cuyos vencimientos caen en esos meses.

El formulario presenta **Fecha de desembolso** encima de **Fecha de vencimiento**. Registra cuándo se recibió el capital, admite fechas desde 1900 y no permite una fecha futura ni posterior al primer vencimiento. Se guarda en el contrato y se muestra al consultarlo. Es un dato administrativo independiente: no cambia la fórmula, los importes ni las fechas del cronograma. Los contratos anteriores y las solicitudes de versiones previas que no incluyen el dato siguen siendo compatibles y no reciben una fecha inventada.

## Fórmula financiera vigente

Se emplea la regla proporcional del ejemplo del profesor: `r = tasa_anual / 100 / 12`. El campo se llama tasa anual nominal para diferenciarlo de una tasa efectiva anual y del porcentaje total que utilizaba la versión anterior. Con capital S/36,000.00 y tasa 17.02 %, el primer interés es S/510.60.

La cuota base ordinaria se obtiene con la anualidad ponderada:

`C = P / Σ(w_t / (1+r)^t)`, para `t = 1...n`.

`w_t` vale 1 para cuotas normales y 2 para meses dobles. Sin meses dobles equivale a `C = P*r / (1-(1+r)^(-n))`. Cuando r es cero, la cuota base es capital / suma de pesos. Considerar los pesos en la anualidad permite conservar el plazo seleccionado y distribuir correctamente el capital.

Por fila:

1. Vencimiento: el primero es la fecha ingresada; los siguientes avanzan meses calendario, recuperando el día original después de meses cortos.
2. Saldo inicial: capital original en la primera fila y saldo final anterior en las demás.
3. Interés: saldo inicial × tasa anual nominal / 100 / 12, redondeado al céntimo con mitades hacia arriba.
4. Cuota a pagar: cuota base redondeada al céntimo, multiplicada por 2 en meses dobles. La última cuota es saldo de capital restante + interés del último mes y puede diferir del valor ordinario o doble para cerrar exactamente.
5. Amortización: cuota a pagar − interés. Se duplica la cuota, sin duplicar otra vez el interés del mismo mes.
6. Saldo final: saldo inicial − amortización. La suma de amortizaciones coincide exactamente con el capital; la última fila tiene saldo S/0.00.

El interés total y el total a pagar se obtienen sumando las filas realmente generadas; no se aplica el porcentaje anual una sola vez al capital. No se añaden seguros, comisiones, mora ni cargos que no hayan sido registrados.

## Precisión y guardado atómico

`server/loan-schedule.mjs` utiliza [decimal.js](https://mikemcl.github.io/decimal.js/) con un contexto independiente de 80 cifras y redondeo HALF_UP. La tasa llega como texto para evitar conversiones a punto flotante. El cálculo de la anualidad utiliza fracciones enteras BigInt exactas para preservar los casos de medio céntimo, incluso con tasas periódicas de decimales repetidos. El interés multiplica el saldo por el porcentaje anual antes de dividir; no redondea previamente la tasa mensual. Solo se convierten a Number los enteros seguros en céntimos al serializar el resultado.

Se rechazan cuotas o amortizaciones no positivas, vencimientos fuera del rango y cuotas que superan el límite de S/1,000,000.00 por operación. Si el plazo, el capital o una distribución de meses dobles no permiten amortización positiva al céntimo, se informa el error y no se guarda un cronograma inconsistente.

`POST /api/loans/preview` requiere sesión y CSRF y no escribe datos. `POST /api/loans` requiere rol asistente y recalcula todas las filas en el servidor. No acepta cuotas, totales, saldos ni filas calculadas por el cliente.

El contrato, sus cuotas y su auditoría se incorporan al mismo documento de estado. `mutateState` los guarda juntos mediante una única instrucción UPDATE de D1 condicionada a la revisión. Ante conflicto se reintenta con el estado nuevo; ante validación, capacidad insuficiente o error de escritura no persiste ni el contrato ni una parte de las cuotas. No se usa un bloque Django ficticio ni se agregan escrituras independientes de cada cuota. Se conserva la arquitectura autorizada por el usuario y no se necesita una migración SQL.

## Ejemplo y diferencia de calendario con la foto

Capital S/36,000.00; tasa nominal anual 17.02 %; primer vencimiento 04/04/2026; 24 cuotas; julio y diciembre dobles:

| Resultado                    | Calendario mensual confirmado | Foto del profesor, cada 30 días |
| ---------------------------- | ----------------------------: | ------------------------------: |
| Primer interés               |                      S/510.60 |                        S/510.60 |
| Cuota normal                 |                    S/1,526.07 |                      S/1,528.26 |
| Cuota doble sin ajuste final |                    S/3,052.14 |                      S/3,056.52 |
| Última fecha                 |                    04/03/2028 |                      23/02/2028 |
| Última cuota                 |                    S/1,525.93 |                      S/1,528.32 |
| Saldo final                  |                        S/0.00 |                          S/0.00 |

El calendario mensual genera los meses dobles en las filas 4, 9, 16 y 21. La foto usa filas 4, 10, 17 y 22, porque avanza exactamente 30 días y contiene dos vencimientos en octubre de 2026. Esto cambia la anualidad. La aplicación conserva los meses calendario confirmados por el usuario; no altera el capital, la tasa o las fechas para forzar los importes de una periodicidad diferente. La comparación se contrastó con un cálculo independiente en Python Decimal.

## Históricos y compatibilidad

- Primer vencimiento, recibos y selector mensual aceptan años 1900–2099 sin restricciones relacionadas con la fecha actual. El cronograma debe terminar dentro del rango.
- El 31 de enero continúa el 28 o 29 de febrero y recupera el 31 de marzo. La fecha ingresada pertenece a la primera cuota.
- Las cuotas históricas no se dan por pagadas: se registran pendientes o vencidas según corresponda; sus pagos requieren el original y la constancia.
- Los contratos anteriores de cuota manual o `total-interest-v1` no se recalculan ni se interpretan como tasas anuales. Se conservan sus IDs, importes, fechas, documentos, pagos y movimientos de efectivo.
- Los vencimientos de cuotas calculadas no se modifican por separado. El gerente conserva la consulta y revisión; el asistente registra contratos.
- Continúan las fechas efectivas de pagos y efectivo, las fechas reales de creación y la auditoría. Los pagos realizados no admiten fechas futuras. La conciliación impide cubrir un gasto pasado con una entrega posterior.
- Se conservan los títulos verdes y la protección de ventanas frente a clic fuera o Escape, también durante el guardado del préstamo.

## Verificación

Las pruebas comprueban intereses con una fórmula racional entera independiente, anualidad ordinaria y con pesos, cuotas dobles, redondeo de medio céntimo con tasas periódicas repetidas, interés cero, cuota única, cierre exacto, años anteriores, meses cortos, igualdad entre vista previa y persistencia, permisos, duplicados concurrentes y ausencia de escrituras parciales ante fallo de D1. Se prueba también la interacción real del formulario en un DOM con tasa textual, primer vencimiento histórico y bloqueo del cierre durante el guardado.
