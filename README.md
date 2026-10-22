# Finesa — Inventario TI y Actas Digitales

Plataforma corporativa integral para la gestión del ciclo de vida de activos tecnológicos, control de inventario de equipos de cómputo, generación y firma electrónica de actas digitales, administración de proveedores y portal de autoservicio para **Finesa S.A.**

---

## Características Principales

### 1. Gestión de Activos y Equipos de Cómputo
- **Ciclo de vida completo**: Estados parametrizados (disponible, asignado, mantenimiento, baja, contingencia/préstamo con fecha límite).
- **Trazabilidad total**: Historial inmutable de movimientos auditado automáticamente mediante triggers en base de datos.
- **Series y activos**: Verificación única de número de serie y placa de inventario corporativa.
- **Gestión de garantías y proveedores**: Vinculación de equipos con órdenes de compra, contratos y fechas de cobertura.

### 2. Actas Digitales con Firma Electrónica
- **Tipos de acta soportados**:
  - **Entrega**: Asignación formal de equipos a empleados.
  - **Devolución**: Reintegro de equipos con liberación automática de responsabilidades.
  - **Cambio**: Movimiento bidireccional atómico (entrega de equipo nuevo y devolución del reemplazado bajo una misma firma).
  - **Préstamo / Contingencia**: Asignación temporal con fecha de vencimiento y alertas de mora.
- **Firma electrónica**:
  - Captura táctil / canvas para firma presencial de técnico y empleado.
  - Enlaces de firma remota con token criptográfico protegido en servidor.
  - Generación de PDF oficial inmutable mediante `pdf-lib` en el servidor con marcas de tiempo, datos de auditoría e imagen de firmas incrustadas.

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
- Validación previa de integridad referencial, duplicados y dependencias antes de aplicar cambios en base de datos.

### 6. Catálogos Maestros y Auditoría
- **Catálogos cerrados**: Estandarización de marcas, modelos, tipos de equipo, sedes, áreas y empresas.
- **Bitácora de auditoría inmutable**: Registro de eventos críticos (inicios de sesión, cambios de estado, firmas, anulaciones) bloqueados contra eliminación o modificación.

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
   VITE_SUPABASE_PUBLISHABLE_KEY="tu_anon_public_key"
   SUPABASE_SERVICE_ROLE_KEY="tu_service_role_key"
   ```

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

---

## Licencia

Propiedad exclusiva de **Finesa S.A.** Todos los derechos reservados.
