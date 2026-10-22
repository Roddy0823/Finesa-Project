import { beforeEach, describe, expect, it, vi } from "vitest";
import { cargaMasivaStore, type FinalCargaMasiva } from "@/lib/cargaMasivaStore";
import type { Contexto, Lectura, Validacion } from "@/lib/cargaMasiva";

describe("cargaMasivaStore", () => {
  beforeEach(() => {
    cargaMasivaStore.reiniciar();
  });

  it("inicia en estado idle con valores vacíos", () => {
    const s = cargaMasivaStore.getState();
    expect(s.fase).toBe("idle");
    expect(s.pct).toBe(0);
    expect(s.paso).toBeNull();
    expect(s.final).toBeNull();
    expect(cargaMasivaStore.isProcessing()).toBe(false);
  });

  it("transiciona a revisión al fijar la lectura del archivo", () => {
    const lectura = { archivo: "datos.xlsx", hojas: {} } as unknown as Lectura;
    const ctx = { esAdmin: true } as unknown as Contexto;
    const val = { filas: { empleados: [], equipos: [], asignaciones: [] }, faltantes: [], advertenciasGenerales: [] } as unknown as Validacion;

    cargaMasivaStore.setRevision(lectura, ctx, val);

    const s = cargaMasivaStore.getState();
    expect(s.fase).toBe("revision");
    expect(s.lectura).toBe(lectura);
    expect(s.val).toBe(val);
    expect(s.ctx).toBe(ctx);
  });

  it("actualiza progreso durante el procesamiento y notifica a los suscriptores", () => {
    const listener = vi.fn();
    const unsubscribe = cargaMasivaStore.subscribe(listener);

    cargaMasivaStore.iniciarProcesamiento();
    expect(cargaMasivaStore.isProcessing()).toBe(true);
    expect(cargaMasivaStore.getState().fase).toBe("procesando");
    expect(listener).toHaveBeenCalled();

    cargaMasivaStore.setProgreso("equipos", 50, "50 de 100 equipos");
    const s = cargaMasivaStore.getState();
    expect(s.paso).toBe("equipos");
    expect(s.pct).toBe(50);
    expect(s.detallePaso).toBe("50 de 100 equipos");

    unsubscribe();
  });

  it("finaliza con éxito registrando métricas y pasando a fase resultado", () => {
    cargaMasivaStore.iniciarProcesamiento();

    const resultadoFinal: FinalCargaMasiva = {
      filas: [],
      metricas: [["Equipos creados", 10]],
      catCreados: 2,
      duracion: 4,
    };

    cargaMasivaStore.finalizarExito(resultadoFinal);

    const s = cargaMasivaStore.getState();
    expect(s.fase).toBe("resultado");
    expect(s.pct).toBe(100);
    expect(s.final).toEqual(resultadoFinal);
    expect(cargaMasivaStore.isProcessing()).toBe(false);
  });

  it("vuelve a revisión si ocurre un error durante el procesamiento", () => {
    cargaMasivaStore.iniciarProcesamiento();
    cargaMasivaStore.finalizarError();

    const s = cargaMasivaStore.getState();
    expect(s.fase).toBe("revision");
    expect(s.paso).toBeNull();
    expect(cargaMasivaStore.isProcessing()).toBe(false);
  });
});
