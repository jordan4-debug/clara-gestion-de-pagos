# Control administrativo de gastos · corrección vigente

Esta corrección sustituye el alcance anterior de simulación bancaria. Clara conserva React 19, TypeScript y Vite, el Worker de Cloudflare Pages, Cloudflare D1 y los archivos divididos en bloques dentro de la base existente.

## Roles y operaciones

- **Gerente** (`owner` en la base, por compatibilidad): consulta el resumen de gastos y los recibos, configura entidades y avisos, administra el equipo privado, registra entregas físicas de efectivo y revisa las constancias. Puede registrar un pago que ya ocurrió, con fecha y evidencia, sin ejecutar movimientos bancarios.
- **Asistente**: registra recibos, préstamos ya contratados y sus originales; corrige vencimiento y notas de sus propios registros o de registros antiguos sin autor. Consulta el espacio compartido y registra pagos respaldados. Solo utiliza o devuelve efectivo a su cargo.
- Las acciones se validan en la API. Cambiar el nombre visible a Gerente no cambia IDs, roles internos ni contraseñas existentes. El acceso público conserva los botones de demostración y usa información ficticia.

## Número del recibo

Se conserva como texto, sin convertir a número, recortar espacios o retirar ceros. El campo permite pegado normal y muestra errores específicos. La entidad define el formato habitual; al crear o adjuntar un original puede seleccionarse el formato real del documento:

| Formato      | Regla administrativa ajustable                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Numérico     | Entre 1 y 40 dígitos del 0 al 9.                                                                                           |
| Alfanumérico | Hasta 60 caracteres; grupos de letras y números separados opcionalmente por guion o barra. Sin espacios ni otros símbolos. |

Estas reglas no se presentan como formatos oficiales de Hidrandina, Sedalib ni ninguna otra entidad. Se centralizan en `shared/expenses.mjs`. El servidor compara el número dentro de la misma entidad, sin distinguir mayúsculas de minúsculas, y rechaza duplicados incluso en solicitudes concurrentes. Los ceros son significativos. Los registros históricos se conservan y no se renumeran.

## Dinero y fechas

Los importes continúan almacenados como enteros en céntimos. La conversión de texto separa parte entera y decimales y rechaza un tercer decimal; no redondea cantidades introducidas incorrectamente. Los campos se normalizan a dos decimales al salir, los listados muestran soles y los cálculos usan enteros.

Se distinguen emisión opcional, vencimiento, fecha del pago realizado y fecha de registro en el sistema. El vencimiento ocurre al finalizar el día en Lima. Los registros antiguos sin fecha de pago usan su fecha de registro en Lima para los informes; la pantalla señala cuando no hay una fecha explícita. El total de gastos del mes suma pagos declarados por fecha de pago, incluidos los de deudas de otros periodos. El pendiente del mes se calcula por periodo de la obligación.

## Filtros independientes

| Filtro         | Alcance                                                |
| -------------- | ------------------------------------------------------ |
| Todos          | Recibos de todos los periodos del espacio compartido.  |
| Deudas del mes | Todos los recibos del mes seleccionado, pagados o no.  |
| Pendientes     | Recibos del mes sin liquidar cuya fecha aún no venció. |
| Vencidos       | Recibos del mes sin liquidar con fecha ya superada.    |
| Pagados        | Recibos del mes completamente liquidados.              |

Un vencido sigue formando parte del total por pagar, aunque se consulta en su pestaña específica. Los contadores respetan búsqueda y categoría; el pie muestra importe y pendiente de las filas visibles. La pestaña Todos identifica claramente su alcance de todos los periodos.

## Efectivo

La entrega física al asistente se registra por separado. No crea pagos ni modifica los gastos del mes. Solo guardar un pago con medio Efectivo consume fondos a cargo, con comprobación de saldo en la misma escritura. Las devoluciones no son gastos. Se muestran entregas, gastos y devoluciones del periodo, y el saldo acumulado por rendir. El historial identifica fecha, asistente y operación relacionada.

## Préstamos y cuotas

La opción **Préstamos** está disponible para ambos roles. El asistente registra un contrato ya celebrado: entidad de categoría Préstamos, capital, número de cuotas pendientes, importe mensual, primera fecha de vencimiento, última cuota opcionalmente diferente, referencia y notas. El gerente consulta el cronograma y sus constancias; no registra contratos.

El sistema genera una obligación por cuota sin exigir autorización previa del gerente. Los importes se conservan, las cuotas comparten los permisos de sus recibos y se incluyen en deudas, filtros y totales mensuales sin sumar nuevamente el capital. Los meses cortos se ajustan al último día y los siguientes recuperan el día original. Se muestra capital, total del cronograma, pagado, pendiente, progreso y próximo vencimiento.

Antes de archivar un pago de cuota, el asistente responsable adjunta el documento original con su número. Gerente o asistente puede registrar el pago realizado con constancia. Un pago en efectivo utiliza el saldo entregado al asistente con las mismas validaciones del resto de obligaciones. Los pagos parciales existentes se conservan en el saldo.

Los préstamos anteriores reaparecen sin recrearlos ni modificar su dinero, cuotas o archivos. Los contratos identificados por entidad y referencia no pueden duplicarse, incluso en solicitudes simultáneas. El límite académico es de 30 préstamos y 300 obligaciones en total. No se solicitan préstamos nuevos a entidades, se calculan intereses ni se desembolsa dinero.

## Funciones retiradas y compatibilidad

Se retiran de la navegación y se responde **410** en la API a presupuestos bancarios, simulador, checkout, generación de vouchers internos y plantillas del antiguo flujo. No se borran sus datos. El seguimiento administrativo de préstamos y cuotas permanece disponible. El respaldo administrativo del gerente conserva los datos originales para auditoría.

No se solicitan cuentas bancarias ni tarjetas. Las entidades solo exponen nombre, categoría, referencia administrativa y formato del recibo. Los campos bancarios y pasarelas antiguos no se devuelven como configuración activa. Registrar un pago y revisar su constancia son operaciones administrativas, no certificaciones bancarias.

## Migración y verificación

`0007_administrative_scope.sql` actualiza el nombre del gerente de demostración y añade el indicador de alcance administrativo a la configuración. No elimina tablas, cambia contraseñas ni modifica dinero o archivos anteriores. Los nuevos metadatos de recibos y pagos se añaden al documento compartido existente sin tablas duplicadas.

Aplicación local: `npm run db:local`. Publicación: `npm run deploy`, que ejecuta las migraciones pendientes en la base remota antes del despliegue.

Las pruebas cubren formatos y ceros iniciales, duplicados y concurrencia, céntimos exactos, filtros, fechas, permisos directos, registro de pagos, entregas sin gasto, rendición de efectivo, revisión de constancias, archivos de 5 MiB, cronogramas y registro de pagos de préstamos, conservación de contratos anteriores y renderizado de los paneles. Las pruebas HTTP generan datos solo en localhost. La comprobación pública es de lectura y no crea pagos, recibos ni entregas.

No hay una decisión pendiente que impida el control administrativo. Los formatos oficiales particulares pueden ajustarse si el gerente aporta ejemplos. La revisión visual interactiva requiere habilitar el uso del navegador de esta sesión; las pruebas de renderizado no sustituyen esa inspección.
