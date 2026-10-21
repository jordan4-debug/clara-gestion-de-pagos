# Control del fondo entregado al asistente

El medio y el origen del pago son datos distintos. Una transferencia, un pago por Plin o uno en efectivo pueden utilizar el mismo fondo entregado por el gerente. El origen determina qué saldo se descuenta; el medio identifica cómo se realizó el pago.

## Recorrido

1. El gerente registra la entrega real, el asistente, la fecha y el motivo.
2. El asistente abre el recibo y registra el pago realizado, con medio, fecha, operación y constancia. El origen inicial es **Dinero entregado por el gerente**. La pantalla muestra el disponible y el saldo que quedará.
3. Al guardar, la API comprueba el saldo, el responsable y las fechas y registra juntos pago, constancia y descuento. Si falla, no se descuenta parcialmente ni se crea un pago incompleto. Dos pagos simultáneos no pueden utilizar el mismo saldo dos veces.
4. Control de efectivo muestra el nuevo saldo y, debajo del resumen, una actividad como: **Asistente1 pagó S/200.00 por Luz · Hidrandina. Medio: Plin. Gastado del fondo: S/200.00. Saldo por rendir al registrar el pago: S/300.00.**
5. El gerente puede abrir el recibo y la constancia desde el mensaje. La revisión administrativa del comprobante mantiene su flujo anterior.

Ejemplo: entrega S/500.00 − pago del fondo S/200.00 = saldo S/300.00. Si luego devuelve S/50.00, quedan S/250.00 por rendir. Una entrega no marca un recibo como pagado; una devolución no paga servicios.

Si realmente se utilizan recursos ajenos al fondo, debe elegirse **Otros fondos**. El pago aparece en la actividad con cargo S/0.00 al fondo del asistente y no cambia su saldo. El gerente que registra un pago con fondos de un asistente debe seleccionarlo; con otros fondos no se admite un asistente a cargo.

## Integridad e históricos

- `funding_source` identifica `manager_funds` u `other_funds` en los pagos nuevos. Se valida en el servidor y no depende del valor de `method`.
- El descuento se guarda como un movimiento `expense`, vinculado mediante `payment_id`, `bill_id` y `holder_id`. Guarda medio y saldo al registrar. El préstamo o recibo, pago, movimiento y auditoría usan el documento transaccional existente de D1; no se añaden tablas ni migraciones.
- La API comprueba que el fondo no se sobregire en su historial diario y valida a qué asistente pertenece. El asistente no puede cargar fondos de otro. Se mantienen las protecciones de sesión, CSRF, duplicados, originales y archivos.
- La actividad se calcula al consultar, sin guardar notificaciones nuevas por cada visita. Se actualiza automáticamente cada 15 segundos con la pestaña visible y al recuperar el foco. Se conserva el filtro por fecha efectiva del pago y el horario de Lima.
- El gerente ve los pagos del espacio de trabajo. El asistente ve sus pagos y los efectuados con su fondo. Los enlaces de documentos continúan protegidos por sesión.
- El saldo en cada mensaje nuevo corresponde al momento de registro. El saldo actual y el cierre del mes se presentan por separado; una entrega o devolución posterior no reescribe el mensaje anterior.
- Los pagos antiguos sin un origen explícito se conservan. Si tienen un gasto vinculado, el cargo al fondo se reconoce; si no lo tienen, se indica **Origen sin indicar en el registro anterior**, sin deducir dinero ni inventar su procedencia. Los clientes anteriores conservan su significado previo: el medio Efectivo con asistente a cargo utiliza el fondo, otros medios sin origen no se reclasifican automáticamente.
- La actividad señala vínculos inconsistentes, cargos duplicados o cargos ausentes. No modifica ni repara importes históricos automáticamente.

## Cronograma legible

El formulario del préstamo utiliza más ancho en escritorio. Cuando la tabla no cabe, dispone de barra horizontal y flechas arriba, sincronizadas con el desplazamiento de la tabla. La lista tiene un área vertical limitada y mantiene encabezados y totales visibles. No es necesario llegar a la última cuota para acceder a las columnas de la derecha. Los controles superiores se ocultan cuando todas las columnas caben.

## Pruebas

Se comprueban todos los medios de pago con el fondo, otros fondos sin cargo, registros antiguos, saldo insuficiente, responsables falsificados, doble consumo concurrente, pagos históricos y actividad sin escrituras. Las pruebas de interfaz cubren barra superior, flechas y sincronización, origen inicial del asistente, saldo insuficiente y refresco del panel con mensajes, comprobantes y saldo. La comprobación visual en un navegador real no está disponible en esta sesión; las pruebas de interacción usan el DOM de React y los estilos publicados se verifican por separado.
