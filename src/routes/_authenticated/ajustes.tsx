import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useTheme, type Theme } from "@/lib/theme";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { copiarTexto, cn } from "@/lib/utils";
import { actualizarNombre, borrarMiFirma, cambiarMiPassword, guardarMiFirma, obtenerMiFirma } from "@/lib/ajustes.functions";
import { IDLE_CONFIG_EVENT, IDLE_STORAGE_KEY, leerMinutosInactividad, registrarActividadGlobal } from "@/lib/inactividad";
import { PageHeader } from "@/components/Estado";
import { Certificaciones } from "@/components/Certificaciones";
import { ConfigPortalEmpleados } from "@/components/ConfigPortalEmpleados";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  User,
  PenTool,
  Users,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  CheckCircle2,
  Copy,
  Mail,
  Sparkles,
  Trash2,
  RefreshCw,
  Lock,
  KeyRound,
  Clock,
  Activity,
  LogOut,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";

const search = z.object({ tab: z.enum(["perfil", "seguridad", "firma", "portal", "certificacion"]).optional() });

export const Route = createFileRoute("/_authenticated/ajustes")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Configuración — Finesa" },
      { name: "description", content: "Perfil, apariencia, firma digital y configuración del sistema." },
    ],
  }),
  component: Ajustes,
});

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Ajustes() {
  const { data: me } = useMe();
  const { tab = "perfil" } = Route.useSearch();
  const nav = useNavigate({ from: "/ajustes" });

  if (!me) return null;

  const tabs: { id: NonNullable<typeof tab>; label: string; icon: typeof User; badge?: string }[] = [
    { id: "perfil", label: "Perfil y apariencia", icon: User },
    { id: "seguridad", label: "Seguridad y sesión", icon: Lock },
    ...(me.isStaff ? [{ id: "firma" as const, label: "Firma digital", icon: PenTool }] : []),
    ...(me.isAdmin
      ? [
          { id: "portal" as const, label: "Portal de empleados", icon: Users, badge: "Admin" },
          { id: "certificacion" as const, label: "Certificación anual", icon: ShieldCheck, badge: "Admin" },
        ]
      : []),
  ];

  const actual =
    ((tab === "certificacion" || tab === "portal") && !me.isAdmin) || (tab === "firma" && !me.isStaff)
      ? "perfil"
      : tab;

  const rol = me.isAdmin ? "Administrador" : me.isStaff ? "Auxiliar de soporte" : "Empleado";

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Configuración"
        desc="Personalice su perfil, apariencia de la interfaz, firma electrónica y preferencias globales."
      />

      {/* Interactive Segmented Tab Bar */}
      <div className="border-b border-border/70 pb-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border/70 bg-muted/50 p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = actual === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => nav({ search: { tab: t.id } })}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all",
                  active
                    ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground")} />
                <span>{t.label}</span>
                {t.badge && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 font-mono text-[10px]",
                      active ? "bg-primary/15 text-primary font-semibold" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {actual === "perfil" && (
        <div className="space-y-6">
          <Perfil nombre={me.nombre} email={me.email} rol={rol} puedeEditar={me.isStaff} />
          <AparienciaCard />
        </div>
      )}
      {actual === "seguridad" && <SeguridadPanel userId={me.id} email={me.email} isStaff={me.isStaff} rol={rol} />}
      {actual === "firma" && me.isStaff && <Firma email={me.email} />}
      {actual === "portal" && me.isAdmin && <ConfigPortalEmpleados />}
      {actual === "certificacion" && me.isAdmin && <Certificaciones admin ownerId={me.id} />}
    </div>
  );
}

function validarNombreCliente(raw: string, actual: string): { valido: boolean; limpio: string; error: string | null } {
  const limpio = raw.trim().replace(/\s+/g, " ");
  if (limpio === actual.trim()) {
    return { valido: false, limpio, error: null };
  }
  if (limpio.length < 3) {
    return { valido: false, limpio, error: "El nombre debe tener al menos 3 caracteres." };
  }
  if (limpio.length > 120) {
    return { valido: false, limpio, error: "El nombre no puede superar los 120 caracteres." };
  }
  if (!/^[\p{L}\s.'-]+$/u.test(limpio)) {
    return {
      valido: false,
      limpio,
      error: "Solo se permiten letras, espacios, puntos o guiones (sin números ni símbolos especiales).",
    };
  }
  return { valido: true, limpio, error: null };
}

function DialogConfirmarCredenciales({
  open,
  onClose,
  emailCuenta,
  titulo,
  descripcion,
  resumen,
  destructivo = false,
  textoConfirmar = "Verificar y guardar",
  onConfirmar,
}: {
  open: boolean;
  onClose: () => void;
  emailCuenta: string;
  titulo: string;
  descripcion: string;
  resumen?: React.ReactNode;
  destructivo?: boolean;
  textoConfirmar?: string;
  onConfirmar: (credenciales: { email: string; passwordActual: string }) => Promise<{ error?: string } | void>;
}) {
  const [email, setEmail] = useState(emailCuenta);
  const [passwordActual, setPasswordActual] = useState("");
  const [mostrarPwd, setMostrarPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail(emailCuenta);
      setPasswordActual("");
      setMostrarPwd(false);
      setErrorMsg(null);
    }
  }, [open, emailCuenta]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const correoLimpio = email.trim().toLowerCase();
    if (!correoLimpio || correoLimpio !== emailCuenta.trim().toLowerCase()) {
      setErrorMsg("El correo electrónico ingresado no coincide con el de su sesión activa.");
      return;
    }
    if (!passwordActual) {
      setErrorMsg("Ingrese su contraseña actual para verificar su identidad.");
      return;
    }
    setLoading(true);
    try {
      const res = await onConfirmar({ email: correoLimpio, passwordActual });
      if (res && "error" in res && res.error) {
        setErrorMsg(res.error);
        setPasswordActual("");
        return;
      }
      onClose();
    } catch (err) {
      setErrorMsg(errMsg(err));
      setPasswordActual("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                destructivo
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-primary/25 bg-primary/10 text-primary",
              )}
            >
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base">{titulo}</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 space-y-4">
          {resumen && (
            <div className="rounded-xl border border-border/80 bg-muted/25 p-3 text-xs">
              {resumen}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Correo electrónico de su cuenta</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                className="pl-8 font-mono text-xs"
                placeholder={emailCuenta}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Contraseña actual</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type={mostrarPwd ? "text" : "password"}
                required
                autoFocus
                autoComplete="current-password"
                value={passwordActual}
                onChange={(e) => {
                  setPasswordActual(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Ingrese su contraseña para confirmar"
                className="pl-8 pr-9"
              />
              <button
                type="button"
                onClick={() => setMostrarPwd((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                title={mostrarPwd ? "Ocultar" : "Mostrar"}
              >
                {mostrarPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Por seguridad, cualquier modificación a su perfil, firma digital o credenciales verifica su identidad en el servidor y queda registrada en la bitácora de auditoría.
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-3">
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={destructivo ? "destructive" : "default"}
              disabled={loading || !passwordActual || !email.trim()}
            >
              {loading ? "Verificando…" : textoConfirmar}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Perfil({
  nombre,
  email,
  rol,
  puedeEditar,
}: {
  nombre: string;
  email: string;
  rol: string;
  puedeEditar: boolean;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(actualizarNombre);
  const [n, setN] = useState(nombre);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => setN(nombre), [nombre]);

  const validacion = validarNombreCliente(n, nombre);
  const modificado = n.trim() !== nombre.trim();

  function solicitarGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!modificado) return;
    if (!validacion.valido) {
      toast.error(validacion.error ?? "Verifique el nombre ingresado.");
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmarGuardar(credenciales: { email: string; passwordActual: string }) {
    const r = await fn({ data: { nombre: validacion.limpio, credenciales } });
    if ("error" in r && r.error) {
      return { error: r.error };
    }
    toast.success("Nombre de perfil verificado y actualizado");
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["mi-seguridad-auditoria"] });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 bg-muted/20 px-6 py-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/12 font-mono text-sm font-bold text-primary shadow-2xs">
            {iniciales(n || nombre || "U")}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">{nombre}</h2>
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {rol}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Información de identidad visible en las actas, reportes y bitácora de auditoría.
            </p>
          </div>
        </div>
        {puedeEditar && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Protegido con confirmación de credenciales
          </span>
        )}
      </div>

      <form onSubmit={solicitarGuardar} className="grid gap-5 p-6 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nombre completo</Label>
          <Input
            required
            minLength={3}
            maxLength={120}
            disabled={!puedeEditar}
            value={n}
            onChange={(e) => setN(e.target.value)}
            placeholder="Su nombre y apellido"
          />
          {modificado && validacion.error ? (
            <p className="text-[11px] font-medium text-destructive">{validacion.error}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Aparecerá como responsable técnico al emitir actas de entrega o devolución.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Correo electrónico de acceso</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={email} disabled className="pl-8 pr-9 font-mono text-xs" />
            {email && (
              <button
                type="button"
                title="Copiar correo"
                onClick={async () => {
                  if (await copiarTexto(email)) toast.success("Correo copiado al portapapeles");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Identificador único vinculado a su cuenta.</p>
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 sm:col-span-2">
            <span className="text-xs text-muted-foreground">
              {modificado
                ? validacion.valido
                  ? "Cambio validado. Se solicitarán sus credenciales al guardar."
                  : "Corrija el formato del nombre antes de continuar."
                : "Su perfil está actualizado."}
            </span>
            <div className="flex items-center gap-2">
              {modificado && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setN(nombre)}>
                  Restablecer
                </Button>
              )}
              <Button type="submit" size="sm" disabled={!validacion.valido}>
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Guardar cambios
              </Button>
            </div>
          </div>
        )}
      </form>

      <DialogConfirmarCredenciales
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        emailCuenta={email}
        titulo="Confirmar modificación de perfil"
        descripcion="Ingrese sus credenciales para autorizar el cambio de su nombre en el sistema."
        resumen={
          <div className="space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Nombre actual:</span>
              <span className="font-medium text-foreground">{nombre}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Nuevo nombre:</span>
              <span className="font-semibold text-primary">{validacion.limpio}</span>
            </div>
          </div>
        }
        textoConfirmar="Verificar y actualizar nombre"
        onConfirmar={confirmarGuardar}
      />
    </section>
  );
}

function AparienciaCard() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const opciones: {
    id: Theme;
    title: string;
    desc: string;
    icon: typeof Sun;
    preview: React.ReactNode;
  }[] = [
    {
      id: "light",
      title: "Modo claro",
      desc: "Superficies claras de alto contraste ideales para entornos muy iluminados.",
      icon: Sun,
      preview: (
        <div className="flex h-20 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <div className="w-8 rounded bg-zinc-200/80 p-1">
            <div className="h-2 w-4 rounded-xs bg-indigo-600" />
            <div className="mt-1.5 space-y-1">
              <div className="h-1.5 w-full rounded-xs bg-zinc-300" />
              <div className="h-1.5 w-4/5 rounded-xs bg-zinc-300" />
            </div>
          </div>
          <div className="ml-2 flex-1 space-y-1.5 rounded bg-white p-2 shadow-2xs ring-1 ring-zinc-200/70">
            <div className="h-2 w-1/2 rounded-xs bg-zinc-800" />
            <div className="grid grid-cols-3 gap-1">
              <div className="h-5 rounded-xs bg-zinc-100 ring-1 ring-zinc-200" />
              <div className="h-5 rounded-xs bg-zinc-100 ring-1 ring-zinc-200" />
              <div className="h-5 rounded-xs bg-indigo-50 ring-1 ring-indigo-200" />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "dark",
      title: "Modo oscuro",
      desc: "Tonos carbón profundo e índigo diseñados para reducir la fatiga visual.",
      icon: Moon,
      preview: (
        <div className="flex h-20 w-full overflow-hidden rounded-lg border border-zinc-800 bg-[#0d0f17] p-2">
          <div className="w-8 rounded bg-[#141722] p-1 ring-1 ring-white/5">
            <div className="h-2 w-4 rounded-xs bg-indigo-500" />
            <div className="mt-1.5 space-y-1">
              <div className="h-1.5 w-full rounded-xs bg-zinc-700" />
              <div className="h-1.5 w-4/5 rounded-xs bg-zinc-700" />
            </div>
          </div>
          <div className="ml-2 flex-1 space-y-1.5 rounded bg-[#171b26] p-2 ring-1 ring-white/8">
            <div className="h-2 w-1/2 rounded-xs bg-zinc-200" />
            <div className="grid grid-cols-3 gap-1">
              <div className="h-5 rounded-xs bg-zinc-800/90 ring-1 ring-white/6" />
              <div className="h-5 rounded-xs bg-zinc-800/90 ring-1 ring-white/6" />
              <div className="h-5 rounded-xs bg-indigo-500/20 ring-1 ring-indigo-400/30" />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "system",
      title: "Automático (Sistema)",
      desc: "Sincroniza automáticamente el tema claro u oscuro según su sistema operativo.",
      icon: Monitor,
      preview: (
        <div className="relative flex h-20 w-full overflow-hidden rounded-lg border border-border">
          <div className="flex w-1/2 bg-zinc-50 p-2">
            <div className="w-full space-y-1.5 rounded bg-white p-1.5 ring-1 ring-zinc-200">
              <div className="h-2 w-2/3 rounded-xs bg-zinc-800" />
              <div className="h-5 rounded-xs bg-zinc-100" />
            </div>
          </div>
          <div className="flex w-1/2 bg-[#0d0f17] p-2">
            <div className="w-full space-y-1.5 rounded bg-[#171b26] p-1.5 ring-1 ring-white/10">
              <div className="h-2 w-2/3 rounded-xs bg-zinc-200" />
              <div className="h-5 rounded-xs bg-indigo-500/20 ring-1 ring-indigo-400/30" />
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Apariencia del espacio de trabajo</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Seleccione el tema visual de Finesa. Actualmente visualizando en modo{" "}
            <b className="text-foreground">{resolvedTheme === "dark" ? "oscuro" : "claro"}</b>.
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-3">
        {opciones.map((op) => {
          const Icon = op.icon;
          const active = theme === op.id;
          return (
            <button
              key={op.id}
              type="button"
              onClick={() => {
                setTheme(op.id);
                toast.success(`Tema cambiado a: ${op.title}`);
              }}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all",
                active
                  ? "border-primary bg-primary/6 shadow-sm ring-1 ring-primary/30"
                  : "border-border/80 bg-background/40 hover:border-border hover:bg-muted/30",
              )}
            >
              <div>
                {op.preview}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-xs font-semibold text-foreground">{op.title}</span>
                  </div>
                  {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{op.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Firma({ email }: { email: string }) {
  const ver = useServerFn(obtenerMiFirma);
  const guardarFn = useServerFn(guardarMiFirma);
  const borrarFn = useServerFn(borrarMiFirma);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mi-firma"], queryFn: () => ver() });
  const [firma, setFirma] = useState<string | null>(null);
  const [editar, setEditar] = useState(false);
  const [confirmAccion, setConfirmAccion] = useState<"guardar" | "borrar" | null>(null);
  const url = q.data?.url;

  async function confirmarGuardar(credenciales: { email: string; passwordActual: string }) {
    if (!firma) return { error: "Debe trazar una firma válida antes de guardar." };
    const r = await guardarFn({ data: { firma, credenciales } });
    if ("error" in r && r.error) {
      return { error: r.error };
    }
    toast.success("Identidad verificada y firma guardada. Se agregará automáticamente a las actas que genere.");
    setEditar(false);
    setFirma(null);
    qc.invalidateQueries({ queryKey: ["mi-firma"] });
    qc.invalidateQueries({ queryKey: ["mi-seguridad-auditoria"] });
  }

  async function confirmarBorrar(credenciales: { email: string; passwordActual: string }) {
    const r = await borrarFn({ data: { credenciales } });
    if ("error" in r && r.error) {
      return { error: r.error };
    }
    toast.success("Identidad verificada y firma eliminada");
    qc.invalidateQueries({ queryKey: ["mi-firma"] });
    qc.invalidateQueries({ queryKey: ["mi-seguridad-auditoria"] });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <PenTool className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Firma digital del técnico</h2>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                url
                  ? "border-success/30 bg-success/12 text-success"
                  : "border-warning/30 bg-warning/15 text-warning-foreground",
              )}
            >
              {url ? "Activa" : "Pendiente"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Se estampa automáticamente en el campo «Técnico responsable» de cada acta PDF que usted emita.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Protegida con confirmación de credenciales
        </span>
      </div>

      <div className="space-y-4 p-6">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando firma…</p>
        ) : url && !editar ? (
          <>
            <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-border bg-white p-4 shadow-inner">
              <img src={url} alt="Firma registrada" className="max-h-32 object-contain" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
              <span className="text-xs text-muted-foreground">
                Los cambios futuros de firma no alteran las actas que ya fueron emitidas.
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditar(true)}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Reemplazar firma
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmAccion("borrar")}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Eliminar
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <SignaturePad onChange={setFirma} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
              <span className="text-xs text-muted-foreground">
                {firma
                  ? "Firma lista. Al guardar se le solicitarán las credenciales de su cuenta."
                  : "Trace su firma digital en el recuadro superior."}
              </span>
              <div className="flex items-center gap-2">
                {url && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditar(false);
                      setFirma(null);
                    }}
                  >
                    Cancelar
                  </Button>
                )}
                <Button size="sm" disabled={!firma} onClick={() => setConfirmAccion("guardar")}>
                  <Lock className="mr-1.5 h-3.5 w-3.5" />
                  Guardar firma
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal de verificación de credenciales para guardar/reemplazar firma */}
      <DialogConfirmarCredenciales
        open={confirmAccion === "guardar"}
        onClose={() => setConfirmAccion(null)}
        emailCuenta={email}
        titulo={url ? "Confirmar reemplazo de firma digital" : "Confirmar registro de firma digital"}
        descripcion="Por seguridad documental, confirme sus credenciales antes de guardar su firma electrónica."
        resumen={
          firma ? (
            <div className="space-y-2">
              <div className="text-[11px] font-medium text-muted-foreground">
                Vista previa de la firma que se asociará a su cuenta:
              </div>
              <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-white p-2">
                <img src={firma} alt="Nueva firma" className="max-h-20 object-contain" />
              </div>
            </div>
          ) : undefined
        }
        textoConfirmar="Verificar y guardar firma"
        onConfirmar={confirmarGuardar}
      />

      {/* Modal de verificación de credenciales para eliminar firma */}
      <DialogConfirmarCredenciales
        open={confirmAccion === "borrar"}
        onClose={() => setConfirmAccion(null)}
        emailCuenta={email}
        titulo="Confirmar eliminación de firma digital"
        descripcion="Ingrese sus credenciales para autorizar la eliminación de su firma registrada."
        destructivo
        resumen={
          <div className="text-muted-foreground">
            Las nuevas actas que genere dejarán de incluir su firma automática hasta que vuelva a registrar una. Las actas emitidas anteriormente no se verán afectadas.
          </div>
        }
        textoConfirmar="Verificar y eliminar firma"
        onConfirmar={confirmarBorrar}
      />
    </section>
  );
}

function evaluarFortalezaPassword(p: string) {
  const checks = [
    { label: "Mínimo 8 caracteres", ok: p.length >= 8 },
    { label: "Letras mayúsculas y minúsculas", ok: /[a-z]/.test(p) && /[A-Z]/.test(p) },
    { label: "Al menos un número", ok: /\d/.test(p) },
    { label: "Símbolo o carácter especial", ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const nivel =
    p.length === 0
      ? { texto: "Sin definir", cls: "text-muted-foreground", bar: "bg-muted" }
      : score <= 1
        ? { texto: "Débil", cls: "text-destructive", bar: "bg-destructive" }
        : score === 2
          ? { texto: "Aceptable", cls: "text-warning-foreground", bar: "bg-warning" }
          : score === 3
            ? { texto: "Fuerte", cls: "text-primary", bar: "bg-primary" }
            : { texto: "Muy fuerte", cls: "text-success", bar: "bg-success" };
  return { checks, score, nivel };
}

function SeguridadPanel({
  userId,
  email,
  isStaff,
  rol,
}: {
  userId: string;
  email: string;
  isStaff: boolean;
  rol: string;
}) {
  const cambiarPwdFn = useServerFn(cambiarMiPassword);
  const [idleMin, setIdleMin] = useState<number>(() => leerMinutosInactividad());
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [mostrarPwd, setMostrarPwd] = useState(false);
  const [confirmPwdOpen, setConfirmPwdOpen] = useState(false);
  const [cerrandoOtras, setCerrandoOtras] = useState(false);

  const eventosSeguridad = useQuery({
    queryKey: ["mi-seguridad-auditoria", userId],
    enabled: isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("auditoria")
        .select("id, tabla, accion, detalle, created_at")
        .eq("user_id", userId)
        .in("accion", [
          "LOGIN",
          "LOGOUT",
          "CAMBIO_CLAVE",
          "CAMBIAR_NOMBRE",
          "REGISTRAR_FIRMA",
          "BORRAR_FIRMA",
          "REAUTH_FALLIDA",
          "REVOCAR_SESIONES",
          "FIRMA",
          "ENLACE",
          "PIN_BLOQUEADO",
        ])
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  function actualizarInactividad(minutos: number) {
    setIdleMin(minutos);
    localStorage.setItem(IDLE_STORAGE_KEY, String(minutos));
    registrarActividadGlobal();
    window.dispatchEvent(new CustomEvent(IDLE_CONFIG_EVENT));
    toast.success(
      minutos > 0
        ? `Cierre automático configurado en ${minutos} minuto(s) de inactividad`
        : "Cierre automático por inactividad desactivado en este navegador",
    );
  }

  function solicitarGuardarPassword(e: React.FormEvent) {
    e.preventDefault();
    if (p1 !== p2) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    if (p1.length < 8 || !/[a-zA-Z]/.test(p1) || !/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p1)) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres, incluyendo letras y números o símbolos.");
      return;
    }
    setConfirmPwdOpen(true);
  }

  async function confirmarGuardarPassword(credenciales: { email: string; passwordActual: string }) {
    if (p1 === credenciales.passwordActual) {
      return { error: "La nueva contraseña debe ser diferente a su contraseña actual." };
    }
    const r = await cambiarPwdFn({ data: { password: p1, credenciales } });
    if ("error" in r && r.error) {
      return { error: r.error };
    }
    toast.success("Identidad verificada y contraseña actualizada.");
    setP1("");
    setP2("");
    void eventosSeguridad.refetch();
  }

  async function cerrarOtrasSesiones() {
    setCerrandoOtras(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      await supabase.rpc("log_evento", {
        p_accion: "REVOCAR_SESIONES",
        p_detalle: "Cierre de sesiones activas en otros dispositivos",
      });
      toast.success("Se cerraron todas las sesiones abiertas en otros dispositivos.");
      void eventosSeguridad.refetch();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setCerrandoOtras(false);
    }
  }

  const evalPwd = evaluarFortalezaPassword(p1);
  const opcionesIdle = [
    { min: 2, label: "2 minutos", desc: "Prueba rápida de bloqueo (aviso a los 60 segundos)." },
    { min: 5, label: "5 minutos", desc: "Seguridad estricta para puestos compartidos." },
    { min: 15, label: "15 minutos", desc: "Alta seguridad recomendada para estaciones públicas." },
    { min: 30, label: "30 minutos", desc: "Equilibrio estándar para operación diaria." },
    { min: 60, label: "60 minutos", desc: "Sesión extendida para estaciones dedicadas." },
    { min: 0, label: "Desactivado", desc: "No cerrar sesión automáticamente por inactividad." },
  ];

  return (
    <div className="space-y-6">
      {/* Resumen de blindaje activo */}
      <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              <h2 className="text-sm font-semibold text-foreground">Estado de seguridad de la sesión</h2>
              <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                Protección activa
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Controles criptográficos y de acceso aplicados en tiempo real a su cuenta ({rol}).
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={cerrandoOtras}
            onClick={cerrarOtrasSesiones}
            className="text-xs"
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            {cerrandoOtras ? "Revocando…" : "Cerrar otros dispositivos"}
          </Button>
        </div>

        <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              titulo: "Verificación JWT + RLS",
              valor: "Activa en servidor",
              detalle: "Cada operación valida token activo, estado de cuenta y permisos.",
            },
            {
              titulo: "Aislamiento de datos",
              valor: "Multi-ecosistema",
              detalle: "Visibilidad restringida por propietario (owner_id) en base de datos.",
            },
            {
              titulo: "Protector de inactividad",
              valor: idleMin > 0 ? `${idleMin} minutos` : "Manual",
              detalle: "Cierre automático de sesión ante ausencia en el puesto de trabajo.",
            },
            {
              titulo: "Integridad documental",
              valor: "SHA-256 + PNG Magic",
              detalle: "Actas firmadas con huella digital inalterable (Ley 527 de 1999).",
            },
          ].map((item) => (
            <div
              key={item.titulo}
              className="rounded-xl border border-border/70 bg-background/50 p-3.5 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">{item.titulo}</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              </div>
              <div className="mt-1 font-display text-sm font-semibold text-foreground">{item.valor}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.detalle}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bloqueo automático por inactividad */}
      <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
        <div className="border-b border-border/70 bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Bloqueo automático por inactividad</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cierra su sesión automáticamente si el navegador permanece sin actividad durante el tiempo elegido (con aviso previo de 60 segundos).
          </p>
        </div>

        <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {opcionesIdle.map((op) => {
            const activo = idleMin === op.min;
            return (
              <button
                key={op.min}
                type="button"
                onClick={() => actualizarInactividad(op.min)}
                className={cn(
                  "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all",
                  activo
                    ? "border-primary bg-primary/6 shadow-2xs ring-1 ring-primary/30"
                    : "border-border/80 bg-background/40 hover:border-border hover:bg-muted/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{op.label}</span>
                  {activo && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{op.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Cambio de contraseña para personal de soporte/admin */}
      {isStaff && (
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-6 py-4">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Actualizar contraseña de acceso</h2>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Exige mínimo 8 caracteres combinando letras y números o símbolos. El cambio queda registrado en auditoría.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Protegido con confirmación de credenciales
            </span>
          </div>

          <form onSubmit={solicitarGuardarPassword} className="grid gap-5 p-6 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  type={mostrarPwd ? "text" : "password"}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={p1}
                  onChange={(e) => setP1(e.target.value)}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPwd((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  title={mostrarPwd ? "Ocultar" : "Mostrar"}
                >
                  {mostrarPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Confirmar nueva contraseña</Label>
              <Input
                type={mostrarPwd ? "text" : "password"}
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                placeholder="Repita la contraseña"
                value={p2}
                onChange={(e) => setP2(e.target.value)}
              />
            </div>

            <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/15 p-3.5 sm:col-span-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Fortaleza de la contraseña</span>
                <span className={cn("font-semibold", evalPwd.nivel.cls)}>{evalPwd.nivel.texto}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      evalPwd.score >= idx ? evalPwd.nivel.bar : "bg-muted",
                    )}
                  />
                ))}
              </div>
              <div className="grid gap-1.5 pt-1 sm:grid-cols-2">
                {evalPwd.checks.map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2
                      className={cn("h-3.5 w-3.5 shrink-0", c.ok ? "text-success" : "text-muted-foreground/40")}
                    />
                    <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4 sm:col-span-2">
              {p1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setP1("");
                    setP2("");
                  }}
                >
                  Limpiar
                </Button>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={p1.length < 8 || p1 !== p2}
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Actualizar contraseña
              </Button>
            </div>
          </form>

          <DialogConfirmarCredenciales
            open={confirmPwdOpen}
            onClose={() => setConfirmPwdOpen(false)}
            emailCuenta={email}
            titulo="Confirmar cambio de contraseña"
            descripcion="Por seguridad, ingrese su contraseña actual para autorizar el cambio de clave."
            resumen={
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fortaleza de la nueva clave:</span>
                <span className={cn("font-semibold", evalPwd.nivel.cls)}>{evalPwd.nivel.texto}</span>
              </div>
            }
            textoConfirmar="Verificar y cambiar contraseña"
            onConfirmar={confirmarGuardarPassword}
          />
        </section>
      )}

      {/* Actividad reciente de seguridad de la cuenta */}
      {isStaff && (
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
          <div className="border-b border-border/70 bg-muted/20 px-6 py-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Actividad reciente de seguridad en su cuenta</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Últimos eventos de autenticación, firmas y credenciales registrados en la bitácora inmutable.
            </p>
          </div>

          <div className="divide-y divide-border/60">
            {eventosSeguridad.isLoading ? (
              <p className="p-6 text-xs text-muted-foreground">Consultando bitácora de seguridad…</p>
            ) : !eventosSeguridad.data?.length ? (
              <p className="p-6 text-xs text-muted-foreground">Sin eventos de seguridad recientes registrados.</p>
            ) : (
              eventosSeguridad.data.map((ev) => {
                const esAlerta = ev.accion === "REAUTH_FALLIDA" || ev.accion === "PIN_BLOQUEADO";
                return (
                  <div key={ev.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold",
                          esAlerta
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-primary/25 bg-primary/10 text-primary",
                        )}
                      >
                        {ev.accion}
                      </span>
                      <span className="text-foreground">{ev.detalle ?? ev.tabla}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {fmtFecha(ev.created_at, true)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
