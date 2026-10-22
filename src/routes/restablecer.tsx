import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/lib/theme";
import { toast } from "sonner";

export const Route = createFileRoute("/restablecer")({
  head: () => ({
    meta: [
      { title: "Definir contraseña — Finesa" },
      { name: "description", content: "Cree una nueva contraseña para su cuenta." },
      { property: "og:title", content: "Definir contraseña — Finesa" },
      { property: "og:description", content: "Cree una nueva contraseña para su cuenta." },
    ],
  }),
  component: Restablecer,
});

function Restablecer() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((ev, session) => {
      if (session && (ev === "PASSWORD_RECOVERY" || ev === "SIGNED_IN" || ev === "INITIAL_SESSION")) setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => s.session && setReady(true));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (p1.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres.");
    if (p1 !== p2) return toast.error("Las contraseñas no coinciden.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setLoading(false);
    if (error) return toast.error(error.message);
    await supabase.rpc("log_evento", { p_accion: "CAMBIO_CLAVE", p_detalle: "Contraseña definida mediante enlace" });
    toast.success("Contraseña actualizada");
    nav({ to: "/panel", replace: true });
  }

  return (
    <div className="login-bg relative flex min-h-screen items-center justify-center p-4">
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <form
        onSubmit={submit}
        className="login-card w-full max-w-[390px] space-y-5 rounded-2xl border border-border/80 bg-card/85 p-7 backdrop-blur-xl"
      >
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Definir nueva contraseña</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {ready ? "Elija una contraseña segura de mínimo 8 caracteres." : "Validando enlace… Si no avanza, solicite un nuevo enlace."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p1" className="text-xs">Nueva contraseña</Label>
          <Input id="p1" type="password" value={p1} onChange={(e) => setP1(e.target.value)} disabled={!ready} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p2" className="text-xs">Confirmar contraseña</Label>
          <Input id="p2" type="password" value={p2} onChange={(e) => setP2(e.target.value)} disabled={!ready} />
        </div>
        <Button className="h-10 w-full" disabled={!ready || loading}>
          Guardar contraseña
        </Button>
      </form>
    </div>
  );
}
