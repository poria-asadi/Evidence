'use client';

import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const HELP = [
  {
    title: 'Write your review protocol',
    summary: 'This protocol guides every later screening decision.',
    steps: [
      'Give the review a clear title and describe the question or main purpose.',
      'Write the inclusion and exclusion criteria that each record must be checked against.',
      'Add population, intervention, comparison, and outcomes if they help define the question.',
      'Select Save & continue. You can return to edit the protocol later.',
    ],
    tip: 'The four required fields are title, purpose, inclusion, and exclusion criteria.',
  },
  {
    title: 'Import and deduplicate references',
    summary: 'Bring your search exports into one review library.',
    steps: [
      'Choose RIS, PubMed NBIB, CSV, or bibliographic TXT files to import.',
      'Check the import summary and warnings to confirm the records were recognized.',
      'Open Duplicates and decide whether each uncertain pair is a duplicate or two distinct records.',
      'Download the retained RIS file if needed, then continue to title and abstract screening.',
    ],
    tip: 'Each file can be up to 30 MB. Resolve uncertain duplicates before screening.',
  },
  {
    title: 'Screen titles and abstracts',
    summary: 'Run the AI detectives, then make the researcher decisions.',
    steps: [
      'Confirm that imports and duplicate review are complete.',
      'Choose how many records to screen, confirm the AI allowance, and start the run.',
      'Wait for the run to finish, then inspect each detective’s decision and reasoning in Results.',
      'Make or revise researcher decisions. Ask Sherlock Holmes for an optional opinion on conflicts.',
      'Download the screening workbook or continue to full-text screening.',
    ],
    tip: 'AI suggestions do not become your final researcher decision automatically.',
  },
  {
    title: 'Screen full-text articles',
    summary: 'Check the complete PDFs against your declared criteria.',
    steps: [
      'Use the saved title and abstract criteria or enter full-text inclusion and exclusion criteria, then save them.',
      'Upload the Article\'s PDF for each included article.',
      'Confirm the AI allowance and start full-text screening.',
      'Review the detective results and any articles marked as needing attention. Replace unreadable PDFs if needed.',
      'Record your researcher decisions, then continue to data extraction.',
    ],
    tip: 'Each PDF can be up to 25 MB.',
  },
  {
    title: 'Extract study data',
    summary: 'Build the final sheet and inspect every extracted value.',
    steps: [
      'Name the columns you want, with optional guidance, and save the sheet; or upload a CSV or XLSX sheet.',
      'Prepare the columns if prompted, then choose pending or previously extracted articles.',
      'Run Inspector Gadget and Murdoch, then wait for the selected articles to finish.',
      'Open the results to review values marked NR or needing researcher review.',
      'Download the completed extraction sheet.',
    ],
    tip: 'Uploaded sheets can be up to 5 MB. Re-extraction replaces the prior values for those articles.',
  },
] as const;

export function StepHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className="shrink-0 bg-card"
    >
      <CircleHelp className="size-4" /> How to use this step
    </Button>
  );
}

export default function WorkspaceStepHelp({
  step,
  open,
  onOpenChange,
}: {
  step: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const help = HELP[Math.max(0, Math.min(HELP.length - 1, step - 1))];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85dvh,44rem)] overflow-y-auto p-6 sm:max-w-xl">
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
            Step {step} of 5 · Help
          </p>
          <DialogTitle className="text-xl leading-snug">
            {help.title}
          </DialogTitle>
          <DialogDescription className="leading-6">
            {help.summary}
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {help.steps.map((instruction, index) => (
            <li key={instruction} className="flex gap-3 text-sm leading-6">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                {index + 1}
              </span>
              <span>{instruction}</span>
            </li>
          ))}
        </ol>
        <p className="rounded-xl bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
          <strong className="text-foreground">Tip:</strong> {help.tip}
        </p>
      </DialogContent>
    </Dialog>
  );
}
