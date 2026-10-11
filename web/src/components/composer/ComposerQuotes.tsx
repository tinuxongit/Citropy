import { CloseIcon } from "../icons/marks.tsx";
import { QuoteIcon } from "../icons/editing.tsx";

export function ComposerQuotes({ quotes, onRemove }: { quotes: string[]; onRemove: (index: number) => void }) {
  return (
    <div className="attachments">
      {quotes.map((quote, index) => (
        <div className="attachment composer-quote" key={`${index}:${quote}`}>
          <QuoteIcon size={16} className="attachment-file-icon" aria-hidden="true" />
          <p title={quote}>{quote}</p>
          <button
            type="button"
            className="icon-btn attachment-remove"
            aria-label="Remove quote"
            onClick={() => onRemove(index)}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
