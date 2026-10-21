import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { firmarConToken, obtenerActaPorToken } from "@/lib/firmas.functions";
import { SignaturePad } from "@/components/SignaturePad";
import { ActaResumen } from "@/components/ActaResumen";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { errMsg } from "@/lib/constantes";

export const Route = createFileRoute("/firmar/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Firma de acta — Finesa" },
      { name: "description", content: "Firme digitalmente su acta de entrega o devolución de equipos." },
      { property: "og:title", content: "Firma de acta — Finesa" },
      { property: "og:description", content: "Firme digitalmente su acta de entrega o devolución de equipos." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FirmarRemoto,
});

function FirmarRemoto() {
  const { token } = Route.useParams();
  const obtener = useServerFn(obtenerActaPorToken);
  const firmar = useServerFn(firmarConToken);
  const q = useQuery({ queryKey: ["firma", token], queryFn: () => obtener({ data: { token } }), retry: false });
  const [firma, setFirma] = useState<string | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!firma) return;
    setEnviando(true);
    setError(null);
    try {
      await firmar({ data: { token, firma } });
      setHecho(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary px-4 py-3 text-primary-foreground">
        <span className="font-display font-extrabold tracking-tight">FINESA</span>
        <span className="ml-2 text-sm text-sidebar-primary">Firma de acta</span>
      </header>
      <main className="mx-auto max-w-xl space-y-5 p-4 pb-16">
        {q.isLoading && <p className="py-12 text-center text-muted-foreground">Cargando acta…</p>}
        {q.isError && <Aviso texto="El enlace no es válido." />}
        {q.data?.error && !hecho && <Aviso texto={q.data.error} />}
        {hecho && (
          <div className="rounded-md border border-success/30 bg-success/10 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <h1 className="mt-3 text-xl font-bold">Acta firmada</h1>
            <p className="mt-1 text-sm text-muted-foreground">Su firma quedó registrada con fecha, hora e IP. Ya puede cerrar esta página.</p>
          </div>
        )}
        {q.data?.acta && !hecho && (
          <>
            <ActaResumen a={q.data.acta} />
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Su firma</h2>
              <SignaturePad onChange={setFirma} />
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={acepto} onCheckedChange={(v) => setAcepto(v === true)} className="mt-0.5" />
                <span>Declaro que la información es correcta y acepto firmar electrónicamente esta acta. Se registrará la fecha, hora y dirección IP de este dispositivo.</span>
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="h-12 w-full text-base" disabled={!firma || !acepto || enviando} onClick={enviar}>
                {enviando ? "Registrando firma…" : "Firmar acta"}
              </Button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/15 p-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-warning-foreground" />
      <p className="mt-3 font-medium">{texto}</p>
      <p className="mt-1 text-sm text-muted-foreground">Solicite un nuevo enlace al área de soporte.</p>
    </div>
  );
}
