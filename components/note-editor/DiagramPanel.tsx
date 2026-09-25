import { forwardRef } from "react";
import { MermaidDiagram } from "@/components/MermaidDiagram";

const DIAGRAM_TEMPLATES: { label: string; code: string }[] = [
  {
    label: "Flowchart",
    code: "flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Do this]\n  B -->|No| D[Do that]",
  },
  {
    label: "Mind map",
    code: "mindmap\n  root((Topic))\n    Idea 1\n      Detail A\n      Detail B\n    Idea 2\n    Idea 3",
  },
  {
    label: "Timeline",
    code: "timeline\n  title A Sequence of Events\n  Step 1 : First thing happens\n  Step 2 : Then this\n  Step 3 : Finally this",
  },
  {
    label: "Cycle",
    code: "flowchart LR\n  A[Stage 1] --> B[Stage 2]\n  B --> C[Stage 3]\n  C --> D[Stage 4]\n  D --> A",
  },
  {
    label: "Org chart",
    code: "flowchart TD\n  Head[Head Teacher]\n  Head --> A[Deputy A]\n  Head --> B[Deputy B]\n  A --> A1[Teacher]\n  B --> B1[Teacher]",
  },
  {
    label: "Sequence diagram",
    code: "sequenceDiagram\n  participant Teacher\n  participant Student\n  Teacher->>Student: Asks a question\n  Student-->>Teacher: Gives an answer",
  },
];

type DiagramPanelProps = {
  diagramTitle: string;
  onDiagramTitleChange: (value: string) => void;
  diagramCode: string;
  onDiagramCodeChange: (value: string) => void;
  isSaving: boolean;
  onSave: () => void;
  onClose: () => void;
};

export const DiagramPanel = forwardRef<HTMLElement, DiagramPanelProps>(function DiagramPanel(
  {
    diagramTitle,
    onDiagramTitleChange,
    diagramCode,
    onDiagramCodeChange,
    isSaving,
    onSave,
    onClose,
  },
  ref
) {
  return (
    <section ref={ref} className="mb-4 rounded-xl border border-rule bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">Generate Mermaid diagram</h3>
        <button type="button" onClick={onClose} title="Close this panel" className="text-xs text-ink-soft hover:underline">
          Close
        </button>
      </div>
      <input
        type="text"
        value={diagramTitle}
        onChange={(e) => onDiagramTitleChange(e.target.value)}
        placeholder="Diagram title (optional)"
        title="Display title for this diagram"
        className="mb-2 w-full rounded-lg border border-rule bg-white p-2 text-sm text-ink outline-none focus-visible:border-marigold"
      />
      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
          Start from a template
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DIAGRAM_TEMPLATES.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => onDiagramCodeChange(template.code)}
              title={`Start from the ${template.label} template`}
              className="rounded-full border border-rule px-2.5 py-1 text-xs text-ink hover:border-marigold hover:bg-paper"
            >
              {template.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
            Mermaid code
          </p>
          <textarea
            value={diagramCode}
            onChange={(e) => onDiagramCodeChange(e.target.value)}
            rows={10}
            title="Mermaid diagram syntax"
            className="w-full rounded-lg border border-rule bg-white p-3 font-mono text-sm text-ink outline-none focus-visible:border-marigold"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Preview</p>
          <div className="h-full min-h-[10rem] rounded-lg border border-rule bg-paper p-2">
            <MermaidDiagram code={diagramCode} title={diagramTitle || undefined} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          title="Insert this diagram into the note"
          className="rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Insert diagram into note"}
        </button>
      </div>
    </section>
  );
});
