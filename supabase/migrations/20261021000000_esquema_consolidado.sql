-- =============================================================================
-- FINESA S.A. — Inventario TI y Actas Digitales
-- Migración consolidada del esquema de base de datos (PostgreSQL / Supabase)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos enumerados
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'auxiliar', 'empleado');
create type public.app_permiso as enum (
  'equipos_editar',
  'reabastecimiento_gestionar',
  'proveedores_editar',
  'empleados_editar',
  'cargas_masivas',
  'actas_entrega',
  'actas_devolucion',
  'firmas_capturar',
  'repositorio_ver',
  'estadisticas_ver',
  'reportes_exportar',
  'catalogos_editar'
);
create type public.catalogo_tipo as enum ('marca', 'tipo_equipo', 'sede', 'area', 'empresa');
create type public.equipo_estado as enum ('disponible', 'asignado', 'en_reparacion', 'de_baja', 'en_alistamiento');
create type public.acta_tipo as enum ('entrega', 'devolucion', 'cambio');
create type public.acta_estado as enum ('pendiente', 'firmada', 'anulada');

-- -----------------------------------------------------------------------------
-- 2. Función utilitaria de marcas de tiempo
-- -----------------------------------------------------------------------------
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Perfiles, roles y permisos
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text not null default '',
  activo boolean not null default true,
  firma_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  owner_id uuid,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create index user_roles_owner_idx on public.user_roles(owner_id);
create unique index user_roles_un_solo_admin on public.user_roles ((role)) where role = 'admin';

create table public.user_permisos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permiso public.app_permiso not null,
  created_at timestamptz not null default now(),
  unique (user_id, permiso)
);
grant select on public.user_permisos to authenticated;
grant all on public.user_permisos to service_role;
alter table public.user_permisos enable row level security;

-- Funciones de autorización y ecosistema
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_active(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = _user_id and activo)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active(_user_id) and exists (
    select 1 from public.user_roles where user_id = _user_id and role in ('admin', 'auxiliar')
  )
$$;

create or replace function public.has_permiso(_user_id uuid, _p public.app_permiso)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active(_user_id) and (
    public.has_role(_user_id, 'admin') or
    (public.has_role(_user_id, 'auxiliar') and exists (
      select 1 from public.user_permisos where user_id = _user_id and permiso = _p
    ))
  )
$$;

create or replace function public.my_owner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case
    when public.has_role(auth.uid(), 'admin') then auth.uid()
    else (select ur.owner_id from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'auxiliar' limit 1)
  end
$$;

create or replace function public.user_roles_guard_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'admin' and auth.uid() is not null then
    raise exception 'El rol de Administrador solo se asigna directamente en la base de datos.';
  end if;
  return new;
end $$;
create trigger user_roles_guard_admin before insert or update on public.user_roles
  for each row execute function public.user_roles_guard_admin();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, nombre)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'nombre', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 4. Catálogos y Empleados
-- -----------------------------------------------------------------------------
create table public.catalogo_items (
  id uuid primary key default gen_random_uuid(),
  tipo public.catalogo_tipo not null,
  nombre text not null,
  activo boolean not null default true,
  owner_id uuid default public.my_owner_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.catalogo_items to authenticated;
grant all on public.catalogo_items to service_role;
alter table public.catalogo_items enable row level security;

create index catalogo_owner_idx on public.catalogo_items(owner_id);
create unique index catalogo_items_tipo_owner_nombre_uq on public.catalogo_items (tipo, owner_id, upper(nombre));

create table public.empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  identificacion text not null,
  email text,
  cargo text,
  area_id uuid references public.catalogo_items(id) on delete restrict,
  sede_id uuid references public.catalogo_items(id) on delete restrict,
  empresa_id uuid references public.catalogo_items(id) on delete restrict,
  activo boolean not null default true,
  user_id uuid unique references auth.users(id) on delete set null,
  pin_intentos integer not null default 0,
  pin_bloqueo_hasta timestamptz,
  owner_id uuid default public.my_owner_id(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.empleados to authenticated;
grant all on public.empleados to service_role;
alter table public.empleados enable row level security;

create index empleados_owner_idx on public.empleados(owner_id);
create index idx_empleados_identificacion on public.empleados(identificacion);
create index idx_empleados_user on public.empleados(user_id);
create unique index empleados_identificacion_unica on public.empleados (upper(identificacion));

create or replace function public.my_empleado_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.empleados where user_id = auth.uid() limit 1
$$;

-- Políticas de perfiles, roles, permisos, catálogos y empleados
create policy "Ver perfil propio o personal" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (public.is_staff(auth.uid()) and (
      id = public.my_owner_id()
      or id in (select ur.user_id from public.user_roles ur where ur.owner_id = public.my_owner_id())
      or id in (select e.user_id from public.empleados e where e.owner_id = public.my_owner_id() and e.user_id is not null)
    ))
  );

create policy "Ver roles propios o admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or owner_id = auth.uid());

create policy "Ver permisos propios o admin" on public.user_permisos for select to authenticated
  using (
    user_id = auth.uid() or exists (
      select 1 from public.user_roles ur
      where ur.user_id = user_permisos.user_id and ur.role = 'auxiliar' and ur.owner_id = auth.uid()
    )
  );

create policy "Catalogos visibles" on public.catalogo_items for select to authenticated
  using (owner_id = public.my_owner_id() or owner_id = (select e.owner_id from public.empleados e where e.user_id = auth.uid()));
create policy "Admin crea catalogos" on public.catalogo_items for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') and public.is_active(auth.uid()) and owner_id = auth.uid());
create policy "Admin edita catalogos" on public.catalogo_items for update to authenticated
  using (public.has_role(auth.uid(), 'admin') and public.is_active(auth.uid()) and owner_id = auth.uid());
create policy "Admin elimina catalogos" on public.catalogo_items for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') and public.is_active(auth.uid()) and owner_id = auth.uid());

create policy "Ver empleados" on public.empleados for select to authenticated
  using (owner_id = public.my_owner_id() or user_id = auth.uid());
create policy "Crear empleados" on public.empleados for insert to authenticated
  with check (public.has_permiso(auth.uid(), 'empleados_editar') and owner_id = public.my_owner_id());
create policy "Editar empleados" on public.empleados for update to authenticated
  using (public.has_permiso(auth.uid(), 'empleados_editar') and owner_id = public.my_owner_id());

-- -----------------------------------------------------------------------------
-- 5. Proveedores y Alertas de Stock
-- -----------------------------------------------------------------------------
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text,
  contacto_nombre text,
  telefono text,
  whatsapp text,
  email text,
  ciudad text,
  direccion text,
  sitio_web text,
  asesor_telefono text,
  etiquetas text[] not null default '{}',
  dias_entrega integer,
  forma_pago text,
  activo boolean not null default true,
  notas text,
  owner_id uuid default public.my_owner_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.proveedores to authenticated;
grant all on public.proveedores to service_role;
alter table public.proveedores enable row level security;

create policy "Personal ve proveedores" on public.proveedores for select to authenticated
  using (public.is_staff(auth.uid()) and owner_id = public.my_owner_id());
create policy "Personal gestiona proveedores" on public.proveedores for all to authenticated
  using (public.has_permiso(auth.uid(), 'proveedores_editar') and owner_id = public.my_owner_id())
  with check (public.has_permiso(auth.uid(), 'proveedores_editar') and owner_id = public.my_owner_id());

create table public.alertas_stock_config (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references public.catalogo_items(id) on delete cascade,
  stock_minimo integer not null default 3,
  activa boolean not null default true,
  owner_id uuid default public.my_owner_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, tipo_id)
);
grant select, insert, update, delete on public.alertas_stock_config to authenticated;
grant all on public.alertas_stock_config to service_role;
alter table public.alertas_stock_config enable row level security;

create policy "Personal ve alertas_stock_config" on public.alertas_stock_config for select to authenticated
  using (public.is_staff(auth.uid()) and owner_id = public.my_owner_id());
create policy "Personal gestiona alertas_stock_config" on public.alertas_stock_config for all to authenticated
  using (public.has_permiso(auth.uid(), 'reabastecimiento_gestionar') and owner_id = public.my_owner_id())
  with check (public.has_permiso(auth.uid(), 'reabastecimiento_gestionar') and owner_id = public.my_owner_id());

create table public.articulo_proveedores (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references public.catalogo_items(id) on delete cascade,
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  precio_referencia numeric,
  tiempo_entrega_dias integer,
  es_principal boolean not null default false,
  ultimo_precio numeric,
  ultima_compra date,
  owner_id uuid default public.my_owner_id(),
  created_at timestamptz not null default now(),
  unique (tipo_id, proveedor_id)
);
grant select, insert, update, delete on public.articulo_proveedores to authenticated;
grant all on public.articulo_proveedores to service_role;
alter table public.articulo_proveedores enable row level security;

create unique index articulo_proveedores_un_principal on public.articulo_proveedores(owner_id, tipo_id) where es_principal;

create policy "Personal ve articulo_proveedores" on public.articulo_proveedores for select to authenticated
  using (public.is_staff(auth.uid()) and owner_id = public.my_owner_id());
create policy "Personal gestiona articulo_proveedores" on public.articulo_proveedores for all to authenticated
  using ((public.has_permiso(auth.uid(), 'proveedores_editar') or public.has_permiso(auth.uid(), 'reabastecimiento_gestionar')) and owner_id = public.my_owner_id())
  with check ((public.has_permiso(auth.uid(), 'proveedores_editar') or public.has_permiso(auth.uid(), 'reabastecimiento_gestionar')) and owner_id = public.my_owner_id());

-- -----------------------------------------------------------------------------
-- 6. Equipos, Historial y Reparaciones
-- -----------------------------------------------------------------------------
create sequence public.periferico_seq;

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references public.catalogo_items(id) on delete restrict,
  marca_id uuid references public.catalogo_items(id) on delete restrict,
  sede_id uuid references public.catalogo_items(id) on delete restrict,
  modelo text,
  serie text not null unique,
  codigo_interno boolean not null default false,
  activo_fijo text,
  nombre_equipo text,
  sistema_operativo text,
  fecha_ingreso date not null default current_date,
  estado public.equipo_estado not null default 'disponible',
  observaciones text,
  proveedor text,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  valor_compra numeric(14,2),
  factura_numero text,
  factura_path text,
  anio_compra int,
  garantia_fin date,
  novedad text,
  empleado_id uuid references public.empleados(id) on delete restrict,
  reparacion_proveedor_id uuid references public.proveedores(id) on delete set null,
  reparacion_inicio timestamptz,
  prestamo_hasta date,
  owner_id uuid default public.my_owner_id(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.equipos to authenticated;
grant all on public.equipos to service_role;
alter table public.equipos enable row level security;

create unique index equipos_activo_fijo_uq on public.equipos (upper(activo_fijo)) where activo_fijo is not null;
create index equipos_owner_idx on public.equipos(owner_id);
create index idx_equipos_owner_estado on public.equipos(owner_id, estado);
create index equipos_owner_estado_tipo_idx on public.equipos(owner_id, estado, tipo_id);
create index idx_equipos_serie on public.equipos(serie);
create index idx_equipos_empleado on public.equipos(empleado_id);
create index equipos_proveedor_id_idx on public.equipos(proveedor_id);

create policy "Ver equipos" on public.equipos for select to authenticated
  using (owner_id = public.my_owner_id() or (empleado_id is not null and empleado_id = public.my_empleado_id()));
create policy "Crear equipos" on public.equipos for insert to authenticated
  with check (public.has_permiso(auth.uid(), 'equipos_editar') and owner_id = public.my_owner_id());
create policy "Editar equipos" on public.equipos for update to authenticated
  using (public.has_permiso(auth.uid(), 'equipos_editar') and owner_id = public.my_owner_id());

create table public.equipo_historial (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  evento text not null,
  detalle text,
  acta_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
grant select on public.equipo_historial to authenticated;
grant all on public.equipo_historial to service_role;
alter table public.equipo_historial enable row level security;

create index idx_hist_equipo_created on public.equipo_historial(equipo_id, created_at desc);

create policy "Personal ve historial" on public.equipo_historial for select to authenticated
  using (exists (select 1 from public.equipos e where e.id = equipo_id and e.owner_id = public.my_owner_id()));

create table public.reparaciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  inicio timestamptz not null default now(),
  fin timestamptz,
  owner_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.reparaciones to authenticated;
grant all on public.reparaciones to service_role;
alter table public.reparaciones enable row level security;

create index reparaciones_proveedor_id_idx on public.reparaciones(proveedor_id);

create policy "Personal ve reparaciones" on public.reparaciones for select to authenticated
  using (public.is_staff(auth.uid()) and owner_id = public.my_owner_id());

-- Triggers de equipos y paz y salvo de empleados
create or replace function public.equipos_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.serie is null or btrim(new.serie) = '' then
    new.serie := 'FIN-ACC-' || lpad(nextval('public.periferico_seq')::text, 4, '0');
    new.codigo_interno := true;
  else
    new.serie := upper(btrim(new.serie));
  end if;
  if new.estado not in ('disponible', 'en_reparacion') then
    raise exception 'Un equipo nuevo solo puede registrarse como Disponible o En reparación';
  end if;
  new.empleado_id := null;
  return new;
end $$;
create trigger equipos_bi before insert on public.equipos
  for each row execute function public.equipos_before_insert();

create or replace function public.equipos_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.serie is distinct from old.serie and coalesce(current_setting('app.serie_ok', true), '') <> '1' then
    raise exception 'El número de serie no se puede modificar. Solo el Administrador puede corregirlo indicando un motivo.';
  end if;
  if (new.estado is distinct from old.estado or new.empleado_id is distinct from old.empleado_id)
     and coalesce(current_setting('app.estado_ok', true), '') <> '1' then
    raise exception 'El estado del equipo solo cambia mediante actas firmadas o con un motivo registrado.';
  end if;
  return new;
end $$;
create trigger equipos_bu before update on public.equipos
  for each row execute function public.equipos_before_update();

create or replace function public.equipos_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.equipo_historial(equipo_id, evento, detalle)
  values (new.id, 'ingreso', 'Registro del equipo con estado ' || new.estado);
  return new;
end $$;
create trigger equipos_ai after insert on public.equipos
  for each row execute function public.equipos_after_insert();

create or replace function public.equipos_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cambios text[] := '{}';
  det text;
  ev text;
  emp_old text;
  emp_new text;
  x text := nullif(current_setting('app.hist_detalle', true), '');
  acta uuid := nullif(current_setting('app.acta_id', true), '')::uuid;
  evs text := nullif(current_setting('app.hist_evento', true), '');
begin
  if new.estado is distinct from old.estado or new.empleado_id is distinct from old.empleado_id then
    det := '';
    if new.empleado_id is distinct from old.empleado_id then
      select nombre into emp_old from public.empleados where id = old.empleado_id;
      select nombre into emp_new from public.empleados where id = new.empleado_id;
      det := 'Responsable: ' || coalesce(emp_old, 'Sin asignar') || ' → ' || coalesce(emp_new, 'Sin asignar');
    end if;
    if new.estado is distinct from old.estado then
      det := det || case when det <> '' then ' · ' else '' end || 'Estado: ' || old.estado || ' → ' || new.estado;
    end if;
    if x is not null then det := det || ' · ' || x; end if;
    ev := coalesce(evs, case when new.empleado_id is distinct from old.empleado_id then 'asignacion' else new.estado::text end);
    insert into public.equipo_historial(equipo_id, evento, detalle, acta_id) values (new.id, ev, det, acta);
  end if;
  if new.sede_id is distinct from old.sede_id then cambios := cambios || ('Sede: ' || coalesce((select nombre from catalogo_items where id=old.sede_id),'—') || ' → ' || coalesce((select nombre from catalogo_items where id=new.sede_id),'—')); end if;
  if new.marca_id is distinct from old.marca_id then cambios := cambios || ('Marca: ' || coalesce((select nombre from catalogo_items where id=old.marca_id),'—') || ' → ' || coalesce((select nombre from catalogo_items where id=new.marca_id),'—')); end if;
  if new.tipo_id is distinct from old.tipo_id then cambios := cambios || ('Tipo: ' || coalesce((select nombre from catalogo_items where id=old.tipo_id),'—') || ' → ' || coalesce((select nombre from catalogo_items where id=new.tipo_id),'—')); end if;
  if new.modelo is distinct from old.modelo then cambios := cambios || ('Modelo: ' || coalesce(old.modelo,'—') || ' → ' || coalesce(new.modelo,'—')); end if;
  if new.proveedor is distinct from old.proveedor then cambios := cambios || ('Proveedor: ' || coalesce(old.proveedor,'—') || ' → ' || coalesce(new.proveedor,'—')); end if;
  if new.valor_compra is distinct from old.valor_compra then cambios := cambios || ('Valor de compra: ' || coalesce(old.valor_compra::text,'—') || ' → ' || coalesce(new.valor_compra::text,'—')); end if;
  if new.garantia_fin is distinct from old.garantia_fin then cambios := cambios || ('Garantía: ' || coalesce(old.garantia_fin::text,'—') || ' → ' || coalesce(new.garantia_fin::text,'—')); end if;
  if new.activo_fijo is distinct from old.activo_fijo then cambios := cambios || ('Activo fijo: ' || coalesce(old.activo_fijo,'—') || ' → ' || coalesce(new.activo_fijo,'—')); end if;
  if new.nombre_equipo is distinct from old.nombre_equipo then cambios := cambios || ('Nombre de equipo: ' || coalesce(old.nombre_equipo,'—') || ' → ' || coalesce(new.nombre_equipo,'—')); end if;
  if new.sistema_operativo is distinct from old.sistema_operativo then cambios := cambios || ('Sistema operativo: ' || coalesce(old.sistema_operativo,'—') || ' → ' || coalesce(new.sistema_operativo,'—')); end if;
  if new.factura_numero is distinct from old.factura_numero then cambios := cambios || ('Factura: ' || coalesce(old.factura_numero,'—') || ' → ' || coalesce(new.factura_numero,'—')); end if;
  if new.anio_compra is distinct from old.anio_compra then cambios := cambios || ('Año de compra: ' || coalesce(old.anio_compra::text,'—') || ' → ' || coalesce(new.anio_compra::text,'—')); end if;
  if new.novedad is distinct from old.novedad then cambios := cambios || ('Novedad: ' || coalesce(old.novedad,'—') || ' → ' || coalesce(new.novedad,'—')); end if;
  if new.observaciones is distinct from old.observaciones then cambios := cambios || 'Observaciones actualizadas'::text; end if;
  if new.factura_path is distinct from old.factura_path then cambios := cambios || 'Factura adjunta actualizada'::text; end if;
  if array_length(cambios, 1) > 0 then
    insert into public.equipo_historial(equipo_id, evento, detalle) values (new.id, 'edicion', array_to_string(cambios, ' · '));
  end if;
  return new;
end $$;
create trigger equipos_au after update on public.equipos
  for each row execute function public.equipos_after_update();

create or replace function public.empleados_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.activo and not new.activo then
    if exists (select 1 from public.equipos where empleado_id = new.id and estado = 'asignado') then
      raise exception 'PAZ_Y_SALVO: El empleado tiene equipos asignados. Realice primero el acta de devolución.';
    end if;
  end if;
  return new;
end $$;
create trigger empleados_bu before update on public.empleados
  for each row execute function public.empleados_before_update();

-- -----------------------------------------------------------------------------
-- 7. Actas, Items de Acta y Tokens de Firma
-- -----------------------------------------------------------------------------
create table public.actas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  tipo public.acta_tipo not null,
  estado public.acta_estado not null default 'pendiente',
  empleado_id uuid not null references public.empleados(id) on delete restrict,
  tecnico_id uuid not null default auth.uid(),
  tecnico_nombre text,
  tecnico_firma_path text,
  observaciones text,
  es_prestamo boolean not null default false,
  prestamo_hasta date,
  prestamo_reparacion_equipo_id uuid references public.equipos(id),
  firmado_at timestamptz,
  firma_ip text,
  firma_user_agent text,
  firma_medio text,
  firma_path text,
  pdf_path text,
  anulada_motivo text,
  anulada_por uuid,
  anulada_at timestamptz,
  owner_id uuid default public.my_owner_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert on public.actas to authenticated;
grant all on public.actas to service_role;
alter table public.actas enable row level security;

create index actas_owner_idx on public.actas(owner_id);
create index idx_actas_owner_created on public.actas(owner_id, created_at desc);
create index idx_actas_empleado on public.actas(empleado_id);

create policy "Ver actas" on public.actas for select to authenticated
  using (owner_id = public.my_owner_id() or empleado_id = public.my_empleado_id());
create policy "Crear actas" on public.actas for insert to authenticated
  with check (
    tecnico_id = auth.uid() and estado = 'pendiente' and owner_id = public.my_owner_id() and (
      (tipo = 'entrega' and public.has_permiso(auth.uid(), 'actas_entrega')) or
      (tipo = 'devolucion' and public.has_permiso(auth.uid(), 'actas_devolucion')) or
      (tipo = 'cambio' and public.has_permiso(auth.uid(), 'actas_entrega') and public.has_permiso(auth.uid(), 'actas_devolucion'))
    )
  );

create table public.acta_items (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references public.actas(id) on delete cascade,
  equipo_id uuid not null references public.equipos(id) on delete restrict,
  direccion text,
  estado_destino text not null default 'disponible',
  estado_fisico text,
  accesorios text,
  nota text,
  created_at timestamptz not null default now(),
  unique (acta_id, equipo_id)
);
grant select, insert on public.acta_items to authenticated;
grant all on public.acta_items to service_role;
alter table public.acta_items enable row level security;

create index idx_acta_items_acta on public.acta_items(acta_id);

create policy "Ver items de actas visibles" on public.acta_items for select to authenticated
  using (exists (select 1 from public.actas a where a.id = acta_items.acta_id and (a.owner_id = public.my_owner_id() or a.empleado_id = public.my_empleado_id())));
create policy "Agregar items a acta propia pendiente" on public.acta_items for insert to authenticated
  with check (exists (select 1 from public.actas a where a.id = acta_id and a.tecnico_id = auth.uid() and a.estado = 'pendiente'));

create table public.tokens_firma (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references public.actas(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant all on public.tokens_firma to service_role;
alter table public.tokens_firma enable row level security;

create policy "Sin acceso directo a tokens" on public.tokens_firma for select to authenticated using (false);

-- Triggers de actas
create or replace function public.actas_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'entrega' and not exists (select 1 from public.empleados where id = new.empleado_id and activo) then
    raise exception 'No se puede entregar equipos a un empleado inactivo.';
  end if;
  new.estado := 'pendiente';
  new.firmado_at := null;
  new.pdf_path := null;
  new.firma_path := null;
  select coalesce(nullif(nombre, ''), email) into new.tecnico_nombre from public.profiles where id = new.tecnico_id;
  return new;
end $$;
create trigger actas_bi before insert on public.actas
  for each row execute function public.actas_before_insert();

create or replace function public.actas_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'anulada' and new.estado is distinct from old.estado then
    raise exception 'Un acta anulada no puede cambiar de estado';
  end if;
  if old.estado = 'firmada' and new.estado not in ('firmada', 'anulada') then
    raise exception 'Un acta firmada solo puede anularse';
  end if;
  return new;
end $$;
create trigger actas_bu before update on public.actas
  for each row execute function public.actas_before_update();

create or replace function public.acta_items_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a public.actas;
  e public.equipos;
begin
  select * into a from public.actas where id = new.acta_id;
  select * into e from public.equipos where id = new.equipo_id;
  if a.tipo::text = 'cambio' then
    if new.direccion not in ('entrega', 'devolucion') then
      raise exception 'Indique si el equipo se entrega o se devuelve';
    end if;
  else
    new.direccion := a.tipo::text;
  end if;
  if new.estado_destino not in ('disponible', 'en_alistamiento', 'en_reparacion') then
    raise exception 'Estado de destino inválido';
  end if;
  if new.direccion = 'entrega' and e.estado <> 'disponible' then
    raise exception 'El equipo % no está Disponible.', e.serie;
  end if;
  if new.direccion = 'devolucion' and (e.estado <> 'asignado' or e.empleado_id is distinct from a.empleado_id) then
    raise exception 'El equipo % no está asignado a este empleado.', e.serie;
  end if;
  if exists (
    select 1 from public.acta_items i join public.actas x on x.id = i.acta_id
    where i.equipo_id = new.equipo_id and x.estado = 'pendiente' and x.id <> new.acta_id
  ) then
    raise exception 'El equipo % ya está en otra acta pendiente de firma.', e.serie;
  end if;
  return new;
end $$;
create trigger acta_items_bi before insert on public.acta_items
  for each row execute function public.acta_items_before_insert();

create or replace function public.actas_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'firmada' and old.estado = 'pendiente' then
    perform set_config('app.estado_ok', '1', true);
    perform set_config('app.acta_id', new.id::text, true);
    perform set_config('app.hist_evento', new.tipo::text, true);
    perform set_config(
      'app.hist_detalle',
      'Acta #' || new.numero || ' firmada (' || coalesce(new.firma_medio, '') || ')' ||
      case when new.es_prestamo then ' · Préstamo temporal hasta ' || coalesce(new.prestamo_hasta::text, '—') else '' end,
      true
    );
    update public.equipos set
      estado = 'asignado',
      empleado_id = new.empleado_id,
      prestamo_hasta = case when new.es_prestamo then coalesce(new.prestamo_hasta, current_date + 7) else null end
    where id in (select equipo_id from public.acta_items where acta_id = new.id and direccion = 'entrega');

    update public.equipos e set
      estado = i.estado_destino::equipo_estado,
      empleado_id = null,
      prestamo_hasta = null,
      reparacion_inicio = case when i.estado_destino = 'en_reparacion' then now() else null end,
      reparacion_proveedor_id = null
    from public.acta_items i
    where i.acta_id = new.id and i.direccion = 'devolucion' and e.id = i.equipo_id;

    insert into public.reparaciones(equipo_id, owner_id)
      select i.equipo_id, new.owner_id
      from public.acta_items i
      where i.acta_id = new.id and i.direccion = 'devolucion' and i.estado_destino = 'en_reparacion';

    perform set_config('app.estado_ok', '', true);
    perform set_config('app.acta_id', '', true);
    perform set_config('app.hist_evento', '', true);
    perform set_config('app.hist_detalle', '', true);
  end if;
  return new;
end $$;
create trigger actas_au after update on public.actas
  for each row execute function public.actas_after_update();

-- -----------------------------------------------------------------------------
-- 8. Reabastecimiento y Pedidos de Compra
-- -----------------------------------------------------------------------------
create table public.solicitudes_reabastecimiento (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references public.catalogo_items(id),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  cantidad integer not null default 1,
  estado text not null default 'solicitada',
  solicitado_por uuid default auth.uid(),
  solicitado_nombre text,
  cerrado_at timestamptz,
  owner_id uuid default public.my_owner_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.solicitudes_reabastecimiento to authenticated;
grant all on public.solicitudes_reabastecimiento to service_role;
alter table public.solicitudes_reabastecimiento enable row level security;

create index solicitudes_reabastecimiento_owner_tipo_estado_idx
  on public.solicitudes_reabastecimiento(owner_id, tipo_id, estado);

create policy "Personal ve solicitudes" on public.solicitudes_reabastecimiento for select to authenticated
  using (public.is_staff(auth.uid()) and owner_id = public.my_owner_id());

create table public.pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  numero bigserial,
  proveedor_id uuid not null references public.proveedores(id),
  estado text not null default 'borrador',
  fecha_pedido date,
  fecha_esperada date,
  notas text,
  creado_por uuid default auth.uid(),
  creado_nombre text,
  cancelado_motivo text,
  cerrado_at timestamptz,
  owner_id uuid default public.my_owner_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.pedidos_compra to authenticated;
grant usage on sequence public.pedidos_compra_numero_seq to authenticated;
grant all on public.pedidos_compra to service_role;
alter table public.pedidos_compra enable row level security;

create policy "Personal ve pedidos" on public.pedidos_compra for select to authenticated
  using (public.is_staff(auth.uid()) and owner_id = public.my_owner_id());
create policy "Personal gestiona pedidos" on public.pedidos_compra for all to authenticated
  using (public.has_permiso(auth.uid(), 'reabastecimiento_gestionar') and owner_id = public.my_owner_id())
  with check (public.has_permiso(auth.uid(), 'reabastecimiento_gestionar') and owner_id = public.my_owner_id());

create table public.pedido_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_compra(id) on delete cascade,
  tipo_id uuid not null references public.catalogo_items(id),
  cantidad integer not null default 1,
  recibida integer not null default 0,
  precio_estimado numeric,
  owner_id uuid default public.my_owner_id(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.pedido_lineas to authenticated;
grant all on public.pedido_lineas to service_role;
alter table public.pedido_lineas enable row level security;

create policy "Personal ve lineas" on public.pedido_lineas for select to authenticated
  using (public.is_staff(auth.uid()) and owner_id = public.my_owner_id());
create policy "Personal gestiona lineas" on public.pedido_lineas for all to authenticated
  using (public.has_permiso(auth.uid(), 'reabastecimiento_gestionar') and owner_id = public.my_owner_id())
  with check (public.has_permiso(auth.uid(), 'reabastecimiento_gestionar') and owner_id = public.my_owner_id());

create or replace function public.pedidos_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado not in ('borrador', 'pedido', 'parcial', 'recibido', 'cancelado') then
    raise exception 'Estado inválido';
  end if;
  if tg_op = 'UPDATE' and old.estado in ('recibido', 'cancelado') and new.estado <> old.estado then
    raise exception 'El pedido ya está cerrado';
  end if;
  if new.estado = 'cancelado' and coalesce(trim(new.cancelado_motivo), '') = '' then
    raise exception 'Indique el motivo de cancelación';
  end if;
  return new;
end $$;
create trigger pedidos_validar before insert or update on public.pedidos_compra
  for each row execute function public.pedidos_validar();

-- -----------------------------------------------------------------------------
-- 9. Reportes de Falla y Certificación Anual
-- -----------------------------------------------------------------------------
create table public.reportes_falla (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id),
  empleado_id uuid not null references public.empleados(id),
  descripcion text not null,
  estado text not null default 'abierto',
  respuesta text,
  atendido_por uuid,
  atendido_at timestamptz,
  owner_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.reportes_falla to authenticated;
grant all on public.reportes_falla to service_role;
alter table public.reportes_falla enable row level security;

create policy "Ver reportes de falla" on public.reportes_falla for select to authenticated
  using ((public.is_staff(auth.uid()) and owner_id = public.my_owner_id()) or empleado_id = public.my_empleado_id());

create table public.certificaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha_limite date not null,
  activa boolean not null default true,
  creado_por uuid,
  owner_id uuid not null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.certificaciones to authenticated;
grant all on public.certificaciones to service_role;
alter table public.certificaciones enable row level security;

create policy "Ver certificaciones" on public.certificaciones for select to authenticated
  using (
    (public.is_staff(auth.uid()) and owner_id = public.my_owner_id())
    or (activa and owner_id = (select owner_id from public.empleados where id = public.my_empleado_id()))
  );
create policy "Admin crea certificaciones" on public.certificaciones for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') and public.is_active(auth.uid()) and owner_id = public.my_owner_id());
create policy "Admin edita certificaciones" on public.certificaciones for update to authenticated
  using (public.has_role(auth.uid(), 'admin') and owner_id = public.my_owner_id())
  with check (owner_id = public.my_owner_id());

create table public.certificacion_respuestas (
  id uuid primary key default gen_random_uuid(),
  certificacion_id uuid not null references public.certificaciones(id) on delete cascade,
  empleado_id uuid not null references public.empleados(id),
  equipos_ok uuid[] not null default '{}',
  equipos_faltantes uuid[] not null default '{}',
  comentario text,
  owner_id uuid,
  created_at timestamptz not null default now(),
  unique (certificacion_id, empleado_id)
);
grant select on public.certificacion_respuestas to authenticated;
grant all on public.certificacion_respuestas to service_role;
alter table public.certificacion_respuestas enable row level security;

create policy "Ver respuestas" on public.certificacion_respuestas for select to authenticated
  using ((public.is_staff(auth.uid()) and owner_id = public.my_owner_id()) or empleado_id = public.my_empleado_id());

-- -----------------------------------------------------------------------------
-- 10. Auditoría Inmutable y Triggers de updated_at / audit
-- -----------------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  user_id uuid,
  tabla text not null,
  accion text not null,
  registro_id text,
  antes jsonb,
  despues jsonb,
  detalle text,
  created_at timestamptz not null default now()
);
grant select on public.auditoria to authenticated;
grant all on public.auditoria to service_role;
alter table public.auditoria enable row level security;

create index auditoria_created_desc_idx on public.auditoria (created_at desc);

create policy "Admin ve auditoria" on public.auditoria for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin') and (
      user_id = auth.uid()
      or user_id in (select ur.user_id from public.user_roles ur where ur.role = 'auxiliar' and ur.owner_id = auth.uid())
    )
  );

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  if tg_op = 'DELETE' then rid := old.id::text; else rid := new.id::text; end if;
  insert into public.auditoria(user_id, tabla, accion, registro_id, antes, despues)
  values (
    auth.uid(),
    tg_table_name,
    tg_op,
    rid,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create or replace function public.auditoria_inmutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'La auditoría no puede modificarse ni eliminarse';
end $$;

create trigger auditoria_no_update before update or delete on public.auditoria
  for each row execute function public.auditoria_inmutable();

-- Triggers de auditoría
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_trigger();
create trigger audit_user_roles after insert or update or delete on public.user_roles for each row execute function public.audit_trigger();
create trigger audit_user_permisos after insert or update or delete on public.user_permisos for each row execute function public.audit_trigger();
create trigger audit_catalogo after insert or update or delete on public.catalogo_items for each row execute function public.audit_trigger();
create trigger audit_empleados after insert or update or delete on public.empleados for each row execute function public.audit_trigger();
create trigger audit_equipos after insert or update or delete on public.equipos for each row execute function public.audit_trigger();
create trigger audit_actas after insert or update or delete on public.actas for each row execute function public.audit_trigger();
create trigger audit_acta_items after insert or update or delete on public.acta_items for each row execute function public.audit_trigger();
create trigger audit_tokens after insert or update or delete on public.tokens_firma for each row execute function public.audit_trigger();
create trigger proveedores_audit after insert or update or delete on public.proveedores for each row execute function public.audit_trigger();
create trigger alertas_stock_config_audit after insert or update or delete on public.alertas_stock_config for each row execute function public.audit_trigger();
create trigger articulo_proveedores_audit after insert or update or delete on public.articulo_proveedores for each row execute function public.audit_trigger();
create trigger solicitudes_audit after insert or update or delete on public.solicitudes_reabastecimiento for each row execute function public.audit_trigger();
create trigger pedidos_audit after insert or update or delete on public.pedidos_compra for each row execute function public.audit_trigger();
create trigger lineas_audit after insert or update or delete on public.pedido_lineas for each row execute function public.audit_trigger();
create trigger reportes_falla_audit after insert or update or delete on public.reportes_falla for each row execute function public.audit_trigger();
create trigger certificaciones_audit after insert or update or delete on public.certificaciones for each row execute function public.audit_trigger();
create trigger cert_resp_audit after insert or update or delete on public.certificacion_respuestas for each row execute function public.audit_trigger();

-- Triggers de updated_at
create trigger t_upd_profiles before update on public.profiles for each row execute function public.update_updated_at_column();
create trigger t_upd_catalogo before update on public.catalogo_items for each row execute function public.update_updated_at_column();
create trigger t_upd_empleados before update on public.empleados for each row execute function public.update_updated_at_column();
create trigger t_upd_equipos before update on public.equipos for each row execute function public.update_updated_at_column();
create trigger t_upd_actas before update on public.actas for each row execute function public.update_updated_at_column();
create trigger proveedores_upd before update on public.proveedores for each row execute function public.update_updated_at_column();
create trigger alertas_upd before update on public.alertas_stock_config for each row execute function public.update_updated_at_column();
create trigger solicitudes_upd before update on public.solicitudes_reabastecimiento for each row execute function public.update_updated_at_column();
create trigger pedidos_upd before update on public.pedidos_compra for each row execute function public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 11. Políticas de Storage
-- -----------------------------------------------------------------------------
create policy "Personal ve facturas" on storage.objects for select to authenticated
  using (bucket_id = 'facturas' and public.is_staff(auth.uid()));
create policy "Subir facturas con permiso" on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas' and public.has_permiso(auth.uid(), 'equipos_editar'));
create policy "Personal ve actas" on storage.objects for select to authenticated
  using (bucket_id = 'actas' and public.is_staff(auth.uid()));

-- -----------------------------------------------------------------------------
-- 12. Funciones RPC de Negocio y Consultas
-- -----------------------------------------------------------------------------
create or replace function public.log_evento(p_accion text, p_detalle text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.auditoria(user_id, tabla, accion, detalle)
  values (auth.uid(), 'sesion', left(p_accion, 50), left(p_detalle, 500));
end $$;

create or replace function public.corregir_serie(p_equipo uuid, p_serie text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare old_serie text;
begin
  if not (public.has_role(auth.uid(), 'admin') and public.is_active(auth.uid())) then
    raise exception 'Solo el Administrador puede corregir series';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'El motivo es obligatorio'; end if;
  if coalesce(btrim(p_serie), '') = '' then raise exception 'La serie no puede estar vacía'; end if;
  select serie into old_serie from public.equipos where id = p_equipo;
  perform set_config('app.serie_ok', '1', true);
  update public.equipos set serie = upper(btrim(p_serie)) where id = p_equipo;
  perform set_config('app.serie_ok', '', true);
  insert into public.equipo_historial(equipo_id, evento, detalle)
  values (p_equipo, 'correccion_serie', old_serie || ' → ' || upper(btrim(p_serie)) || '. Motivo: ' || p_motivo);
end $$;

create or replace function public.cambiar_estado_equipo(
  p_equipo uuid,
  p_estado public.equipo_estado,
  p_motivo text,
  p_proveedor uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.equipos;
  es_admin boolean := public.has_role(auth.uid(), 'admin');
  pn text;
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
  perform set_config('app.estado_ok', '1', true);
  perform set_config('app.hist_evento', p_estado::text, true);
  perform set_config('app.hist_detalle', 'Motivo: ' || p_motivo || coalesce(' · Proveedor de servicio: ' || pn, ''), true);
  update public.equipos set
    estado = p_estado,
    empleado_id = case when p_estado = 'en_reparacion' then e.empleado_id else null end,
    reparacion_proveedor_id = case when p_estado = 'en_reparacion' and pn is not null then p_proveedor else null end,
    reparacion_inicio = case when p_estado = 'en_reparacion' then now() else null end
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

create or replace function public.finalizar_reparacion(p_equipo uuid, p_devolver boolean, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.equipos;
begin
  if not public.has_permiso(auth.uid(), 'equipos_editar') then raise exception 'Sin permiso'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into e from public.equipos where id = p_equipo;
  if e.estado <> 'en_reparacion' then raise exception 'El equipo no está en reparación'; end if;
  if p_devolver and e.empleado_id is null then raise exception 'El equipo no tiene empleado ligado; déjelo disponible'; end if;
  perform set_config('app.estado_ok', '1', true);
  perform set_config('app.hist_evento', case when p_devolver then 'asignado' else 'disponible' end, true);
  perform set_config('app.hist_detalle', 'Fin de reparación' || case when p_devolver then ' (devuelto al empleado)' else '' end || '. Motivo: ' || p_motivo, true);
  if p_devolver then
    update public.equipos set estado = 'asignado', reparacion_proveedor_id = null, reparacion_inicio = null where id = p_equipo;
  else
    update public.equipos set estado = 'disponible', empleado_id = null, reparacion_proveedor_id = null, reparacion_inicio = null where id = p_equipo;
  end if;
  update public.reparaciones set fin = now() where equipo_id = p_equipo and fin is null;
  perform set_config('app.estado_ok', '', true);
  perform set_config('app.hist_evento', '', true);
  perform set_config('app.hist_detalle', '', true);
end $$;

create or replace function public.marcar_alistado(p_equipo uuid, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.equipos;
begin
  if not public.has_permiso(auth.uid(), 'equipos_editar') then raise exception 'Sin permiso'; end if;
  select * into e from public.equipos where id = p_equipo and owner_id = public.my_owner_id();
  if not found or e.estado::text <> 'en_alistamiento' then raise exception 'El equipo no está en alistamiento'; end if;
  perform set_config('app.estado_ok', '1', true);
  perform set_config('app.hist_evento', 'alistado', true);
  perform set_config('app.hist_detalle', 'Alistamiento terminado' || coalesce('. Nota: ' || nullif(btrim(p_nota), ''), ''), true);
  update public.equipos set estado = 'disponible' where id = p_equipo;
  perform set_config('app.estado_ok', '', true);
  perform set_config('app.hist_evento', '', true);
  perform set_config('app.hist_detalle', '', true);
end $$;

create or replace function public.anular_acta(p_acta uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') and public.is_active(auth.uid())) then
    raise exception 'Solo el Administrador puede anular actas';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'El motivo es obligatorio'; end if;
  update public.actas set
    estado = 'anulada',
    anulada_motivo = p_motivo,
    anulada_por = auth.uid(),
    anulada_at = now()
  where id = p_acta and estado <> 'anulada';
  update public.tokens_firma set used_at = now() where acta_id = p_acta and used_at is null;
  insert into public.equipo_historial(equipo_id, evento, detalle, acta_id)
    select equipo_id, 'acta_anulada', 'Motivo: ' || p_motivo, p_acta from public.acta_items where acta_id = p_acta;
end $$;

create or replace function public.asignar_carga_inicial(p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  n int := 0;
begin
  if not (public.has_permiso(auth.uid(), 'cargas_masivas') or auth.role() = 'service_role') then
    raise exception 'Sin permiso para cargas masivas';
  end if;
  perform set_config('app.estado_ok', '1', true);
  perform set_config('app.hist_evento', 'carga_inicial', true);
  perform set_config('app.hist_detalle', 'Asignación registrada en carga inicial de inventario (sin acta)', true);
  for it in select * from jsonb_array_elements(p_items) loop
    update public.equipos set estado = 'asignado', empleado_id = (it->>'empleado_id')::uuid
      where id = (it->>'equipo_id')::uuid and estado = 'disponible' and empleado_id is null;
    if found then n := n + 1; end if;
  end loop;
  perform set_config('app.estado_ok', '', true);
  perform set_config('app.hist_evento', '', true);
  perform set_config('app.hist_detalle', '', true);
  return n;
end $$;

create or replace function public.recibir_pedido_linea(
  p_linea uuid,
  p_seriales text[],
  p_sin_serial integer,
  p_marca uuid,
  p_sede uuid,
  p_modelo text,
  p_valor numeric,
  p_factura text,
  p_garantia date,
  p_activos text[] default null,
  p_nombres text[] default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  l record;
  p record;
  n integer := 0;
  prov text;
  pend integer;
  k integer;
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_permiso(auth.uid(), 'reabastecimiento_gestionar')) then
    raise exception 'Sin permiso';
  end if;
  select * into l from pedido_lineas where id = p_linea and owner_id = public.my_owner_id() for update;
  if not found then raise exception 'Línea no encontrada'; end if;
  select * into p from pedidos_compra where id = l.pedido_id for update;
  if p.estado not in ('pedido', 'parcial') then raise exception 'El pedido debe estar en estado Pedido realizado'; end if;
  select nombre into prov from proveedores where id = p.proveedor_id;
  pend := l.cantidad - l.recibida;
  if coalesce(array_length(p_seriales, 1), 0) + coalesce(p_sin_serial, 0) = 0 then raise exception 'Nada para recibir'; end if;
  if coalesce(array_length(p_seriales, 1), 0) + coalesce(p_sin_serial, 0) > pend then raise exception 'Supera lo pendiente (%)', pend; end if;
  for k in 1..coalesce(array_length(p_seriales, 1), 0) loop
    insert into equipos(tipo_id, marca_id, sede_id, modelo, serie, activo_fijo, nombre_equipo, proveedor_id, proveedor, valor_compra, factura_numero, garantia_fin, anio_compra, fecha_ingreso, estado, created_by, owner_id)
    values (
      l.tipo_id, p_marca, p_sede, nullif(trim(p_modelo), ''), upper(trim(p_seriales[k])),
      nullif(trim(p_activos[k]), ''), nullif(trim(p_nombres[k]), ''),
      p.proveedor_id, prov, p_valor, nullif(trim(p_factura), ''), p_garantia,
      extract(year from now())::int, current_date, 'disponible', auth.uid(), p.owner_id
    );
    n := n + 1;
  end loop;
  for i in 1..coalesce(p_sin_serial, 0) loop
    insert into equipos(tipo_id, marca_id, sede_id, modelo, serie, proveedor_id, proveedor, valor_compra, factura_numero, garantia_fin, anio_compra, fecha_ingreso, estado, created_by, owner_id)
    values (
      l.tipo_id, p_marca, p_sede, nullif(trim(p_modelo), ''), '',
      p.proveedor_id, prov, p_valor, nullif(trim(p_factura), ''), p_garantia,
      extract(year from now())::int, current_date, 'disponible', auth.uid(), p.owner_id
    );
    n := n + 1;
  end loop;
  update pedido_lineas set recibida = recibida + n where id = l.id;
  if exists (select 1 from articulo_proveedores where tipo_id = l.tipo_id and proveedor_id = p.proveedor_id) then
    update articulo_proveedores set ultima_compra = current_date, ultimo_precio = coalesce(p_valor, ultimo_precio)
    where tipo_id = l.tipo_id and proveedor_id = p.proveedor_id;
  else
    insert into articulo_proveedores(tipo_id, proveedor_id, ultima_compra, ultimo_precio, owner_id)
    values (l.tipo_id, p.proveedor_id, current_date, p_valor, p.owner_id);
  end if;
  if not exists (select 1 from pedido_lineas where pedido_id = p.id and recibida < cantidad) then
    update pedidos_compra set estado = 'recibido', cerrado_at = now() where id = p.id;
  else
    update pedidos_compra set estado = 'parcial' where id = p.id;
  end if;
  return n;
end $$;

create or replace function public.reportar_falla(p_equipo uuid, p_descripcion text)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.equipos;
  emp uuid := public.my_empleado_id();
begin
  if emp is null then raise exception 'Solo empleados pueden reportar fallas'; end if;
  if coalesce(btrim(p_descripcion), '') = '' then raise exception 'Describa la falla'; end if;
  select * into e from public.equipos where id = p_equipo and empleado_id = emp;
  if not found then raise exception 'El equipo no está a su cargo'; end if;
  if exists (select 1 from public.reportes_falla where equipo_id = p_equipo and estado = 'abierto') then
    raise exception 'Ya hay un reporte abierto para este equipo';
  end if;
  insert into public.reportes_falla(equipo_id, empleado_id, descripcion, owner_id)
  values (p_equipo, emp, left(btrim(p_descripcion), 1000), e.owner_id);
  insert into public.equipo_historial(equipo_id, evento, detalle, user_id)
  values (p_equipo, 'falla_reportada', 'Reporte del empleado: ' || left(btrim(p_descripcion), 300), auth.uid());
end $$;

create or replace function public.atender_falla(p_reporte uuid, p_estado text, p_respuesta text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reportes_falla;
begin
  if not public.has_permiso(auth.uid(), 'equipos_editar') then raise exception 'Sin permiso'; end if;
  if p_estado not in ('atendido', 'descartado', 'en_reparacion') then raise exception 'Estado inválido'; end if;
  select * into r from public.reportes_falla where id = p_reporte and owner_id = public.my_owner_id() and estado = 'abierto';
  if not found then raise exception 'Reporte no encontrado o ya cerrado'; end if;
  update public.reportes_falla set
    estado = p_estado,
    respuesta = nullif(btrim(p_respuesta), ''),
    atendido_por = auth.uid(),
    atendido_at = now()
  where id = p_reporte;
  insert into public.equipo_historial(equipo_id, evento, detalle, user_id)
  values (r.equipo_id, 'falla_' || p_estado, coalesce(nullif(btrim(p_respuesta), ''), 'Reporte cerrado'), auth.uid());
end $$;

create or replace function public.certificar_equipos(p_cert uuid, p_faltantes uuid[], p_comentario text)
returns void language plpgsql security definer set search_path = public as $$
declare
  emp public.empleados;
  c public.certificaciones;
  todos uuid[];
begin
  select * into emp from public.empleados where id = public.my_empleado_id();
  if not found then raise exception 'Solo empleados pueden certificar'; end if;
  select * into c from public.certificaciones where id = p_cert and activa and owner_id = emp.owner_id;
  if not found then raise exception 'Campaña no disponible'; end if;
  select coalesce(array_agg(id), '{}') into todos
  from public.equipos
  where empleado_id = emp.id and estado in ('asignado', 'en_reparacion');
  insert into public.certificacion_respuestas(certificacion_id, empleado_id, equipos_ok, equipos_faltantes, comentario, owner_id)
  values (
    p_cert,
    emp.id,
    array(select unnest(todos) except select unnest(coalesce(p_faltantes, '{}'))),
    array(select unnest(coalesce(p_faltantes, '{}')) intersect select unnest(todos)),
    nullif(btrim(p_comentario), ''),
    emp.owner_id
  );
end $$;

create or replace function public.panel_conteos()
returns table(estado public.equipo_estado, total bigint)
language sql stable security invoker set search_path = public as $$
  select e.estado, count(*) from public.equipos e where e.owner_id = public.my_owner_id() group by e.estado
$$;

create or replace function public.stock_bajo()
returns table(tipo_id uuid, tipo text, disponibles bigint, stock_minimo integer)
language sql stable security invoker set search_path = public as $$
  select a.tipo_id, c.nombre,
    (select count(*) from equipos e where e.tipo_id = a.tipo_id and e.estado = 'disponible' and e.owner_id = a.owner_id),
    a.stock_minimo
  from alertas_stock_config a join catalogo_items c on c.id = a.tipo_id
  where a.activa and a.owner_id = my_owner_id()
    and (select count(*) from equipos e where e.tipo_id = a.tipo_id and e.estado = 'disponible' and e.owner_id = a.owner_id) <= a.stock_minimo
  order by 3, 2;
$$;

create or replace function public.resumen_proveedores()
returns table(proveedor_id uuid, nombre text, equipos bigint, en_garantia bigint, valor numeric, reparaciones bigint, en_reparacion bigint, dias_promedio numeric)
language sql stable set search_path = public as $$
  select p.id, p.nombre,
    (select count(*) from equipos e where e.proveedor_id = p.id and e.estado <> 'de_baja'),
    (select count(*) from equipos e where e.proveedor_id = p.id and e.estado <> 'de_baja' and e.garantia_fin >= current_date),
    (select coalesce(sum(e.valor_compra), 0) from equipos e where e.proveedor_id = p.id and e.estado <> 'de_baja'),
    (select count(*) from reparaciones r where r.proveedor_id = p.id and r.fin is not null),
    (select count(*) from reparaciones r where r.proveedor_id = p.id and r.fin is null),
    (select round(avg(extract(epoch from r.fin - r.inicio) / 86400)::numeric, 1) from reparaciones r where r.proveedor_id = p.id and r.fin is not null)
  from proveedores p where p.owner_id = my_owner_id() order by p.nombre
$$;

create or replace function public.estadisticas_inventario(p_sede uuid default null, p_tipo uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
with e as (
  select eq.*, coalesce(eq.valor_compra, 0) v from equipos eq
  where eq.owner_id = my_owner_id()
    and (p_sede is null or eq.sede_id = p_sede) and (p_tipo is null or eq.tipo_id = p_tipo)
)
select jsonb_build_object(
  'total', (select count(*) from e),
  'valor_total', (select coalesce(sum(v), 0) from e where estado <> 'de_baja'),
  'valor_por_estado', (select coalesce(jsonb_object_agg(estado, val), '{}') from (select estado, sum(v) val from e group by estado) s),
  'por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}') from (select estado, count(*) n from e group by estado) s),
  'sin_valor', (select count(*) from e where valor_compra is null),
  'por_tipo', (select coalesce(jsonb_agg(t order by t.cantidad desc), '[]') from (
      select coalesce(c.nombre, '—') nombre, count(*) cantidad,
        count(*) filter (where estado = 'disponible') disponibles,
        count(*) filter (where estado = 'asignado') asignados,
        count(*) filter (where estado = 'en_reparacion') en_reparacion,
        count(*) filter (where estado = 'de_baja') de_baja,
        sum(v) valor, round(avg(valor_compra), 0) promedio
      from e left join catalogo_items c on c.id = e.tipo_id group by c.nombre) t),
  'por_marca', (select coalesce(jsonb_agg(t order by t.cantidad desc), '[]') from (
      select coalesce(c.nombre, 'Sin marca') nombre, count(*) cantidad, sum(v) valor from e left join catalogo_items c on c.id = e.marca_id group by c.nombre order by 2 desc limit 15) t),
  'por_sede', (select coalesce(jsonb_agg(t order by t.cantidad desc), '[]') from (
      select coalesce(c.nombre, 'Sin sede') nombre, count(*) cantidad, sum(v) valor from e left join catalogo_items c on c.id = e.sede_id group by c.nombre) t),
  'ingresos_mes', (select coalesce(jsonb_agg(t order by t.mes), '[]') from (
      select to_char(date_trunc('month', fecha_ingreso), 'YYYY-MM') mes, count(*) cantidad, sum(v) valor from e
      where fecha_ingreso >= date_trunc('month', current_date) - interval '11 months' group by 1) t),
  'por_anio', (select coalesce(jsonb_agg(t order by t.anio), '[]') from (
      select anio_compra anio, count(*) cantidad from e where anio_compra is not null group by 1) t),
  'garantia_vencida', (select count(*) from e where garantia_fin < current_date and estado <> 'de_baja'),
  'garantia_por_vencer', (select count(*) from e where garantia_fin between current_date and current_date + 90 and estado <> 'de_baja'),
  'top_proveedores', (select coalesce(jsonb_agg(t order by t.valor desc), '[]') from (
      select coalesce(p.nombre, nullif(e.proveedor, ''), 'Sin proveedor') nombre, count(*) cantidad, sum(v) valor
      from e left join proveedores p on p.id = e.proveedor_id group by 1 order by 3 desc limit 10) t),
  'actas_mes', (select coalesce(jsonb_agg(t order by t.mes), '[]') from (
      select to_char(date_trunc('month', firmado_at), 'YYYY-MM') mes,
        count(*) filter (where tipo = 'entrega') entregas, count(*) filter (where tipo = 'devolucion') devoluciones
      from actas where owner_id = my_owner_id() and estado = 'firmada'
        and firmado_at >= date_trunc('month', current_date) - interval '11 months' group by 1) t),
  'actas_firmadas_mes', (select count(*) from actas where owner_id = my_owner_id() and estado = 'firmada' and firmado_at >= date_trunc('month', current_date)),
  'actas_pendientes', (select count(*) from actas where owner_id = my_owner_id() and estado = 'pendiente')
)
$$;

create or replace function public.estadisticas_avanzadas(p_sede uuid default null, p_tipo uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
with e as (
  select eq.* from equipos eq where eq.owner_id = my_owner_id()
    and (p_sede is null or eq.sede_id = p_sede) and (p_tipo is null or eq.tipo_id = p_tipo)
), r as (
  select rp.* from reparaciones rp join e on e.id = rp.equipo_id
), a as (
  select * from actas where owner_id = my_owner_id() and estado <> 'anulada'
)
select jsonb_build_object(
  'fallas_30', (select count(distinct id) from (
      select equipo_id id from r where inicio >= now() - interval '30 days'
      union select id from e where estado = 'de_baja' and updated_at >= now() - interval '30 days') x),
  'fallas_30_prev', (select count(distinct id) from (
      select equipo_id id from r where inicio >= now() - interval '60 days' and inicio < now() - interval '30 days') x),
  'asignados_prev', (select count(*) from e where estado = 'asignado' and created_at < date_trunc('month', current_date)),
  'firmadas', (select count(*) from a where estado = 'firmada'),
  'pendientes', (select count(*) from a where estado = 'pendiente'),
  'firmadas_mes_prev', (select count(*) from a where estado = 'firmada' and firmado_at >= date_trunc('month', current_date) - interval '1 month' and firmado_at < date_trunc('month', current_date)),
  'horas_firma', (select round(avg(extract(epoch from firmado_at - created_at) / 3600)::numeric, 1) from a where estado = 'firmada' and firmado_at is not null),
  'por_tipo_estado', (select coalesce(jsonb_agg(t order by t.total desc), '[]') from (
      select coalesce(c.nombre, '—') nombre, count(*) total,
        count(*) filter (where estado = 'disponible') disponible, count(*) filter (where estado = 'asignado') asignado,
        count(*) filter (where estado = 'en_reparacion') en_reparacion, count(*) filter (where estado = 'de_baja') de_baja
      from e left join catalogo_items c on c.id = e.tipo_id group by c.nombre order by 2 desc limit 12) t),
  'fallas_marca', (select coalesce(jsonb_agg(t order by t.total desc), '[]') from (
      select coalesce(c.nombre, 'Sin marca') nombre,
        (select count(*) from r join e e2 on e2.id = r.equipo_id where e2.marca_id is not distinct from c.id) reparaciones,
        count(*) filter (where e.estado = 'de_baja') bajas,
        count(*) equipos,
        (select count(*) from r join e e2 on e2.id = r.equipo_id where e2.marca_id is not distinct from c.id) + count(*) filter (where e.estado = 'de_baja') total
      from e left join catalogo_items c on c.id = e.marca_id group by c.id, c.nombre) t where t.total > 0 limit 12),
  'fallas_modelo', (select coalesce(jsonb_agg(t order by t.total desc), '[]') from (
      select coalesce(nullif(e.modelo, ''), 'Sin modelo') nombre,
        count(distinct r.id) reparaciones, count(distinct e.id) filter (where e.estado = 'de_baja') bajas,
        count(distinct r.id) + count(distinct e.id) filter (where e.estado = 'de_baja') total
      from e left join r on r.equipo_id = e.id group by 1) t where t.total > 0 limit 12),
  'por_cargo', (select coalesce(jsonb_agg(t order by t.cantidad desc), '[]') from (
      select coalesce(nullif(em.cargo, ''), 'Sin cargo') nombre, count(*) cantidad from e join empleados em on em.id = e.empleado_id where e.estado = 'asignado' group by 1 order by 2 desc limit 15) t),
  'por_area', (select coalesce(jsonb_agg(t order by t.cantidad desc), '[]') from (
      select coalesce(c.nombre, 'Sin área') nombre, count(*) cantidad from e join empleados em on em.id = e.empleado_id left join catalogo_items c on c.id = em.area_id where e.estado = 'asignado' group by 1 order by 2 desc limit 15) t),
  'por_sede_emp', (select coalesce(jsonb_agg(t order by t.cantidad desc), '[]') from (
      select coalesce(c.nombre, 'Sin sede') nombre, count(*) cantidad from e join empleados em on em.id = e.empleado_id left join catalogo_items c on c.id = em.sede_id where e.estado = 'asignado' group by 1 order by 2 desc limit 15) t),
  'movimientos', (select coalesce(jsonb_agg(t order by t.mes), '[]') from (
      select to_char(m, 'YYYY-MM') mes,
        (select count(*) from a where estado = 'firmada' and tipo = 'entrega' and date_trunc('month', firmado_at) = m) entregas,
        (select count(*) from a where estado = 'firmada' and tipo = 'devolucion' and date_trunc('month', firmado_at) = m) devoluciones,
        (select count(*) from e where date_trunc('month', fecha_ingreso) = m) ingresos,
        (select count(*) from e where fecha_ingreso < m + interval '1 month') acumulado
      from generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), interval '1 month') m) t),
  'stock', (select coalesce(jsonb_agg(t order by t.nombre), '[]') from (
      select c.nombre, (select count(*) from equipos x where x.owner_id = my_owner_id() and x.tipo_id = s.tipo_id and x.estado = 'disponible') disponibles, s.stock_minimo minimo
      from alertas_stock_config s join catalogo_items c on c.id = s.tipo_id where s.owner_id = my_owner_id() and s.activa) t),
  'garantias', jsonb_build_object(
      'd30', (select count(*) from e where estado <> 'de_baja' and garantia_fin between current_date and current_date + 30),
      'd60', (select count(*) from e where estado <> 'de_baja' and garantia_fin between current_date + 31 and current_date + 60),
      'd90', (select count(*) from e where estado <> 'de_baja' and garantia_fin between current_date + 61 and current_date + 90))
)
$$;

-- -----------------------------------------------------------------------------
-- 13. Permisos de Ejecución de Funciones
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
  loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

revoke execute on function
  public.acta_items_before_insert(),
  public.actas_after_update(),
  public.actas_before_insert(),
  public.actas_before_update(),
  public.audit_trigger(),
  public.auditoria_inmutable(),
  public.empleados_before_update(),
  public.equipos_after_insert(),
  public.equipos_after_update(),
  public.equipos_before_insert(),
  public.equipos_before_update(),
  public.handle_new_user(),
  public.pedidos_validar(),
  public.update_updated_at_column(),
  public.user_roles_guard_admin()
from authenticated, anon, public;
