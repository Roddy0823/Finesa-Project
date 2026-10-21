import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { IdCard, Lock, Mail, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { ingresoEmpleado } from "@/lib/usuarios.functions";
import { obtenerConfigPortal } from "@/lib/ajustes.functions";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      return await obtenerConfigPortal();
    } catch {
      return { portalEmpleadosActivo: true };
    }
  },
  head: () => ({
    meta: [
      { title: "Ingresar — Finesa Inventario y Actas" },
      { name: "description", content: "Acceso al sistema de inventario de equipos y actas digitales de Finesa." },
      { property: "og:title", content: "Ingresar — Finesa Inventario y Actas" },
      { property: "og:description", content: "Acceso al sistema de inventario de equipos y actas digitales de Finesa." },
    ],
  }),
  component: Login,
});

function Login() {
  const loaderData = Route.useLoaderData();
  const obtenerConfigFn = useServerFn(obtenerConfigPortal);
  const configQuery = useQuery({
    queryKey: ["config-portal"],
    queryFn: () => obtenerConfigFn(),
    initialData: loaderData,
  });
  const portalActivo = configQuery.data?.portalEmpleadosActivo ?? true;

  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useState<"empleado" | "personal">(portalActivo ? "empleado" : "personal");
  const [cedula, setCedula] = useState("");
  const [pin, setPin] = useState("");
  const ingresar = useServerFn(ingresoEmpleado);
  const irDestino = () => {
    nav({ to: "/panel", replace: true });
  };

  useEffect(() => {
    if (!portalActivo && modo === "empleado") {
      setModo("personal");
    }
  }, [portalActivo, modo]);

  async function submitEmpleado(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await ingresar({ data: { cedula, pin } });
      if ("error" in r) {
        toast.error(r.error);
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
      if (error) throw error;
      qc.removeQueries({ queryKey: ["me"] });
      irDestino();
    } catch {
      toast.error("No fue posible ingresar. Intente de nuevo.");
      setLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) irDestino();
    });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      toast.error(error.message.includes("banned") ? "Su cuenta está suspendida." : "Correo o contraseña incorrectos.");
      return;
    }
    await supabase.rpc("log_evento", { p_accion: "LOGIN", p_detalle: "Inicio de sesión" });
    qc.removeQueries({ queryKey: ["me"] });
    irDestino();
  }

  const campo = "h-12 pl-10 text-base";
  return (
    <main className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="login-card w-full max-w-sm rounded-2xl bg-card p-7 sm:p-8">
        <div className="mb-7 text-center">
          <div className="font-display text-3xl font-extrabold tracking-[0.18em] text-primary">FINESA</div>
          <div className="mx-auto mt-2 h-0.5 w-10 rounded-full bg-sidebar-primary" />
        </div>
        {portalActivo ? (
          <div className="relative mb-6 grid grid-cols-2 rounded-full bg-muted p-1 text-sm font-medium">
            <span
              className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-primary shadow transition-all duration-300 ${modo === "empleado" ? "left-1" : "left-[calc(50%+3px)]"}`}
            />
            <button
              type="button"
              onClick={() => setModo("empleado")}
              className={`relative z-10 rounded-full py-2 transition-colors ${modo === "empleado" ? "text-primary-foreground" : "text-muted-foreground"}`}
            >
              Empleado
            </button>
            <button
              type="button"
              onClick={() => setModo("personal")}
              className={`relative z-10 rounded-full py-2 transition-colors ${modo === "personal" ? "text-primary-foreground" : "text-muted-foreground"}`}
            >
              Mesa de servicios
            </button>
          </div>
        ) : (
          <div className="mb-6 rounded-full bg-primary py-2 text-center text-sm font-medium text-primary-foreground shadow">
            Mesa de servicios
          </div>
        )}
        {portalActivo && modo === "empleado" ? (
          <form onSubmit={submitEmpleado} className="space-y-4">
            <div className="relative">
              <IdCard className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Número de cédula"
                placeholder="Número de cédula"
                className={campo}
                inputMode="numeric"
                autoComplete="username"
                required
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
              />
            </div>
            <div>
              <div className="relative">
                <Input
                  aria-label="PIN"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  autoComplete="current-password"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                />
                <div className="pointer-events-none grid grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`flex h-14 items-center justify-center rounded-lg border-2 text-2xl transition-colors ${pin.length === i ? "border-primary" : "border-input"} bg-background`}
                    >
                      {pin[i] ? "•" : ""}
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-1.5 text-center text-xs text-muted-foreground">PIN</p>
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Ingresar"}
            </Button>
          </form>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Correo"
                placeholder="Correo"
                className={campo}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Contraseña"
                placeholder="Contraseña"
                className={campo}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Ingresar"}
            </Button>
            <div className="text-center">
              <Link to="/recuperar" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                ¿Olvidó su contraseña?
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
