import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/lib/theme";
import { toast } from "sonner";
import {
  IdCard,
  Lock,
  Mail,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  Users,
  Wrench,
} from "lucide-react";
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
      { name: "description", content: "Acceso al sistema de inventario de equipos y actas digitales de Finesa S.A." },
      { property: "og:title", content: "Ingresar — Finesa Inventario y Actas" },
      { property: "og:description", content: "Acceso al sistema de inventario de equipos y actas digitales de Finesa S.A." },
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
  const [mostrarPassword, setMostrarPassword] = useState(false);
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
      toast.error("No fue posible ingresar. Verifique su número de cédula y PIN de 4 dígitos.");
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
    await supabase.rpc("log_evento", { p_accion: "LOGIN", p_detalle: "Inicio de sesión mesa de soporte" });
    qc.removeQueries({ queryKey: ["me"] });
    irDestino();
  }

  const campo =
    "h-10.5 pl-9 text-sm bg-background/70 border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

  return (
    <main className="login-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      {/* Botón flotante para alternar tema */}
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* Tarjeta de inicio de sesión centrada y enfocada */}
      <div className="login-card w-full max-w-[410px] rounded-2xl border border-border/80 bg-card/90 p-7 shadow-2xl backdrop-blur-xl sm:p-8">
        {/* Cabecera con Logotipo Oficial de Finesa */}
        <div className="mb-6 flex flex-col items-center text-center">
          <h1 className="sr-only">Finesa — Plataforma de activos TI y actas digitales</h1>
          <div className="flex items-center justify-center">
            {/* Logo Finesa 3 para tema claro */}
            <img
              src="/logo-finesa-light.png"
              alt="Finesa"
              className="h-16 w-auto max-w-[260px] object-contain drop-shadow-sm transition-all duration-200 dark:hidden"
            />
            {/* Logo Finesa 2 para tema oscuro */}
            <img
              src="/logo-finesa-dark.png"
              alt="Finesa"
              className="hidden h-16 w-auto max-w-[260px] object-contain drop-shadow-sm transition-all duration-200 dark:block"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Plataforma de activos TI y actas digitales
          </p>
        </div>

        {/* Conmutador de modo: Portal Empleado vs Mesa de Servicios */}
        {portalActivo ? (
          <div className="relative mb-6 grid grid-cols-2 rounded-xl border border-border/70 bg-muted/60 p-1 text-xs font-medium">
            <span
              className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-lg bg-card shadow-xs ring-1 ring-border/60 transition-all duration-200 ${
                modo === "empleado" ? "left-1" : "left-[calc(50%+3px)]"
              }`}
            />
            <button
              type="button"
              onClick={() => setModo("empleado")}
              className={`relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-colors ${
                modo === "empleado"
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Portal empleado</span>
            </button>
            <button
              type="button"
              onClick={() => setModo("personal")}
              className={`relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-colors ${
                modo === "personal"
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Mesa de servicios</span>
            </button>
          </div>
        ) : (
          <div className="mb-6 flex items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 py-2 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Mesa de servicios</span>
          </div>
        )}

        {/* Formulario 1: Portal Empleado (Cédula + PIN 4 dígitos) */}
        {portalActivo && modo === "empleado" ? (
          <form onSubmit={submitEmpleado} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Documento de identidad
              </label>
              <div className="relative">
                <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Número de cédula"
                  placeholder="Número de cédula"
                  className={campo}
                  inputMode="numeric"
                  autoComplete="username"
                  required
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  PIN de seguridad
                </label>
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
                      className={`flex h-12 items-center justify-center rounded-xl border font-mono text-xl font-bold transition-all ${
                        pin.length === i
                          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
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

            <Button
              type="submit"
              className="h-10 w-full gap-2 text-sm font-medium"
              disabled={loading || !cedula || pin.length < 4}
            >
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
          /* Formulario 2: Mesa de Servicios (Correo + Contraseña con ojito) */
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Correo corporativo
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                <label className="text-xs font-medium text-muted-foreground">
                  Contraseña
                </label>
                <Link to="/recuperar" className="text-[11px] text-primary hover:underline">
                  ¿Olvidó su clave?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Contraseña"
                  placeholder="••••••••"
                  className={`${campo} pr-10`}
                  type={mostrarPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={mostrarPassword ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {mostrarPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-10 w-full gap-2 text-sm font-medium"
              disabled={loading || !email || !password}
            >
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

