import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/lib/theme";
import { toast } from "sonner";
import { IdCard, Lock, Mail, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
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
    staleTime: 5 * 60_000,
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
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) irDestino();
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

  const campo = "h-10 pl-9 text-sm bg-background/60";
  return (
    <main className="login-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="login-card w-full max-w-[390px] rounded-2xl border border-border/80 bg-card/85 p-7 backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-md shadow-primary/25">
            F
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Finesa Inventario</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Plataforma de activos TI y actas digitales
          </p>
        </div>

        {portalActivo ? (
          <div className="relative mb-6 grid grid-cols-2 rounded-xl border border-border/70 bg-muted/60 p-1 text-xs font-medium">
            <span
              className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-lg bg-card shadow-xs ring-1 ring-border/60 transition-all duration-200 ${modo === "empleado" ? "left-1" : "left-[calc(50%+3px)]"}`}
            />
            <button
              type="button"
              onClick={() => setModo("empleado")}
              className={`relative z-10 rounded-lg py-1.5 transition-colors ${modo === "empleado" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Portal empleado
            </button>
            <button
              type="button"
              onClick={() => setModo("personal")}
              className={`relative z-10 rounded-lg py-1.5 transition-colors ${modo === "personal" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Mesa de servicios
            </button>
          </div>
        ) : (
          <div className="mb-6 flex items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 py-2 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Mesa de servicios TI</span>
          </div>
        )}

        {portalActivo && modo === "empleado" ? (
          <form onSubmit={submitEmpleado} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Documento de identidad</label>
              <div className="relative">
                <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">PIN de seguridad</label>
                <span className="font-mono text-[10px] text-muted-foreground">4 dígitos</span>
              </div>
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
                  className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
                />
                <div className="pointer-events-none grid grid-cols-4 gap-2.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`flex h-12 items-center justify-center rounded-xl border font-mono text-xl transition-all ${
                        pin.length === i
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : pin[i]
                            ? "border-border bg-background text-foreground"
                            : "border-input/80 bg-background/50 text-muted-foreground"
                      }`}
                    >
                      {pin[i] ? "•" : ""}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Button type="submit" className="h-10 w-full gap-2 text-sm font-medium" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Continuar al portal</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </form>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Correo corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Correo"
                  placeholder="nombre@finesa.com.co"
                  className={campo}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Contraseña</label>
                <Link to="/recuperar" className="text-[11px] text-primary hover:underline">
                  ¿Olvidó su clave?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Contraseña"
                  placeholder="••••••••"
                  className={campo}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" className="h-10 w-full gap-2 text-sm font-medium" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Iniciar sesión</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </form>
        )}
      </div>

      <div className="mt-6 text-center text-[11px] text-muted-foreground/70">
        Finesa S.A. · Gestión de Activos Tecnológicos y Firmas Digitales
      </div>
    </main>
  );
}
