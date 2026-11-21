import { describe, expect, it } from "vitest";
import { MAX_RELEARN, RELEARN_GAP, buildQueue, canRelearn, pendingRelearn, requeueAfterFail } from "./session";

describe("cola de la sesión", () => {
  it("crea una tarjeta por concepto, sin repetidos ni identificadores vacíos", () => {
    expect(buildQueue(["a", "b", "a", ""])).toEqual([
      { conceptId: "a", attempt: 0 },
      { conceptId: "b", attempt: 0 },
    ]);
  });

  it("un fallo vuelve a aparecer unas tarjetas después, no inmediatamente", () => {
    const q = buildQueue(["a", "b", "c", "d", "e", "f"]);
    const next = requeueAfterFail(q, 0);
    expect(next.map((x) => x.conceptId)).toEqual(["a", "b", "c", "d", "a", "e", "f"]);
    expect(next[1 + RELEARN_GAP]).toEqual({ conceptId: "a", attempt: 1 });
    // La lista original no cambia.
    expect(q).toHaveLength(6);
  });

  it("si quedan pocas tarjetas, la repetición va al final", () => {
    const q = buildQueue(["a", "b"]);
    expect(requeueAfterFail(q, 1).map((x) => `${x.conceptId}${x.attempt}`)).toEqual(["a0", "b0", "b1"]);
    expect(requeueAfterFail(buildQueue(["a"]), 0).map((x) => `${x.conceptId}${x.attempt}`)).toEqual(["a0", "a1"]);
  });

  it("la repetición recuerda el método con el que se falló, también en la segunda vuelta", () => {
    const first = requeueAfterFail(buildQueue(["a"]), 0, "application");
    expect(first[1]).toEqual({ conceptId: "a", attempt: 1, method: "application" });
    expect(requeueAfterFail(first, 1)[2]).toEqual({ conceptId: "a", attempt: 2, method: "application" });
  });

  it("limita las repeticiones por concepto para que la sesión termine", () => {
    let q = buildQueue(["a"]);
    for (let i = 0; i < 10; i++) q = requeueAfterFail(q, q.length - 1);
    expect(q).toHaveLength(1 + MAX_RELEARN);
    expect(canRelearn(q, q.length - 1)).toBe(false);
    expect(requeueAfterFail(q, q.length - 1)).toBe(q);
  });

  it("cuenta las repeticiones que quedan por delante", () => {
    const q = requeueAfterFail(requeueAfterFail(buildQueue(["a", "b", "c"]), 0), 1);
    expect(pendingRelearn(q, 1)).toBe(2);
    expect(pendingRelearn(q, q.length - 1)).toBe(0);
  });

  it("ignora posiciones fuera de la cola", () => {
    const q = buildQueue(["a"]);
    expect(requeueAfterFail(q, 5)).toBe(q);
    expect(canRelearn(q, -1)).toBe(false);
  });
});
