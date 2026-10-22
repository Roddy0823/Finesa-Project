import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emailEmpleado, generarPin, normalizarCedula, passwordEmpleado } from "@/lib/acceso-empleado.server";

describe("acceso-empleado.server", () => {
  const secretoOriginal = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  afterEach(() => {
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = secretoOriginal;
  });

  describe("normalizarCedula", () => {
    it("elimina puntos, espacios y guiones", () => {
      expect(normalizarCedula(" 1.023.456-78 ")).toBe("102345678");
    });

    it("conserva letras (pasaportes / cédulas de extranjería) en mayúscula", () => {
      expect(normalizarCedula("ce-ab 123")).toBe("CEAB123");
    });

    it("devuelve cadena vacía si no hay caracteres válidos", () => {
      expect(normalizarCedula("--. ")).toBe("");
    });
  });

  describe("emailEmpleado", () => {
    it("genera el correo interno a partir de la cédula normalizada", () => {
      expect(emailEmpleado("1.234.567")).toBe("1234567@empleados.finesa.local");
    });

    it("usa minúsculas para documentos alfanuméricos", () => {
      expect(emailEmpleado("PA-998877X")).toBe("pa998877x@empleados.finesa.local");
    });
  });

  describe("passwordEmpleado (HMAC del PIN)", () => {
    it("coincide con HMAC-SHA256(secreto, 'cedula:pin') en base64url", () => {
      const esperado = createHmac("sha256", "service-role-secret-de-pruebas").update("1234567:0420").digest("base64url");
      expect(passwordEmpleado("1234567", "0420")).toBe(esperado);
    });

    it("es determinista e independiente del formato de la cédula", () => {
      expect(passwordEmpleado("1.234.567", "1111")).toBe(passwordEmpleado("1234567", "1111"));
    });

    it("cambia con el PIN y con la cédula", () => {
      const base = passwordEmpleado("1234567", "1111");
      expect(passwordEmpleado("1234567", "1112")).not.toBe(base);
      expect(passwordEmpleado("1234568", "1111")).not.toBe(base);
    });

    it("depende del secreto del servidor (no es reproducible desde el navegador)", () => {
      const conSecretoA = passwordEmpleado("1234567", "1111");
      process.env["SUPABASE_SERVICE_ROLE_KEY"] = "otro-secreto";
      expect(passwordEmpleado("1234567", "1111")).not.toBe(conSecretoA);
    });

    it("nunca contiene el PIN en claro y es seguro para URL", () => {
      const pwd = passwordEmpleado("1234567", "9876");
      expect(pwd).not.toContain("9876");
      expect(pwd).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
  });

  describe("generarPin", () => {
    it("siempre devuelve exactamente 4 dígitos", () => {
      for (let i = 0; i < 500; i++) expect(generarPin()).toMatch(/^\d{4}$/);
    });

    it("rellena con ceros a la izquierda", () => {
      vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
        (arr as unknown as Uint32Array)[0] = 7;
        return arr;
      });
      expect(generarPin()).toBe("0007");
    });

    it("reduce el valor aleatorio al rango 0000-9999", () => {
      vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
        (arr as unknown as Uint32Array)[0] = 4_294_967_295;
        return arr;
      });
      expect(generarPin()).toBe("7295");
    });

    it("usa el generador criptográfico del runtime", () => {
      const spy = vi.spyOn(crypto, "getRandomValues");
      generarPin();
      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
