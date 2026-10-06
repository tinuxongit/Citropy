import { ChevronRight, MessageCircleQuestion } from "lucide-react";
import type { QuestionPart } from "../../../../shared/questions.ts";

export function QuestionHistory({ part }: { part: QuestionPart }) {
  if (part.status === "pending") return <div className="question-history-status"><MessageCircleQuestion size={14} />Waiting for your answer</div>;
  return <details className="question-history">
    <summary><ChevronRight size={12} /><MessageCircleQuestion size={12} />{part.status === "answered" ? "Answers shared" : "Questions skipped"}</summary>
    <dl>{part.questions.map(question => <div key={question.id}><dt>{question.question}</dt><dd>{part.answers?.[question.id]?.join(", ") ?? "Skipped"}</dd></div>)}</dl>
  </details>;
}
