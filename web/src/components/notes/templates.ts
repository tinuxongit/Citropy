import { Bug, FileText, Lightbulb, ListChecks, NotebookPen, SearchCheck, Target, Users } from "lucide-react";

export interface NoteTemplate {
  id: string;
  label: string;
  hint: string;
  icon: typeof FileText;
  title: string;
  body: string;
}

const sections = (...headings: Array<[heading: string, start: string]>) =>
  headings.map(([heading, start]) => `## ${heading}\n${start}`).join("\n\n");

export function noteTemplates(): NoteTemplate[] {
  return [
    { id: "blank", label: "Blank note", hint: "Start from an empty page", icon: NotebookPen, title: "", body: "" },
    {
      id: "brief",
      label: "Task brief",
      hint: "Tell the agent what to build and when it's done",
      icon: Target,
      title: "Task brief",
      body: sections(["Goal", ""], ["Context", ""], ["Constraints", "- "], ["Done when", "- [ ] "]),
    },
    {
      id: "bug",
      label: "Bug report",
      hint: "What broke, what you expected, how to repeat it",
      icon: Bug,
      title: "Bug report",
      body: sections(["What happened", ""], ["What I expected", ""], ["Steps to reproduce", "1. "], ["Where", "- "]),
    },
    {
      id: "idea",
      label: "Feature idea",
      hint: "The problem, the idea, the open questions",
      icon: Lightbulb,
      title: "Feature idea",
      body: sections(["Problem", ""], ["Idea", ""], ["Open questions", "- "]),
    },
    {
      id: "todo",
      label: "To-do list",
      hint: "A checklist you can tick off",
      icon: ListChecks,
      title: "To do",
      body: "- [ ] ",
    },
    {
      id: "review",
      label: "Review notes",
      hint: "Things to check and change in a diff",
      icon: SearchCheck,
      title: "Review notes",
      body: sections(["Check", "- [ ] "], ["Concerns", "- "], ["Suggestions", "- "]),
    },
    {
      id: "meeting",
      label: "Meeting notes",
      hint: "Who was there, what was decided, who does what",
      icon: Users,
      title: "Meeting notes",
      body: sections(["Attendees", "- "], ["Notes", ""], ["Decisions", "- "], ["Action items", "- [ ] "]),
    },
  ];
}
