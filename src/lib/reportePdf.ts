import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const NAVY: [number, number, number] = [11, 37, 69];
const AZUL: [number, number, number] = [19, 64, 116];

/** Genera un reporte PDF horizontal con encabezado Finesa, resumen y tabla. */
export function reportePdf(opts: { titulo: string; subtitulo: string; resumen: string[]; columnas: string[]; filas: (string | number | null | undefined)[][]; archivo: string }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const generado = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
  doc.setFillColor(...NAVY); doc.rect(0, 0, w, 60, "F");
  doc.setTextColor(238, 244, 237); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("FINESA", 40, 30);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(141, 169, 196); doc.text(opts.titulo, 40, 48);
  doc.setTextColor(...NAVY); doc.setFontSize(10);
  doc.text(opts.subtitulo, 40, 82);
  doc.setFontSize(9); doc.setTextColor(90, 100, 120);
  doc.text(opts.resumen.join("   ·   "), 40, 98, { maxWidth: w - 80 });
  autoTable(doc, {
    startY: 112,
    head: [opts.columnas],
    body: opts.filas.map((r) => r.map((c) => String(c ?? ""))),
    styles: { fontSize: 7.5, cellPadding: 3, textColor: [30, 40, 55] },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [238, 244, 237] },
    margin: { left: 40, right: 40, bottom: 36 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Generado: ${generado}`, 40, h - 18);
      doc.text(`Página ${doc.getNumberOfPages()}`, w - 40, h - 18, { align: "right" });
    },
  });
  doc.save(opts.archivo);
}
