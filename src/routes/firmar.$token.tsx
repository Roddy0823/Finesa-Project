import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { firmarConToken, obtenerActaPorToken } from "@/lib/firmas.functions";
import { detectarIpNavegador } from "@/lib/detectarIp";
import { SignaturePad } from "@/components/SignaturePad";
import { ActaResumen } from "@/components/ActaResumen";
import { ThemeToggle } from "@/lib/theme";
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
      const ip = await detectarIpNavegador();
      await firmar({ data: { token, firma, ip } });
      setHecho(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 flex h-13 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            F
          </div>
          <span className="font-display text-sm font-bold tracking-tight">FINESA</span>
          <span className="text-xs text-muted-foreground">· Firma digital de acta</span>
        </div>
        <ThemeToggle compact />
      </header>
      <main className="mx-auto max-w-xl space-y-5 p-4 pb-16 sm:pt-6">
        {q.isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Cargando acta…</p>}
        {q.isError && <Aviso texto="El enlace no es válido." />}
        {q.data?.error && !hecho && <Aviso texto={q.data.error} />}
        {hecho && (
          <div className="rounded-xl border border-success/30 bg-success/10 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <h1 className="mt-3 text-xl font-bold">Acta firmada</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Su firma quedó registrada con fecha, hora e IP. Ya puede cerrar esta página.
            </p>
          </div>
        )}
        {q.data?.acta && !hecho && (
          <>
            <ActaResumen a={q.data.acta} />
            <section className="space-y-3 rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
              <h2 className="text-base font-semibold">Su firma electrónica</h2>
              <SignaturePad onChange={setFirma} />
              <label className="flex items-start gap-3 text-xs text-muted-foreground sm:text-sm">
                <Checkbox checked={acepto} onCheckedChange={(v) => setAcepto(v === true)} className="mt-0.5" />
                <span>
                  Declaro que la información es correcta y acepto firmar electrónicamente esta acta. Se registrará la
                  fecha, hora y dirección IP de este dispositivo.
                </span>
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="h-11 w-full text-sm font-semibold" disabled={!firma || !acepto || enviando} onClick={enviar}>
                {enviando ? "Registrando firma…" : "Confirmar y firmar acta"}
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
    <div className="rounded-xl border border-warning/40 bg-warning/15 p-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-warning-foreground" />
      <p className="mt-3 font-medium">{texto}</p>
      <p className="mt-1 text-sm text-muted-foreground">Solicite un nuevo enlace al área de soporte.</p>
    </div>
  );
}
