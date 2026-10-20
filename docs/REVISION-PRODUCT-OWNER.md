# Revisión del Product Owner · 19 de octubre de 2026

> Documento histórico: el alcance vigente es [Control administrativo de gastos](ALCANCE-ADMINISTRATIVO.md). Las funciones bancarias descritas aquí están retiradas. El seguimiento de préstamos ya contratados está disponible según el alcance vigente.
> Documento histórico de la reunión. El catálogo del 20 de octubre reserva ahora los pagos al asistente y añade simulación bancaria. Ver [cobertura vigente](COBERTURA-REQUISITOS.md).

## Alcance confirmado

Clara organiza las deudas mensuales de una persona responsable y el trabajo de su asistente. La revisión no define un sector comercial concreto ni solicita un panel para clientes externos. Los proveedores son destinatarios de las obligaciones, no usuarios clientes de la aplicación.

## Decisiones y criterios de aceptación

| Referencia en la reunión  | Decisión                                                                                                                                       | Comprobación                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:00–02:26 y 07:39–08:34 | El asistente registra recibos y préstamos. El propietario supervisa y puede pagar excepcionalmente; el asistente realiza los pagos habituales. | La API rechaza el alta y edición de obligaciones o alta de préstamos realizada por el propietario. Su panel no muestra esas acciones.                                                                             |
| 01:39–02:26               | No hay aprobación previa de cada pago. Las excepciones se comunican de forma esporádica.                                                       | No aparece una cola de autorizaciones. No se añade un bloqueo obligatorio.                                                                                                                                        |
| 02:42–03:27               | Consultar meses anteriores y siguientes desde la misma pantalla; retirar menús de Historial y Recurrentes.                                     | Inicio en Deudas del mes con selector y flechas; cuatro opciones principales. Se conservan los registros y la auditoría interna.                                                                                  |
| 05:36–06:42               | Ver concepto, vencimiento, monto y total del mes. El pendiente disminuye al registrar pagos.                                                   | Total de las obligaciones del mes = abonado a esas obligaciones + pendiente. Los montos desconocidos se identifican por separado.                                                                                 |
| 07:39–09:23               | El propietario administra la información para pagar; el asistente la utiliza.                                                                  | Configuración de destinos y métodos dentro de Configuración, solo para propietario. No se guardan contraseñas bancarias ni números completos de tarjetas en esos formularios.                                     |
| 09:33–10:43               | El propietario necesita contrastar la deuda y la constancia, evitando registros sin respaldo.                                                  | Cada recibo manual nuevo exige un archivo original. Se archiva separado del voucher. El archivo original no se reemplaza silenciosamente. Los registros anteriores se conservan y se señala si falta el original. |
| 10:55–11:39               | Controlar efectivo entregado al asistente y respaldar el pago en ventanilla.                                                                   | Entregas por asistente, gastos vinculados al pago y devoluciones; no se permite gastar o devolver más de lo disponible.                                                                                           |
| 11:59–12:36               | Menos pasos y controles claros para una persona mayor.                                                                                         | Lista mensual desde el ingreso, acciones directas, navegación reducida, controles táctiles y datos secundarios plegados.                                                                                          |

## Efectivo

Se registra dinero que ya se entregó físicamente. No es una recarga ni un saldo bancario. El propietario registra entregas a un asistente identificado. El asistente utiliza únicamente su efectivo y puede registrar una devolución. Al guardar un pago en efectivo con constancia se descuenta el importe dentro de la misma operación de base de datos. Dos operaciones concurrentes no pueden consumir el mismo efectivo.

El propietario también puede registrar un pago con fondos propios; no se descuenta el dinero de un asistente si no se selecciona ese origen.

## Documentos y verificación

El recibo original respalda qué se debe; la constancia respalda el pago declarado. El propietario puede consultarlos desde la deuda y revisar u observar la constancia. Esto permite verificación humana, pero no detecta automáticamente documentos falsos ni confirma un movimiento con el banco.

## Pendientes externos

La pasarela y la confirmación bancaria automática siguen pendientes de credenciales, afiliación y alcance autorizado. No se generan QR ficticios ni estados de éxito de una transacción inexistente. Tampoco se almacenan credenciales o datos completos de tarjeta para que el asistente los consulte. Un medio tokenizado requerirá la integración oficial de la pasarela.

La transcripción y el audio se conservan fuera del repositorio público. Los pasajes poco claros no se convierten en requisitos adicionales.
