import { v } from "convex/values";
import { orgQuery } from "./lib/customFunctions";
import { issueShape } from "./issues";

/**
 * My Tasks — a cross-team home for the current user's assigned work. Each issue
 * is returned with its team key so the UI can render KEY-number identifiers
 * without extra round trips, then bucket by due date client-side.
 */

const myIssueShape = {
  ...issueShape,
  teamKey: v.string(),
};

export const list = orgQuery({
  args: {},
  returns: v.array(v.object(myIssueShape)),
  handler: async (ctx) => {
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_assignee", (q) =>
        q.eq("orgId", ctx.org._id).eq("assigneeId", ctx.user._id)
      )
      .collect();

    const teamKeys = new Map<string, string>();
    const result = [];
    for (const issue of issues) {
      // Finished work drops off the My Tasks list.
      if (issue.status === "done" || issue.status === "canceled") {
        continue;
      }
      let key = teamKeys.get(issue.teamId);
      if (key === undefined) {
        const team = await ctx.db.get(issue.teamId);
        key = team?.key ?? "";
        teamKeys.set(issue.teamId, key);
      }
      result.push({ ...issue, teamKey: key });
    }
    return result;
  },
});
