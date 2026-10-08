import { BugIcon, LightbulbIcon, TargetIcon } from "../icons/objects.tsx";
import { FileTextIcon } from "../icons/files.tsx";
import { PlanIcon } from "../PlanIcon.tsx";
import { NotebookPenIcon } from "../icons/pencil.tsx";
import { SearchCheckIcon } from "../icons/actions.tsx";
import { UsersIcon } from "../icons/people.tsx";

export interface NoteTemplate {
  id: string;
  label: string;
  hint: string;
  icon: typeof FileTextIcon;
  title: string;
  body: string;
}

const sections = (...headings: Array<[heading: string, start: string]>) =>
  headings.map(([heading, start]) => `## ${heading}\n${start}`).join("\n\n");

export function noteTemplates(): NoteTemplate[] {
  return [
    { id: "blank", label: "Blank note", hint: "Start from an empty page", icon: NotebookPenIcon, title: "", body: "" },
    {
      id: "brief",
      label: "Task brief",
      hint: "Tell the agent what to build and when it's done",
      icon: TargetIcon,
      title: "Task brief",
      body: sections(["Goal", ""], ["Context", ""], ["Constraints", "- "], ["Done when", "- [ ] "]),
    },
    {
      id: "bug",
      label: "Bug report",
      hint: "What broke, what you expected, how to repeat it",
      icon: BugIcon,
      title: "Bug report",
      body: sections(["What happened", ""], ["What I expected", ""], ["Steps to reproduce", "1. "], ["Where", "- "]),
    },
    {
      id: "idea",
      label: "Feature idea",
      hint: "The problem, the idea, the open questions",
      icon: LightbulbIcon,
      title: "Feature idea",
      body: sections(["Problem", ""], ["Idea", ""], ["Open questions", "- "]),
    },
    {
      id: "todo",
      label: "To-do list",
      hint: "A checklist you can tick off",
      icon: PlanIcon,
      title: "To do",
      body: "- [ ] ",
    },
    {
      id: "review",
      label: "Review notes",
      hint: "Things to check and change in a diff",
      icon: SearchCheckIcon,
      title: "Review notes",
      body: sections(["Check", "- [ ] "], ["Concerns", "- "], ["Suggestions", "- "]),
    },
    {
      id: "meeting",
      label: "Meeting notes",
      hint: "Who was there, what was decided, who does what",
      icon: UsersIcon,
      title: "Meeting notes",
      body: sections(["Attendees", "- "], ["Notes", ""], ["Decisions", "- "], ["Action items", "- [ ] "]),
    },
  ];
}
