import { beforeEach, describe, expect, it } from "vitest";

const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

(globalThis as unknown as { window: { localStorage: typeof mockLocalStorage } }).window = {
  localStorage: mockLocalStorage,
};
(globalThis as unknown as { localStorage: typeof mockLocalStorage }).localStorage = mockLocalStorage;

import {
  IDLE_STORAGE_KEY,
  LAST_ACTIVITY_KEY,
  leerMinutosInactividad,
  leerUltimaActividad,
  registrarActividadGlobal,
  limpiarActividadGlobal,
} from "@/lib/inactividad";

describe("Inactividad y Bloqueo de Sesión", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("lee 30 minutos por defecto si no hay configuración guardada", () => {
    expect(leerMinutosInactividad()).toBe(30);
  });

  it("lee correctamente tiempos configurados válidos (2, 5, 15, 30, 60 y 0)", () => {
    mockLocalStorage.setItem(IDLE_STORAGE_KEY, "2");
    expect(leerMinutosInactividad()).toBe(2);

    mockLocalStorage.setItem(IDLE_STORAGE_KEY, "5");
    expect(leerMinutosInactividad()).toBe(5);

    mockLocalStorage.setItem(IDLE_STORAGE_KEY, "15");
    expect(leerMinutosInactividad()).toBe(15);

    mockLocalStorage.setItem(IDLE_STORAGE_KEY, "0");
    expect(leerMinutosInactividad()).toBe(0);
  });

  it("registra y lee la última actividad en milisegundos en localStorage", () => {
    const t0 = Date.now();
    registrarActividadGlobal();
    const stored = leerUltimaActividad();
    expect(stored).toBeGreaterThanOrEqual(t0);

    const hace20Min = Date.now() - 20 * 60_000;
    mockLocalStorage.setItem(LAST_ACTIVITY_KEY, String(hace20Min));
    expect(leerUltimaActividad()).toBe(hace20Min);
  });

  it("limpia la marca de actividad al cerrar sesión para permitir reingreso inmediato", () => {
    registrarActividadGlobal();
    expect(mockLocalStorage.getItem(LAST_ACTIVITY_KEY)).not.toBeNull();
    limpiarActividadGlobal();
    expect(mockLocalStorage.getItem(LAST_ACTIVITY_KEY)).toBeNull();
  });
});
