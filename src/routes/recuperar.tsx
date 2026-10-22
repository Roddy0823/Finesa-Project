import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/lib/theme";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/recuperar")({
  head: () => ({
    meta: [
      { title: "Recuperar contraseña — Finesa" },
      { name: "description", content: "Solicite un enlace para restablecer su contraseña." },
      { property: "og:title", content: "Recuperar contraseña — Finesa" },
      { property: "og:description", content: "Solicite un enlace para restablecer su contraseña." },
    ],
  }),
  component: Recuperar,
});

function Recuperar() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/restablecer` });
    setLoading(false);
    setEnviado(true);
  }
  return (
    <div className="login-bg relative flex min-h-screen items-center justify-center p-4">
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="login-card w-full max-w-[390px] space-y-5 rounded-2xl border border-border/80 bg-card/85 p-7 backdrop-blur-xl">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Recuperar contraseña</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Ingrese su correo corporativo para recibir un enlace de restablecimiento.
          </p>
        </div>
        {enviado ? (
          <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-xs text-foreground">
            <div className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="h-4 w-4" />
              <span>Enlace enviado</span>
            </div>
            <p className="mt-1.5 text-muted-foreground">
              Si el correo está registrado, recibirá instrucciones para crear una nueva contraseña.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Correo electrónico</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="nombre@finesa.com.co"
                  className="h-10 pl-9"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" className="h-10 w-full" disabled={loading}>
              Enviar enlace de recuperación
            </Button>
          </form>
        )}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Volver al inicio de sesión</span>
        </Link>
      </div>
    </div>
  );
}
