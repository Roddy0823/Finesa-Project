-- =============================================================================
-- FINESA S.A. — Mejoras de Seguridad Documental, Flujo de Baja y Storage WORM
-- =============================================================================

-- 1. Columna de integridad criptográfica para actas
alter table public.actas add column if not exists pdf_hash text;

-- 2. Columna para soporte técnico / acta de baja de equipos
alter table public.equipos add column if not exists baja_documento_path text;

-- 3. Actualizar RPC cambiar_estado_equipo para recibir documento de baja
-- Eliminar la versión previa de 4 argumentos para evitar sobrecarga ambigua en PostgREST
drop function if exists public.cambiar_estado_equipo(uuid, public.equipo_estado, text, uuid);

create or replace function public.cambiar_estado_equipo(
  p_equipo uuid,
  p_estado public.equipo_estado,
  p_motivo text,
  p_proveedor uuid default null,
  p_documento_baja text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.equipos;
  es_admin boolean := public.has_role(auth.uid(), 'admin');
  pn text;
  det_hist text;
begin
  if not public.has_permiso(auth.uid(), 'equipos_editar') then raise exception 'Sin permiso'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'El motivo es obligatorio'; end if;
  if p_estado = 'asignado' then raise exception 'Asignado solo se obtiene con un acta de entrega firmada'; end if;
  if p_estado = 'de_baja' and not es_admin then raise exception 'Solo el Administrador puede dar de baja equipos'; end if;
  select * into e from public.equipos where id = p_equipo;
  if e.estado = 'de_baja' then raise exception 'El equipo ya está dado de baja'; end if;
  if e.estado = 'asignado' and p_estado <> 'en_reparacion' and not es_admin then
    raise exception 'El equipo está asignado; realice primero el acta de devolución';
  end if;
  if p_proveedor is not null then
    select nombre into pn from public.proveedores where id = p_proveedor and owner_id = e.owner_id;
  end if;

  det_hist := 'Motivo: ' || p_motivo || coalesce(' · Proveedor de servicio: ' || pn, '');
  if p_estado = 'de_baja' and p_documento_baja is not null then
    det_hist := det_hist || ' · Soporte de baja adjunto';
  end if;

  perform set_config('app.estado_ok', '1', true);
  perform set_config('app.hist_evento', p_estado::text, true);
  perform set_config('app.hist_detalle', det_hist, true);
  update public.equipos set
    estado = p_estado,
    empleado_id = case when p_estado = 'en_reparacion' then e.empleado_id else null end,
    reparacion_proveedor_id = case when p_estado = 'en_reparacion' and pn is not null then p_proveedor else null end,
    reparacion_inicio = case when p_estado = 'en_reparacion' then now() else null end,
    baja_documento_path = case when p_estado = 'de_baja' and p_documento_baja is not null then p_documento_baja else e.baja_documento_path end
  where id = p_equipo;

  if p_estado = 'en_reparacion' then
    insert into public.reparaciones(equipo_id, proveedor_id, owner_id)
    values (p_equipo, case when pn is not null then p_proveedor end, e.owner_id);
  elsif e.estado = 'en_reparacion' then
    update public.reparaciones set fin = now() where equipo_id = p_equipo and fin is null;
  end if;
  perform set_config('app.estado_ok', '', true);
  perform set_config('app.hist_evento', '', true);
  perform set_config('app.hist_detalle', '', true);
end $$;

grant execute on function public.cambiar_estado_equipo(uuid, public.equipo_estado, text, uuid, text) to authenticated, service_role;

-- 4. Políticas WORM en Storage (bloqueo de UPDATE y DELETE en el bucket 'actas')
drop policy if exists "Bloquear modificacion de actas" on storage.objects;
create policy "Bloquear modificacion de actas" on storage.objects for update to authenticated
  using (false);

drop policy if exists "Bloquear eliminacion de actas" on storage.objects;
create policy "Bloquear eliminacion de actas" on storage.objects for delete to authenticated
  using (false);

-- 5. RPC para conteo optimizado de actas por estado en servidor
create or replace function public.panel_conteos_actas()
returns table(estado public.acta_estado, total bigint)
language sql stable security invoker set search_path = public as $$
  select a.estado, count(*) from public.actas a where a.owner_id = public.my_owner_id() group by a.estado
$$;

grant execute on function public.panel_conteos_actas() to authenticated, service_role;

