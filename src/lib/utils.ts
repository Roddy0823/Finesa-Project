import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function copiarTexto(texto: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Continuar con el respaldo clásico si falla por permisos o contexto
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = texto;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, texto.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
