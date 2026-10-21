import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <h1 className="text-2xl font-bold">Definir nueva contraseña</h1>
        {!ready && <p className="text-sm text-muted-foreground">Validando enlace… Si no avanza, solicite un nuevo enlace.</p>}
        <div className="space-y-2">
          <Label htmlFor="p1">Nueva contraseña</Label>
          <Input id="p1" type="password" value={p1} onChange={(e) => setP1(e.target.value)} disabled={!ready} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p2">Confirmar contraseña</Label>
          <Input id="p2" type="password" value={p2} onChange={(e) => setP2(e.target.value)} disabled={!ready} />
        </div>
        <Button className="w-full" disabled={!ready || loading}>Guardar contraseña</Button>
      </form>
    </div>
  );
}
