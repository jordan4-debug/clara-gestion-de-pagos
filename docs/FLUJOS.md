# Responsabilidades y flujo de trabajo

## Permisos

| Acción                                                      | Propietario              | Asistente                                        |
| ----------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| Consultar obligaciones y vencimientos                       | Sí                       | Sí                                               |
| Crear pagos, definir un importe pendiente y preparar el mes | Sí                       | Sí                                               |
| Editar vencimiento y notas de un pago pendiente             | Sí                       | Sí                                               |
| Cambiar el monto de un pago ya creado                       | No                       | No                                               |
| Registrar un pago externo con constancia                    | Sí                       | Sí                                               |
| Registrar préstamos y consultar sus cuotas                  | Sí                       | Sí                                               |
| Revisar u observar una constancia                           | Sí                       | No                                               |
| Corregir un comprobante observado                           | Sí                       | Solo los propios o antiguos sin autor individual |
| Configurar proveedores, métodos, destinos y recurrentes     | Sí                       | Solo consulta                                    |
| Consultar reportes y exportar respaldo completo             | Sí                       | No                                               |
| Configurar anticipación de avisos                           | Sí                       | No                                               |
| Crear o desactivar integrantes                              | Solo propietario privado | No                                               |
| Cambiar su contraseña                                       | Cuenta privada           | Cuenta privada                                   |

Los permisos se comprueban en la API. El asistente no necesita autorización del propietario para crear ni registrar un pago.

## Operación normal

1. El propietario registra proveedores y sus datos de destino. En **Proveedores → Métodos de pago** configura el canal y los medios que admite cada entidad.
2. El asistente prepara el mes sin duplicados. Los importes variables quedan por definir; al recibir el recibo se define su monto una sola vez.
3. Al crear un pago manual se fija el importe y se elige el vencimiento. El importe queda bloqueado para ambos roles, también mediante la API. Las notas son opcionales.
4. Dentro del pago creado, el asistente elige un método. El sistema muestra el portal del proveedor o las instrucciones de transferencia, billetera o ventanilla según su configuración.
5. El pago se realiza en el canal de la entidad. Abrir el portal o seleccionar un método no mueve dinero ni cambia el estado de la obligación. El formulario registra el pendiente completo con operación única y comprobante; la API también admite abonos parciales sin superar el pendiente.
6. La constancia entra **Por revisar**. El propietario abre el archivo y elige **Marcar revisado** u **Observar**, indicando qué corregir.
7. El asistente abre **Mis comprobantes**, adjunta la constancia corregida y explica el cambio. Se mantienen el importe, operación y autor del abono, y el archivo anterior permanece en el historial.
8. La constancia vuelve **Por revisar**. Una revisión antigua se rechaza si otra sesión ya la cambió.

**Pagado** significa que los abonos declarados cubren la obligación. **Revisado** indica que el propietario verificó la constancia. Estos estados no confirman por sí solos un movimiento bancario. Izipay y su QR permanecen pendientes de credenciales y validación.

## Fechas, préstamos y cierre de sesión

- Un pago sigue vigente durante todo su día de vencimiento en horario de Lima; pasa a vencido al día siguiente. No se permite crear un pago con una fecha ya vencida.
- Mientras quede un importe pendiente se puede corregir el vencimiento y las notas. Cambiar la fecha no modifica el monto; tampoco se permite trasladarla a un día ya pasado.
- **Préstamos** registra la entidad de la categoría Préstamos, el capital, las cuotas pendientes y su primer vencimiento. El número de contrato y las notas son opcionales.
- Cada cuota genera un pago fijo. El cronograma es mensual: una primera fecha del 31 genera el último día de febrero y vuelve al 31 en marzo. La última cuota puede tener un importe distinto.
- El sistema registra los importes del contrato, sin calcular intereses. El capital original puede ser distinto del total de las cuotas pendientes de un préstamo que ya estaba en curso.
- Cerrar sesión muestra una confirmación. Cancelar conserva la sesión; confirmar la revoca en el servidor y muestra un aviso de éxito en el acceso.
- Los totales representan obligaciones por pagar. La aplicación no tiene una billetera ni una función de recarga.

## Cuentas y acceso

El primer propietario privado se crea con `npm run user:create -- --remote` en la computadora autorizada para Cloudflare. Después administra integrantes desde **Equipo**. Las cuentas compartidas de demo no pueden consultar usuarios privados ni crear cuentas. Antes de usar información real, cambiar `DEMO_MODE` a `"false"` y publicar de nuevo. Una cuenta desactivada no inicia sesión ni conserva acceso con una cookie anterior.

## Reportes

- El pendiente corresponde a obligaciones cuyo vencimiento pertenece al mes seleccionado.
- Los abonos se agrupan por su momento de registro en horario de Lima, aunque la obligación pertenezca a otro mes.
- La tendencia muestra seis meses de abonos registrados; la distribución por categoría muestra pendientes y abonos.
- La exportación CSV contiene las obligaciones del mes seleccionado y no es una conciliación bancaria.

## Límites actuales

Un solo espacio compartido. Las cuentas se guardan en tablas; obligaciones, préstamos, proveedores y abonos permanecen en un documento D1 con control de revisión. Hay un máximo de 30 préstamos y 300 obligaciones, incluidas las cuotas. Los archivos admiten hasta 3 MB. El historial de negocio conserva hasta 500 eventos y devuelve 300; no es una bitácora financiera inmutable. Los avisos aparecen dentro de la web. No hay recuperación automática de contraseña ni conexión bancaria.
