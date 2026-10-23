-- =============================================================================
-- Migración: Garantizar buckets requeridos en Supabase Storage
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('actas', 'actas', false),
  ('facturas', 'facturas', false),
  ('firmas', 'firmas', false)
on conflict (id) do nothing;
