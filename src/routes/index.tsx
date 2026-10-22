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

/**
 * Logotipo oficial de Finesa en SVG vectorial con monograma y acento de marca.
 */
function FinesaLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      aria-label="Logo Finesa"
    >
      <defs>
        <linearGradient id="finesa-bg-grad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="50%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="finesa-accent-grad" x1="284" y1="340" x2="384" y2="400" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="url(#finesa-bg-grad)" />
      <rect x="16" y="16" width="480" height="480" rx="104" stroke="#ffffff" strokeOpacity="0.15" strokeWidth="6" />
      {/* Monograma F estilizado */}
      <path
        d="M156 128H364C375.046 128 384 136.954 384 148V180C384 191.046 375.046 200 364 200H236V236H332C343.046 236 352 244.954 352 256V284C352 295.046 343.046 304 332 304H236V380C236 391.046 227.046 400 216 400H176C164.954 400 156 391.046 156 380V148C156 136.954 164.954 128 176 128Z"
        fill="#ffffff"
      />
      {/* Barra de acento Finesa */}
      <rect x="284" y="340" width="100" height="60" rx="20" fill="url(#finesa-accent-grad)" />
    </svg>
  );
}

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
          <div className="relative mb-3 flex items-center justify-center">
            <div className="absolute -inset-1.5 rounded-2xl bg-primary/25 blur-sm" />
            <FinesaLogo className="relative h-14 w-14 rounded-2xl shadow-lg ring-1 ring-white/20" />
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            Finesa Inventario
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
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
            <span>Mesa de servicios TI</span>
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

