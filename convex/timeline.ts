import { v } from "convex/values";
import { orgQuery } from "./lib/customFunctions";

/**
 * Timeline support — dependency edges between issues in one team, used to draw
 * arrows on the Timeline/Gantt view. Reuses the existing `issueRelations`
 * table (Track C) without modifying it. An edge {from, to} means `from` blocks
 * `to` (i.e. `to` depends on `from`). Both `blocks` and `blocked_by` rows are
 * normalized into this single direction and de-duplicated.
 */

export const dependencies = orgQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(
    v.object({
      from: v.id("issues"),
      to: v.id("issues"),
    })
  ),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== ctx.org._id) {
      throw new Error("Team not found");
    }

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const inTeam = new Set(issues.map((i) => i._id));

    const seen = new Set<string>();
    const edges: { from: import("./_generated/dataModel").Id<"issues">; to: import("./_generated/dataModel").Id<"issues"> }[] = [];

    for (const issue of issues) {
      const relations = await ctx.db
        .query("issueRelations")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .collect();
      for (const relation of relations) {
        if (relation.type !== "blocks" && relation.type !== "blocked_by") {
          continue;
        }
        // Normalize to from-blocks-to.
        const from =
          relation.type === "blocks" ? relation.issueId : relation.relatedIssueId;
        const to =
          relation.type === "blocks" ? relation.relatedIssueId : relation.issueId;
        // Only draw edges where both endpoints are on this team's timeline.
        if (!inTeam.has(from) || !inTeam.has(to)) {
          continue;
        }
        const key = `${from}->${to}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        edges.push({ from, to });
      }
    }
    return edges;
  },
});
