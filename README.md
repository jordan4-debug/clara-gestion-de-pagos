# Clara · Gestión de pagos

Aplicación web en español para organizar obligaciones, proveedores, gastos recurrentes, autorizaciones y comprobantes. Interfaz blanca con acentos verdes, acceso mediante correo y contraseña, panel adaptable a computadora y celular. Montos en soles y horario de Lima.

## Tecnologías

| Parte         | Implementación                                         |
| ------------- | ------------------------------------------------------ |
| Interfaz      | React 19, TypeScript, Vite, DM Sans local y Lucide     |
| API           | Cloudflare Pages Functions, Worker en modo avanzado    |
| Base de datos | Cloudflare D1, SQL compatible con SQLite               |
| Comprobantes  | Archivos divididos en bloques de 64 KB guardados en D1 |
| Publicación   | Cloudflare Pages, proyecto `clara-gestion-de-pagos`    |

**Web publicada:** https://clara-gestion-de-pagos.pages.dev/

El proyecto funciona de forma independiente de Sites y no necesita una cuenta de ChatGPT para visitarlo o iniciar sesión.

## Trabajar en equipo

Repositorio: https://github.com/jordan4-debug/clara-gestion-de-pagos

```powershell
git clone https://github.com/jordan4-debug/clara-gestion-de-pagos.git
cd clara-gestion-de-pagos
code .
```

Seguir la instalación local de abajo y leer [CONTRIBUTING.md](CONTRIBUTING.md) para crear ramas y proponer cambios. Cada computadora utiliza su propia base local; clonar el proyecto no concede acceso a Cloudflare ni a la base publicada. Los cambios de código se publican en la web mediante el comando de despliegue del responsable, después de revisar e integrar las propuestas.

## Ejecutar en Visual Studio Code

Requiere Node.js 24.

```powershell
npm ci
npm run db:local
npm run dev
```

La dirección local es `http://127.0.0.1:8788`. El script compila y abre el servidor de Pages. Después de editar, ejecutar `npm run build` y recargar; Wrangler observa los archivos generados. La base local está en `.wrangler/` y es independiente de la base publicada.

## Acceso

El formulario valida correo y contraseña en el servidor, guarda hashes PBKDF2 con sal aleatoria y establece una sesión de 12 horas con cookie HttpOnly, SameSite, Secure en HTTPS y protección CSRF. Los intentos fallidos tienen límite por correo y origen de la solicitud. Los permisos de propietario y asistente se comprueban en la API.

Con `DEMO_MODE="true"` hay cuentas públicas para la presentación:

| Rol         | Correo                   | Contraseña pública de demostración |
| ----------- | ------------------------ | ---------------------------------- |
| Propietario | `propietario@demo.local` | `Propietario2026!`                 |
| Asistente   | `asistente@demo.local`   | `Asistente2026!`                   |

También pueden usarse los botones «Como propietario» y «Como asistente». Ambos accesos abren el mismo espacio de datos ficticios compartidos. Las contraseñas de estas cuentas no se cambian para evitar bloquear a otros participantes.

Para crear una cuenta privada en una terminal interactiva:

```powershell
npm run user:create -- --local
# Para la base publicada, elegir de forma explícita:
npm run user:create -- --remote
```

La contraseña se escribe localmente sin mostrarse ni incluirse en argumentos del proceso. No se publica una función de registro que permita a visitantes asignarse permisos de propietario. Para trabajar con cuentas privadas y datos de una empresa, crear las cuentas, cambiar `DEMO_MODE` a `"false"` y volver a publicar. El acceso público de demostración permite explorar todos sus registros; usar solo datos ficticios mientras esté activo.

Después de crear el primer propietario privado, iniciar sesión con él y abrir **Equipo** para crear integrantes con rol de propietario o asistente, activar o desactivar accesos y consultar el historial de cambios del equipo. Desactivar una cuenta cierra sus sesiones y conserva sus operaciones. Las cuentas públicas de demostración solo ven los integrantes ficticios y no pueden administrar cuentas privadas. No se debe colocar información real mientras `DEMO_MODE` siga activo, aunque ya existan cuentas privadas.

## Funciones

- Resumen del mes, saldo de los próximos siete días, pagos abonados y montos por definir.
- Proveedores, obligaciones y plantillas recurrentes; generación mensual sin duplicados y ajuste de días al calendario.
- Autorización o bloqueo por el propietario; reglas por monto y avisos dentro de la aplicación.
- Registro de abonos parciales o completos con número de operación y comprobante obligatorio.
- Prevención de duplicados y sobrepagos; bloqueo de edición después de un abono.
- Historial, exportación CSV y respaldo JSON protegido para el propietario.
- Panel propio del propietario: saldo requerido, autorizaciones, revisión de constancias y reportes.
- Bandeja del asistente: pagos listos, montos por completar, espera de autorización y comprobantes observados.
- Revisión de comprobantes con comentario, corrección del archivo, historial y control de revisiones concurrentes. Corregir una constancia no modifica ni duplica el importe abonado.
- Reportes por categoría y tendencia de seis meses, con fechas de registro en horario de Lima.
- Gestión de integrantes privados y revocación de sesiones, protegida en el servidor.

Ver [responsabilidades y flujo completo](docs/FLUJOS.md). La revisión de una constancia documenta la verificación del propietario; no confirma una transferencia con el banco.

**Los pagos reales están desactivados.** Registrar un pago externo no mueve dinero ni confirma una transferencia con el banco. Izipay es una etapa posterior que requiere un comercio habilitado y una integración verificada.

## Organización

```text
src/                 Interfaz, componentes y pantallas
server/api.mjs       API y validación de operaciones
server/auth.mjs      Cuentas, sesiones, permisos e inicio de sesión
server/passwords.mjs Hash y verificación de contraseñas
server/reviews.mjs   Revisión, observación y corrección de comprobantes
server/reports.mjs   Reportes por periodo y categoría
server/team.mjs      Administración de cuentas privadas y auditoría
server/cloud-state.mjs Persistencia compartida y cálculos
server/storage.mjs   Archivos divididos en bloques en D1
server/worker.mjs    Entrada de Pages Functions
migrations/          Esquema SQL, sin contraseñas ni datos de prueba
scripts/             Desarrollo, compilación y despliegue
tests/               Pruebas de seguridad, persistencia y operaciones
docs/                Diseño y guía de presentación
public/fonts/        Fuente local y licencia OFL
wrangler.jsonc       Proyecto y binding de la base D1
cloudflare-account.json Identificador público de la cuenta de despliegue
```

El espacio académico se guarda como un documento JSON limitado a 512 KB con revisión optimista: cada escritura comprueba la revisión leída y reintenta si otro participante modificó los datos. Los comprobantes se guardan por separado para no aumentar ese documento. El límite de demostración es de 300 obligaciones, 100 proveedores, 100 plantillas y 100 comprobantes, cada archivo de hasta 3 MB. Para ampliar a una operación financiera de producción se necesita normalizar el modelo y revisar límites, respaldo y recuperación.

## Publicar

```powershell
npx wrangler login --scopes account:read user:read pages:write d1:write
npm run deploy:setup
npm run deploy
```

La autorización se realiza en Cloudflare; no se deben enviar claves ni contraseñas por chat. Los scripts reutilizan el proyecto y la base existentes. `wrangler.jsonc` y `cloudflare-account.json` conservan los identificadores reales de base y cuenta devueltos por Cloudflare, que no son credenciales. Los tokens de OAuth permanecen en el almacén local de Wrangler y no se incluyen en el repositorio.

El enlace gratuito utiliza la terminación `pages.dev`. Un dominio propio es opcional y se registra por separado. La disponibilidad y los límites del servicio dependen de Cloudflare. La configuración de esta presentación no usa R2 ni activa planes de pago.

## Comprobar

```powershell
npm run check
npm test
npm run build
# Con el servidor local abierto:
node tests/integration.mjs
```

Las pruebas cubren contraseñas con sal, concurrencia, rechazo sin escrituras parciales, archivos de hasta 3 MB, inicio y cierre de sesión, roles, CSRF/origen, fechas de febrero, idempotencia mensual, abonos, duplicados y sobrepagos. La prueba HTTP genera registros ficticios y se niega a ejecutarse sobre un dominio público.

También se prueban observación y corrección sin alterar saldos, conservación de constancias anteriores, decisiones simultáneas, registros antiguos sin archivo, permisos de equipo, desactivación de cuentas, nueva autorización al cambiar el destino y el límite de mes en horario de Lima. `node scripts/smoke-live.mjs` comprueba el alojamiento publicado mediante lecturas y sesiones transitorias; no genera obligaciones ni abonos en la nube.

## Etapas pendientes

- Conectar Izipay y conciliar cobros reales al final de la implementación.
- Configurar el primer propietario privado y desactivar la demostración para usar datos reales.
- Recuperación de contraseña mediante un canal verificado y notificaciones por correo o WhatsApp.
- Separar los datos de negocio del documento JSON en tablas relacionadas, automatizar respaldos y ensayar recuperación antes de ampliar el volumen de uso.

## Traslado y respaldos

`scripts/import-previous-demo.mjs` recupera el espacio del alojamiento anterior y sus archivos. Se niega a sobrescribir una base de destino que ya contiene un espacio. Los respaldos y el SQL de importación están en `.local/`, fuera del repositorio. No se trasladan sesiones, cookies ni contraseñas del alojamiento anterior.

No incluir `.local`, `.wrangler`, `.env`, tokens, base local o archivos de usuarios al preparar un ZIP o repositorio. Las imágenes de concepto de `docs/` son referencias de diseño, no capturas de funcionalidades verificadas.
