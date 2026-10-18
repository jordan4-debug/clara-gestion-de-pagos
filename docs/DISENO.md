# Dirección visual de Clara

Se prepararon dos conceptos con Image Gen antes de implementar: `diseno-acceso-blanco.png` y `diseno-panel-blanco.png`. Son referencias de diseño. La interfaz final está construida con componentes HTML/React; no es una imagen de fondo ni una maqueta sin controles.

## Brief de los conceptos

**Panel:** aplicación de cuentas por pagar en español para un propietario y su asistente en Perú. Fondo blanco puro, texto verde carbón, acento esmeralda y zonas menta suaves. Tipografía DM Sans, controles legibles, navegación Resumen/Pagos/Recurrentes/Proveedores/Historial/Configuración, cuatro indicadores, tabla de obligaciones y columna derecha con preparación del mes, vencimientos y actividad. Conservar la información existente y evitar fotografías, gráficos inventados, degradados, vidrio, afirmaciones comerciales y decoración innecesaria.

**Acceso:** dos columnas blancas separadas por una línea fina. Marca Clara, texto «Todo en orden, cada mes.», explicación del sistema y dos beneficios. Formulario real con correo, contraseña, control para mostrarla, botón Iniciar sesión y acceso de demostración secundario para ambos roles. Mantener el vocabulario del panel, la paleta y controles implementables mediante HTML/CSS. No añadir un proveedor de identidad externo ni botones sin funcionamiento.

## Sistema aplicado

| Elemento | Valor |
| --- | --- |
| Fondo y superficies | `#ffffff` |
| Texto | `#17332b` |
| Acción principal | `#087c5a` |
| Acento suave | `#ebf6f0` |
| Bordes | `#e3eae6` |
| Texto secundario | `#65766f` |
| Fuente | DM Sans local, pesos 400–700 |
| Controles | Bordes suaves, campos de acceso de 60 px y foco visible |

`src/styles.css` contiene las bases y los componentes existentes; `src/white.css` define el tema blanco, las proporciones y las adaptaciones. Se conservaron los estados funcionales de las obligaciones. Los valores, nombres, avisos y actividades de la interfaz se calculan a partir de los datos guardados; las cifras de los conceptos son ilustrativas.

La revisión visual comparó composición, jerarquía tipográfica, paleta, controles, tabla, espaciado y distribución móvil. En celular la navegación está abajo, los formularios se apilan y la tabla permite desplazamiento dentro de su región sin ensanchar el documento. Se respeta la preferencia de movimiento reducido.
