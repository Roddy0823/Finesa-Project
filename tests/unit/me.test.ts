import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearSupabaseMock } from "../helpers/supabase-mock";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn() }));
const state = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth, from: state.from } }));
import { meQuery } from "@/lib/me";

const load = () => new QueryClient({ defaultOptions: { queries: { retry: false } } }).fetchQuery(meQuery);

describe("identidad validada en Supabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const db = crearSupabaseMock({ onQuery: (q) => ({ data:
      q.table === "profiles" ? { activo: true, nombre: "Auxiliar" } :
      q.table === "user_roles" ? [{ role: "auxiliar" }] : [{ permiso: "reportes_exportar" }],
    }) });
    state.from.mockImplementation(db.client.from);
  });
  it("no acepta una sesión local si Supabase rechaza al usuario", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "forged" } } } });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    expect(await load()).toBeNull();
    expect(state.from).not.toHaveBeenCalled();
    expect(auth.getSession).not.toHaveBeenCalled();
  });
  it("propaga fallos de red sin recuperar permisos de una sesión antigua", async () => {
    auth.getUser.mockRejectedValue(new Error("network unavailable"));
    await expect(load()).rejects.toThrow("network unavailable");
    expect(state.from).not.toHaveBeenCalled();
  });
  it("carga los permisos del usuario validado e ignora user_metadata", async () => {
    auth.getUser.mockResolvedValue({ data: { user: {
      id: "verified", email: "test@example.com", app_metadata: {},
      user_metadata: { role: "admin", permisos_extra: ["cargas_masivas"] },
    } }, error: null });
    const me = await load();
    expect(me?.id).toBe("verified");
    expect(me?.isAdmin).toBe(false);
    expect(me?.can("reportes_exportar")).toBe(true);
    expect(me?.can("cargas_masivas")).toBe(false);
  });
});
