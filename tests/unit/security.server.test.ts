import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, validarPngBase64, validarPoliticaPassword } from "@/lib/security.server";
import { crearPng, pngDataUrl } from "../helpers/png";

describe("security.server", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkRateLimit", () => {
    it("permite hasta el máximo y luego bloquea con tiempo de espera", () => {
      const key = `rl-test-${Math.random()}`;
      for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
      const r = checkRateLimit(key, 3, 60_000);
      expect(r.allowed).toBe(false);
      expect(r.retryAfterSec).toBeGreaterThan(0);
      expect(r.retryAfterSec).toBeLessThanOrEqual(60);
    });

    it("reinicia el contador al vencer la ventana", () => {
      vi.useFakeTimers();
      const key = `rl-window-${Math.random()}`;
      checkRateLimit(key, 1, 1_000);
      expect(checkRateLimit(key, 1, 1_000).allowed).toBe(false);
      vi.advanceTimersByTime(1_001);
      expect(checkRateLimit(key, 1, 1_000).allowed).toBe(true);
    });

    it("aísla los contadores por clave (IP + acción)", () => {
      const a = `rl-a-${Math.random()}`;
      const b = `rl-b-${Math.random()}`;
      checkRateLimit(a, 1, 60_000);
      expect(checkRateLimit(a, 1, 60_000).allowed).toBe(false);
      expect(checkRateLimit(b, 1, 60_000).allowed).toBe(true);
    });
  });

  describe("validarPngBase64", () => {
    it("acepta un PNG legítimo y devuelve sus bytes", () => {
      const png = crearPng();
      const r = validarPngBase64(pngDataUrl(png));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.bytes).toEqual(png);
    });

    it("rechaza tipos MIME distintos de image/png", () => {
      const r = validarPngBase64(pngDataUrl(crearPng()).replace("image/png", "image/svg+xml"));
      expect(r).toEqual({ ok: false, error: expect.stringContaining("se requiere imagen PNG") });
    });

    it("rechaza firmas vacías o demasiado cortas", () => {
      const r = validarPngBase64(pngDataUrl(crearPng(1, 1)));
      expect(r).toEqual({ ok: false, error: expect.stringContaining("vacío o es demasiado corto") });
    });

    it("rechaza contenido que no es PNG aunque declare image/png (magic bytes)", () => {
      const falso = new Uint8Array(1_000).fill(0x41);
      const r = validarPngBase64(pngDataUrl(falso));
      expect(r).toEqual({ ok: false, error: expect.stringContaining("no corresponde a una imagen PNG") });
    });

    it("rechaza cabecera IHDR alterada", () => {
      const png = crearPng();
      png[12] = 0x00;
      const r = validarPngBase64(pngDataUrl(png));
      expect(r).toEqual({ ok: false, error: expect.stringContaining("IHDR") });
    });

    it("rechaza imágenes de más de 2 MB", () => {
      const grande = new Uint8Array(2_000_001);
      grande.set(crearPng().subarray(0, 16));
      const r = validarPngBase64(pngDataUrl(grande));
      expect(r).toEqual({ ok: false, error: expect.stringContaining("2 MB") });
    });

    it("rechaza intentos de inyección en el data URL", () => {
      const r = validarPngBase64(`${pngDataUrl(crearPng())}"><script>alert(1)</script>`);
      expect(r.ok).toBe(false);
    });
  });

  describe("validarPoliticaPassword", () => {
    it.each([
      ["corta1", "al menos 8 caracteres"],
      ["a".repeat(70) + "123", "72 caracteres"],
      ["solamenteletras", "letra y un número o símbolo"],
      ["12345678", "letra y un número o símbolo"],
    ])("rechaza %s", (pwd, mensaje) => {
      expect(validarPoliticaPassword(pwd)).toContain(mensaje);
    });

    it.each(["Finesa2026", "clave-segura!", "abcdefg1"])("acepta %s", (pwd) => {
      expect(validarPoliticaPassword(pwd)).toBeNull();
    });
  });
});
