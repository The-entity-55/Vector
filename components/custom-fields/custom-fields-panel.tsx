"use client";

import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IssueDetailSlotProps } from "@/components/issue-detail/slots";

/**
 * Custom fields panel — renders the workspace's custom field definitions on an
 * issue and lets the user fill them in. Values are stored as strings and
 * interpreted by each field's type (text / number / date / select).
 */
export function CustomFieldsPanel({ issue }: IssueDetailSlotProps) {
  const defs = useQuery(api.customFields.listDefs);
  const values = useQuery(api.customFields.listForIssue, {
    issueId: issue._id,
  });
  const setValue = useMutation(api.customFields.setValue);

  if (defs === undefined || values === undefined) {
    return null;
  }
  if (defs.length === 0) {
    return null;
  }

  const valueByField = new Map(values.map((v) => [v.fieldId, v.value]));

  const save = (fieldId: Id<"customFieldDefs">, value: string) => {
    setValue({ issueId: issue._id, fieldId, value }).catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update field"
      );
    });
  };

  return (
    <section className="mb-5">
      <div className="flex h-6 items-center">
        <h3 className="text-xs font-medium text-muted-foreground">
          Custom fields
        </h3>
      </div>
      <div className="flex flex-col gap-2 pt-1">
        {defs.map((def) => {
          const current = valueByField.get(def._id) ?? "";
          return (
            <div
              key={def._id}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate text-xs text-muted-foreground">
                {def.name}
              </span>
              {def.type === "select" ? (
                <Select
                  value={current || "none"}
                  onValueChange={(value) =>
                    save(def._id, value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-36 gap-1.5 border-none shadow-none"
                  >
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">—</span>
                    </SelectItem>
                    {(def.options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <input
                  type={
                    def.type === "number"
                      ? "number"
                      : def.type === "date"
                        ? "date"
                        : "text"
                  }
                  defaultValue={current}
                  onBlur={(event) => {
                    if (event.target.value !== current) {
                      save(def._id, event.target.value);
                    }
                  }}
                  placeholder="—"
                  className="h-8 w-36 rounded-md bg-transparent px-2 text-right text-xs outline-none ring-ring focus-visible:ring-1"
                  aria-label={def.name}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
