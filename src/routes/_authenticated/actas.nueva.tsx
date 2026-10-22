import { fetchAll } from "@/lib/fetchAll";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adjuntarFirmaTecnico, obtenerMiFirma } from "@/lib/ajustes.functions";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, DESTINO_DEVOLUCION } from "@/lib/constantes";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CheckCircle2,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Search,
  X,
  UserCheck,
  Laptop,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/actas/nueva")({
  head: () => ({
    meta: [{ title: "Nueva acta — Finesa" }, { name: "description", content: "Crear acta de entrega o devolución." }],
  }),
  component: NuevaActa,
});

function NuevaActa() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const nav = useNavigate();
  const [tipo, setTipo] = useState<"entrega" | "devolucion" | "cambio">(
    me?.can("actas_entrega") ? "entrega" : "devolucion",
  );
  const [empleadoId, setEmpleadoId] = useState("");
  const [buscaEmp, setBuscaEmp] = useState("");
  const [buscaEq, setBuscaEq] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fMarca, setFMarca] = useState("");
  const [fSede, setFSede] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [det, setDet] = useState<
    Record<string, { estado_fisico: string; accesorios: string; nota: string; destino?: string }>
  >({});
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);
  const adjuntar = useServerFn(adjuntarFirmaTecnico);
  const verFirma = useServerFn(obtenerMiFirma);
  const miFirma = useQuery({ queryKey: ["mi-firma"], queryFn: () => verFirma() });

  const emps = useQuery({
    queryKey: ["empleados"],
    queryFn: () =>
      fetchAll((a, b) => supabase.from("empleados").select("*").order("nombre").order("id").range(a, b)),
  });
  const eqs = useQuery({
    queryKey: ["equipos"],
    queryFn: () =>
      fetchAll((a, b) =>
        supabase
          .from("equipos")
          .select("*, empleado:empleados(id, nombre)")
          .order("created_at", { ascending: false })
          .order("id")
          .range(a, b),
      ),
  });

  const empleados = (emps.data ?? []).filter(
    (e) =>
      (tipo === "devolucion" || e.activo) &&
      (!buscaEmp || e.nombre.toLowerCase().includes(buscaEmp.toLowerCase()) || e.identificacion.includes(buscaEmp)),
  );
  const disponibles = useMemo(() => {
    const t = buscaEq.toLowerCase();
    return (eqs.data ?? [])
      .filter(
        (e) =>
          (tipo === "entrega"
            ? e.estado === "disponible"
            : tipo === "devolucion"
              ? e.estado === "asignado" && e.empleado_id === empleadoId
              : e.estado === "disponible" || (e.estado === "asignado" && e.empleado_id === empleadoId)) &&
          (!fTipo || e.tipo_id === fTipo) &&
          (!fMarca || e.marca_id === fMarca) &&
          (!fSede || e.sede_id === fSede) &&
          (!t || [e.serie, e.modelo, e.activo_fijo, e.nombre_equipo].some((v) => (v ?? "").toLowerCase().includes(t))),
      )
      .slice(0, 300);
  }, [eqs.data, tipo, empleadoId, buscaEq, fTipo, fMarca, fSede]);
  const eqPorId = useMemo(() => new Map((eqs.data ?? []).map((e) => [e.id, e])), [eqs.data]);
  const dirDe = (id: string) =>
    tipo === "cambio" ? (eqPorId.get(id)?.estado === "asignado" ? "devolucion" : "entrega") : tipo;
  const setD = (id: string, k: "estado_fisico" | "accesorios" | "nota" | "destino", v: string) =>
    setDet((d) => ({
      ...d,
      [id]: { ...(d[id] ?? { estado_fisico: "Bueno", accesorios: "", nota: "" }), [k]: v },
    }));

  if (!me?.can("actas_entrega") && !me?.can("actas_devolucion"))
    return <p className="text-muted-foreground">No tiene permiso para crear actas.</p>;

  async function crear() {
    if (!empleadoId) return toast.error("Seleccione un empleado");
    if (!sel.length) return toast.error("Seleccione al menos un equipo");
    if (tipo === "cambio" && (!sel.some((i) => dirDe(i) === "entrega") || !sel.some((i) => dirDe(i) === "devolucion")))
      return toast.error("Un cambio necesita al menos un equipo que devuelve y uno que recibe");
    setLoading(true);
    try {
      const { data: acta, error } = await supabase
        .from("actas")
        .insert({ tipo, empleado_id: empleadoId, tecnico_id: me!.id, observaciones: obs || null })
        .select("id")
        .single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("acta_items").insert(
        sel.map((equipo_id) => {
          const d = det[equipo_id];
          const dir = dirDe(equipo_id);
          return {
            acta_id: acta.id,
            equipo_id,
            direccion: dir,
            estado_destino: dir === "devolucion" ? (d?.destino ?? "disponible") : "disponible",
            estado_fisico: d?.estado_fisico ?? "Bueno",
            accesorios: d?.accesorios.trim() || null,
            nota: d?.nota.trim() || null,
          };
        }),
      );
      if (e2) throw e2;
      try {
        await adjuntar({ data: { actaId: acta.id } });
      } catch {
        /* la firma del técnico es opcional */
      }
      toast.success("Acta creada. Proceda con la firma.");
      nav({ to: "/actas/$id", params: { id: acta.id } });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  const empSel = emps.data?.find((e) => e.id === empleadoId);
  const fs = "h-8 w-full rounded-lg border border-input bg-card/70 px-2.5 text-xs";

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Nueva acta digital"
        desc="Seleccione el tipo de movimiento, colaborador y equipos. El estado del inventario se actualiza automáticamente al firmar."
      />

      {miFirma.data && !miFirma.data.url && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-xs sm:text-sm">
          <span>No tiene una firma registrada; el acta se emitirá sin firma del técnico.</span>
          <Link to="/ajustes" search={{ tab: "firma" }} className="shrink-0 font-semibold text-primary hover:underline">
            Registrar mi firma →
          </Link>
        </div>
      )}

      {/* Interactive Operation Type Selector Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {me.can("actas_entrega") && (
          <button
            type="button"
            onClick={() => {
              setTipo("entrega");
              setSel([]);
            }}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
              tipo === "entrega"
                ? "border-primary bg-primary/8 shadow-xs ring-1 ring-primary/30"
                : "border-border/80 bg-card hover:border-border hover:bg-muted/30",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                tipo === "entrega"
                  ? "border-primary/30 bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <ArrowUpRight className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Acta de entrega</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Asignar equipos disponibles a un empleado</div>
            </div>
          </button>
        )}

        {me.can("actas_devolucion") && (
          <button
            type="button"
            onClick={() => {
              setTipo("devolucion");
              setSel([]);
            }}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
              tipo === "devolucion"
                ? "border-primary bg-primary/8 shadow-xs ring-1 ring-primary/30"
                : "border-border/80 bg-card hover:border-border hover:bg-muted/30",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                tipo === "devolucion"
                  ? "border-primary/30 bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <ArrowDownLeft className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Acta de devolución</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Recibir equipos a cargo de un empleado</div>
            </div>
          </button>
        )}

        {me.can("actas_entrega") && me.can("actas_devolucion") && (
          <button
            type="button"
            onClick={() => {
              setTipo("cambio");
              setSel([]);
            }}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
              tipo === "cambio"
                ? "border-primary bg-primary/8 shadow-xs ring-1 ring-primary/30"
                : "border-border/80 bg-card hover:border-border hover:bg-muted/30",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                tipo === "cambio"
                  ? "border-primary/30 bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Cambio de equipo</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Recibir y entregar en una sola firma</div>
            </div>
          </button>
        )}
      </div>

      {/* Step 1 & Step 2 Grid */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Step 1: Employee */}
        <section className="flex flex-col rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">
                1. Colaborador {tipo === "entrega" && "(activos)"}
              </Label>
            </div>
            {empSel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-medium text-primary">
                <CheckCircle2 className="h-3 w-3" />
                {empSel.nombre.split(" ")[0]}
              </span>
            )}
          </div>

          <div className="relative mb-2.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o cédula…"
              value={buscaEmp}
              onChange={(e) => setBuscaEmp(e.target.value)}
              className="pl-8 pr-8"
            />
            {buscaEmp && (
              <button
                type="button"
                onClick={() => setBuscaEmp("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/70 bg-background/40">
            {empleados.map((e) => {
              const selected = empleadoId === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmpleadoId(e.id);
                      setSel([]);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition-colors",
                      selected ? "bg-primary/12 text-foreground" : "hover:bg-muted/60",
                    )}
                  >
                    <div className="min-w-0">
                      <div className={cn("truncate font-medium", selected && "font-semibold text-primary")}>
                        {e.nombre}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        CC {e.identificacion} · {cat.nombre(e.area_id)}
                      </div>
                    </div>
                    {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
            {!empleados.length && (
              <li className="px-3 py-8 text-center text-xs text-muted-foreground">No se encontraron empleados.</li>
            )}
          </ul>
        </section>

        {/* Step 2: Equipment */}
        <section className="flex flex-col rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Laptop className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">
                2. Equipos{" "}
                {tipo === "entrega"
                  ? "disponibles"
                  : tipo === "cambio"
                    ? "(devuelve / recibe)"
                    : `a cargo de ${empSel?.nombre.split(" ")[0] ?? "…"}`}
              </Label>
            </div>
            {sel.length > 0 && (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">
                {sel.length} seleccionado(s)
              </span>
            )}
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar serie, modelo, activo fijo o nombre…"
              value={buscaEq}
              onChange={(e) => setBuscaEq(e.target.value)}
              className="pl-8 pr-8"
            />
            {buscaEq && (
              <button
                type="button"
                onClick={() => setBuscaEq("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="mb-2.5 grid grid-cols-3 gap-1.5">
            <select aria-label="Tipo" className={fs} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              <option value="">Tipo</option>
              {cat.byTipo("tipo_equipo", false).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select aria-label="Marca" className={fs} value={fMarca} onChange={(e) => setFMarca(e.target.value)}>
              <option value="">Marca</option>
              {cat.byTipo("marca", false).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select aria-label="Sede" className={fs} value={fSede} onChange={(e) => setFSede(e.target.value)}>
              <option value="">Sede</option>
              {cat.byTipo("sede", false).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/70 bg-background/40">
            {disponibles.map((e) => {
              const checked = sel.includes(e.id);
              return (
                <li key={e.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-sm transition-colors",
                      checked ? "bg-primary/10" : "hover:bg-muted/60",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => setSel(c ? [...sel, e.id] : sel.filter((x) => x !== e.id))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {cat.nombre(e.tipo_id)} {cat.nombre(e.marca_id)} {e.modelo}
                      </span>
                      {e.activo_fijo && (
                        <span className="block font-mono text-[11px] text-muted-foreground">AF: {e.activo_fijo}</span>
                      )}
                    </span>
                    {tipo === "cambio" && (
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          e.estado === "asignado"
                            ? "border-warning/30 bg-warning/15 text-warning-foreground"
                            : "border-success/30 bg-success/15 text-success",
                        )}
                      >
                        {e.estado === "asignado" ? "Devuelve" : "Recibe"}
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{e.serie}</span>
                  </label>
                </li>
              );
            })}
            {!disponibles.length && (
              <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                {tipo === "devolucion" && !empleadoId
                  ? "Seleccione primero un colaborador en el paso 1."
                  : "No hay equipos disponibles con esos filtros."}
              </li>
            )}
          </ul>
        </section>
      </div>

      {/* Step 3: Interactive Item Details */}
      {sel.length > 0 && (
        <section className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <Label className="text-sm font-semibold">
              3. Estado físico y detalles por equipo ({sel.length})
            </Label>
          </div>
          <div className="space-y-3">
            {sel.map((id) => {
              const e = eqPorId.get(id);
              const d = det[id] ?? { estado_fisico: "Bueno", accesorios: "", nota: "" };
              return (
                <div
                  key={id}
                  className="grid gap-3 rounded-xl border border-border/70 bg-background/40 p-3.5 md:grid-cols-[1.3fr_1.1fr_1fr_1fr]"
                >
                  <div className="text-sm">
                    <div className="font-semibold text-foreground">
                      {cat.nombre(e?.tipo_id)} {cat.nombre(e?.marca_id)} {e?.modelo}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{e?.serie}</div>
                    {tipo === "cambio" && (
                      <div className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                        {dirDe(id) === "devolucion" ? "Devuelve" : "Recibe"}
                      </div>
                    )}
                    {dirDe(id) === "devolucion" && (
                      <select
                        aria-label="Queda como"
                        className={fs + " mt-2"}
                        value={d.destino ?? "disponible"}
                        onChange={(ev) => setD(id, "destino", ev.target.value)}
                      >
                        {Object.entries(DESTINO_DEVOLUCION).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Interactive Condition Pills */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Estado físico</span>
                    <div className="flex flex-wrap gap-1">
                      {["Nuevo", "Bueno", "Regular", "Con daños"].map((x) => (
                        <button
                          key={x}
                          type="button"
                          onClick={() => setD(id, "estado_fisico", x)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                            d.estado_fisico === x
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Accesorios incluidos</span>
                    <Input
                      placeholder="Cargador, maletín, mouse…"
                      value={d.accesorios}
                      onChange={(ev) => setD(id, "accesorios", ev.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Nota particular</span>
                    <Input
                      placeholder="Opcional…"
                      value={d.nota}
                      onChange={(ev) => setD(id, "nota", ev.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 4: Observations & Submit */}
      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">4. Observaciones generales del acta</Label>
          <Textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Novedades o acuerdos adicionales…"
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
          <span className="text-xs text-muted-foreground">
            {empSel ? `Colaborador: ${empSel.nombre}` : "Seleccione un colaborador"} · {sel.length} equipo(s)
          </span>
          <Button onClick={crear} disabled={loading || !empleadoId || !sel.length}>
            {loading
              ? "Generando acta…"
              : `Crear acta y pasar a firma (${sel.length} equipo${sel.length === 1 ? "" : "s"})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
