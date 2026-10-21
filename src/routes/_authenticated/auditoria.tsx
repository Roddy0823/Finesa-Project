import { createFileRoute } from "@tanstack/react-router";
import { useMe } from "@/lib/me";
import { AuditoriaPanel } from "@/components/AuditoriaPanel";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoría — Finesa" }, { name: "description", content: "Registro de auditoría del sistema." }] }),
  component: Auditoria,
});

function Auditoria() {
  const { data: me } = useMe();
  if (!me?.isAdmin) return <p className="text-muted-foreground">La auditoría es solo para el administrador.</p>;
  return <AuditoriaPanel />;
}
