/**
 * Plain-text / Markdown formatters that turn Vector's report data into compact
 * Telegram messages. Kept separate from bot.ts so both the mutation and the
 * actions can share them without pulling in Telegram API code.
 */

import { Doc } from "../_generated/dataModel";

type ProjectStatus = {
  name: string;
  status: string;
  leadName: string | null;
  targetDate: string | null;
  totalIssues: number;
  doneIssues: number;
  inProgressIssues: number;
};

type IssueSummary = {
  identifier: string;
  title: string;
};

type StandupEntry = {
  memberName: string;
  inProgress: IssueSummary[];
  completed: IssueSummary[];
  created: IssueSummary[];
};

type Standup = {
  sinceHours: number;
  entries: StandupEntry[];
};

/** Extra system-prompt line giving the agent org/user/date context. */
export function actorContextText(orgName: string, userName: string): string {
  return `Workspace: ${orgName}. Requesting user: ${userName}. Today's date: ${new Date().toISOString().slice(0, 10)}.`;
}

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  planned: "Planned",
  in_progress: "In Progress",
  paused: "Paused",
  completed: "Completed",
  canceled: "Canceled",
};

export function formatHelp(): string {
  return [
    "*Vector — what I can do*",
    "",
    "Just chat with me in plain language about your workspace — projects, issues, cycles, standups — and I can also create or update issues.",
    "",
    "Quick commands:",
    "• /projects — status of every project",
    "• /standup — activity in the last 24 hours",
    "• /help — this message",
  ].join("\n");
}

export function formatUnlinked(botUsername?: string): string {
  const suffix = botUsername ? ` (@${botUsername})` : "";
  return [
    `👋 This chat isn't linked to a Vector account yet${suffix}.`,
    "",
    "Open Vector → Settings → Integrations and tap *Connect my Telegram* to get a secure link.",
  ].join("\n");
}

export function formatProjects(projects: ProjectStatus[]): string {
  if (projects.length === 0) {
    return "No projects in this workspace yet.";
  }
  const lines = ["*Projects*", ""];
  for (const project of projects) {
    const label = STATUS_LABELS[project.status] ?? project.status;
    const progress = `${project.doneIssues}/${project.totalIssues} done`;
    const wip =
      project.inProgressIssues > 0
        ? `, ${project.inProgressIssues} in progress`
        : "";
    const lead = project.leadName ? ` · lead ${project.leadName}` : "";
    const target = project.targetDate ? ` · due ${project.targetDate}` : "";
    lines.push(`• *${project.name}* — ${label} (${progress}${wip})${lead}${target}`);
  }
  return lines.join("\n");
}

export function formatStandup(standup: Standup): string {
  if (standup.entries.length === 0) {
    return `No activity in the last ${standup.sinceHours} hours.`;
  }
  const lines = [`*Standup — last ${standup.sinceHours}h*`, ""];
  for (const entry of standup.entries) {
    lines.push(`*${entry.memberName}*`);
    if (entry.completed.length) {
      lines.push(`  ✅ ${entry.completed.map(issueRef).join(", ")}`);
    }
    if (entry.inProgress.length) {
      lines.push(`  🔨 ${entry.inProgress.map(issueRef).join(", ")}`);
    }
    if (entry.created.length) {
      lines.push(`  ➕ ${entry.created.map(issueRef).join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function issueRef(issue: IssueSummary): string {
  return `${issue.identifier} ${truncate(issue.title, 40)}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Message sent to a user when an issue is assigned to them. */
export function formatAssignment(
  issue: Doc<"issues">,
  teamKey: string,
  actorName: string
): string {
  return `🔔 *${teamKey}-${issue.number}* was assigned to you by ${actorName}\n${truncate(issue.title, 80)}`;
}

/** Workspace broadcast sent when any new issue is created. */
export function formatNewIssue(
  issue: Doc<"issues">,
  teamKey: string,
  creatorName: string,
  assigneeName: string | null
): string {
  const who = assigneeName ? `assigned to ${assigneeName}` : "unassigned";
  return `🆕 *${teamKey}-${issue.number}* created by ${creatorName} · ${who}\n${truncate(issue.title, 80)}`;
}

// ── Scheduled digest ────────────────────────────────────────────────────────

export type DigestSlot = "morning" | "afternoon" | "evening";

type DigestData = {
  windowHours: number;
  created: IssueSummary[];
  completed: IssueSummary[];
  updated: IssueSummary[];
  commented: IssueSummary[];
  createdCount: number;
  completedCount: number;
  updatedCount: number;
  commentedCount: number;
};

const SLOT_GREETING: Record<DigestSlot, string> = {
  morning: "🌅 *Good morning — overnight recap*",
  afternoon: "☀️ *Afternoon update*",
  evening: "🌆 *Evening wrap-up*",
};

/**
 * Compact workspace digest for a slot. Returns null when nothing changed in the
 * window so the caller can skip sending an empty ping.
 */
export function formatDigest(slot: DigestSlot, data: DigestData): string | null {
  const total =
    data.createdCount +
    data.completedCount +
    data.updatedCount +
    data.commentedCount;
  if (total === 0) {
    return null;
  }

  const lines = [SLOT_GREETING[slot], ""];
  const section = (
    emoji: string,
    label: string,
    count: number,
    items: IssueSummary[]
  ) => {
    if (count === 0) return;
    lines.push(`${emoji} *${label}* (${count})`);
    for (const item of items) {
      lines.push(`  • ${issueRef(item)}`);
    }
    if (count > items.length) {
      lines.push(`  …and ${count - items.length} more`);
    }
    lines.push("");
  };

  section("✅", "Completed", data.completedCount, data.completed);
  section("🆕", "Created", data.createdCount, data.created);
  section("✏️", "Updated", data.updatedCount, data.updated);
  section("💬", "New comments", data.commentedCount, data.commented);

  return lines.join("\n").trim();
}

// ── Due-date reminders ────────────────────────────────────────────────────────

type DueSoonIssue = {
  identifier: string;
  title: string;
  dueDate: number;
};

/**
 * Personal "due soon" nudge sent to an assignee (or broadcast for unassigned
 * issues). Produces a compact list of issues due within the next 36 hours.
 */
export function formatDueDateReminder(issues: DueSoonIssue[]): string {
  const now = Date.now();
  const lines = ["⏰ *Due soon — please complete these tasks*", ""];

  for (const issue of issues) {
    const msLeft = issue.dueDate - now;
    const hoursLeft = Math.round(msLeft / (60 * 60 * 1000));
    const dueLabel =
      hoursLeft <= 24
        ? `due in ~${hoursLeft}h`
        : `due ${new Date(issue.dueDate).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}`;

    lines.push(
      `• *${issue.identifier}* ${truncate(issue.title, 60)} _(${dueLabel})_`
    );
  }

  lines.push("");
  lines.push("Mark them done in Vector when complete ✅");

  return lines.join("\n").trim();
}

