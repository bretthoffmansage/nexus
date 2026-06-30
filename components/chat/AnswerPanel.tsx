import type { NexusAnswer } from "@/lib/types/presentation";
import { PartialResultBanner } from "@/components/ui/PartialResultBanner";

type AnswerPanelProps = {
  answer?: NexusAnswer | null;
  emptyLabel?: string;
};

export function AnswerPanel({
  answer,
  emptyLabel = "Answers will appear here after Nexus task connectivity is enabled.",
}: AnswerPanelProps) {
  if (!answer?.text) {
    return <p className="nexus-empty-copy">{emptyLabel}</p>;
  }

  return (
    <div className="nexus-answer-panel">
      {answer.partial ? <PartialResultBanner /> : null}
      <div className="nexus-answer-body">{answer.text}</div>
    </div>
  );
}
