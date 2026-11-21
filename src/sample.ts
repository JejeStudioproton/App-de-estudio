import type { Concept, Subject } from "./domain";
import { createConcept, createSubject } from "./engine";

export const SAMPLE_SUBJECT_NAME = "Cómo estudiar mejor (ejemplo)";

type SampleCard = { title: string; prompt: string; answer: string; applicationPrompt: string; applicationAnswer: string; importance?: 1 | 2 | 3 };

/**
 * Seis conceptos de ejemplo sobre técnicas de estudio. Sirven para probar la app en un minuto
 * y como modelo de tarjeta: una pregunta concreta, una respuesta breve y un caso de aplicación.
 */
const CARDS: SampleCard[] = [
  {
    title: "Práctica de recuperación",
    prompt: "¿Qué es la práctica de recuperación y por qué suele funcionar mejor que releer?",
    answer:
      "Consiste en intentar sacar la información de la memoria (responder preguntas, explicar sin mirar) en lugar de volver a leerla. El esfuerzo de recordar refuerza el recuerdo y además te muestra lo que todavía no sabes. Releer resulta más cómodo, pero suele retenerse menos a largo plazo.",
    applicationPrompt: "Has leído un tema de 20 páginas y el examen es dentro de una semana. ¿Cómo lo repasas usando práctica de recuperación?",
    applicationAnswer:
      "Cierras los apuntes y escribes o dices en voz alta lo que recuerdas de cada apartado. Después compruebas con los apuntes qué faltó o estaba mal, y otro día repites lo que falló. También sirve convertir los apartados en preguntas y responderlas sin mirar.",
    importance: 3,
  },
  {
    title: "Práctica espaciada",
    prompt: "¿Qué es la práctica espaciada y en qué se diferencia de estudiarlo todo de golpe?",
    answer:
      "Es repartir el estudio de un mismo contenido en varias sesiones separadas por días, en lugar de concentrarlo en una sola. Con el mismo tiempo total se suele recordar durante más tiempo. Estudiar de golpe puede bastar para el día siguiente, pero se olvida antes.",
    applicationPrompt: "Tienes 3 horas en total para un tema y el examen es dentro de 10 días. ¿Cómo las repartes?",
    applicationAnswer:
      "En varias sesiones cortas (por ejemplo, cuatro o cinco de unos 40 minutos) repartidas a lo largo de los 10 días, con la última uno o dos días antes del examen, en vez de una sola sesión de 3 horas la víspera.",
    importance: 3,
  },
  {
    title: "Curva del olvido",
    prompt: "¿Qué describe la curva del olvido?",
    answer:
      "Que, si no se repasa, lo aprendido se olvida deprisa al principio y cada vez más despacio después. Un repaso hecho a tiempo frena el olvido posterior, y por eso los repasos pueden ir separándose cada vez más.",
    applicationPrompt: "Hoy aprendes 30 palabras nuevas de un idioma. ¿Cuándo haces el primer repaso, y por qué no dentro de un mes?",
    applicationAnswer:
      "Pronto: mañana o pasado mañana. La mayor parte del olvido ocurre en los primeros días, así que dentro de un mes habría que volver a aprender casi todo. Los repasos siguientes ya pueden separarse más.",
  },
  {
    title: "Ilusión de saber",
    prompt: "¿Por qué releer y subrayar pueden hacerte creer que sabes algo que en realidad no sabes?",
    answer:
      "Porque al releer, el texto resulta familiar y fácil de seguir, y esa facilidad se confunde con saberlo. Reconocer algo cuando lo tienes delante no es lo mismo que poder recordarlo o explicarlo sin apoyo, que es lo que pide un examen.",
    applicationPrompt: "¿Cómo compruebas si de verdad sabes un tema antes del examen?",
    applicationAnswer:
      "Poniéndote a prueba sin el material delante: responder preguntas, explicarle el tema a alguien o escribirlo de memoria, y comparar después con los apuntes.",
  },
  {
    title: "Práctica intercalada",
    prompt: "¿Qué es intercalar la práctica y cuándo ayuda?",
    answer:
      "Es mezclar en una misma sesión ejercicios de tipos o temas distintos, en lugar de hacer seguidos todos los de un tipo. Obliga a decidir qué método corresponde a cada problema, que es lo que hay que hacer en un examen. Ayuda sobre todo con problemas parecidos que se confunden entre sí, aunque mientras se practica parece más difícil.",
    applicationPrompt: "Tienes 12 problemas: 4 de porcentajes, 4 de proporciones y 4 de ecuaciones. ¿En qué orden los haces?",
    applicationAnswer:
      "Mezclados, por ejemplo alternando uno de cada tipo, y no en tres bloques. Así en cada problema tienes que reconocer primero de qué tipo es.",
  },
  {
    title: "Autoexplicación",
    prompt: "¿En qué consiste la autoexplicación?",
    answer:
      "En explicarte con tus propias palabras por qué algo es así o por qué se da cada paso de un procedimiento, relacionándolo con lo que ya sabes. Obliga a comprender en lugar de memorizar frases, y deja a la vista los puntos que no entiendes.",
    applicationPrompt: "Estás siguiendo un problema resuelto del libro. ¿Cómo lo estudias usando autoexplicación?",
    applicationAnswer:
      "Te detienes en cada paso para decir por qué se hace y qué regla se aplica, antes de leer la explicación del libro. Si no puedes justificar un paso, ahí está lo que tienes que repasar.",
  },
];

/** Materia de ejemplo lista para añadir al estado. Se puede borrar como cualquier otra. */
export function buildSample(): { subject: Subject; concepts: Concept[] } {
  const subject = createSubject(SAMPLE_SUBJECT_NAME, "Materia de ejemplo para probar FORMA. Puedes borrarla cuando quieras.");
  const concepts = CARDS.map((card) =>
    createConcept({
      subjectId: subject.id,
      title: card.title,
      prompt: card.prompt,
      answer: card.answer,
      explanation: card.answer,
      applicationPrompt: card.applicationPrompt,
      applicationAnswer: card.applicationAnswer,
      importance: card.importance ?? 2,
      tags: ["ejemplo"],
    }),
  );
  return { subject, concepts };
}
