# Finesa — Inventario TI y Actas Digitales

Sistema web y móvil (PWA) para la gestión de inventario de equipos de cómputo, proveedores, pedidos de reabastecimiento, actas digitales de entrega/devolución/cambio con firma electrónica, portal del empleado y auditoría para **Finesa S.A.**

## Tecnologías

- **Frontend / SSR:** TanStack Start + TanStack Router + React 19 + TypeScript
- **Estilos:** Tailwind CSS v4 + Radix UI
- **Base de datos y autenticación:** Supabase (PostgreSQL + RLS + Storage)
- **Generación de documentos:** `pdf-lib`, `jspdf`, `xlsx`

## Desarrollo local

```sh
bun install
bun run dev
```

La aplicación estará disponible en `http://localhost:8080`.
