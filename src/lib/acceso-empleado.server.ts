import { createHmac } from "crypto";

export function normalizarCedula(c: string) {
  return c.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

export function emailEmpleado(cedula: string) {
  return `${normalizarCedula(cedula).toLowerCase()}@empleados.finesa.local`;
}

// Contraseña interna derivada del PIN con un secreto del servidor: no se puede
// adivinar desde el navegador ni saltarse el bloqueo por intentos fallidos.
export function passwordEmpleado(cedula: string, pin: string) {
  const secreto = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  return createHmac("sha256", secreto).update(`${normalizarCedula(cedula)}:${pin}`).digest("base64url");
}

export function generarPin() {
  const n = (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 10000;
  return n.toString().padStart(4, "0");
}
