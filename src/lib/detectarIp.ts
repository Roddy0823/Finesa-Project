let ipClienteCache: string | null = null;

/**
 * Detecta la IP corporativa o pública de salida del cliente (navegador).
 */
export async function detectarIpNavegador(): Promise<string | undefined> {
  if (ipClienteCache) return ipClienteCache;
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = (await res.json()) as { ip?: string };
      if (data?.ip) {
        ipClienteCache = data.ip;
        return data.ip;
      }
    }
  } catch {
    /* fallback si la red bloquea consultas externas directas desde cliente */
  }
  return undefined;
}
