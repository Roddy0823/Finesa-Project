import { useSyncExternalStore } from "react";
import type { Contexto, FilaValidada, Lectura, Validacion } from "./cargaMasiva";

export type Resultado = "nuevo" | "existe" | "error" | "fallo";
export type FilaResultado = FilaValidada & { resultado?: Resultado | undefined; detalleResultado?: string | undefined };
export type Fase = "idle" | "leyendo" | "revision" | "procesando" | "resultado";
export type Paso = "catalogos" | "empleados" | "equipos" | "asignaciones";

export interface FinalCargaMasiva {
  filas: FilaResultado[];
  metricas: [string, number | string][];
  catCreados: number;
  duracion: number;
}

export interface CargaMasivaState {
  fase: Fase;
  lectura: Lectura | null;
  ctx: Contexto | null;
  val: Validacion | null;
  paso: Paso | null;
  pct: number;
  detallePaso: string;
  autorizaCat: boolean;
  final: FinalCargaMasiva | null;
}

const initialState: CargaMasivaState = {
  fase: "idle",
  lectura: null,
  ctx: null,
  val: null,
  paso: null,
  pct: 0,
  detallePaso: "",
  autorizaCat: false,
  final: null,
};

let state: CargaMasivaState = { ...initialState };
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      console.error(e);
    }
  }
}

export const cargaMasivaStore = {
  getState(): CargaMasivaState {
    return state;
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setFase(fase: Fase) {
    state = { ...state, fase };
    notify();
  },

  setRevision(lectura: Lectura, ctx: Contexto, val: Validacion) {
    state = {
      ...state,
      lectura,
      ctx,
      val,
      fase: "revision",
      final: null,
      autorizaCat: false,
    };
    notify();
  },

  setCtx(ctx: Contexto) {
    state = { ...state, ctx };
    notify();
  },

  setVal(val: Validacion) {
    state = { ...state, val };
    notify();
  },

  setAutorizaCat(autorizaCat: boolean) {
    state = { ...state, autorizaCat };
    notify();
  },

  iniciarProcesamiento() {
    state = {
      ...state,
      fase: "procesando",
      paso: null,
      pct: 0,
      detallePaso: "Iniciando importación...",
    };
    notify();
  },

  setProgreso(paso: Paso, pct: number, detallePaso: string) {
    state = {
      ...state,
      paso,
      pct,
      detallePaso,
    };
    notify();
  },

  finalizarExito(final: FinalCargaMasiva) {
    state = {
      ...state,
      fase: "resultado",
      pct: 100,
      paso: null,
      detallePaso: "",
      final,
    };
    notify();
  },

  finalizarError() {
    state = {
      ...state,
      fase: "revision",
      paso: null,
      detallePaso: "",
    };
    notify();
  },

  reiniciar() {
    state = { ...initialState };
    notify();
  },

  isProcessing(): boolean {
    return state.fase === "procesando";
  },
};

export function useCargaMasivaStore(): CargaMasivaState {
  return useSyncExternalStore(
    cargaMasivaStore.subscribe,
    cargaMasivaStore.getState,
    cargaMasivaStore.getState,
  );
}
