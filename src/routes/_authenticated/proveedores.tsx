import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { ETIQUETAS_PROVEEDOR, cop, telefonoPrincipal, type Prov } from "@/lib/proveedores";
import { ContactoProveedor } from "@/components/ContactoProveedor";
import { PedidosProveedor } from "@/components/Pedidos";
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
import { Download, ExternalLink, PackageCheck, Pencil, Plus, Star, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/proveedores")({
  head: () => ({ meta: [{ title: "Proveedores — Finesa" }, { name: "description", content: "Directorio inteligente de proveedores del inventario." }] }),
  component: Proveedores,
});

function Proveedores() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const [texto, setTexto] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [estado, setEstado] = useState("activo");
  const [articulo, setArticulo] = useState("");
  const pag = usePaginacion(`${texto}|${etiqueta}|${estado}|${articulo}`);
  const [editar, setEditar] = useState<Prov | "nuevo" | null>(null);
  const [ver, setVer] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["proveedores", texto, etiqueta, estado, articulo, pag.desde, pag.tamano],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const t = texto.trim().replace(/[,()%]/g, " ");
      // Búsqueda por artículo: el texto también coincide con tipos de equipo del catálogo
      const tiposTexto = t ? cat.byTipo("tipo_equipo", false).filter((c) => c.nombre.toLowerCase().includes(t.toLowerCase())).map((c) => c.id) : [];
      const tipos = articulo ? [articulo] : [];
      let idsArticulo: string[] | null = null;
      if (tipos.length) idsArticulo = ((await supabase.from("articulo_proveedores").select("proveedor_id").in("tipo_id", tipos)).data ?? []).map((r) => r.proveedor_id);
      const idsTexto = tiposTexto.length ? ((await supabase.from("articulo_proveedores").select("proveedor_id").in("tipo_id", tiposTexto)).data ?? []).map((r) => r.proveedor_id) : [];
      let s = supabase.from("proveedores").select("*, articulo_proveedores(tipo_id), equipos!equipos_proveedor_id_fkey(count)", { count: "exact" });
      if (t) s = s.or([`nombre.ilike.%${t}%`, `nit.ilike.%${t}%`, `ciudad.ilike.%${t}%`, ...(idsTexto.length ? [`id.in.(${idsTexto.join(",")})`] : [])].join(","));
      if (idsArticulo) s = s.in("id", idsArticulo.length ? idsArticulo : ["00000000-0000-0000-0000-000000000000"]);
      if (etiqueta) s = s.contains("etiquetas", [etiqueta]);
      if (estado) s = s.eq("activo", estado === "activo");
      const { data, count, error } = await s.order("nombre").range(pag.desde, pag.hasta);
      if (error) throw error;
      return { filas: data ?? [], total: count ?? 0 };
    },
  });
  if (!me?.can("proveedores_editar")) return <p className="text-muted-foreground">No tiene permiso para gestionar proveedores.</p>;

  async function exportar() {
    const [{ data }, { data: res }] = await Promise.all([supabase.from("proveedores").select("*").order("nombre"), supabase.rpc("resumen_proveedores")]);
    const r = Object.fromEntries((res ?? []).map((x) => [x.proveedor_id, x]));
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet((data ?? []).map((p) => ({
      "Razón social": p.nombre, NIT: p.nit ?? "", Ciudad: p.ciudad ?? "", Dirección: p.direccion ?? "", "Sitio web": p.sitio_web ?? "",
      Asesor: p.contacto_nombre ?? "", "Teléfono directo": p.asesor_telefono ?? "", Celular: p.whatsapp ?? "", Teléfono: p.telefono ?? "", Correo: p.email ?? "",
      Tipos: (p.etiquetas ?? []).join(", "), "Días entrega": p.dias_entrega ?? "", "Forma de pago": p.forma_pago ?? "", Estado: p.activo ? "Activo" : "Inactivo",
      "Equipos suministrados": Number(r[p.id]?.equipos ?? 0), "En garantía": Number(r[p.id]?.en_garantia ?? 0), "Valor": Number(r[p.id]?.valor ?? 0),
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Proveedores"); XLSX.writeFile(wb, "proveedores.xlsx");
  }
  const sel = "h-9 rounded-md border border-input bg-card px-3 text-sm";

  return (
    <div>
      <PageHeader title="Proveedores" desc="Directorio de aliados comerciales, artículos que surten, garantías y reparaciones.">
        <Button variant="outline" onClick={exportar}><Download className="mr-1 h-4 w-4" />Excel</Button>
        <Button onClick={() => setEditar("nuevo")}><Plus className="mr-1 h-4 w-4" />Nuevo proveedor</Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Buscar por nombre, NIT, ciudad o artículo (ej. Diademas)" className="w-full sm:w-96" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <select className={sel} value={articulo} onChange={(e) => setArticulo(e.target.value)} aria-label="Artículo"><option value="">Todos los artículos</option>{cat.byTipo("tipo_equipo").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        <select className={sel} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} aria-label="Tipo"><option value="">Todos los tipos</option>{ETIQUETAS_PROVEEDOR.map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado"><option value="activo">Activos</option><option value="inactivo">Inactivos</option><option value="">Todos</option></select>
      </div>
      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Proveedor</TableHead><TableHead>NIT</TableHead><TableHead>Asesor</TableHead><TableHead>Contacto</TableHead><TableHead>Tipo</TableHead><TableHead>Artículos</TableHead><TableHead className="text-right">Equipos</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <FilasSkeleton columnas={8} />}
            {(q.data?.filas ?? []).map((p) => {
              const tipos = ((p.articulo_proveedores ?? []) as { tipo_id: string }[]).map((a) => cat.nombre(a.tipo_id));
              const n = Array.isArray(p.equipos) ? Number((p.equipos[0] as { count?: number })?.count ?? 0) : 0;
              const tel = telefonoPrincipal(p);
              return (
                <TableRow key={p.id} className={p.activo ? "" : "opacity-60"}>
                  <TableCell><button className="font-medium text-primary hover:underline" onClick={() => setVer(p.id)}>{p.nombre}</button><div className="text-xs text-muted-foreground">{p.ciudad ?? ""}{!p.activo && " · Inactivo"}</div></TableCell>
                  <TableCell>{p.nit ?? "—"}</TableCell>
                  <TableCell>{p.contacto_nombre ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div>{tel || "—"}</div>{p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                  </TableCell>
                  <TableCell><div className="flex max-w-56 flex-wrap gap-1">{(p.etiquetas ?? []).map((e) => <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>)}</div></TableCell>
                  <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={tipos.join(", ")}>{tipos.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right">{n}</TableCell>
                  <TableCell className="text-right"><Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditar(p as Prov)}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              );
            })}
            {!q.isLoading && !q.data?.filas.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No hay proveedores con esos filtros.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination total={q.data?.total ?? 0} pagina={pag.pagina} tamano={pag.tamano} onPagina={pag.setPagina} onTamano={pag.setTamano} />
      {editar && <FormProveedor p={editar === "nuevo" ? null : editar} onClose={() => setEditar(null)} />}
      <DetalleProveedor id={ver} onClose={() => setVer(null)} onEditar={(p) => setEditar(p)} />
    </div>
  );
}

type Vin = { id: string; tipo_id: string; es_principal: boolean; precio_referencia: number | null; ultimo_precio: number | null; ultima_compra: string | null; tiempo_entrega_dias: number | null };

function DetalleProveedor({ id, onClose, onEditar }: { id: string | null; onClose: () => void; onEditar: (p: Prov) => void }) {
  const qc = useQueryClient();
  const cat = useCatalogos();
  const q = useQuery({
    queryKey: ["proveedor", id], enabled: !!id,
    queryFn: async () => {
      const [p, vin, eqs, rep, res] = await Promise.all([
        supabase.from("proveedores").select("*").eq("id", id!).single(),
        supabase.from("articulo_proveedores").select("*").eq("proveedor_id", id!),
        supabase.from("equipos").select("id, serie, tipo_id, modelo, valor_compra, estado, garantia_fin").eq("proveedor_id", id!).order("created_at", { ascending: false }).limit(500),
        supabase.from("equipos").select("id, serie, tipo_id, reparacion_inicio").eq("reparacion_proveedor_id", id!).eq("estado", "en_reparacion"),
        supabase.rpc("resumen_proveedores"),
      ]);
      if (p.error) throw p.error;
      return { p: p.data as Prov, vinculos: (vin.data ?? []) as Vin[], equipos: eqs.data ?? [], reparando: rep.data ?? [], resumen: (res.data ?? []).find((r) => r.proveedor_id === id) ?? null };
    },
  });
  const [n, setN] = useState({ tipo_id: "", precio: "", ultimo: "" });
  const [recibir, setRecibir] = useState<string | null | undefined>(undefined);
  const refrescar = () => { ["proveedor", "proveedores", "proveedores_articulo"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };
  async function vincular() {
    if (!n.tipo_id || !id) return toast.error("Seleccione un tipo de equipo");
    const { error } = await supabase.from("articulo_proveedores").insert({ tipo_id: n.tipo_id, proveedor_id: id, precio_referencia: n.precio ? Number(n.precio) : null, ultimo_precio: n.ultimo ? Number(n.ultimo) : null });
    if (error) return toast.error(error.code === "23505" ? "Ya está vinculado a ese tipo." : errMsg(error));
    setN({ tipo_id: "", precio: "", ultimo: "" }); refrescar();
  }
  async function principal(v: Vin) {
    if (v.es_principal) { await supabase.from("articulo_proveedores").update({ es_principal: false }).eq("id", v.id); return refrescar(); }
    await supabase.from("articulo_proveedores").update({ es_principal: false }).eq("tipo_id", v.tipo_id).eq("es_principal", true);
    const { error } = await supabase.from("articulo_proveedores").update({ es_principal: true }).eq("id", v.id);
    if (error) toast.error(errMsg(error)); else { toast.success(`Proveedor principal de ${cat.nombre(v.tipo_id)}`); refrescar(); }
  }
  async function precio(v: Vin, campo: "precio_referencia" | "ultimo_precio", valor: string) {
    const num = valor ? Number(valor) : null;
    if (num === v[campo] || (num !== null && (!Number.isFinite(num) || num < 0))) return;
    const { error } = await supabase.from("articulo_proveedores").update(campo === "precio_referencia" ? { precio_referencia: num } : { ultimo_precio: num }).eq("id", v.id);
    if (error) toast.error(errMsg(error)); else refrescar();
  }
  async function quitar(vid: string) {
    const { error } = await supabase.from("articulo_proveedores").delete().eq("id", vid);
    if (error) toast.error(errMsg(error)); else refrescar();
  }
  const d = q.data;
  const hoy = new Date().toISOString().slice(0, 10);
  const ya = new Set((d?.vinculos ?? []).map((v) => v.tipo_id));
  const sel = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";
  const r = d?.resumen;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>{d?.p.nombre ?? "Proveedor"}</SheetTitle></SheetHeader>
        {d && (
          <div className="mt-4 space-y-6 text-sm">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="mb-1 flex flex-wrap gap-1">{d.p.etiquetas.map((e) => <Badge key={e} variant="secondary">{e}</Badge>)}<Badge variant={d.p.activo ? "default" : "outline"}>{d.p.activo ? "Activo" : "Inactivo"}</Badge></div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Item k="NIT" v={d.p.nit} /><Item k="Ciudad" v={d.p.ciudad} /><Item k="Dirección" v={d.p.direccion} />
                <Item k="Sitio web" v={d.p.sitio_web && <a className="text-primary hover:underline" href={d.p.sitio_web.startsWith("http") ? d.p.sitio_web : `https://${d.p.sitio_web}`} target="_blank" rel="noreferrer">{d.p.sitio_web} <ExternalLink className="inline h-3 w-3" /></a>} />
                                <Item k="Entrega promedio" v={d.p.dias_entrega != null ? `${d.p.dias_entrega} días` : null} /><Item k="Forma de pago" v={d.p.forma_pago} />
              </dl>
              <div className="mt-3 rounded border border-border bg-card p-2"><div className="mb-1 text-xs font-medium">Datos de contacto</div><ContactoProveedor p={d.p} compacto /></div>
              {d.p.notas && <p className="mt-2">{d.p.notas}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onEditar(d.p)}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                <Button size="sm" onClick={() => setRecibir(null)}><PackageCheck className="mr-1 h-3.5 w-3.5" />Recibir stock de este proveedor</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi k="Equipos suministrados" v={Number(r?.equipos ?? 0)} /><Kpi k="En garantía" v={Number(r?.en_garantia ?? 0)} />
              <Kpi k="Valor" v={cop(Number(r?.valor ?? 0))} /><Kpi k="Reparaciones" v={`${Number(r?.reparaciones ?? 0)}${r?.dias_promedio != null ? ` · ${r.dias_promedio} d prom.` : ""}`} />
            </div>
            <PedidosProveedor proveedorId={d.p.id} />

            <section>
              <h3 className="mb-2 font-medium">Artículos que vende</h3>
              <div className="rounded border border-border">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead>Artículo</TableHead><TableHead>Precio ref.</TableHead><TableHead>Última compra</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.vinculos.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell><button onClick={() => principal(v)} aria-label="Proveedor principal" title="Proveedor principal del artículo"><Star className={`h-4 w-4 ${v.es_principal ? "fill-warning text-warning" : "text-muted-foreground"}`} /></button></TableCell>
                        <TableCell>{cat.nombre(v.tipo_id)}</TableCell>
                        <TableCell><Input type="number" min={0} className="h-8 w-28" defaultValue={v.precio_referencia ?? ""} onBlur={(e) => precio(v, "precio_referencia", e.target.value)} aria-label="Precio de referencia" /></TableCell>
                        <TableCell><Input type="number" min={0} className="h-8 w-28" defaultValue={v.ultimo_precio ?? ""} onBlur={(e) => precio(v, "ultimo_precio", e.target.value)} aria-label="Último precio" />{v.ultima_compra && <div className="text-[10px] text-muted-foreground">{fmtFecha(v.ultima_compra)}</div>}</TableCell>
                        <TableCell className="text-right"><Button size="icon" variant="ghost" aria-label="Quitar" onClick={() => quitar(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                      </TableRow>
                    ))}
                    {!d.vinculos.length && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Sin artículos vinculados.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
                <div className="col-span-2 space-y-1"><Label>Vincular artículo</Label>
                  <select className={sel} value={n.tipo_id} onChange={(e) => setN({ ...n, tipo_id: e.target.value })}><option value="">—</option>{cat.byTipo("tipo_equipo").filter((c) => !ya.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
                </div>
                <div className="space-y-1"><Label>Precio ref.</Label><Input type="number" min={0} value={n.precio} onChange={(e) => setN({ ...n, precio: e.target.value })} /></div>
                <div className="space-y-1"><Label>Último precio</Label><Input type="number" min={0} value={n.ultimo} onChange={(e) => setN({ ...n, ultimo: e.target.value })} /></div>
                <Button className="col-span-2 sm:col-span-4" onClick={vincular}>Vincular</Button>
              </div>
            </section>

            {d.reparando.length > 0 && (
              <section>
                <h3 className="mb-2 font-medium">En reparación ahora ({d.reparando.length})</h3>
                <ul className="divide-y divide-border rounded border border-border">
                  {d.reparando.map((e) => <li key={e.id} className="flex justify-between px-3 py-2"><Link to="/equipos/$id" params={{ id: e.id }} className="font-mono text-xs text-primary hover:underline">{e.serie}</Link><span className="text-xs text-muted-foreground">{cat.nombre(e.tipo_id)} · desde {fmtFecha(e.reparacion_inicio)}</span></li>)}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 font-medium">Equipos comprados ({d.equipos.length})</h3>
              <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded border border-border">
                {d.equipos.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <Link to="/equipos/$id" params={{ id: e.id }} className="font-mono text-xs text-primary hover:underline">{e.serie}</Link>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">{cat.nombre(e.tipo_id)} {e.modelo ?? ""} · {cop(e.valor_compra)}
                      {e.garantia_fin && <Badge variant={e.garantia_fin >= hoy ? "default" : "outline"} className="text-[10px]">{e.garantia_fin >= hoy ? "En garantía" : "Vencida"}</Badge>}</span>
                  </li>
                ))}
                {!d.equipos.length && <li className="px-3 py-3 text-muted-foreground">Ningún equipo tiene este proveedor asignado.</li>}
              </ul>
            </section>
          </div>
        )}
        {recibir !== undefined && id && <RecibirStock proveedorId={id} onClose={() => setRecibir(undefined)} />}
      </SheetContent>
    </Sheet>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>;
}
function Kpi({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="rounded-md border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="text-lg font-semibold">{v}</div></div>;
}
