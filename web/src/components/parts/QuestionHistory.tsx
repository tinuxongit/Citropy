import { ChevronRightIcon } from "../icons/chevrons.tsx";
import { QuestionMessageIcon } from "../icons/messages.tsx";
import type { QuestionPart } from "../../../../shared/questions.ts";
import { useDisclosure } from "../../lib/use-disclosure.ts";

export function QuestionHistory({ part }: { part: QuestionPart }) {
  const [open, setOpen] = useDisclosure(part.id, "question");
  if (part.status === "pending") return <div className="question-history-status"><QuestionMessageIcon size={14} />Waiting for your answer</div>;
  const asked = part.questions.length === 1 ? part.questions[0]!.question : `${part.questions.length} questions`;
  return <details className="question-history" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <ChevronRightIcon size={12} /><QuestionMessageIcon size={12} />
      <span className="question-history-asked">{asked}</span>
      <span className="question-history-state">{part.status === "answered" ? "Answered" : "Skipped"}</span>
    </summary>
    <dl>{part.questions.map(question => <div key={question.id}><dt>{question.question}</dt><dd>{part.answers?.[question.id]?.join(", ") ?? "Skipped"}</dd></div>)}</dl>
  </details>;
}
