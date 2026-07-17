import { Plug } from "lucide-react";
import type { AppCommand } from "@/components/commands/registry";

/** Command-palette entry for the integrations settings page (Telegram, etc.). */
export const integrationsCommands: AppCommand[] = [
  {
    id: "go-integrations-settings",
    label: "Go to integrations settings",
    group: "Settings",
    icon: Plug,
    run: ({ push, orgSlug }) => push(`/${orgSlug}/settings/integrations`),
  },
];
