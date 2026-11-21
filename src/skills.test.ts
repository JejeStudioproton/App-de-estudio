import { describe, expect, it } from "vitest";
import { resolveReviewSkill, skillForMethod } from "./skills";

describe("skillForMethod", () => {
  it("atribuye el recuerdo y las preguntas cerradas a memoria", () => {
    expect(skillForMethod("active-recall")).toBe("memory");
    expect(skillForMethod("multiple-choice")).toBe("memory");
  });

  it("atribuye explicar y estudiar ejemplos a comprensión", () => {
    expect(skillForMethod("explanation")).toBe("understanding");
    expect(skillForMethod("worked-example")).toBe("understanding");
  });

  it("atribuye la práctica aplicada a aplicación", () => {
    expect(skillForMethod("application")).toBe("application");
  });
});

describe("resolveReviewSkill", () => {
  it("conserva la habilidad objetivo si se mantiene el método recomendado", () => {
    // El plan puede recomendar un ejemplo resuelto para practicar aplicación.
    expect(resolveReviewSkill("application", "worked-example", "worked-example")).toBe("application");
  });

  it("usa la habilidad del método elegido cuando el estudiante lo cambia", () => {
    expect(resolveReviewSkill("memory", "active-recall", "application")).toBe("application");
    expect(resolveReviewSkill("memory", "active-recall", "explanation")).toBe("understanding");
    expect(resolveReviewSkill("application", "application", "multiple-choice")).toBe("memory");
  });

  it("no depende de que exista un plan previo", () => {
    expect(resolveReviewSkill(undefined, undefined, "active-recall")).toBe("memory");
  });
});
