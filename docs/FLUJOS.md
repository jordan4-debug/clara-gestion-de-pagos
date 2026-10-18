# Responsabilidades y flujo de trabajo

## Permisos

| Acción                                                  | Propietario              | Asistente                                                                     |
| ------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| Consultar obligaciones y vencimientos                   | Sí                       | Sí                                                                            |
| Crear obligaciones, completar montos y preparar el mes  | Sí                       | Sí                                                                            |
| Registrar un abono externo autorizado con constancia    | Sí                       | Sí                                                                            |
| Autorizar o detener una obligación                      | Sí                       | No                                                                            |
| Revisar u observar una constancia                       | Sí                       | No                                                                            |
| Corregir un comprobante observado                       | Sí                       | Solo los registrados por su cuenta, o registros antiguos sin autor individual |
| Modificar proveedores, cuentas de destino y recurrentes | Sí                       | Solo consulta                                                                 |
| Consultar reportes y exportar respaldo completo         | Sí                       | No                                                                            |
| Cambiar reglas de autorización y avisos                 | Sí                       | No                                                                            |
| Crear o desactivar integrantes                          | Solo propietario privado | No                                                                            |
| Cambiar su contraseña                                   | Cuenta privada           | Cuenta privada                                                                |

Los permisos se comprueban en la API. Ocultar una opción en el menú no sustituye ese control.

## Operación normal

1. El propietario define proveedores, destinos, recurrentes, monto de autorización y anticipación de avisos.
2. El asistente prepara el mes sin duplicados y completa los montos variables cuando recibe cada factura.
3. Los pagos habituales autorizados aparecen en **Listos**. Las excepciones quedan **Por autorizar**; un cambio de destino o de importe previamente autorizado vuelve a requerir revisión.
4. El propietario consulta **Autorizaciones**, revisa el detalle y autoriza o mantiene detenido el pago. El asistente no puede hacerlo mediante la API.
5. El asistente realiza el pago fuera de la aplicación y registra el abono, medio, operación única y constancia. Se admiten abonos parciales; nunca se permite superar el saldo.
6. La constancia entra **Por revisar**. El propietario abre el archivo y elige **Marcar revisado** o **Observar**, explicando qué corregir.
7. El asistente ve la observación en **Mis comprobantes**, adjunta la constancia corregida y explica el cambio. El abono conserva su importe, operación y autor. El archivo anterior permanece accesible en el historial.
8. La nueva constancia regresa **Por revisar**. El propietario vuelve a verificarla. Una revisión antigua se rechaza si otra sesión ya cambió el comprobante.

**Pagado** significa que los abonos declarados cubren el saldo de una obligación. **Revisado** indica que el propietario verificó la constancia. Ninguno de esos estados comprueba por sí solo un movimiento en el banco; los pagos reales siguen desactivados.

## Cuentas y acceso

El primer propietario privado se crea con `npm run user:create -- --remote` en la computadora autorizada para Cloudflare. Después administra integrantes desde **Equipo**. Las cuentas compartidas de demo no pueden consultar usuarios privados ni crear cuentas. Antes de utilizar información real, cambiar `DEMO_MODE` a `"false"` y publicar de nuevo. Una cuenta desactivada no inicia sesión ni conserva acceso mediante una cookie anterior.

## Reportes

- El saldo pendiente corresponde a obligaciones cuyo vencimiento pertenece al mes seleccionado.
- Los abonos se agrupan por el momento en que se registraron, convertido al horario de Lima, aunque su obligación pertenezca a otro mes.
- La tendencia muestra seis meses de abonos registrados; la distribución por categoría muestra tanto saldos como abonos.
- La exportación CSV contiene las obligaciones del mes seleccionado. No es una conciliación bancaria.

## Límites actuales

Un solo espacio de trabajo compartido. Las cuentas se guardan en tablas; obligaciones, proveedores y abonos permanecen en un documento D1 con control de revisión. Los archivos tienen un máximo de 3 MB. El historial de negocio conserva hasta 500 eventos y la consulta devuelve 300; no es una bitácora financiera inmutable para uso regulado. Los avisos aparecen dentro de la web. No hay recuperación automática de contraseña ni conexión bancaria.
