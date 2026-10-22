const rateBuckets = new Map<string, { count: number; resetAt: number }>();

let lastCleanup = Date.now();

function cleanupBuckets(now: number) {
  if (now - lastCleanup < 60_000 && rateBuckets.size < 2000) return;
  lastCleanup = now;
  for (const [k, v] of rateBuckets) {
    if (v.resetAt <= now) rateBuckets.delete(k);
  }
}

/**
 * Limitador de tasa en memoria por ventana deslizante fija (IP + acción).
 * Protege endpoints públicos y sensibles contra fuerza bruta y enumeración.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  cleanupBuckets(now);

  const entry = rateBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const IHDR_ASCII = [0x49, 0x48, 0x44, 0x52] as const;

/**
 * Valida estrictamente que un Data URL sea una imagen PNG legítima
 * comprobando su cabecera binaria (Magic Bytes + chunk IHDR) y límites de tamaño.
 */
export function validarPngBase64(
  dataUrl: string,
): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m || !m[1]) {
    return { ok: false, error: "Formato de firma inválido (se requiere imagen PNG)." };
  }

  let bytes: Uint8Array;
  try {
    const cleanBase64 = m[1].replace(/\s+/g, "");
    bytes = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));
  } catch {
    return { ok: false, error: "Codificación base64 de la firma inválida." };
  }

  if (bytes.length < 500) {
    return { ok: false, error: "El trazo de la firma está vacío o es demasiado corto." };
  }
  if (bytes.length > 2_000_000) {
    return { ok: false, error: "La imagen de la firma excede el tamaño máximo permitido (2 MB)." };
  }

  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) {
      return { ok: false, error: "El archivo enviado no corresponde a una imagen PNG válida." };
    }
  }

  for (let i = 0; i < IHDR_ASCII.length; i++) {
    if (bytes[12 + i] !== IHDR_ASCII[i]) {
      return { ok: false, error: "Cabecera IHDR de imagen PNG inválida." };
    }
  }

  return { ok: true, bytes };
}

/**
 * Valida que la contraseña cumpla con los requisitos de complejidad corporativa.
 */
export function validarPoliticaPassword(password: string): string | null {
  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (password.length > 72) {
    return "La contraseña no puede superar los 72 caracteres.";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return "La contraseña debe incluir al menos una letra y un número o símbolo.";
  }
  return null;
}
