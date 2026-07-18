import { v } from "convex/values";
import { orgMutation, orgQuery } from "./lib/customFunctions";

/**
 * Sections — Asana-style ordered groupings of tasks within a team, an
 * alternative to grouping by status. Issues reference a section via
 * `issues.sectionId` (set through `issues.update`).
 */

const sectionShape = {
  _id: v.id("sections"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  teamId: v.id("teams"),
  name: v.string(),
  sortOrder: v.number(),
};

export const listByTeam = orgQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(v.object(sectionShape)),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== ctx.org._id) {
      throw new Error("Team not found");
    }
    const sections = await ctx.db
      .query("sections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    return sections.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const create = orgMutation({
  args: { teamId: v.id("teams"), name: v.string() },
  returns: v.id("sections"),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== ctx.org._id) {
      throw new Error("Team not found");
    }
    const name = args.name.trim();
    if (!name) {
      throw new Error("Section name is required");
    }
    const last = await ctx.db
      .query("sections")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const maxOrder = last.reduce((m, s) => Math.max(m, s.sortOrder), 0);
    return await ctx.db.insert("sections", {
      orgId: ctx.org._id,
      teamId: args.teamId,
      name,
      sortOrder: maxOrder + 1000,
    });
  },
});

export const rename = orgMutation({
  args: { sectionId: v.id("sections"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.sectionId);
    if (!section || section.orgId !== ctx.org._id) {
      throw new Error("Section not found");
    }
    const name = args.name.trim();
    if (!name) {
      throw new Error("Section name is required");
    }
    await ctx.db.patch(section._id, { name });
    return null;
  },
});

export const reorder = orgMutation({
  args: { sectionId: v.id("sections"), sortOrder: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.sectionId);
    if (!section || section.orgId !== ctx.org._id) {
      throw new Error("Section not found");
    }
    await ctx.db.patch(section._id, { sortOrder: args.sortOrder });
    return null;
  },
});

export const remove = orgMutation({
  args: { sectionId: v.id("sections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.sectionId);
    if (!section || section.orgId !== ctx.org._id) {
      throw new Error("Section not found");
    }
    // Detach any issues still pointing at this section.
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_section", (q) => q.eq("sectionId", section._id))
      .collect();
    for (const issue of issues) {
      await ctx.db.patch(issue._id, { sectionId: undefined });
    }
    await ctx.db.delete(section._id);
    return null;
  },
});
