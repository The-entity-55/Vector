import { v } from "convex/values";
import { orgAdminMutation, orgMutation, orgQuery } from "./lib/customFunctions";
import { getOrgIssue } from "./issues";
import { customFieldTypeValidator } from "./schema";

/**
 * Custom fields — Asana-style typed fields defined per workspace and filled in
 * per issue. Definitions live in `customFieldDefs`; values in
 * `issueCustomFieldValues` (one row per issue+field). Values are stored as
 * strings and interpreted by the definition's `type`.
 */

const fieldDefShape = {
  _id: v.id("customFieldDefs"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  type: customFieldTypeValidator,
  options: v.optional(v.array(v.string())),
  sortOrder: v.number(),
};

const fieldValueShape = {
  _id: v.id("issueCustomFieldValues"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  issueId: v.id("issues"),
  fieldId: v.id("customFieldDefs"),
  value: v.string(),
};

export const listDefs = orgQuery({
  args: {},
  returns: v.array(v.object(fieldDefShape)),
  handler: async (ctx) => {
    const defs = await ctx.db
      .query("customFieldDefs")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .collect();
    return defs.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const createDef = orgAdminMutation({
  args: {
    name: v.string(),
    type: customFieldTypeValidator,
    options: v.optional(v.array(v.string())),
  },
  returns: v.id("customFieldDefs"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Field name is required");
    }
    if (args.type === "select" && (!args.options || args.options.length === 0)) {
      throw new Error("Select fields require at least one option");
    }
    const existing = await ctx.db
      .query("customFieldDefs")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .collect();
    const maxOrder = existing.reduce((m, d) => Math.max(m, d.sortOrder), 0);
    return await ctx.db.insert("customFieldDefs", {
      orgId: ctx.org._id,
      name,
      type: args.type,
      options: args.type === "select" ? args.options : undefined,
      sortOrder: maxOrder + 1000,
    });
  },
});

export const removeDef = orgAdminMutation({
  args: { fieldId: v.id("customFieldDefs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const def = await ctx.db.get(args.fieldId);
    if (!def || def.orgId !== ctx.org._id) {
      throw new Error("Field not found");
    }
    // Remove every value recorded for this field.
    const values = await ctx.db
      .query("issueCustomFieldValues")
      .withIndex("by_field", (q) => q.eq("fieldId", def._id))
      .collect();
    for (const value of values) {
      await ctx.db.delete(value._id);
    }
    await ctx.db.delete(def._id);
    return null;
  },
});

/** Values recorded on a single issue, keyed by field. */
export const listForIssue = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.array(v.object(fieldValueShape)),
  handler: async (ctx, args) => {
    await getOrgIssue(ctx, ctx.org._id, args.issueId);
    return await ctx.db
      .query("issueCustomFieldValues")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
  },
});

/** Set (or clear, when value is empty) a field's value on an issue. */
export const setValue = orgMutation({
  args: {
    issueId: v.id("issues"),
    fieldId: v.id("customFieldDefs"),
    value: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getOrgIssue(ctx, ctx.org._id, args.issueId);
    const def = await ctx.db.get(args.fieldId);
    if (!def || def.orgId !== ctx.org._id) {
      throw new Error("Field not found");
    }
    const existing = await ctx.db
      .query("issueCustomFieldValues")
      .withIndex("by_issue_and_field", (q) =>
        q.eq("issueId", args.issueId).eq("fieldId", args.fieldId)
      )
      .unique();

    const trimmed = args.value.trim();
    if (!trimmed) {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return null;
    }
    if (existing) {
      await ctx.db.patch(existing._id, { value: trimmed });
    } else {
      await ctx.db.insert("issueCustomFieldValues", {
        orgId: ctx.org._id,
        issueId: args.issueId,
        fieldId: args.fieldId,
        value: trimmed,
      });
    }
    return null;
  },
});
