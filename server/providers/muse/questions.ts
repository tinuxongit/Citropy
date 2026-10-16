import type { UserInputAnswer, UserInputQuestion } from "@muse-code/sdk/dist/src/msp.js";
import type { UserQuestion } from "../../../shared/questions.ts";

const MAX_FREE_TEXT = 500;

export function userQuestions(questions: UserInputQuestion[]): UserQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    ...(question.header ? { header: question.header } : {}),
    question: question.question,
    options: question.options.map((option) => ({
      label: option.label,
      ...(option.description ? { description: option.description } : {}),
    })),
    multiple: question.selection.mode === "multiple",
  }));
}

export function museAnswers(
  questions: UserInputQuestion[],
  answers: Record<string, string[]>,
): UserInputAnswer[] {
  return questions.map((question) => {
    const values = answers[question.id] ?? [];
    const selected = values.filter((value) =>
      question.options.some((option) => option.label === value),
    );
    const freeText = values.filter((value) => !selected.includes(value)).join("\n");
    if (freeText.length > MAX_FREE_TEXT)
      throw new Error(`Muse Code accepts at most ${MAX_FREE_TEXT} characters of typed answer.`);
    return {
      questionId: question.id,
      ...(selected.length
        ? question.selection.mode === "multiple"
          ? { selectedLabels: selected }
          : { selectedLabel: selected[0]! }
        : {}),
      ...(freeText ? (selected.length ? { note: freeText } : { freeText }) : {}),
    };
  });
}
