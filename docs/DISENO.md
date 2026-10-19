# Dirección visual de Clara

La interfaz utiliza componentes React, formularios y estados vinculados a la API. Cada rol tiene un panel enfocado en sus responsabilidades.

## Criterios de diseño

**Paneles por rol:** aplicación de cuentas por pagar en español para un propietario y su asistente en Perú. Fondo blanco, texto verde carbón, acento esmeralda y zonas menta suaves. Tipografía DM Sans, controles legibles y estados expresados mediante texto e iconos. El propietario prioriza vencimientos, comprobantes, obligaciones pendientes y reportes. El asistente trabaja con una bandeja de pagos listos, montos por completar, vencidos y correcciones. Ambos acceden a préstamos; la configuración de proveedores y métodos corresponde al propietario. La navegación de celular reúne las opciones secundarias en «Más». Los indicadores y gráficos proceden de los datos guardados.

**Acceso:** dos columnas blancas separadas por una línea fina. Marca Clara, texto «Todo en orden, cada mes.», explicación del sistema y dos beneficios. Formulario real con correo, contraseña, control para mostrarla, botón Iniciar sesión y acceso de demostración secundario para ambos roles. Mantener el vocabulario del panel, la paleta y controles implementables mediante HTML/CSS. No añadir un proveedor de identidad externo ni botones sin funcionamiento.

## Sistema aplicado

| Elemento            | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| Fondo y superficies | `#ffffff`                                               |
| Texto               | `#17332b`                                               |
| Acción principal    | `#087c5a`                                               |
| Acento suave        | `#ebf6f0`                                               |
| Bordes              | `#e3eae6`                                               |
| Texto secundario    | `#65766f`                                               |
| Fuente              | DM Sans local, pesos 400–700                            |
| Controles           | Bordes suaves, campos de acceso de 60 px y foco visible |

`src/styles.css` contiene las bases y los componentes existentes; `src/white.css` define el tema blanco y `src/workflow.css` organiza los paneles por rol, las revisiones y los reportes. Los valores, nombres, avisos y actividades se calculan a partir de los datos guardados.

La revisión visual comparó composición, jerarquía tipográfica, paleta, controles, tabla, espaciado y distribución móvil. En celular la navegación está abajo, los formularios se apilan y la tabla permite desplazamiento dentro de su región sin ensanchar el documento. Se respeta la preferencia de movimiento reducido.
