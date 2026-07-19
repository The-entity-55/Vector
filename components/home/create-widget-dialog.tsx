"use client";

import {
  LayoutDashboard,
  BarChart3,
  Activity,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { type WidgetType, ALL_WIDGET_TYPES, WIDGET_META } from "./use-home-widgets";

const WIDGET_ICONS: Record<WidgetType, LucideIcon> = {
  dashboard: LayoutDashboard,
  reporting: BarChart3,
  activities: Activity,
};

interface CreateWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: WidgetType) => void;
  disabledTypes: WidgetType[];
}

export function CreateWidgetDialog({
  open,
  onOpenChange,
  onSelect,
  disabledTypes,
}: CreateWidgetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Widget</DialogTitle>
          <DialogDescription>
            Choose a widget to add to your home screen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-1">
          {ALL_WIDGET_TYPES.map((type) => {
            const Icon = WIDGET_ICONS[type];
            const meta = WIDGET_META[type];
            const disabled = disabledTypes.includes(type);

            return (
              <button
                key={type}
                disabled={disabled}
                onClick={() => {
                  onSelect(type);
                  onOpenChange(false);
                }}
                className={cn(
                  "group flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                  disabled
                    ? "cursor-not-allowed border-border/50 opacity-40"
                    : "cursor-pointer border-border hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm",
                )}
              >
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-md transition-colors",
                    disabled
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary group-hover:bg-primary/15",
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {meta.label}
                    {disabled && (
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        Already added
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {meta.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
