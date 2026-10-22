-- Endurece la asignación de carga inicial: solo equipos y empleados activos del
-- mismo ecosistema (owner_id) del usuario, con límite de tamaño por llamada.
create or replace function public.asignar_carga_inicial(p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  n int := 0;
  v_owner uuid := public.my_owner_id();
  v_service boolean := auth.role() = 'service_role';
begin
  if not (public.has_permiso(auth.uid(), 'cargas_masivas') or v_service) then
    raise exception 'Sin permiso para cargas masivas';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Formato de asignaciones inválido';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'Máximo 1000 asignaciones por llamada';
  end if;
  perform set_config('app.estado_ok', '1', true);
  perform set_config('app.hist_evento', 'carga_inicial', true);
  perform set_config('app.hist_detalle', 'Asignación registrada en carga inicial de inventario (sin acta)', true);
  for it in select * from jsonb_array_elements(p_items) loop
    update public.equipos e
       set estado = 'asignado', empleado_id = emp.id
      from public.empleados emp
     where e.id = (it->>'equipo_id')::uuid
       and emp.id = (it->>'empleado_id')::uuid
       and e.estado = 'disponible'
       and e.empleado_id is null
       and emp.activo
       and (v_service or (e.owner_id = v_owner and emp.owner_id = v_owner));
    if found then n := n + 1; end if;
  end loop;
  perform set_config('app.estado_ok', '', true);
  perform set_config('app.hist_evento', '', true);
  perform set_config('app.hist_detalle', '', true);
  return n;
end $$;
