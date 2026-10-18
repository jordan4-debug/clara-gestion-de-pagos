# Trabajar en Clara Gestión de Pagos

## Preparar la computadora

Instalar Git, Node.js 24 y Visual Studio Code. Clonar el repositorio y ejecutar:

```powershell
git clone https://github.com/jordan4-debug/clara-gestion-de-pagos.git
cd clara-gestion-de-pagos
npm ci
npm run db:local
npm run dev
```

Abrir `http://127.0.0.1:8788`. Las cuentas de demostración están en el README. La base de datos local es independiente para cada compañero. Después de editar, ejecutar `npm run build` y recargar el navegador.

## Proponer una mejora

Si tienes permiso de escritura, actualizar `main` y crear una rama por tarea:

```powershell
git switch main
git pull --ff-only origin main
git switch -c mejora/filtro-de-pagos
```

Realizar los cambios y comprobarlos:

```powershell
npm run check
npm test
npm run build
git add src README.md
git diff --cached
git commit -m "Agrega filtro de pagos por proveedor"
git push -u origin mejora/filtro-de-pagos
```

Adaptar los archivos de `git add` a la tarea. Abrir un **Pull request** hacia `main` en GitHub, explicar el cambio y adjuntar capturas si modifica la interfaz. Otro integrante revisa la propuesta antes de integrarla. GitHub Actions ejecuta los chequeos de TypeScript, las pruebas y la compilación en cada propuesta y envío a `main`.

El repositorio es público. Si todavía no tienes permiso de escritura, pulsa **Fork**, clona tu copia, crea la rama y abre el Pull request desde tu copia hacia el repositorio original. El propietario puede invitar colaboradores desde **Settings → Collaborators** usando sus usuarios de GitHub.

## Reparto sugerido

- Interfaz: `src/features/`, `src/components/` y estilos.
- Operaciones y permisos: `server/api.mjs`, `server/auth.mjs`, validaciones y pruebas.
- Persistencia: `server/cloud-state.mjs`, `server/storage.mjs` y nuevas migraciones SQL.
- Documentación y presentación: `README.md` y `docs/`.

Avisar al equipo antes de modificar archivos en los que otra persona ya trabaja. Mantener las comprobaciones de permisos en el servidor y los montos en soles. Agregar una nueva migración para un cambio de esquema ya publicado; no reescribir una migración aplicada.

## Datos y publicación

Usar información y comprobantes ficticios en la demostración. No subir tokens, archivos `.env`, `.dev.vars`, la base `.wrangler/`, respaldos `.local/` ni archivos de usuarios. Las contraseñas de demostración del README son públicas y solo sirven para datos ficticios.

Cloudflare conserva las credenciales de publicación fuera del repositorio. Los identificadores de `wrangler.jsonc` y `cloudflare-account.json` no son claves de acceso. Solo el responsable autorizado ejecuta `npm run deploy` para actualizar la web compartida; este repositorio no activa despliegues automáticos.

Los pagos reales siguen desactivados. La futura integración de Izipay debe validar el resultado en el servidor antes de registrar dinero recibido.
