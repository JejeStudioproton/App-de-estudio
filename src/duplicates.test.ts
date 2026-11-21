import { describe, expect, it } from "vitest";
import { draftDuplicates, findDuplicate, titleKey } from "./duplicates";
import { concept } from "./test-helpers";

const existing = [
  concept({ id: "c1", title: "Fotosíntesis" }),
  concept({ id: "c2", title: "Ciclo de Krebs" }),
  concept({ id: "c3", title: "Mitosis", subjectId: "s2" }),
];

describe("conceptos duplicados", () => {
  it("compara títulos sin tildes, mayúsculas, signos ni espacios de más", () => {
    expect(titleKey("  ¿Fotosíntesis?  ")).toBe("fotosintesis");
    expect(titleKey("Ciclo   de KREBS.")).toBe("ciclo de krebs");
    expect(titleKey("¿?")).toBe("");
  });
  it("encuentra el concepto con el mismo título en la misma materia", () => {
    expect(findDuplicate("fotosintesis", "s1", existing)?.id).toBe("c1");
    expect(findDuplicate("Fotosíntesis oxigénica", "s1", existing)).toBeUndefined();
    // En otra materia no es un duplicado.
    expect(findDuplicate("Mitosis", "s1", existing)).toBeUndefined();
    expect(findDuplicate("Mitosis", "s2", existing)?.id).toBe("c3");
  });
  it("al editar no se considera duplicado de sí mismo, y un título vacío no duplica nada", () => {
    expect(findDuplicate("Fotosíntesis", "s1", existing, "c1")).toBeUndefined();
    expect(findDuplicate("   ", "s1", existing)).toBeUndefined();
    expect(findDuplicate("Fotosíntesis", "", existing)).toBeUndefined();
  });
  it("marca los borradores que ya existen en la materia y los repetidos dentro de la lista", () => {
    const drafts = [
      { title: "Fotosíntesis", checked: true },
      { title: "Meiosis", checked: true },
      { title: "meiosis", checked: true },
      { title: "", checked: true },
      { title: "Mitosis", checked: true },
    ];
    expect(draftDuplicates(drafts, "s1", existing)).toEqual(["existing", undefined, "repeated", undefined, undefined]);
    expect(draftDuplicates(drafts, "s2", existing)[4]).toBe("existing");
  });
  it("un borrador desmarcado no convierte en repetido al siguiente", () => {
    const drafts = [
      { title: "Meiosis", checked: false },
      { title: "Meiosis", checked: true },
      { title: "Meiosis", checked: true },
    ];
    expect(draftDuplicates(drafts, "s1", existing)).toEqual([undefined, undefined, "repeated"]);
  });
  it("con una materia nueva como destino solo cuentan los repetidos de la lista", () => {
    expect(draftDuplicates([{ title: "Fotosíntesis", checked: true }], "", existing)).toEqual([undefined]);
  });
});
