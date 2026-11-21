import { describe, expect, it } from "vitest";
import { BACKUP_EVERY_DAYS, BACKUP_MIN_CONCEPTS, BACKUP_MIN_REVIEWS, BACKUP_SNOOZE_DAYS, backupReminder, snoozeUntil } from "./backup";
import { concept, ev } from "./test-helpers";
import { initialState, normalizeState } from "./engine";

const NOW = Date.parse("2026-05-20T10:00:00Z");
const DAY = 86_400_000;
const concepts = (n: number) => Array.from({ length: n }, (_, i) => concept({ id: `c${i}`, title: `C${i}` }));
const reviews = (n: number) => Array.from({ length: n }, () => ev({ rating: 2 }));
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

describe("recordatorio de copia de seguridad", () => {
  it("no avisa con poco trabajo guardado", () => {
    expect(backupReminder({ concepts: concepts(BACKUP_MIN_CONCEPTS - 1), reviews: reviews(BACKUP_MIN_REVIEWS - 1) }, NOW)).toBeUndefined();
  });
  it("avisa si nunca se ha guardado una copia y ya hay bastantes conceptos o intentos", () => {
    expect(backupReminder({ concepts: concepts(BACKUP_MIN_CONCEPTS), reviews: [] }, NOW)).toEqual({});
    expect(backupReminder({ concepts: concepts(1), reviews: reviews(BACKUP_MIN_REVIEWS) }, NOW)).toEqual({});
  });
  it("avisa cuando la última copia es antigua, con los días que han pasado", () => {
    const base = { concepts: concepts(BACKUP_MIN_CONCEPTS), reviews: [] };
    expect(backupReminder({ ...base, lastBackupAt: iso(BACKUP_EVERY_DAYS - 1) }, NOW)).toBeUndefined();
    expect(backupReminder({ ...base, lastBackupAt: iso(BACKUP_EVERY_DAYS) }, NOW)).toEqual({ daysSince: BACKUP_EVERY_DAYS });
    expect(backupReminder({ ...base, lastBackupAt: iso(40) }, NOW)).toEqual({ daysSince: 40 });
  });
  it("«Ahora no» lo calla unos días y después vuelve", () => {
    const base = { concepts: concepts(BACKUP_MIN_CONCEPTS), reviews: [], backupSnoozedUntil: snoozeUntil(NOW) };
    expect(backupReminder(base, NOW + DAY)).toBeUndefined();
    expect(backupReminder(base, NOW + BACKUP_SNOOZE_DAYS * DAY + 1)).toEqual({});
  });
  it("una fecha inservible se trata como si no hubiera copia", () => {
    expect(backupReminder({ concepts: concepts(BACKUP_MIN_CONCEPTS), reviews: [], lastBackupAt: "ayer" }, NOW)).toEqual({});
  });
});

describe("datos guardados de la 0.6", () => {
  it("la fecha de la última copia sobrevive a guardar y cargar, y una fecha inservible se descarta", () => {
    const base = { ...initialState(), lastBackupAt: iso(3), backupSnoozedUntil: iso(-1) };
    const again = normalizeState(JSON.parse(JSON.stringify(base)));
    expect(again.lastBackupAt).toBe(base.lastBackupAt);
    expect(again.backupSnoozedUntil).toBe(base.backupSnoozedUntil);
    expect(normalizeState({ ...base, lastBackupAt: "nunca", backupSnoozedUntil: 5 }).lastBackupAt).toBeUndefined();
    expect(normalizeState({ ...base, lastBackupAt: "nunca", backupSnoozedUntil: 5 }).backupSnoozedUntil).toBeUndefined();
  });
  it("«Reducir animaciones» solo queda activo si se guardó como activo", () => {
    expect(normalizeState({ ...initialState(), settings: { reducedMotion: true } }).settings.reducedMotion).toBe(true);
    expect(normalizeState({ ...initialState(), settings: { reducedMotion: "sí" } }).settings.reducedMotion).toBe(false);
    expect(normalizeState({ ...initialState(), settings: {} }).settings.reducedMotion).toBe(false);
  });
  it("las opciones de tipo test guardadas se limpian al cargar", () => {
    const raw = { ...initialState(), concepts: [{ ...concept({ id: "c1", title: "A", answer: "x" }), choices: ["x", 3, "y"], correctChoice: 0 }, { ...concept({ id: "c2", title: "B" }), choices: "mal", correctChoice: 1 }] };
    const [a, b] = normalizeState(JSON.parse(JSON.stringify(raw))).concepts;
    expect(a.choices).toEqual(["x", "y"]);
    expect(a.correctChoice).toBe(0);
    expect(b.choices).toBeUndefined();
    expect(b.correctChoice).toBeUndefined();
  });
});
