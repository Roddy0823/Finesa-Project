export const IDLE_CONFIG_EVENT = "finesa:idle-config-changed";
export const IDLE_STORAGE_KEY = "finesa-idle-min";
export const LAST_ACTIVITY_KEY = "finesa-last-activity";

/**
 * Lee los minutos de inactividad configurados por el usuario en localStorage.
 * Por defecto 30 minutos. 0 significa desactivado.
 */
export function leerMinutosInactividad(): number {
  if (typeof window === "undefined") return 30;
  const raw = localStorage.getItem(IDLE_STORAGE_KEY);
  if (raw === null) return 30;
  const val = Number(raw);
  if (Number.isFinite(val) && val >= 0) return val;
  return 30;
}

/**
 * Lee la marca de tiempo (timestamp ms) de la última actividad del usuario.
 * Si no existe o no es válida, la inicializa en Date.now().
 */
export function leerUltimaActividad(): number {
  if (typeof window === "undefined") return Date.now();
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  const val = Number(raw);
  if (Number.isFinite(val) && val > 0) return val;
  const now = Date.now();
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  return now;
}

/**
 * Registra una nueva marca de actividad (Date.now()) compartida entre pestañas.
 */
export function registrarActividadGlobal(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

/**
 * Elimina la marca de actividad al cerrar sesión para garantizar
 * que una nueva sesión pueda iniciar sin ser expulsada por timestamps residuales.
 */
export function limpiarActividadGlobal(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LAST_ACTIVITY_KEY);
}
