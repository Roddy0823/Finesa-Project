import { vi } from "vitest";

export type Filtro = { op: string; col: string; val: unknown };

export type Consulta = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  columns?: string | undefined;
  filters: Filtro[];
  single?: boolean | undefined;
};

export type Respuesta = { data?: unknown; error?: { message: string; code?: string } | null };

type Responder = (q: Consulta) => Respuesta | undefined;
type RpcResponder = (name: string, args: unknown) => Respuesta | undefined;

/**
 * Cliente Supabase simulado. Cada `from(tabla)...` se registra en `queries` y se
 * resuelve con `onQuery`. Las RPC con `onRpc`. Los métodos de `auth.admin` y
 * `storage` son `vi.fn()` reemplazables por prueba.
 */
export function crearSupabaseMock(opts: { onQuery?: Responder; onRpc?: RpcResponder } = {}) {
  const queries: Consulta[] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  const state = { onQuery: opts.onQuery, onRpc: opts.onRpc };

  const resolver = (q: Consulta) => {
    const r = state.onQuery?.(q) ?? {};
    return { data: r.data ?? null, error: r.error ?? null };
  };

  function from(table: string) {
    const q: Consulta = { table, op: "select", filters: [] };
    let registrado = false;
    const registrar = () => {
      if (!registrado) {
        queries.push(q);
        registrado = true;
      }
    };
    const filtro = (op: string) => (col: string, val?: unknown, extra?: unknown) => {
      q.filters.push({ op, col, val: extra === undefined ? val : [val, extra] });
      return b;
    };
    const b: Record<string, unknown> = {
      select(columns?: string) {
        if (q.op === "select") q.columns = columns;
        return b;
      },
      insert(payload: unknown) {
        q.op = "insert";
        q.payload = payload;
        return b;
      },
      update(payload: unknown) {
        q.op = "update";
        q.payload = payload;
        return b;
      },
      upsert(payload: unknown) {
        q.op = "upsert";
        q.payload = payload;
        return b;
      },
      delete() {
        q.op = "delete";
        return b;
      },
      eq: filtro("eq"),
      neq: filtro("neq"),
      not: filtro("not"),
      ilike: filtro("ilike"),
      in: filtro("in"),
      order: () => b,
      range: () => b,
      limit: () => b,
      maybeSingle() {
        q.single = true;
        registrar();
        return Promise.resolve(resolver(q));
      },
      single() {
        q.single = true;
        registrar();
        return Promise.resolve(resolver(q));
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        registrar();
        return Promise.resolve(resolver(q)).then(res, rej);
      },
    };
    return b;
  }

  const storageUpload = vi.fn(async (_path: string, _body: unknown, _o?: unknown) => ({ data: { path: _path }, error: null as null | { message: string } }));
  const storageDownload = vi.fn(async (_path: string) => ({ data: null as Blob | null, error: null }));
  const storageBuckets: string[] = [];

  const client = {
    from: vi.fn(from),
    rpc: vi.fn(async (name: string, args?: unknown) => {
      rpcs.push({ name, args });
      const r = state.onRpc?.(name, args) ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    }),
    auth: {
      signInWithPassword: vi.fn(async (_c: { email: string; password: string }) => ({
        data: { session: null as null | { access_token: string; refresh_token: string } },
        error: { message: "Invalid login credentials" } as null | { message: string },
      })),
      admin: {
        createUser: vi.fn(async (_a: unknown) => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null }, error: null as null | { message: string } })),
        updateUserById: vi.fn(async (_id: string, _a: unknown) => ({ data: { user: { id: _id } }, error: null as null | { message: string } })),
        getUserById: vi.fn(async (_id: string) => ({ data: { user: { id: _id, app_metadata: {} as Record<string, unknown> } }, error: null })),
        deleteUser: vi.fn(async (_id: string) => ({ data: {}, error: null as null | { message: string } })),
      },
    },
    storage: {
      from: vi.fn((bucket: string) => {
        storageBuckets.push(bucket);
        return { upload: storageUpload, download: storageDownload };
      }),
    },
  };

  return {
    client,
    queries,
    rpcs,
    storageUpload,
    storageDownload,
    storageBuckets,
    setOnQuery(fn: Responder) {
      state.onQuery = fn;
    },
    setOnRpc(fn: RpcResponder) {
      state.onRpc = fn;
    },
    /** Consultas registradas sobre una tabla y operación concretas. */
    find(table: string, op?: Consulta["op"]) {
      return queries.filter((q) => q.table === table && (!op || q.op === op));
    },
    auditorias() {
      return queries
        .filter((q) => q.table === "auditoria" && q.op === "insert")
        .map((q) => q.payload as { user_id: string | null; tabla: string; accion: string; registro_id: string | null; detalle: string });
    },
  };
}

export type SupabaseMock = ReturnType<typeof crearSupabaseMock>;

export function filtro(q: Consulta, col: string, op = "eq") {
  return q.filters.find((f) => f.col === col && f.op === op)?.val;
}
