import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { sanitizarBusquedaPostgrest, sanitizarFilaExcel, urlExternaSegura } from "@/lib/utils";
import { ETIQUETAS_PROVEEDOR, cop, telefonoPrincipal, type Prov } from "@/lib/proveedores";
import { ContactoProveedor } from "@/components/ContactoProveedor";
import { NuevoPedido, PedidosProveedor } from "@/components/Pedidos";
import { PageHeader } from "@/components/Estado";
import { FormProveedor } from "@/components/ProveedorForm";
import { RecibirStock } from "@/components/RecibirStock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTablePagination, FilasSkeleton, usePaginacion } from "@/components/DataTablePagination";
import { toast } from "sonner";
import {
  Building2,
  Download,
  ExternalLink,
  Link2,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  Star,
  Trash2,
  Wrench,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/proveedores")({
  head: () => ({
    meta: [
      { title: "Proveedores — Finesa" },
      { name: "description", content: "Directorio inteligente de proveedores del inventario." },
    ],
  }),
  component: Proveedores,
});

const sel =
  "h-9 rounded-lg border border-input bg-background/80 px-3 text-xs font-medium transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function Proveedores() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [estado, setEstado] = useState("activo");
  const [articulo, setArticulo] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setTexto(busca), 220);
    return () => clearTimeout(id);
  }, [busca]);

  const pag = usePaginacion(`${texto}|${etiqueta}|${estado}|${articulo}`);
  const [editar, setEditar] = useState<Prov | "nuevo" | null>(null);
  const [ver, setVer] = useState<string | null>(null);
  const [pedidoProv, setPedidoProv] = useState<{
    proveedor_id: string;
    lineas?: { tipo_id: string; cantidad: number }[];
  } | null>(null);

  const q = useQuery({
    queryKey: ["proveedores", texto, etiqueta, estado, articulo, pag.desde, pag.hasta, pag.tamano],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const t = sanitizarBusquedaPostgrest(texto);
      const tiposTexto = t
        ? cat
            .byTipo("tipo_equipo", false)
            .filter((c) => c.nombre.toLowerCase().includes(t.toLowerCase()))
            .map((c) => c.id)
        : [];
      const tipos = articulo ? [articulo] : [];
      let idsArticulo: string[] | null = null;
      if (tipos.length)
        idsArticulo = (
          (await supabase.from("articulo_proveedores").select("proveedor_id").in("tipo_id", tipos)).data ?? []
        ).map((r) => r.proveedor_id);
      const idsTexto = tiposTexto.length
        ? (
            (await supabase.from("articulo_proveedores").select("proveedor_id").in("tipo_id", tiposTexto)).data ?? []
          ).map((r) => r.proveedor_id)
        : [];
      let s = supabase
        .from("proveedores")
        .select("*, articulo_proveedores(tipo_id), equipos!equipos_proveedor_id_fkey(count)", { count: "exact" });
      if (t)
        s = s.or(
          [
            `nombre.ilike.%${t}%`,
            `nit.ilike.%${t}%`,
            `ciudad.ilike.%${t}%`,
            ...(idsTexto.length ? [`id.in.(${idsTexto.join(",")})`] : []),
          ].join(","),
        );
      if (idsArticulo) s = s.in("id", idsArticulo.length ? idsArticulo : ["00000000-0000-0000-0000-000000000000"]);
      if (etiqueta) s = s.contains("etiquetas", [etiqueta]);
      if (estado) s = s.eq("activo", estado === "activo");
      const { data, count, error } = await s.order("nombre").range(pag.desde, pag.hasta);
      if (error) throw error;
      return { filas: data ?? [], total: count ?? 0 };
    },
  });

  if (!me?.can("proveedores_editar"))
    return <p className="text-muted-foreground">No tiene permiso para gestionar proveedores.</p>;

  const puedeReabastecer = me.can("reabastecimiento_gestionar");

  async function exportar() {
    const [{ data }, { data: res }] = await Promise.all([
      supabase.from("proveedores").select("*").order("nombre"),
      supabase.rpc("resumen_proveedores"),
    ]);
    const r = Object.fromEntries((res ?? []).map((x) => [x.proveedor_id, x]));
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      (data ?? []).map((p) =>
        sanitizarFilaExcel({
          "Razón social": p.nombre,
          NIT: p.nit ?? "",
          Ciudad: p.ciudad ?? "",
          Dirección: p.direccion ?? "",
          "Sitio web": p.sitio_web ?? "",
          Asesor: p.contacto_nombre ?? "",
          "Teléfono directo": p.asesor_telefono ?? "",
          Celular: p.whatsapp ?? "",
          Teléfono: p.telefono ?? "",
          Correo: p.email ?? "",
          Tipos: (p.etiquetas ?? []).join(", "),
          "Días entrega": p.dias_entrega ?? "",
          "Forma de pago": p.forma_pago ?? "",
          Estado: p.activo ? "Activo" : "Inactivo",
          "Equipos suministrados": Number(r[p.id]?.equipos ?? 0),
          "En garantía": Number(r[p.id]?.en_garantia ?? 0),
          Valor: Number(r[p.id]?.valor ?? 0),
        }),
      ),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proveedores");
    XLSX.writeFile(wb, "proveedores.xlsx");
  }

  const hayFiltros = Boolean(busca || texto || etiqueta || articulo || estado !== "activo");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Proveedores"
        desc="Directorio de aliados comerciales, catálogo de artículos suministrados, precios de referencia y garantías."
      >
        <Button variant="outline" onClick={exportar}>
          <Download className="mr-1.5 h-4 w-4" />
          Exportar Excel
        </Button>
        <Button onClick={() => setEditar("nuevo")}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo proveedor
        </Button>
      </PageHeader>

      {/* Barra de búsqueda y filtros interactivos */}
      <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, NIT, ciudad o artículo que suministra…"
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className={sel}
              value={articulo}
              onChange={(e) => setArticulo(e.target.value)}
              aria-label="Artículo"
            >
              <option value="">Todos los artículos</option>
              {cat.byTipo("tipo_equipo").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>

            <div className="inline-flex items-center rounded-xl border border-border/80 bg-muted/30 p-1">
              {[
                { id: "activo", label: "Activos" },
                { id: "inactivo", label: "Inactivos" },
                { id: "", label: "Todos" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setEstado(s.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    estado === s.id
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {hayFiltros && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setBusca("");
                  setTexto("");
                  setEtiqueta("");
                  setArticulo("");
                  setEstado("activo");
                }}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Píldoras interactivas de especialidad */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="mr-1 text-[11px] font-medium text-muted-foreground">Especialidad:</span>
          <button
            type="button"
            onClick={() => setEtiqueta("")}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
              !etiqueta
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            Todas
          </button>
          {ETIQUETAS_PROVEEDOR.map((x) => {
            const act = etiqueta === x;
            return (
              <button
                key={x}
                type="button"
                onClick={() => setEtiqueta(act ? "" : x)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                  act
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {x}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabla interactiva de proveedores */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Proveedor</TableHead>
              <TableHead>NIT</TableHead>
              <TableHead>Asesor y contacto</TableHead>
              <TableHead>Categorías</TableHead>
              <TableHead>Artículos suministrados</TableHead>
              <TableHead className="text-right">Equipos</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <FilasSkeleton columnas={7} />}
            {(q.data?.filas ?? []).map((p) => {
              const tipos = ((p.articulo_proveedores ?? []) as { tipo_id: string }[]).map((a) => cat.nombre(a.tipo_id));
              const n = Array.isArray(p.equipos) ? Number((p.equipos[0] as { count?: number })?.count ?? 0) : 0;
              const tel = telefonoPrincipal(p);
              return (
                <TableRow
                  key={p.id}
                  onClick={() => setVer(p.id)}
                  className={`group cursor-pointer transition-colors hover:bg-muted/40 ${p.activo ? "" : "opacity-60"}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/40 font-semibold text-xs text-foreground group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
                        {p.nombre.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-foreground group-hover:text-primary">
                          <span>{p.nombre}</span>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              p.activo ? "bg-success" : "bg-muted-foreground/50"
                            }`}
                            title={p.activo ? "Activo" : "Inactivo"}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {p.ciudad && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5" />
                              {p.ciudad}
                            </span>
                          )}
                          {p.dias_entrega != null && <span>· {p.dias_entrega}d entrega</span>}
                          {!p.activo && <span>· Inactivo</span>}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.nit ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-xs font-medium text-foreground">{p.contacto_nombre || tel || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {[p.contacto_nombre ? tel : null, p.email].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-52 flex-wrap gap-1">
                      {(p.etiquetas ?? []).map((e) => (
                        <Badge key={e} variant="secondary" className="text-[10px] font-normal">
                          {e}
                        </Badge>
                      ))}
                      {!(p.etiquetas ?? []).length && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-56">
                    {tipos.length > 0 ? (
                      <div className="flex flex-wrap gap-1" title={tipos.join(", ")}>
                        {tipos.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] text-foreground"
                          >
                            {t}
                          </span>
                        ))}
                        {tipos.length > 3 && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            +{tipos.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin vincular</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs font-medium">{n}</span>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      {puedeReabastecer && p.activo && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          aria-label="Crear pedido"
                          title="Crear pedido de compra"
                          onClick={() => setPedidoProv({ proveedor_id: p.id })}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        aria-label="Editar"
                        title="Editar proveedor"
                        onClick={() => setEditar(p as Prov)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!q.isLoading && !q.data?.filas.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                  No se encontraron proveedores con esos filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataTablePagination
          total={q.data?.total ?? 0}
          pagina={pag.pagina}
          tamano={pag.tamano}
          onPagina={pag.setPagina}
          onTamano={pag.setTamano}
        />
      </div>

      {editar && <FormProveedor p={editar === "nuevo" ? null : editar} onClose={() => setEditar(null)} />}
      {pedidoProv && <NuevoPedido inicial={pedidoProv} onClose={() => setPedidoProv(null)} />}
      <DetalleProveedor
        id={ver}
        onClose={() => setVer(null)}
        onEditar={(p) => setEditar(p)}
        onPedir={(provId, tipoId) =>
          setPedidoProv({
            proveedor_id: provId,
            ...(tipoId ? { lineas: [{ tipo_id: tipoId, cantidad: 1 }] } : {}),
          })
        }
      />
    </div>
  );
}

type Vin = {
  id: string;
  tipo_id: string;
  es_principal: boolean;
  precio_referencia: number | null;
  ultimo_precio: number | null;
  ultima_compra: string | null;
  tiempo_entrega_dias: number | null;
};

function DetalleProveedor({
  id,
  onClose,
  onEditar,
  onPedir,
}: {
  id: string | null;
  onClose: () => void;
  onEditar: (p: Prov) => void;
  onPedir: (provId: string, tipoId?: string) => void;
}) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const cat = useCatalogos();
  const puedeReabastecer = !!me?.can("reabastecimiento_gestionar");

  const q = useQuery({
    queryKey: ["proveedor", id],
    enabled: !!id,
    queryFn: async () => {
      const [p, vin, eqs, rep, res] = await Promise.all([
        supabase.from("proveedores").select("*").eq("id", id!).single(),
        supabase.from("articulo_proveedores").select("*").eq("proveedor_id", id!),
        supabase
          .from("equipos")
          .select("id, serie, tipo_id, modelo, valor_compra, estado, garantia_fin")
          .eq("proveedor_id", id!)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("equipos")
          .select("id, serie, tipo_id, reparacion_inicio")
          .eq("reparacion_proveedor_id", id!)
          .eq("estado", "en_reparacion"),
        supabase.rpc("resumen_proveedores"),
      ]);
      if (p.error) throw p.error;
      return {
        p: p.data as Prov,
        vinculos: (vin.data ?? []) as Vin[],
        equipos: eqs.data ?? [],
        reparando: rep.data ?? [],
        resumen: (res.data ?? []).find((r) => r.proveedor_id === id) ?? null,
      };
    },
  });
  const [n, setN] = useState({ tipo_id: "", precio: "", ultimo: "" });
  const [recibir, setRecibir] = useState<string | null | undefined>(undefined);
  const refrescar = () => {
    ["proveedor", "proveedores", "proveedores_articulo"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  async function vincular() {
    if (!n.tipo_id || !id) return toast.error("Seleccione un tipo de equipo");
    const { error } = await supabase.from("articulo_proveedores").insert({
      tipo_id: n.tipo_id,
      proveedor_id: id,
      precio_referencia: n.precio ? Number(n.precio) : null,
      ultimo_precio: n.ultimo ? Number(n.ultimo) : null,
    });
    if (error) return toast.error(error.code === "23505" ? "Ya está vinculado a ese tipo." : errMsg(error));
    setN({ tipo_id: "", precio: "", ultimo: "" });
    toast.success("Artículo vinculado al proveedor");
    refrescar();
  }
  async function principal(v: Vin) {
    if (v.es_principal) {
      await supabase.from("articulo_proveedores").update({ es_principal: false }).eq("id", v.id);
      return refrescar();
    }
    await supabase
      .from("articulo_proveedores")
      .update({ es_principal: false })
      .eq("tipo_id", v.tipo_id)
      .eq("es_principal", true);
    const { error } = await supabase.from("articulo_proveedores").update({ es_principal: true }).eq("id", v.id);
    if (error) toast.error(errMsg(error));
    else {
      toast.success(`Proveedor principal de ${cat.nombre(v.tipo_id)}`);
      refrescar();
    }
  }
  async function precio(v: Vin, campo: "precio_referencia" | "ultimo_precio", valor: string) {
    const num = valor ? Number(valor) : null;
    if (num === v[campo] || (num !== null && (!Number.isFinite(num) || num < 0))) return;
    const { error } = await supabase
      .from("articulo_proveedores")
      .update(campo === "precio_referencia" ? { precio_referencia: num } : { ultimo_precio: num })
      .eq("id", v.id);
    if (error) toast.error(errMsg(error));
    else {
      toast.success("Precio actualizado");
      refrescar();
    }
  }
  async function quitar(vid: string) {
    const { error } = await supabase.from("articulo_proveedores").delete().eq("id", vid);
    if (error) toast.error(errMsg(error));
    else refrescar();
  }
  const d = q.data;
  const hoy = new Date().toISOString().slice(0, 10);
  const ya = new Set((d?.vinculos ?? []).map((v) => v.tipo_id));
  const r = d?.resumen;
  const pagEquipos = usePaginacion(id ?? "", 25);
  const equiposPagina = (d?.equipos ?? []).slice(pagEquipos.desde, pagEquipos.desde + pagEquipos.tamano);

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-base font-semibold tracking-tight">
                    {d?.p.nombre ?? "Proveedor"}
                  </SheetTitle>
                  {d && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        d.p.activo
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${d.p.activo ? "bg-success" : "bg-muted-foreground"}`} />
                      {d.p.activo ? "Activo" : "Inactivo"}
                    </span>
                  )}
                </div>
                {d && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[d.p.nit && `NIT ${d.p.nit}`, d.p.ciudad].filter(Boolean).join(" · ") || "Sin NIT o ciudad"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {d && (
          <div className="mt-5 space-y-6 text-sm">
            {/* Ficha comercial y acciones rápidas */}
            <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
              {d.p.etiquetas.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {d.p.etiquetas.map((e) => (
                    <Badge key={e} variant="secondary" className="text-[11px] font-normal">
                      {e}
                    </Badge>
                  ))}
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <Item k="Dirección" v={d.p.direccion} />
                <Item
                  k="Entrega promedio"
                  v={d.p.dias_entrega != null ? `${d.p.dias_entrega} días` : null}
                />
                <Item k="Forma de pago" v={d.p.forma_pago} />
                {urlExternaSegura(d.p.sitio_web) && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-[11px] text-muted-foreground">Sitio web</dt>
                    <dd>
                      <a
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        href={urlExternaSegura(d.p.sitio_web)!}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {d.p.sitio_web}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-3.5 rounded-xl border border-border/70 bg-card p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Canales de contacto (clic para copiar)
                </div>
                <ContactoProveedor p={d.p} compacto />
              </div>

              {d.p.notas && (
                <p className="mt-3 rounded-lg border border-border/60 bg-background/60 p-2.5 text-xs text-muted-foreground">
                  {d.p.notas}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onEditar(d.p)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar ficha
                </Button>
                {puedeReabastecer && d.p.activo && (
                  <Button size="sm" className="h-8 text-xs" onClick={() => onPedir(d.p.id)}>
                    <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                    Crear pedido de compra
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs"
                  onClick={() => setRecibir(null)}
                >
                  <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
                  Recibir stock directo
                </Button>
              </div>
            </div>

            {/* KPIs del proveedor */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Kpi k="Equipos suministrados" v={Number(r?.equipos ?? 0)} />
              <Kpi k="En garantía activa" v={Number(r?.en_garantia ?? 0)} />
              <Kpi k="Valor suministrado" v={cop(Number(r?.valor ?? 0))} />
              <Kpi
                k="Reparaciones"
                v={`${Number(r?.reparaciones ?? 0)}${r?.dias_promedio != null ? ` · ${r.dias_promedio}d` : ""}`}
              />
            </div>

            {/* Historial de pedidos */}
            <PedidosProveedor proveedorId={d.p.id} />

            {/* Artículos que vende */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Catálogo de artículos que suministra ({d.vinculos.length})
                </h3>
                <span className="text-[11px] text-muted-foreground">★ marca como proveedor principal</span>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Artículo</TableHead>
                      <TableHead>Precio ref.</TableHead>
                      <TableHead>Última compra</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.vinculos.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => principal(v)}
                            aria-label="Proveedor principal"
                            title="Proveedor principal del artículo"
                          >
                            <Star
                              className={`h-4 w-4 ${
                                v.es_principal ? "fill-warning text-warning" : "text-muted-foreground/40 hover:text-warning"
                              }`}
                            />
                          </button>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>{cat.nombre(v.tipo_id)}</div>
                          {v.es_principal && (
                            <span className="text-[10px] font-medium text-warning">Proveedor principal</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-28 font-mono text-xs"
                            placeholder="0"
                            defaultValue={v.precio_referencia ?? ""}
                            onBlur={(e) => precio(v, "precio_referencia", e.target.value)}
                            aria-label="Precio de referencia"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-28 font-mono text-xs"
                            placeholder="0"
                            defaultValue={v.ultimo_precio ?? ""}
                            onBlur={(e) => precio(v, "ultimo_precio", e.target.value)}
                            aria-label="Último precio"
                          />
                          {v.ultima_compra && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">{fmtFecha(v.ultima_compra)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            {puedeReabastecer && d.p.activo && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                title="Pedir este artículo"
                                onClick={() => onPedir(d.p.id, v.tipo_id)}
                              >
                                <ShoppingCart className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              aria-label="Quitar"
                              onClick={() => quitar(v.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!d.vinculos.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                          Sin artículos vinculados. Usa el formulario inferior para asociar tipos de equipo.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-border/80 bg-muted/15 p-3.5 sm:grid-cols-4">
                <div className="col-span-2 space-y-1">
                  <Label className="flex items-center gap-1 text-xs">
                    <Link2 className="h-3 w-3 text-primary" />
                    Vincular artículo
                  </Label>
                  <select
                    className={`${sel} w-full`}
                    value={n.tipo_id}
                    onChange={(e) => setN({ ...n, tipo_id: e.target.value })}
                  >
                    <option value="">Seleccione tipo…</option>
                    {cat
                      .byTipo("tipo_equipo")
                      .filter((c) => !ya.has(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Precio ref. (COP)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-9 font-mono text-xs"
                    value={n.precio}
                    onChange={(e) => setN({ ...n, precio: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Último precio</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-9 font-mono text-xs"
                    value={n.ultimo}
                    onChange={(e) => setN({ ...n, ultimo: e.target.value })}
                  />
                </div>
                <Button className="col-span-2 h-8 text-xs sm:col-span-4" disabled={!n.tipo_id} onClick={vincular}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Vincular artículo al catálogo del proveedor
                </Button>
              </div>
            </section>

            {/* En reparación */}
            {d.reparando.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-warning">
                  <Wrench className="h-3.5 w-3.5" />
                  Equipos en reparación ahora ({d.reparando.length})
                </h3>
                <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-warning/30 bg-warning/5">
                  {d.reparando.map((e) => (
                    <li key={e.id} className="flex items-center justify-between px-3.5 py-2">
                      <Link
                        to="/equipos/$id"
                        params={{ id: e.id }}
                        className="font-mono text-xs font-medium text-primary hover:underline"
                      >
                        {e.serie}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {cat.nombre(e.tipo_id)} · desde {fmtFecha(e.reparacion_inicio)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Equipos comprados */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Equipos suministrados ({d.equipos.length})
              </h3>
              <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
                <ul className="divide-y divide-border/60">
                  {equiposPagina.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs">
                      <Link
                        to="/equipos/$id"
                        params={{ id: e.id }}
                        className="font-mono font-medium text-primary hover:underline"
                      >
                        {e.serie || "(Sin serial)"}
                      </Link>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span>
                          {cat.nombre(e.tipo_id)} {e.modelo ?? ""} · <b className="font-mono text-foreground">{cop(e.valor_compra)}</b>
                        </span>
                        {e.garantia_fin && (
                          <Badge variant={e.garantia_fin >= hoy ? "default" : "outline"} className="text-[10px]">
                            {e.garantia_fin >= hoy ? "En garantía" : "Vencida"}
                          </Badge>
                        )}
                      </span>
                    </li>
                  ))}
                  {!d.equipos.length && (
                    <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Ningún equipo del inventario tiene este proveedor asignado aún.
                    </li>
                  )}
                </ul>
                {d.equipos.length > 0 && (
                  <DataTablePagination
                    pagina={pagEquipos.pagina}
                    tamano={pagEquipos.tamano}
                    total={d.equipos.length}
                    onPagina={pagEquipos.setPagina}
                    onTamano={pagEquipos.setTamano}
                  />
                )}
              </div>
            </section>
          </div>
        )}
        {recibir !== undefined && id && <RecibirStock proveedorId={id} onClose={() => setRecibir(undefined)} />}
      </SheetContent>
    </Sheet>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className="font-medium text-foreground">{v || "—"}</dd>
    </div>
  );
}

function Kpi({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="mt-0.5 font-mono text-base font-semibold text-foreground">{v}</div>
    </div>
  );
}
