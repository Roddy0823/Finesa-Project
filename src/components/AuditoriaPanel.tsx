import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAll } from "@/lib/fetchAll";
import { DataTablePagination, FilasSkeleton, usePaginacion } from "@/components/DataTablePagination";
import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { PageHeader } from "@/components/Estado";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { descargarCSV, fmtFecha } from "@/lib/constantes";


const TABLAS: Record<string, string> = {
  equipos: "Equipos", empleados: "Empleados", actas: "Actas", acta_items: "Ítems de acta", catalogo_items: "Catálogos",
  profiles: "Perfiles", user_roles: "Roles", user_permisos: "Permisos", tokens_firma: "Enlaces de firma", usuarios: "Usuarios", sesion: "Sesión",
};

const RAPIDOS = [["hoy", "Hoy"], ["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["todos", "Todos"]] as const;
const isoDia = (d: Date) => d.toISOString().slice(0, 10);

export function AuditoriaPanel() {
  const { data: me } = useMe();
  const [tabla, setTabla] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [rapido, setRapido] = useState<string>("todos");
  const [abierto, setAbierto] = useState<number | null>(null);
  const pag = usePaginacion({ tabla, desde, hasta });
  function elegirRapido(k: string) {
    setRapido(k);
    const hoy = new Date();
    if (k === "todos") { setDesde(""); setHasta(""); return; }
    const d = new Date(hoy); d.setDate(d.getDate() - (k === "hoy" ? 0 : Number(k) - 1));
    setDesde(isoDia(d)); setHasta(isoDia(hoy));
  }
  const filtrar = <T extends { eq: (c: string, v: string) => T; gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(s: T) => {
    if (tabla) s = s.eq("tabla", tabla);
    if (desde) s = s.gte("created_at", desde);
    if (hasta) s = s.lte("created_at", hasta + "T23:59:59");
    return s;
  };
  const perfilesQ = useQuery({ queryKey: ["auditoria", "perfiles"], enabled: !!me?.isAdmin, queryFn: async () => (await supabase.from("profiles").select("id, nombre, email")).data ?? [] });
  const nom = (id: string | null) => { const p = perfilesQ.data?.find((x) => x.id === id); return p ? p.nombre || p.email : id ? "—" : "Sistema / firmante externo"; };
  const q = useQuery({
    queryKey: ["auditoria", tabla, desde, hasta, pag.desde, pag.tamano],
    enabled: !!me?.isAdmin,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, count, error } = await filtrar(supabase.from("auditoria").select("*", { count: "exact" })).order("created_at", { ascending: false }).order("id", { ascending: false }).range(pag.desde, pag.hasta);
      if (error) throw error;
      return { filas: data ?? [], total: count ?? 0 };
    },
  });
  async function exportar() {
    const todas = await fetchAll((a, b) => filtrar(supabase.from("auditoria").select("*")).order("created_at", { ascending: false }).order("id", { ascending: false }).range(a, b));
    descargarCSV("auditoria.csv", todas.map((r) => ({ fecha: r.created_at, usuario: nom(r.user_id), modulo: r.tabla, accion: r.accion, registro: r.registro_id, detalle: r.detalle ?? "" })));
  }
  if (!me?.isAdmin) return <p className="text-muted-foreground">Solo el Administrador puede ver la auditoría.</p>;
  const filas = (q.data?.filas ?? []).map((r) => ({ ...r, usuario: nom(r.user_id) }));
  return (
    <div>
      <PageHeader title="Auditoría" desc="Registro automático e inalterable de quién creó, editó, anuló o eliminó cada registro.">
        <Button variant="outline" onClick={exportar}>Exportar CSV</Button>
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-1">
        {RAPIDOS.map(([k, l]) => <Button key={k} size="sm" variant={rapido === k ? "default" : "outline"} onClick={() => elegirRapido(k)}>{l}</Button>)}
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <select className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={tabla} onChange={(e) => setTabla(e.target.value)}>
          <option value="">Todos los módulos</option>
          {Object.entries(TABLAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Input type="date" className="w-auto" value={desde} onChange={(e) => { setDesde(e.target.value); setRapido(""); }} />
        <Input type="date" className="w-auto" value={hasta} onChange={(e) => { setHasta(e.target.value); setRapido(""); }} />
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Fecha</th><th className="px-4 py-2">Usuario</th><th className="px-4 py-2">Módulo</th><th className="px-4 py-2">Acción</th><th className="px-4 py-2">Detalle</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && <FilasSkeleton columnas={5} />}
            {filas.map((r) => (
              <Fragment key={r.id}>
                <tr className="cursor-pointer hover:bg-muted/50" onClick={() => setAbierto(abierto === r.id ? null : r.id)}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs">{fmtFecha(r.created_at, true)}</td>
                  <td className="px-4 py-2">{r.usuario}</td>
                  <td className="px-4 py-2">{TABLAS[r.tabla] ?? r.tabla}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.accion}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.detalle ?? (r.antes || r.despues ? "Ver cambios" : "")}</td>
                </tr>
                {abierto === r.id && (r.antes || r.despues) && (
                  <tr><td colSpan={5} className="bg-muted/40 px-4 py-3">
                    <div className="grid gap-3 md:grid-cols-2 text-xs">
                      <pre className="overflow-auto rounded bg-card p-2">{r.antes ? JSON.stringify(r.antes, null, 1) : "—"}</pre>
                      <pre className="overflow-auto rounded bg-card p-2">{r.despues ? JSON.stringify(r.despues, null, 1) : "—"}</pre>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!q.isLoading && !filas.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin eventos en este periodo.</td></tr>}
          </tbody>
        </table>
      </div>
      <DataTablePagination total={q.data?.total ?? 0} pagina={pag.pagina} tamano={pag.tamano} onPagina={pag.setPagina} onTamano={pag.setTamano} />
    </div>
  );
}
