import { CheckCircle2, ListChecks } from "lucide-react";
import type { AppCommand } from "@/components/commands/registry";

/**
 * Asana-style feature command-palette entries: cross-team My Tasks and the
 * workspace custom-fields settings.
 */
export const asanaFeatureCommands: AppCommand[] = [
  {
    id: "go-my-tasks",
    label: "Go to My Tasks",
    group: "Navigation",
    icon: CheckCircle2,
    run: ({ push, orgSlug }) => push(`/${orgSlug}/my-tasks`),
  },
  {
    id: "go-custom-fields",
    label: "Manage custom fields",
    group: "Navigation",
    icon: ListChecks,
    run: ({ push, orgSlug }) => push(`/${orgSlug}/settings/custom-fields`),
  },
];
