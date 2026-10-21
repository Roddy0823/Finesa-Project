export const ETIQUETAS_PROVEEDOR = ["Venta de Hardware", "Periféricos y Accesorios", "Servicio Técnico / Reparaciones", "Licenciamiento"] as const;
export const ETIQUETA_SERVICIO = "Servicio Técnico / Reparaciones";
export const FORMAS_PAGO = ["Contado", "Crédito 30 días", "Crédito 60 días", "Otro"] as const;

export type Prov = {
  id: string; nombre: string; nit: string | null; ciudad: string | null; direccion: string | null; sitio_web: string | null;
  contacto_nombre: string | null; asesor_telefono: string | null; telefono: string | null; whatsapp: string | null; email: string | null;
  etiquetas: string[]; dias_entrega: number | null; forma_pago: string | null; activo: boolean; notas: string | null;
};

export const cop = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toLocaleString("es-CO")}`);
export const telefonoPrincipal = (p: Pick<Prov, "whatsapp" | "telefono" | "asesor_telefono">) => p.asesor_telefono || p.telefono || p.whatsapp || "";

export const ESTADOS_PEDIDO: Record<string, string> = {
  borrador: "Borrador", pedido: "Pedido realizado", parcial: "Recibido parcial", recibido: "Recibido completo", cancelado: "Cancelado",
};
export const pedidoAtrasado = (p: { estado: string; fecha_esperada: string | null }) =>
  (p.estado === "pedido" || p.estado === "parcial") && !!p.fecha_esperada && p.fecha_esperada < new Date().toISOString().slice(0, 10);
export const sumarDias = (dias: number | null | undefined) => {
  const d = new Date(); d.setDate(d.getDate() + (dias ?? 0)); return d.toISOString().slice(0, 10);
};
