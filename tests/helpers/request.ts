/** Cabeceras de la petición HTTP simulada que devuelve getRequestHeader(). */
export const requestHeaders = new Map<string, string>();

export function setRequestHeaders(h: Record<string, string>) {
  requestHeaders.clear();
  for (const [k, v] of Object.entries(h)) requestHeaders.set(k.toLowerCase(), v);
}
