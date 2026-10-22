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

/**
 * Previene ataques de inyección de fórmulas (CSV / Excel Formula Injection)
 * prefijando con comilla simple los valores de texto que inicien con `=`, `+`, `-`, `@`, `\t` o `\r`.
 */
export function sanitizarValorCelda<T>(valor: T): T {
  if (typeof valor !== "string") return valor;
  const trimmed = valor.trimStart();
  if (trimmed.length > 0 && /^[=+\-@\t\r]/.test(trimmed)) {
    return `'${valor}` as unknown as T;
  }
  return valor;
}

export function sanitizarFilaExcel<T extends Record<string, unknown>>(fila: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fila)) {
    out[k] = sanitizarValorCelda(v);
  }
  return out as T;
}

/**
 * Normaliza y valida que una URL externa utilice únicamente protocolo HTTP o HTTPS,
 * bloqueando esquemas peligrosos como `javascript:`, `data:` o `vbscript:`.
 */
export function urlExternaSegura(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Limpia términos de búsqueda libre antes de interpolarlos en filtros PostgREST `.or(...)`.
 */
export function sanitizarBusquedaPostgrest(raw: string): string {
  return raw
    .replace(/[,()%*;'"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
