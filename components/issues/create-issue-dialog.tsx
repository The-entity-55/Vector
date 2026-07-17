"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  IssuePriority,
  IssueStatus,
  PRIORITIES,
  STATUSES,
} from "@/components/shared/issue-meta";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";

export function CreateIssueDialog({
  open,
  onOpenChange,
  defaultTeamId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTeamId?: Id<"teams">;
}) {
  const params = useParams<{ orgSlug?: string }>();
  const router = useRouter();
  const teams = useQuery(api.teams.list, open ? {} : "skip");
  const members = useQuery(api.organizations.listMembers, open ? {} : "skip");
  const createIssue = useMutation(api.issues.create);
  const generateDescription = useAction(api.agent.triage.generateDescription);

  const [selectedTeamId, setSelectedTeamId] = useState<
    Id<"teams"> | undefined
  >(undefined);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<IssueStatus>("todo");
  const [priority, setPriority] = useState<IssuePriority>("none");
  const [assigneeId, setAssigneeId] = useState<Id<"users"> | undefined>();
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);

  // Fall back to the default/first team without needing an effect.
  const teamId = selectedTeamId ?? defaultTeamId ?? teams?.[0]?._id;

  const generateTaskDescription = async () => {
    if (!title.trim() || generatingDescription) {
      return;
    }
    setGeneratingDescription(true);
    try {
      const teamName = teams?.find((team) => team._id === teamId)?.name;
      const assigneeName = members?.find(
        (member) => member.userId === assigneeId
      )?.name;
      const context = [
        teamName && `Team: ${teamName}`,
        `Status: ${status}`,
        priority !== "none" && `Priority: ${priority}`,
        assigneeName && `Assignee: ${assigneeName}`,
        dueDate && `Due date: ${dueDate}`,
      ]
        .filter(Boolean)
        .join("; ");
      const result = await generateDescription({ title, context });
      if (result.ok) {
        setDescription(result.description);
        toast.success("Description generated");
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not generate a description"
      );
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleSubmit = async () => {
    if (!teamId || !title.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      const issueId = await createIssue({
        teamId,
        title,
        description: description.trim() || undefined,
        status,
        priority,
        assigneeId,
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).getTime() : undefined,
      });
      toast.success("Task created");
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("none");
      setAssigneeId(undefined);
      setDueDate("");
      if (params.orgSlug) {
        router.push(`/${params.orgSlug}/issue/${issueId}`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create issue"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium text-muted-foreground">
            New task
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            placeholder="Task name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                void handleSubmit();
              }
            }}
            className="border-none px-0 text-lg font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="relative">
            <Textarea
            placeholder="Add description…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
              className="min-h-20 resize-none border-none px-0 pb-10 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!title.trim() || generatingDescription || submitting}
              onClick={() => void generateTaskDescription()}
              className="absolute bottom-1 right-0 h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            >
              <Sparkles className="size-3.5" />
              {generatingDescription ? "Generating…" : "Generate Description"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={teamId ?? ""}
              onValueChange={(value) => setSelectedTeamId(value as Id<"teams">)}
            >
              <SelectTrigger size="sm" className="w-auto gap-1.5">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                {teams?.map((team) => (
                  <SelectItem key={team._id} value={team._id}>
                    {team.key} · {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={assigneeId ?? "unassigned"}
              onValueChange={(value) =>
                setAssigneeId(
                  value === "unassigned" ? undefined : (value as Id<"users">)
                )
              }
            >
              <SelectTrigger size="sm" className="w-auto gap-1.5">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members?.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-label="Due date"
              className="h-8 w-auto text-xs"
            />
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as IssueStatus)}
            >
              <SelectTrigger size="sm" className="w-auto gap-1.5">
                <StatusIcon status={status} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as IssuePriority)}
            >
              <SelectTrigger size="sm" className="w-auto gap-1.5">
                <PriorityIcon priority={priority} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!title.trim() || !teamId || submitting}
            onClick={() => void handleSubmit()}
          >
            Create task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
