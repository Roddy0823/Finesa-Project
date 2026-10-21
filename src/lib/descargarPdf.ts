import { toast } from "sonner";
import { urlArchivo } from "@/lib/firmas.functions";
import { errMsg } from "@/lib/constantes";

/**
 * Descarga el PDF de un acta. Obtiene el enlace firmado en el servidor y
 * descarga el archivo como blob: las ventanas emergentes abiertas después de
 * una espera las bloquea el navegador, por eso no se usa window.open.
 */
export async function descargarPdfActa(
  url: (args: { data: { actaId: string } }) => Promise<{ url: string }>,
  actaId: string,
  nombreArchivo: string,
) {
  try {
    const r = await url({ data: { actaId } });
    const res = await fetch(r.url);
    if (!res.ok) throw new Error("No se pudo obtener el archivo del almacenamiento.");
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  } catch (e) {
    toast.error(errMsg(e));
  }
}
