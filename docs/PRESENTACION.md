# Espacio vacío para la presentación

Los módulos Deudas del mes, Vencidos, Pagados, Préstamos y Control de efectivo permanecen disponibles. Los registros se ingresarán durante la presentación.

Configuración del gerente contiene Equipo y acceso. El asistente administra Servicios y proveedores, ve Control administrativo y cambia su contraseña. La edición de entidades se valida por rol también en el servidor. El formulario de Vencimientos y avisos se retira; la campana sigue mostrando los próximos vencimientos con una anticipación fija de tres días. Las alertas de variación se eliminan del panel, el detalle, los ajustes y los cálculos del servidor.

## Respaldo y vaciado

El procedimiento de mantenimiento no aparece como botón en Configuración. Requiere una cuenta privada de gerente, sesión, origen, CSRF, contraseña actual, confirmación exacta y la huella SHA-256 del estado respaldado. Si alguien registra un cambio durante la descarga o antes del vaciado, la operación se detiene para exigir un respaldo actualizado.

El script `scripts/prepare-presentation.mjs` recibe `CLARA_MANAGER_EMAIL` y `CLARA_MANAGER_PASSWORD` en variables del entorno local. Sin argumentos **solo respalda**. El argumento `--reset` respalda y luego vacía el espacio; debe usarse únicamente cuando el responsable haya autorizado la limpieza.

El respaldo se guarda en `.local/respaldo-presentacion-<fecha>/` con estado completo, equipo sin contraseñas, manifiesto y archivos binarios originales identificados por ID. El manifiesto conserva nombres, tipos, claves y hashes. Se verifica cada archivo descargado antes de borrar. Los respaldos privados no se incluyen en Git ni en el ZIP del código.

El vaciado elimina las obligaciones de todos los meses y años, préstamos activos y archivados con sus cuotas, pagos con sus revisiones, originales y constancias, entregas, gastos y devoluciones, plantillas y actividad previa. Se conserva una entrada de auditoría de la preparación. No modifica cuentas, contraseñas, sesiones, catálogo de entidades ni historial de accesos del equipo.

La limpieza de registros usa una única escritura condicional del estado D1. Los archivos se retiran después de confirmar esa escritura; la respuesta informa cualquier fallo de borrado físico. Los IDs continúan aumentando para que enlaces o pestañas antiguas no afecten registros nuevos. Una publicación, consulta o cambio de mes no ejecuta la limpieza ni vuelve a generar datos.

Después del procedimiento se comprueban los módulos y saldos de ambos roles, la conservación del catálogo y del equipo, y que los documentos anteriores ya no sean accesibles. El sistema queda preparado para registrar recibos, préstamos y pagos nuevos con su flujo habitual.
