"use client";

import { CustomFieldsManager } from "@/components/custom-fields/custom-fields-manager";

/**
 * Workspace custom fields settings: define typed fields (text / number / date /
 * select) that appear on every issue's detail panel. Mutations are admin-only
 * (enforced by orgAdminMutation server-side).
 */
export default function CustomFieldsSettingsPage() {
  return <CustomFieldsManager />;
}
