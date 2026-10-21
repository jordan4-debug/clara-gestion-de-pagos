# Control administrativo de gastos · corrección vigente

Esta corrección sustituye el alcance anterior de simulación bancaria. Clara conserva React 19, TypeScript y Vite, el Worker de Cloudflare Pages, Cloudflare D1 y los archivos divididos en bloques dentro de la base existente.

## Roles y operaciones

- **Gerente** (`owner` en la base, por compatibilidad): consulta el resumen de gastos y los recibos, administra las entidades existentes y los avisos, administra el equipo privado, registra entregas de dinero y revisa las constancias. Puede completar el original y su número cuando falten y registrar un pago que ya ocurrió, con fecha y evidencia, sin ejecutar movimientos bancarios.
- **Asistente**: registra recibos, nuevas entidades desde sus formularios, préstamos ya contratados y sus originales; corrige vencimiento y notas de sus propios registros o de registros antiguos sin autor. Consulta el espacio compartido y registra pagos respaldados. Solo utiliza o devuelve el fondo a su cargo.
- Las acciones se validan en la API. Cambiar el nombre visible a Gerente no cambia IDs, roles internos ni contraseñas existentes. La publicación requiere correo y contraseña de cuentas privadas. Se eliminaron del código de la pantalla de acceso los botones de demostración.

## Ventanas de registro y presentación

Los títulos de páginas y ventanas, las etiquetas de campos y los encabezados del cronograma usan el verde de Clara. Las ventanas compartidas no se cierran al hacer clic fuera, en sus márgenes ni al pulsar Escape. Antes de guardar, el cierre debe ser explícito con la «X» o Cancelar. Mientras se guarda se bloquean el cierre, la cancelación, la navegación interna y los envíos repetidos, también cuando la operación ocurre dentro de la ventana (pago, original, revisión, corrección o entidad nueva). Al terminar se recuperan los controles; si falla, el formulario conserva los valores y muestra el error.

## Número del recibo

Se conserva como texto, sin convertir a número, recortar espacios o retirar ceros. El campo permite pegado normal y muestra errores específicos. El sistema aplica el formato guardado de la entidad. Los formularios muestran solamente el número del documento, sin un selector de letras o números. Se conservan estas reglas internas de validación:

| Formato      | Regla administrativa ajustable                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Numérico     | Entre 1 y 40 dígitos del 0 al 9.                                                                                           |
| Alfanumérico | Hasta 60 caracteres; grupos de letras y números separados opcionalmente por guion o barra. Sin espacios ni otros símbolos. |

Estas reglas no se presentan como formatos oficiales de Hidrandina, Sedalib ni ninguna otra entidad. Se centralizan en `shared/expenses.mjs`. El servidor compara el número dentro de la misma entidad, sin distinguir mayúsculas de minúsculas, y rechaza duplicados incluso en solicitudes concurrentes. Los ceros son significativos. Los registros históricos se conservan y no se renumeran.

## Dinero y fechas

Los importes continúan almacenados como enteros en céntimos. La conversión de texto separa parte entera y decimales y rechaza un tercer decimal; no redondea cantidades introducidas incorrectamente. Los campos monetarios de recibos, préstamos, cuotas, entregas y devoluciones rechazan letras, signos, comas, espacios y un tercer decimal tanto al escribir como al pegar. Se permite el punto decimal (por ejemplo, 1250.75). Los campos se normalizan a dos decimales al salir, los listados muestran soles y los cálculos usan enteros.

Se permiten fechas históricas de 1900 a 2099 en recibos, préstamos y selector mensual. Los pagos y movimientos de efectivo reales pueden registrarse con su fecha anterior, pero no futura. Se distinguen emisión opcional, vencimiento, fecha del pago realizado y fecha de registro en el sistema. El vencimiento ocurre al finalizar el día en Lima. Los registros antiguos sin fecha de pago usan su fecha de registro en Lima para los informes; la pantalla señala cuando no hay una fecha explícita. El total de gastos del mes suma pagos declarados por fecha de pago, incluidos los de deudas de otros periodos. El pendiente del mes se calcula por periodo de la obligación.

## Filtros independientes

| Vista          | Alcance                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deudas del mes | Deudas sin liquidar del mes elegido. Es la vista inicial. El control «Incluir deudas de los próximos meses» amplía la lista a las siguientes obligaciones, sin incluir recibos pagados. |
| Vencidos       | Deudas del mes sin liquidar cuyo día de vencimiento ya terminó en Lima.                                                                                                                 |
| Pagados        | Recibos del mes completamente liquidados, con acceso a constancias.                                                                                                                     |

Deudas del mes reemplaza a Pendientes como etiqueta de la primera pestaña. Se elimina Todos. Las cuatro tarjetas de resumen aparecen primero para ambos roles, antes de la tabla; sus contadores, búsqueda, categoría y exportación CSV usan el mismo filtro.

## Entidades y resumen PDF

El asistente puede agregar un proveedor o entidad desde el selector del recibo o préstamo. Un formulario integrado guarda la entidad y la selecciona, conservando concepto, número de recibo, importe y archivo del formulario principal. Ambos roles pueden crear entidades; solo el gerente modifica las existentes. Los nombres duplicados se rechazan incluso en solicitudes simultáneas. Se mantienen los controles de sesión y CSRF.

El botón Resumen PDF descarga un archivo del mes completo: importe registrado, pagado, pendiente, montos por definir, estado, entidad, vencimiento y fecha del último pago. Incluye las obligaciones liquidadas aunque no estén en la pestaña activa. La biblioteca se carga al pulsar el botón; el archivo se genera dentro del navegador sin servicios externos. Se repiten encabezados y se numeran las páginas. La descarga CSV conserva la lista filtrada.

## Alertas de variación de importes

El gerente ve los avisos después de las cuatro tarjetas iniciales. Mi cuenta permite activar o desactivar los avisos y configurar porcentaje mínimo (1 a 1000, entero) y diferencia mínima en soles (con hasta dos decimales). El umbral inicial es 20 % y S/10.00: deben cumplirse ambos. Los ajustes de variación y de vencimientos se guardan independientemente, conservando los otros valores.

Se compara el importe total del recibo, no lo abonado ni el efectivo entregado. La identidad es proveedor más código de suministro/contrato, normalizado sin distinguir mayúsculas o espacios exteriores. Se necesita exactamente un recibo por suministro y periodo, importe positivo y original con número en los dos registros. Se usa el último periodo anterior disponible y se muestran sus fechas; no se mezclan periodos futuros ni se supone continuidad mensual. Las referencias ficticias o vacías, documentos incompletos, periodos ambiguos y cuotas de préstamos quedan fuera de la comparación. La pantalla explica los casos sin base comparable en vez de considerarlos importes correctos.

Un aumento de S/100.00 a S/150.00 produce una diferencia de S/50.00 y 50 %. El umbral se evalúa con céntimos exactos, antes de redondear el porcentaje mostrado. El gerente accede a ambos originales y al detalle del pago con sus constancias. La alerta no acusa una irregularidad, no valida el movimiento bancario ni exige autorización previa para pagar. No se añade la justificación obligatoria ni el desglose de cargos de otras propuestas.

La migración `0009_entities_variation_alerts.sql` agrega nueve entidades financieras conservando proveedores, IDs, contratos, importes, archivos, entregas y pagos existentes. Reconoce los alias bancarios comunes y no sobrescribe sus referencias o categorías. Los valores de alertas se inicializan solo si faltan; no se reemplazan decisiones ya guardadas. La misma lista está disponible al crear un espacio nuevo.

La ampliación no necesita tablas o columnas nuevas. Si el operador puede publicar Pages pero no administrar D1, las entidades también se pueden registrar mediante `POST /api/suppliers` con una sesión autorizada; los umbrales por defecto se aplican al leer los ajustes existentes. La migración se puede ejecutar posteriormente sin duplicar esas entidades ni sobrescribir umbrales guardados.

## Efectivo

El dinero entregado al asistente se registra por separado y no crea pagos ni gastos. El pago declara su medio (Efectivo, transferencia, Yape, Plin, etc.) y el origen del dinero. Si usa el fondo del gerente, se descuentan sus fondos y se vinculan pago, constancia y movimiento en la misma escritura. El asistente tiene este origen seleccionado inicialmente; puede declarar otros fondos de forma explícita. El gerente debe indicar qué asistente tenía el dinero cuando registra un pago del fondo. No se permite usar fondos de otro asistente ni sobregirar el saldo.

El cuadre muestra apertura + entregas − pagos del fondo − devoluciones = cierre. Cada pago aparece en el historial del mes con actor, recibo, importe, medio, origen, cargo al fondo, saldo al registrar y acceso a la constancia. Los pagos con otros fondos aparecen con cargo cero. Los registros anteriores sin origen y sin movimiento vinculado se indican como tales, sin reclasificarlos ni descontarlos retroactivamente. Las devoluciones de prueba se conservan. El panel se actualiza cada 15 segundos mientras está visible, al recuperar el foco y después de operaciones locales; no crea mensajes duplicados por cada consulta.

Los movimientos conservan fecha efectiva y fecha de registro. El servidor valida el saldo cronológico diario e impide cubrir un pago anterior con una entrega posterior. Los registros antiguos sin fecha efectiva conservan el mes de registro en Lima. Ver [reglas y ejemplo completo](CONTROL-FONDO-Y-PAGOS.md).

## Préstamos y cuotas

La opción **Préstamos** está disponible para ambos roles. El asistente registra entidad, capital, tasa de interés anual nominal y fecha del primer vencimiento, plazo de 1 a 120 cuotas, meses con cuota doble, referencia y notas. El servidor calcula la vista previa y las cuotas; ya no se introducen importes manuales de cuota. Ver [fórmula y fechas históricas](PRESTAMOS-Y-FECHAS.md). El gerente consulta el cronograma y sus constancias; no registra contratos.

El sistema genera una obligación por cuota sin exigir autorización previa del gerente. Los importes se conservan, las cuotas comparten los permisos de sus recibos y se incluyen en deudas, filtros y totales mensuales sin sumar nuevamente el capital. Los meses cortos se ajustan al último día y los siguientes recuperan el día original. Se muestra capital, total del cronograma, pagado, pendiente, progreso y próximo vencimiento.

Antes de archivar un pago de cuota, el asistente responsable o el gerente adjunta el documento original con su número. Gerente o asistente puede registrar el pago realizado con constancia. Un pago con origen en el fondo del gerente utiliza el saldo entregado al asistente con las mismas validaciones del resto de obligaciones. Los pagos parciales existentes se conservan en el saldo.

El gerente puede retirar un préstamo sin abonos con `POST /api/loans/:id/archive`. Se retiran todas sus cuotas de las consultas, totales y pagos; los datos quedan recuperables con `POST /api/loans/:id/restore`. Los préstamos con pagos no se retiran.

Los préstamos anteriores reaparecen sin recrearlos ni modificar su dinero, cuotas o archivos. Los contratos identificados por entidad y referencia no pueden duplicarse, incluso en solicitudes simultáneas. El límite académico es de 30 préstamos y 300 obligaciones en total. El cálculo vigente usa el método francés, interés sobre saldo y tasa anual nominal dividida entre 12, con vencimientos mensuales; no solicita créditos ni desembolsa dinero. Los contratos anteriores no se recalculan.

## Funciones retiradas y compatibilidad

Se retiran de la navegación y se responde **410** en la API a presupuestos bancarios, simulador, checkout, generación de vouchers internos y plantillas del antiguo flujo. No se borran sus datos. El seguimiento administrativo de préstamos y cuotas permanece disponible. El respaldo administrativo del gerente conserva los datos originales para auditoría.

No se solicitan cuentas bancarias ni tarjetas. Las entidades solo exponen nombre, categoría, referencia administrativa y formato del recibo. Los campos bancarios y pasarelas antiguos no se devuelven como configuración activa. Registrar un pago y revisar su constancia son operaciones administrativas, no certificaciones bancarias.

## Migración y verificación

`0007_administrative_scope.sql` actualiza el nombre del gerente de demostración y añade el indicador de alcance administrativo a la configuración. No elimina tablas, cambia contraseñas ni modifica dinero o archivos anteriores. Los nuevos metadatos de recibos y pagos se añaden al documento compartido existente sin tablas duplicadas.

`0008_overdue_presentation_amounts.sql` corrige exclusivamente los dos ejemplos vencidos de luz e internet señalados para la presentación a S/ 100.00 y S/ 80.00. Comprueba identidad, periodo, fecha, importe anterior, ausencia de abonos y documentos antes de cambiar cada registro; conserva el importe anterior como metadato. No modifica el resto del espacio y no actúa sobre una base nueva sin esos ejemplos.

Aplicación local: `npm run db:local`. Publicación: `npm run deploy`, que ejecuta las migraciones pendientes en la base remota antes del despliegue.

Las pruebas cubren formatos y ceros iniciales, duplicados y concurrencia, céntimos exactos, filtros, fechas, permisos directos, registro de pagos, entregas sin gasto, rendición de efectivo, revisión de constancias, archivos de 5 MiB, cronogramas y registro de pagos de préstamos, conservación de contratos anteriores y renderizado de los paneles. Las pruebas HTTP generan datos solo en localhost, iniciando el servidor con `npm run dev -- --demo`. La comprobación publicada toma las credenciales de las variables locales `CLARA_MANAGER_EMAIL`, `CLARA_MANAGER_PASSWORD`, `CLARA_ASSISTANT_EMAIL` y `CLARA_ASSISTANT_PASSWORD`, nunca de claves escritas en el repositorio. La comprobación pública es de lectura y no crea pagos, recibos ni entregas.

No hay una decisión pendiente que impida el control administrativo. Los formatos oficiales particulares pueden ajustarse si el gerente aporta ejemplos. La revisión visual interactiva requiere habilitar el uso del navegador de esta sesión; las pruebas de renderizado no sustituyen esa inspección.

## Actualizaciones de la interfaz

Cada compilación publica un identificador en version.json. La página de entrada se revalida y, si hay una publicación nueva mientras la aplicación está abierta, aparece un aviso con Actualizar. No se recarga automáticamente un formulario en curso.
