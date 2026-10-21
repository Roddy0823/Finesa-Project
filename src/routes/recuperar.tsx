import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
        {enviado ? (
          <p className="text-sm text-muted-foreground">Si el correo está registrado, recibirá un enlace para crear una nueva contraseña.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>Enviar enlace</Button>
          </form>
        )}
        <Link to="/" className="block text-sm text-muted-foreground hover:underline">Volver a ingresar</Link>
      </div>
    </div>
  );
}
