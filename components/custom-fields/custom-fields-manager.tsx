"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FieldType = "text" | "number" | "date" | "select";

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
};

/**
 * Workspace custom fields manager (admin-only mutations enforced server-side).
 * Define typed fields here; they appear on every issue's detail panel.
 */
export function CustomFieldsManager() {
  const defs = useQuery(api.customFields.listDefs);
  const createDef = useMutation(api.customFields.createDef);
  const removeDef = useMutation(api.customFields.removeDef);

  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const options =
      type === "select"
        ? optionsText
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;
    if (type === "select" && (!options || options.length === 0)) {
      toast.error("Add at least one option for a select field");
      return;
    }
    setBusy(true);
    try {
      await createDef({ name: trimmed, type, options });
      setName("");
      setOptionsText("");
      setType("text");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create field"
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = (fieldId: Id<"customFieldDefs">) => {
    removeDef({ fieldId }).catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete field"
      );
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-medium">Custom fields</h2>
        <p className="text-xs text-muted-foreground">
          Typed fields that appear on every issue in this workspace.
        </p>
      </div>

      {/* Existing fields */}
      <div className="flex flex-col gap-2">
        {defs === undefined ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : defs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No custom fields yet.</p>
        ) : (
          defs.map((def) => (
            <div
              key={def._id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm">{def.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {TYPE_LABELS[def.type]}
                  {def.type === "select" && def.options
                    ? ` · ${def.options.join(", ")}`
                    : ""}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() => remove(def._id)}
                aria-label={`Delete ${def.name}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Create new field */}
      <div className="flex flex-col gap-3 rounded-md border p-3">
        <span className="text-xs font-medium text-muted-foreground">
          New field
        </span>
        <div className="flex gap-2">
          <Input
            placeholder="Field name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm"
          />
          <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABELS) as FieldType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {type === "select" && (
          <Input
            placeholder="Options, comma-separated"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            className="h-8 text-sm"
          />
        )}
        <Button
          size="sm"
          className="self-start"
          disabled={busy || !name.trim()}
          onClick={() => void create()}
        >
          <Plus className="size-4" />
          Add field
        </Button>
      </div>
    </div>
  );
}
