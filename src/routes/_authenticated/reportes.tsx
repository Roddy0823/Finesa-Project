import { fetchAll } from "@/lib/fetchAll";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { ESTADO_EQUIPO, TIPO_ACTA, descargarCSV, fmtFecha } from "@/lib/constantes";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { ESTADOS_PEDIDO, pedidoAtrasado } from "@/lib/proveedores";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Laptop,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes — Finesa" },
      { name: "description", content: "Exportación de inventario y actas en Excel y PDF." },
    ],
  }),
  component: Reportes,
});

type Emp = { nombre: string; identificacion: string } | null;

type VistaPrevia = {
  titulo: string;
  subtitulo: string;
  resumen: string[];
  columnas: string[];
  filas: (string | number)[][];
  onCsv: () => void;
  onPdf: () => void;
};

const sel =
  "h-9 w-full rounded-lg border border-input bg-background/80 px-3 text-xs font-medium transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function restarDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function Reportes() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const hoy = new Date().toISOString().slice(0, 10);
  const inicioMes = hoy.slice(0, 8) + "01";
  const inicioAnio = hoy.slice(0, 4) + "-01-01";

  // 1. Inventario
  const [estado, setEstado] = useState("");
  const [sede, setSede] = useState("");
  const [tipoEq, setTipoEq] = useState("");

  // 2. Actas en periodo
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoy);
  const [aTipo, setATipo] = useState("");

  // 3. Actas por empleado
  const [busca, setBusca] = useState("");
  const [empSel, setEmpSel] = useState<{ id: string; nombre: string; identificacion: string } | null>(null);
  const [eDesde, setEDesde] = useState("");
  const [eHasta, setEHasta] = useState("");
  const [eTipo, setETipo] = useState("");

  // 4. Pedidos de reabastecimiento
  const [pDesde, setPDesde] = useState(inicioMes);
  const [pHasta, setPHasta] = useState(hoy);
  const [pEstado, setPEstado] = useState("");
  const [pProv, setPProv] = useState("");

  const [cargando, setCargando] = useState<string | null>(null);
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);

  const provs = useQuery({
    queryKey: ["proveedores_lista"],
    queryFn: async () => (await supabase.from("proveedores").select("id, nombre").order("nombre")).data ?? [],
  });

  const emps = useQuery({
    queryKey: ["reporte_emp_busca", busca],
    enabled: busca.trim().length >= 2 && !empSel,
    queryFn: async () => {
      const t = busca.trim().replace(/[,%()]/g, "");
      return (
        (
          await supabase
            .from("empleados")
            .select("id, nombre, identificacion")
            .or(`nombre.ilike.%${t}%,identificacion.ilike.%${t}%`)
            .order("nombre")
            .limit(15)
        ).data ?? []
      );
    },
  });

  // Contadores rápidos en vivo para mostrar cuántos registros coinciden
  const conteoInv = useQuery({
    queryKey: ["reporte_count_inv", estado, sede, tipoEq],
    enabled: !!me?.can("reportes_exportar"),
    queryFn: async () => {
      let q = supabase.from("equipos").select("id", { count: "exact", head: true });
      if (estado) q = q.eq("estado", estado as "disponible");
      if (sede) q = q.eq("sede_id", sede);
      if (tipoEq) q = q.eq("tipo_id", tipoEq);
      return (await q).count ?? 0;
    },
  });

  const conteoActas = useQuery({
    queryKey: ["reporte_count_actas", desde, hasta, aTipo],
    enabled: !!me?.can("reportes_exportar") && !!desde && !!hasta,
    queryFn: async () => {
      let q = supabase
        .from("actas")
        .select("id", { count: "exact", head: true })
        .eq("estado", "firmada")
        .gte("firmado_at", desde)
        .lte("firmado_at", hasta + "T23:59:59");
      if (aTipo) q = q.eq("tipo", aTipo as "entrega");
      return (await q).count ?? 0;
    },
  });

  const conteoPedidos = useQuery({
    queryKey: ["reporte_count_pedidos", pDesde, pHasta, pEstado, pProv],
    enabled: !!me?.can("reportes_exportar") && !!pDesde && !!pHasta,
    queryFn: async () => {
      let q = supabase
        .from("pedidos_compra")
        .select("id", { count: "exact", head: true })
        .gte("created_at", pDesde)
        .lte("created_at", pHasta + "T23:59:59");
      if (pEstado === "atrasado") q = q.in("estado", ["pedido", "parcial"]).lt("fecha_esperada", hoy);
      else if (pEstado) q = q.eq("estado", pEstado);
      if (pProv) q = q.eq("proveedor_id", pProv);
      return (await q).count ?? 0;
    },
  });

  if (!me?.can("reportes_exportar"))
    return <p className="text-muted-foreground">No tiene permiso para exportar reportes.</p>;

  async function datosInventario() {
    return fetchAll((a, b) => {
      let q = supabase
        .from("equipos")
        .select("*, empleado:empleados(nombre, identificacion)")
        .order("serie")
        .order("id");
      if (estado) q = q.eq("estado", estado as "disponible");
      if (sede) q = q.eq("sede_id", sede);
      if (tipoEq) q = q.eq("tipo_id", tipoEq);
      return q.range(a, b);
    });
  }

  async function inventario(formato: "csv" | "pdf" | "preview") {
    setCargando(`inv_${formato}`);
    try {
      const data = await datosInventario();
      if (!data?.length) return toast.info("No hay datos para exportar con esos filtros");
      const cuenta: Record<string, number> = {};
      data.forEach((e) => {
        const l = ESTADO_EQUIPO[e.estado]?.label ?? e.estado;
        cuenta[l] = (cuenta[l] ?? 0) + 1;
      });
      const subtitulo = `Estado: ${estado ? ESTADO_EQUIPO[estado as "disponible"]?.label : "Todos"} · Sede: ${
        sede ? cat.nombre(sede) : "Todas"
      }${tipoEq ? ` · Tipo: ${cat.nombre(tipoEq)}` : ""}`;
      const resumen = [`Total equipos: ${data.length}`, ...Object.entries(cuenta).map(([k, v]) => `${k}: ${v}`)];
      const columnas = ["Serie", "Activo fijo", "Tipo", "Marca", "Modelo", "Sede", "Estado", "Responsable", "Cédula"];
      const filasTabla = data.map((e) => {
        const emp = e.empleado as Emp;
        return [
          e.serie,
          e.activo_fijo ?? "",
          cat.nombre(e.tipo_id),
          cat.nombre(e.marca_id),
          e.modelo ?? "",
          cat.nombre(e.sede_id),
          ESTADO_EQUIPO[e.estado]?.label ?? "",
          emp?.nombre ?? "",
          emp?.identificacion ?? "",
        ];
      });

      if (formato === "preview") {
        setPrevia({
          titulo: "Reporte de Inventario Actual",
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          onCsv: () => void inventario("csv"),
          onPdf: () => void inventario("pdf"),
        });
        return;
      }

      if (formato === "csv") {
        descargarCSV(
          `inventario_${hoy}.csv`,
          data.map((e) => {
            const emp = e.empleado as Emp;
            return {
              serie: e.serie,
              activo_fijo: e.activo_fijo ?? "",
              tipo: cat.nombre(e.tipo_id),
              marca: cat.nombre(e.marca_id),
              modelo: e.modelo ?? "",
              sede: cat.nombre(e.sede_id),
              estado: ESTADO_EQUIPO[e.estado]?.label,
              asignado_a: emp?.nombre ?? "",
              identificacion: emp?.identificacion ?? "",
              fecha_ingreso: e.fecha_ingreso,
              anio_compra: e.anio_compra ?? "",
              garantia_fin: e.garantia_fin ?? "",
              proveedor: e.proveedor ?? "",
              nombre_equipo: e.nombre_equipo ?? "",
              novedad: e.novedad ?? "",
            };
          }),
        );
      } else {
        (await import("@/lib/reportePdf")).reportePdf({
          titulo: "REPORTE DE INVENTARIO ACTUAL",
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          archivo: `inventario_${hoy}.pdf`,
        });
      }
      await supabase.rpc("log_evento", {
        p_accion: "EXPORTAR",
        p_detalle: `Reporte de inventario (${formato.toUpperCase()})`,
      });
      toast.success(`Reporte de inventario descargado (${formato.toUpperCase()})`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  async function actas(formato: "csv" | "pdf" | "preview") {
    setCargando(`actas_${formato}`);
    try {
      const data = await fetchAll((a, b) => {
        let q = supabase
          .from("actas")
          .select(
            "*, empleado:empleados(nombre, identificacion), items:acta_items(estado_fisico, equipo:equipos(serie, activo_fijo, modelo, tipo_id, marca_id))",
          )
          .eq("estado", "firmada")
          .gte("firmado_at", desde)
          .lte("firmado_at", hasta + "T23:59:59");
        if (aTipo) q = q.eq("tipo", aTipo as "entrega");
        return q.order("firmado_at").order("id").range(a, b);
      });
      if (!data?.length) return toast.info("No hay actas firmadas en el periodo seleccionado");
      type It = {
        estado_fisico: string | null;
        equipo: {
          serie: string;
          activo_fijo: string | null;
          modelo: string | null;
          tipo_id: string;
          marca_id: string | null;
        } | null;
      };
      const filas = data.flatMap((a) => {
        const emp = a.empleado as Emp;
        const items = ((a.items ?? []) as unknown as It[]).filter((i) => i.equipo);
        return items.map((i) => ({ a, emp, e: i.equipo!, estado: i.estado_fisico ?? "" }));
      });
      const ent = data.filter((a) => a.tipo === "entrega").length;
      const eqEnt = filas.filter((f) => f.a.tipo === "entrega").length;
      const subtitulo = `Periodo: ${fmtFecha(desde)} a ${fmtFecha(hasta)}${aTipo ? ` · Tipo: ${TIPO_ACTA[aTipo]}` : ""}`;
      const resumen = [
        `Actas: ${data.length} (${ent} entregas, ${data.length - ent} devoluciones/cambios)`,
        `Equipos entregados: ${eqEnt}`,
        `Equipos devueltos: ${filas.length - eqEnt}`,
      ];
      const columnas = [
        "Acta",
        "Tipo",
        "Fecha de firma",
        "Empleado",
        "Cédula",
        "Técnico",
        "Tipo equipo",
        "Marca",
        "Modelo",
        "Serie",
        "Activo fijo",
      ];
      const filasTabla = filas.map(({ a, emp, e }) => [
        `#${a.numero}`,
        TIPO_ACTA[a.tipo] ?? a.tipo,
        fmtFecha(a.firmado_at, true),
        emp?.nombre ?? "",
        emp?.identificacion ?? "",
        a.tecnico_nombre ?? "",
        cat.nombre(e.tipo_id),
        cat.nombre(e.marca_id),
        e.modelo ?? "",
        e.serie,
        e.activo_fijo ?? "",
      ]);

      if (formato === "preview") {
        setPrevia({
          titulo: "Reporte de Actas Firmadas — Detalle de Equipos",
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          onCsv: () => void actas("csv"),
          onPdf: () => void actas("pdf"),
        });
        return;
      }

      if (formato === "csv") {
        descargarCSV(
          `actas_firmadas_${desde}_${hasta}.csv`,
          filas.map(({ a, emp, e, estado }) => ({
            numero_acta: a.numero,
            tipo: TIPO_ACTA[a.tipo],
            fecha_firma: fmtFecha(a.firmado_at, true),
            empleado: emp?.nombre ?? "",
            identificacion: emp?.identificacion ?? "",
            tecnico: a.tecnico_nombre ?? "",
            tipo_equipo: cat.nombre(e.tipo_id),
            marca: cat.nombre(e.marca_id),
            modelo: e.modelo ?? "",
            serie: e.serie,
            activo_fijo: e.activo_fijo ?? "",
            estado_fisico: estado,
            medio_firma: a.firma_medio ?? "",
          })),
        );
      } else {
        (await import("@/lib/reportePdf")).reportePdf({
          titulo: "REPORTE DE ACTAS FIRMADAS — DETALLE DE EQUIPOS",
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          archivo: `actas_firmadas_${desde}_${hasta}.pdf`,
        });
      }
      await supabase.rpc("log_evento", {
        p_accion: "EXPORTAR",
        p_detalle: `Actas firmadas con detalle de equipos ${desde} a ${hasta} (${formato.toUpperCase()})`,
      });
      toast.success(`Reporte de actas descargado (${formato.toUpperCase()})`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  async function proveedores(formato: "csv" | "pdf" | "preview") {
    setCargando(`prov_${formato}`);
    try {
      const { data, error } = await supabase.rpc("resumen_proveedores");
      if (error) throw error;
      if (!data?.length) return toast.info("No hay proveedores registrados");
      const filas = data.map((r) => ({
        proveedor: r.nombre,
        equipos: Number(r.equipos),
        en_garantia: Number(r.en_garantia),
        valor: Number(r.valor),
        reparaciones: Number(r.reparaciones),
        en_reparacion: Number(r.en_reparacion),
        dias_promedio_reparacion: r.dias_promedio ?? "",
      }));
      const subtitulo = `Generado el ${fmtFecha(hoy)}`;
      const resumen = [
        `Proveedores: ${filas.length}`,
        `Equipos suministrados: ${filas.reduce((a, f) => a + f.equipos, 0)}`,
        `En garantía: ${filas.reduce((a, f) => a + f.en_garantia, 0)}`,
        `Valor total: $${filas.reduce((a, f) => a + f.valor, 0).toLocaleString("es-CO")}`,
      ];
      const columnas = [
        "Proveedor",
        "Equipos",
        "En garantía",
        "Valor",
        "Reparados",
        "En reparación",
        "Días prom. reparación",
      ];
      const filasTabla = filas.map((f) => [
        f.proveedor,
        String(f.equipos),
        String(f.en_garantia),
        `$${f.valor.toLocaleString("es-CO")}`,
        String(f.reparaciones),
        String(f.en_reparacion),
        String(f.dias_promedio_reparacion || "—"),
      ]);

      if (formato === "preview") {
        setPrevia({
          titulo: "Resumen Ejecutivo por Proveedor",
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          onCsv: () => void proveedores("csv"),
          onPdf: () => void proveedores("pdf"),
        });
        return;
      }

      if (formato === "csv") descargarCSV(`proveedores_${hoy}.csv`, filas);
      else
        (await import("@/lib/reportePdf")).reportePdf({
          titulo: "RESUMEN POR PROVEEDOR",
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          archivo: `proveedores_${hoy}.pdf`,
        });
      await supabase.rpc("log_evento", {
        p_accion: "EXPORTAR",
        p_detalle: `Resumen por proveedor (${formato.toUpperCase()})`,
      });
      toast.success(`Reporte de proveedores descargado (${formato.toUpperCase()})`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  async function pedidos(formato: "csv" | "pdf" | "preview") {
    setCargando(`ped_${formato}`);
    try {
      type L = { tipo_id: string; cantidad: number; recibida: number; precio_estimado: number | null };
      type P = {
        numero: number;
        estado: string;
        fecha_pedido: string | null;
        fecha_esperada: string | null;
        created_at: string;
        cerrado_at: string | null;
        creado_nombre: string | null;
        proveedor: { nombre: string } | null;
        lineas: L[];
      };
      const data = (await fetchAll((a, b) => {
        let q = supabase
          .from("pedidos_compra")
          .select(
            "numero, estado, fecha_pedido, fecha_esperada, created_at, cerrado_at, creado_nombre, proveedor:proveedores(nombre), lineas:pedido_lineas(tipo_id, cantidad, recibida, precio_estimado)",
          )
          .gte("created_at", pDesde)
          .lte("created_at", pHasta + "T23:59:59");
        if (pEstado === "atrasado") q = q.in("estado", ["pedido", "parcial"]).lt("fecha_esperada", hoy);
        else if (pEstado) q = q.eq("estado", pEstado);
        if (pProv) q = q.eq("proveedor_id", pProv);
        return q.order("numero").range(a, b);
      })) as unknown as P[];
      if (!data?.length) return toast.info("No hay pedidos en el periodo seleccionado");
      const est = (p: P) => (pedidoAtrasado(p) ? "Atrasado" : (ESTADOS_PEDIDO[p.estado] ?? p.estado));
      const filas = data.flatMap((p) =>
        p.lineas.map((l) => ({ p, l, valor: l.cantidad * (Number(l.precio_estimado) || 0) })),
      );
      const total = filas.reduce((x, f) => x + f.valor, 0);
      const subtitulo = `Periodo: ${fmtFecha(pDesde)} a ${fmtFecha(pHasta)}`;
      const resumen = [
        `Pedidos: ${data.length}`,
        `Unidades pedidas: ${filas.reduce((x, f) => x + f.l.cantidad, 0)}`,
        `Unidades recibidas: ${filas.reduce((x, f) => x + f.l.recibida, 0)}`,
        `Valor estimado: $${Math.round(total).toLocaleString("es-CO")}`,
      ];
      const columnas = [
        "Pedido",
        "Proveedor",
        "Estado",
        "Creado",
        "Solicitó",
        "Entrega",
        "Artículo",
        "Pedida",
        "Recibida",
        "Precio",
        "Valor",
      ];
      const filasTabla = filas.map(({ p, l, valor }) => [
        `#${p.numero}`,
        p.proveedor?.nombre ?? "",
        est(p),
        fmtFecha(p.created_at),
        p.creado_nombre ?? "",
        p.fecha_esperada ? fmtFecha(p.fecha_esperada) : "—",
        cat.nombre(l.tipo_id),
        String(l.cantidad),
        String(l.recibida),
        l.precio_estimado != null ? `$${Number(l.precio_estimado).toLocaleString("es-CO")}` : "—",
        `$${Math.round(valor).toLocaleString("es-CO")}`,
      ]);

      if (formato === "preview") {
        setPrevia({
          titulo: "Reporte de Pedidos de Reabastecimiento",
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          onCsv: () => void pedidos("csv"),
          onPdf: () => void pedidos("pdf"),
        });
        return;
      }

      if (formato === "csv") {
        descargarCSV(
          `reabastecimiento_${pDesde}_${pHasta}.csv`,
          filas.map(({ p, l, valor }) => ({
            pedido: p.numero,
            proveedor: p.proveedor?.nombre ?? "",
            estado: est(p),
            creado: fmtFecha(p.created_at),
            solicitado_por: p.creado_nombre ?? "",
            fecha_pedido: p.fecha_pedido ?? "",
            entrega_esperada: p.fecha_esperada ?? "",
            cerrado: p.cerrado_at ? fmtFecha(p.cerrado_at) : "",
            articulo: cat.nombre(l.tipo_id),
            cantidad: l.cantidad,
            recibida: l.recibida,
            precio_estimado: l.precio_estimado ?? "",
            valor: valor,
          })),
        );
      } else {
        (await import("@/lib/reportePdf")).reportePdf({
          titulo: "REPORTE DE REABASTECIMIENTO",
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          archivo: `reabastecimiento_${pDesde}_${pHasta}.pdf`,
        });
      }
      await supabase.rpc("log_evento", {
        p_accion: "EXPORTAR",
        p_detalle: `Reporte de reabastecimiento ${pDesde} a ${pHasta} (${formato.toUpperCase()})`,
      });
      toast.success(`Reporte de reabastecimiento descargado (${formato.toUpperCase()})`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  async function actasEmpleado(formato: "csv" | "pdf" | "preview") {
    if (!empSel) return toast.info("Seleccione un empleado primero");
    setCargando(`emp_${formato}`);
    try {
      const empId = empSel.id;
      const emp = (
        await supabase.from("empleados").select("nombre, identificacion, cargo").eq("id", empId).single()
      ).data;
      const data = await fetchAll((a, b) => {
        let q = supabase
          .from("actas")
          .select("*, items:acta_items(estado_fisico, equipo:equipos(serie, activo_fijo, modelo, tipo_id, marca_id))")
          .eq("empleado_id", empId)
          .eq("estado", "firmada");
        if (eDesde) q = q.gte("firmado_at", eDesde);
        if (eHasta) q = q.lte("firmado_at", eHasta + "T23:59:59");
        if (eTipo) q = q.eq("tipo", eTipo as "entrega");
        return q.order("firmado_at").order("id").range(a, b);
      });
      if (!data?.length) return toast.info("El empleado no tiene actas firmadas con esos filtros");
      const enPoder =
        (
          await supabase
            .from("equipos")
            .select("id", { count: "exact", head: true })
            .eq("empleado_id", empId)
            .in("estado", ["asignado", "en_reparacion"])
        ).count ?? 0;
      type It = {
        estado_fisico: string | null;
        equipo: {
          serie: string;
          activo_fijo: string | null;
          modelo: string | null;
          tipo_id: string;
          marca_id: string | null;
        } | null;
      };
      const filas = data.flatMap((a) =>
        ((a.items ?? []) as unknown as It[])
          .filter((i) => i.equipo)
          .map((i) => ({ a, e: i.equipo!, estado: i.estado_fisico ?? "" })),
      );
      const ent = filas.filter((f) => f.a.tipo === "entrega").length;
      const base = `actas_${emp?.identificacion ?? "empleado"}`;
      const subtitulo = `${emp?.nombre ?? ""} · C.C. ${emp?.identificacion ?? ""}${
        emp?.cargo ? ` · ${emp.cargo}` : ""
      }${
        eDesde || eHasta
          ? `  ·  Periodo: ${eDesde ? fmtFecha(eDesde) : "inicio"} a ${eHasta ? fmtFecha(eHasta) : "hoy"}`
          : ""
      }`;
      const resumen = [
        `Actas: ${data.length}`,
        `Equipos entregados: ${ent}`,
        `Equipos devueltos: ${filas.length - ent}`,
        `Equipos en su poder hoy: ${enPoder}`,
      ];
      const columnas = [
        "Acta",
        "Tipo",
        "Fecha de firma",
        "Técnico",
        "Tipo equipo",
        "Marca",
        "Modelo",
        "Serie",
        "Activo fijo",
        "Estado físico",
      ];
      const filasTabla = filas.map(({ a, e, estado }) => [
        `#${a.numero}`,
        TIPO_ACTA[a.tipo] ?? a.tipo,
        fmtFecha(a.firmado_at, true),
        a.tecnico_nombre ?? "",
        cat.nombre(e.tipo_id),
        cat.nombre(e.marca_id),
        e.modelo ?? "",
        e.serie,
        e.activo_fijo ?? "",
        estado,
      ]);

      if (formato === "preview") {
        setPrevia({
          titulo: `Actas por Empleado — ${emp?.nombre ?? ""}`,
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          onCsv: () => void actasEmpleado("csv"),
          onPdf: () => void actasEmpleado("pdf"),
        });
        return;
      }

      if (formato === "csv") {
        descargarCSV(
          `${base}.csv`,
          filas.map(({ a, e, estado }) => ({
            numero_acta: a.numero,
            tipo: TIPO_ACTA[a.tipo],
            fecha_firma: fmtFecha(a.firmado_at, true),
            empleado: emp?.nombre ?? "",
            identificacion: emp?.identificacion ?? "",
            tecnico: a.tecnico_nombre ?? "",
            tipo_equipo: cat.nombre(e.tipo_id),
            marca: cat.nombre(e.marca_id),
            modelo: e.modelo ?? "",
            serie: e.serie,
            activo_fijo: e.activo_fijo ?? "",
            estado_fisico: estado,
          })),
        );
      } else {
        (await import("@/lib/reportePdf")).reportePdf({
          titulo: "REPORTE DE ACTAS POR EMPLEADO",
          subtitulo,
          resumen,
          columnas,
          filas: filasTabla,
          archivo: `${base}.pdf`,
        });
      }
      await supabase.rpc("log_evento", {
        p_accion: "EXPORTAR",
        p_detalle: `Actas del empleado ${emp?.identificacion ?? empId} (${formato.toUpperCase()})`,
      });
      toast.success(`Reporte del empleado descargado (${formato.toUpperCase()})`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centro de Reportes y Exportación"
        desc="Genera informes auditables en Excel (CSV) y PDF oficial con vista previa interactiva en tiempo real."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. INVENTARIO ACTUAL */}
        <section className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Laptop className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Inventario actual de equipos</h2>
                    <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Parque TI
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Listado detallado con seriales, activos fijos, responsable actual, sede y garantía.
                  </p>
                </div>
              </div>
              {conteoInv.data !== undefined && (
                <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">
                  {conteoInv.data.toLocaleString("es-CO")} eq.
                </span>
              )}
            </div>

            {/* Píldoras interactivas de estado */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Estado operativo</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setEstado("")}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                    !estado
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Todos
                </button>
                {Object.entries(ESTADO_EQUIPO).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEstado(estado === k ? "" : k)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                      estado === k
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Sede</Label>
                <select className={sel} value={sede} onChange={(e) => setSede(e.target.value)}>
                  <option value="">Todas las sedes</option>
                  {cat.byTipo("sede", false).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de equipo</Label>
                <select className={sel} value={tipoEq} onChange={(e) => setTipoEq(e.target.value)}>
                  <option value="">Todos los tipos</option>
                  {cat.byTipo("tipo_equipo", false).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <AccionesReporte
            cargando={cargando}
            prefijo="inv"
            onPreview={() => inventario("preview")}
            onCsv={() => inventario("csv")}
            onPdf={() => inventario("pdf")}
            onReset={
              estado || sede || tipoEq
                ? () => {
                    setEstado("");
                    setSede("");
                    setTipoEq("");
                  }
                : undefined
            }
          />
        </section>

        {/* 2. ACTAS FIRMADAS EN UN PERIODO */}
        <section className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-success/25 bg-success/10 text-success">
                  <FileCheck2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Actas firmadas por periodo</h2>
                    <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Trazabilidad
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Detalle equipo por equipo de todas las entregas, devoluciones y cambios firmados.
                  </p>
                </div>
              </div>
              {conteoActas.data !== undefined && (
                <span className="shrink-0 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-success">
                  {conteoActas.data} acta(s)
                </span>
              )}
            </div>

            <PresetsFecha
              onSelect={(d, h) => {
                setDesde(d);
                setHasta(h);
              }}
              inicioMes={inicioMes}
              inicioAnio={inicioAnio}
              hoy={hoy}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <Input type="date" className="h-9 text-xs" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input type="date" className="h-9 text-xs" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de acta</Label>
                <select className={sel} value={aTipo} onChange={(e) => setATipo(e.target.value)}>
                  <option value="">Todas</option>
                  {Object.entries(TIPO_ACTA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <AccionesReporte
            cargando={cargando}
            prefijo="actas"
            onPreview={() => actas("preview")}
            onCsv={() => actas("csv")}
            onPdf={() => actas("pdf")}
          />
        </section>

        {/* 3. ACTAS POR EMPLEADO */}
        <section className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Historial de actas por empleado</h2>
                    <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Hoja de vida TI
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Consulta todas las actas firmadas por un colaborador y cuántos equipos tiene en su poder hoy.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Colaborador (nombre o cédula)</Label>
              {empSel ? (
                <div className="flex items-center justify-between rounded-xl border border-primary/35 bg-primary/5 px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <div>
                      <span className="font-semibold text-foreground">{empSel.nombre}</span>
                      <span className="ml-2 font-mono text-muted-foreground">C.C. {empSel.identificacion}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmpSel(null);
                      setBusca("");
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8 text-xs"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Escriba al menos 2 caracteres para buscar…"
                  />
                  {busca.trim().length >= 2 && (
                    <div className="absolute z-20 mt-1 max-h-44 w-full divide-y divide-border/60 overflow-y-auto rounded-xl border border-border bg-popover shadow-xl">
                      {(emps.data ?? []).map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs transition-colors hover:bg-muted"
                          onClick={() => {
                            setEmpSel(e);
                            setBusca(`${e.nombre} · ${e.identificacion}`);
                          }}
                        >
                          <span className="font-medium text-foreground">{e.nombre}</span>
                          <span className="font-mono text-muted-foreground">{e.identificacion}</span>
                        </button>
                      ))}
                      {emps.data && !emps.data.length && (
                        <p className="px-3.5 py-2.5 text-xs text-muted-foreground">Sin coincidencias</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Desde (opcional)</Label>
                <Input type="date" className="h-9 text-xs" value={eDesde} onChange={(e) => setEDesde(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta (opcional)</Label>
                <Input type="date" className="h-9 text-xs" value={eHasta} onChange={(e) => setEHasta(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <select className={sel} value={eTipo} onChange={(e) => setETipo(e.target.value)}>
                  <option value="">Todas</option>
                  {Object.entries(TIPO_ACTA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <AccionesReporte
            cargando={cargando}
            prefijo="emp"
            deshabilitado={!empSel}
            onPreview={() => actasEmpleado("preview")}
            onCsv={() => actasEmpleado("csv")}
            onPdf={() => actasEmpleado("pdf")}
          />
        </section>

        {/* 4. PEDIDOS DE REABASTECIMIENTO */}
        <section className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 text-warning">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Pedidos de reabastecimiento</h2>
                    <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Compras
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Órdenes de compra, cumplimiento de entregas, unidades pedidas vs. recibidas y montos.
                  </p>
                </div>
              </div>
              {conteoPedidos.data !== undefined && (
                <span className="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-warning">
                  {conteoPedidos.data} orden(es)
                </span>
              )}
            </div>

            <PresetsFecha
              onSelect={(d, h) => {
                setPDesde(d);
                setPHasta(h);
              }}
              inicioMes={inicioMes}
              inicioAnio={inicioAnio}
              hoy={hoy}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <Input type="date" className="h-9 text-xs" value={pDesde} onChange={(e) => setPDesde(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input type="date" className="h-9 text-xs" value={pHasta} onChange={(e) => setPHasta(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estado del pedido</Label>
                <select className={sel} value={pEstado} onChange={(e) => setPEstado(e.target.value)}>
                  <option value="">Todos los estados</option>
                  {Object.entries(ESTADOS_PEDIDO).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                  <option value="atrasado">Atrasados</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Proveedor</Label>
                <select className={sel} value={pProv} onChange={(e) => setPProv(e.target.value)}>
                  <option value="">Todos los proveedores</option>
                  {(provs.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <AccionesReporte
            cargando={cargando}
            prefijo="ped"
            onPreview={() => pedidos("preview")}
            onCsv={() => pedidos("csv")}
            onPdf={() => pedidos("pdf")}
          />
        </section>

        {/* 5. RESUMEN EJECUTIVO POR PROVEEDOR */}
        <section className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-2xs lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground"> Consolidado ejecutivo por proveedor</h2>
                  <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Aliados comerciales
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Total de equipos suministrados, unidades en garantía vigente, valoración en pesos (COP), historial de
                  reparaciones y tiempos promedio de respuesta.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-9 text-xs"
                disabled={!!cargando}
                onClick={() => proveedores("preview")}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                {cargando === "prov_preview" ? "Cargando…" : "Vista previa"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-xs"
                disabled={!!cargando}
                onClick={() => proveedores("csv")}
              >
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-success" />
                {cargando === "prov_csv" ? "Exportando…" : "Exportar Excel (CSV)"}
              </Button>
              <Button
                size="sm"
                className="h-9 text-xs"
                disabled={!!cargando}
                onClick={() => proveedores("pdf")}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                {cargando === "prov_pdf" ? "Generando…" : "Descargar PDF"}
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Drawer de Vista Previa Interactiva */}
      <Sheet open={!!previa} onOpenChange={(o) => !o && setPrevia(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
          {previa && (
            <>
              <SheetHeader className="border-b border-border/60 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <SheetTitle className="text-base font-semibold">{previa.titulo}</SheetTitle>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{previa.subtitulo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={previa.onCsv}>
                      <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-success" />
                      Descargar Excel (CSV)
                    </Button>
                    <Button size="sm" className="h-8 text-xs" onClick={previa.onPdf}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Descargar PDF
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {previa.resumen.map((r, i) => (
                    <span
                      key={i}
                      className="rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1 font-mono text-xs font-medium text-foreground"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </SheetHeader>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Mostrando {Math.min(100, previa.filas.length)} de {previa.filas.length} fila(s)
                  </span>
                  <span>El archivo descargado incluye el 100% de los registros</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border/80 bg-card">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border/70 bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        {previa.columnas.map((c) => (
                          <th key={c} className="whitespace-nowrap px-3 py-2">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {previa.filas.slice(0, 100).map((f, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {f.map((celda, j) => (
                            <td key={j} className="whitespace-nowrap px-3 py-2 text-foreground">
                              {celda || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PresetsFecha({
  onSelect,
  inicioMes,
  inicioAnio,
  hoy,
}: {
  onSelect: (desde: string, hasta: string) => void;
  inicioMes: string;
  inicioAnio: string;
  hoy: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Calendar className="h-3 w-3" />
        Rango rápido:
      </span>
      {[
        { label: "Este mes", d: inicioMes, h: hoy },
        { label: "Últimos 30d", d: restarDias(30), h: hoy },
        { label: "Últimos 90d", d: restarDias(90), h: hoy },
        { label: "Este año", d: inicioAnio, h: hoy },
      ].map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onSelect(p.d, p.h)}
          className="rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function AccionesReporte({
  cargando,
  prefijo,
  deshabilitado,
  onPreview,
  onCsv,
  onPdf,
  onReset,
}: {
  cargando: string | null;
  prefijo: string;
  deshabilitado?: boolean | undefined;
  onPreview: () => void;
  onCsv: () => void;
  onPdf: () => void;
  onReset?: (() => void) | undefined;
}) {
  const busy = !!cargando;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3.5">
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          disabled={busy || deshabilitado}
          onClick={onPreview}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          {cargando === `${prefijo}_preview` ? "Cargando…" : "Vista previa"}
        </Button>
        {onReset && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={onReset}>
            <RotateCcw className="mr-1 h-3 w-3" />
            Restablecer
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={busy || deshabilitado}
          onClick={onCsv}
        >
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-success" />
          {cargando === `${prefijo}_csv` ? "Exportando…" : "Excel (CSV)"}
        </Button>
        <Button size="sm" className="h-8 text-xs" disabled={busy || deshabilitado} onClick={onPdf}>
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          {cargando === `${prefijo}_pdf` ? "Generando…" : "PDF"}
        </Button>
      </div>
    </div>
  );
}
