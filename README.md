# Finesa — Inventario TI y Actas Digitales

Plataforma corporativa integral para la gestión del ciclo de vida de activos tecnológicos, control de inventario de equipos de cómputo, generación y firma electrónica de actas digitales, administración de proveedores y portal de autoservicio para **Finesa S.A.**

---

## Características Principales

### 1. Gestión de Activos y Equipos de Cómputo
- **Ciclo de vida completo**: Estados parametrizados (disponible, asignado, en alistamiento, en reparación, de baja definitivo y contingencia/préstamo con fecha límite).
- **Flujo de baja con soporte adjunto**: Proceso formal de desincorporación de activos fijos con soporte técnico o acta pericial adjunta (`baja_documento_path`), trazabilidad contable y enlaces firmados de consulta.
- **Trazabilidad total**: Historial inmutable de movimientos auditado automáticamente mediante triggers en base de datos.
- **Series y activos**: Verificación única de número de serie y placa de inventario corporativa con corrección auditada exclusiva para el Administrador (`corregir_serie`).
- **Gestión de garantías y proveedores**: Vinculación de equipos con órdenes de compra, contratos y fechas de cobertura.
- **Paginación en servidor**: Consultas paginadas por rango (`.range()`) con conteos exactos y sincronización reactiva en la URL (búsqueda, estado, sede, marca, tipo y página).

### 2. Actas Digitales con Firma Electrónica y Blindaje Criptográfico
- **Tipos de acta soportados**:
  - **Entrega**: Asignación formal de equipos a empleados.
  - **Devolución**: Reintegro de equipos con liberación automática de responsabilidades.
  - **Cambio**: Movimiento bidireccional atómico (entrega de equipo nuevo y devolución del reemplazado bajo una misma firma).
  - **Préstamo / Contingencia**: Asignación temporal con fecha de vencimiento y alertas de mora.
- **Firma electrónica y sellado criptográfico**:
  - Captura táctil / canvas para firma presencial de técnico y empleado con validación estricta de Magic Bytes PNG en servidor.
  - Enlaces de firma remota con token criptográfico protegido en servidor.
  - Generación de PDF oficial 100% en servidor mediante `pdf-lib` con marcas de tiempo, datos de auditoría e imagen de firmas incrustadas.
  - **Hash SHA-256 de integridad documental**: Sellado criptográfico del PDF firmado (`pdf_hash`), persistido en base de datos y registrado en auditoría.
  - **Políticas WORM en Storage**: Reglas de inmutabilidad estricta (Write Once, Read Many) que impiden modificaciones (`UPDATE`) o eliminaciones (`DELETE`) de actas en storage.

### 3. Portal de Autoservicio del Empleado
- **Autenticación sin fricción**: Ingreso seguro mediante número de cédula y PIN personal de 4 dígitos (protegido con HMAC y bloqueo tras 5 intentos fallidos).
- **Consulta de activos**: Visualización de equipos actualmente a cargo y especificaciones técnicas.
- **Repositorio personal de actas**: Descarga de actas firmadas en formato PDF.
- **Paz y salvo digital**: Consulta del estado de paz y salvo en tiempo real para procesos de desvinculación o traslado.
- **Reporte de incidencias**: Registro de fallas técnicas directamente a la mesa de soporte.

### 4. Reabastecimiento y Proveedores
- **Gestión de proveedores**: Directorio de aliados estratégicos y catálogo de artículos suministrados.
- **Pedidos de compra**: Flujo de solicitud, aprobación y recepción.
- **Recepción de stock**: Procesamiento atómico vía RPC en base de datos que ingresa los equipos y actualiza el pedido en una sola transacción segura.

### 5. Carga Masiva Inteligente
- Importación y actualización de catálogos, empleados, equipos y asignaciones mediante plantillas Excel (`.xlsx`).
- Pre-validación transaccional exhaustiva: cotejo de seriales duplicados, activos fijos y cédulas contra la base de datos y dentro del archivo antes del commit en lote.
- Vista previa interactiva con desglose de filas válidas, existentes y con error, inserción en lotes de 200 y aislamiento automático ante inconsistencias.

### 6. Catálogos Maestros y Auditoría Ligera
- **Catálogos cerrados**: Estandarización de marcas, modelos, tipos de equipo, sedes, áreas y empresas.
- **Bitácora de auditoría inmutable**: Registro de eventos críticos (inicios de sesión, cambios de estado, firmas, anulaciones) bloqueados contra eliminación o modificación.
- **Carga optimizada de auditoría**: Proyección en servidor de columnas ligeras con carga bajo demanda de diferencias `JSONB` (`antes` y `despues`) al expandir filas, eliminando transferencia masiva de datos en listas y exportación.

---

## Arquitectura y Seguridad

- **Multi-ecosistema (Aislamiento de datos)**: Filtrado estricto por `owner_id` en PostgreSQL mediante políticas RLS (Row Level Security).
- **Lógica de negocio en base de datos**: Reglas críticas (paz y salvo, transiciones de estado, inmutabilidad de series) residen en triggers y RPCs de Postgres para máxima seguridad.
- **Roles y permisos granulares**: Control de acceso basado en roles (`admin`, `auxiliar`, `empleado`) y permisos por acción en `user_permisos`.
- **Identidad de marca y modo oscuro/claro**:
  - Detección automática del tema del sistema con selector manual.
  - Logotipos vectoriales y rasterizados oficiales de Finesa que se alternan dinámicamente según el tema seleccionado.

---

## Tecnologías

- **Runtime:** [Bun](https://bun.sh/)
- **Frontend / SSR:** [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) + [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Estilos y UI:** [Tailwind CSS v4](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) + [Lucide Icons](https://lucide.dev/) + [Sonner](https://sonner.emilkowal.ski/)
- **Estado del servidor:** [TanStack Query](https://tanstack.com/query)
- **Base de datos y Storage:** [Supabase](https://supabase.com/) (PostgreSQL 15+, Auth, RLS, Storage)
- **Generación de documentos:** `pdf-lib`, `jspdf`, `xlsx`

---

## Puesta en Marcha Local

### Requisitos Previos

- [Bun](https://bun.sh/) (v1.1+ recomendado)
- Instancia de [Supabase](https://supabase.com/) configurada con las migraciones y RPCs del proyecto

### Configuración del Entorno

1. Clona el repositorio:
   ```sh
   git clone https://github.com/tu-organizacion/inventario-ti.git
   cd inventario-ti
   ```

2. Copia la plantilla de variables de entorno y ajusta las credenciales:
   ```sh
   cp .env.example .env
   ```

3. Edita `.env` con los valores de tu proyecto Supabase:
   ```env
   VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="tu_publishable_key"
   SUPABASE_URL="https://tu-proyecto.supabase.co"
   SUPABASE_PUBLISHABLE_KEY="tu_publishable_key"
   SUPABASE_SERVICE_ROLE_KEY="tu_service_role_key"
   ```

### Auth y rutas protegidas

El personal ingresa con correo y contraseña de Supabase Auth; los empleados usan `ingresoEmpleado` con cédula y PIN. No hay registro público de administradores: su asignación se realiza exclusivamente por SQL.

Las rutas bajo `_authenticated` validan la identidad con `getUser()` y consultan el perfil, roles y permisos antes de permitir la navegación. `src/lib/route-access.ts` define el acceso por URL: los empleados usan `/mi-portal` y `/ajustes`, y el personal accede a los módulos según sus permisos. Las cuentas inactivas o sin rol ven la pantalla de cuenta sin acceso. Al cerrar sesión o cambiar de usuario se limpia la caché de consultas.

La sesión del navegador se mantiene en localStorage, y este grupo de rutas tiene SSR deshabilitado. Las funciones protegidas de servidor reciben un Bearer token, validan sus claims y el estado activo mediante `requireSupabaseAuth`. Las políticas RLS y las RPC siguen siendo responsables de autorizar los datos y operaciones.

Configura las variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` también en el servidor. La clave `SUPABASE_SERVICE_ROLE_KEY` es exclusiva del servidor y nunca debe llevar el prefijo `VITE_`.

### Instalación y Ejecución

```sh
# Instalar dependencias
bun install

# Iniciar servidor de desarrollo
bun run dev
```

La aplicación estará disponible en `http://localhost:8080`.

### Scripts Disponibles

- `bun run dev`: Inicia el servidor de desarrollo en Vite.
- `bun run build`: Genera la compilación de producción optimizada.
- `bun run preview`: Previsualiza la versión construida.
- `bun run lint`: Ejecuta el análisis estático de código con ESLint.
- `bun run format`: Aplica el formateador Prettier a los archivos del proyecto.
- `bun run test`: Ejecuta la suite completa de pruebas automatizadas (140 pruebas: unitarias y RLS).
- `bun run test:unit`: Ejecuta las pruebas unitarias de funciones críticas de servidor (`firmas.server`, `acceso-empleado.server`, `usuarios.functions`, `security.server`).
- `bun run test:rls`: Ejecuta las pruebas de integración para políticas RLS, triggers y RPCs sobre Postgres en memoria (PGlite).

---

## Suite de Pruebas Automatizadas

El proyecto cuenta con una batería de pruebas automatizadas configurada con [Vitest](https://vitest.dev/) y PostgreSQL embebido ([PGlite](https://pglite.dev/)):

1. **Pruebas Unitarias de Servidor (`tests/unit/`)**:
   - `firmas.server.test.ts`: Validación de DTOs de acta, generación de PDFs oficiales con `pdf-lib`, incrustación de firmas PNG y flujo completo de firma y auditoría.
   - `acceso-empleado.server.test.ts`: Normalización de cédula, generación segura de PIN criptográfico de 4 dígitos y derivación de contraseñas internas mediante HMAC-SHA256 con secreto de servidor.
   - `security.server.test.ts`: Rate limiting en memoria por IP/acción, política de contraseñas y validación estricta de Magic Bytes / chunks IHDR en imágenes de firmas.
   - `usuarios.functions.test.ts`: Acciones de servidor para creación y edición de auxiliares, asignación de permisos, suspensión/reactivación, gestión de catálogos y portal del empleado.

2. **Pruebas de Integración de RLS y Triggers (`tests/rls/`)**:
   - `ecosistema.test.ts`: Aislamiento multi-ecosistema estricto vía `owner_id` y `my_owner_id()` (Admin A y Auxiliar A no ven ni modifican datos del Ecosistema B).
   - `permisos-roles.test.ts`: Protección del rol admin (`user_roles_guard_admin`, índice único `user_roles_un_solo_admin`) y permisos granulares de actas y equipos.
   - `equipos-triggers.test.ts`: Inmutabilidad del número de serie, bloqueo de transiciones de estado directas, generación automática de historial e imposición de regla de paz y salvo en el retiro de empleados.
   - `portal-empleado.test.ts`: Visibilidad restringida del empleado (únicamente sus equipos asignados, sus actas firmadas y reporte de fallas de sus activos).
   - `actas-auditoria.test.ts`: Inmutabilidad estricta de la bitácora de auditoría (bloqueo de `UPDATE`/`DELETE`), transiciones atómicas al firmar actas, sellado de `pdf_hash`, políticas WORM en storage y RPC `panel_conteos_actas`.

---

## Licencia

Propiedad exclusiva de **Finesa S.A.** Todos los derechos reservados.
