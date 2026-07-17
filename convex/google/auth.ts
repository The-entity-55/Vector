import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { fetchGoogleOAuthToken, GOOGLE_PROVIDER, GoogleAuthError } from "./api";

/**
 * Google OAuth token access for internal actions.
 *
 * Calendar/Gmail actions call `getAccessToken` to obtain a fresh Google access
 * token for a specific Clerk user, brokered by Clerk. Requires two env vars on
 * the Convex deployment:
 *   - CLERK_SECRET_KEY      (Clerk Backend API key, sk_...)
 *   - GOOGLE_OAUTH_PROVIDER (optional; defaults to "google")
 */

const scopeValidator = v.array(v.string());

/**
 * Return a fresh Google access token + granted scopes for a Clerk user id.
 * Throws when Google isn't connected so the caller can surface a reconnect
 * prompt. Internal-only: the caller supplies the clerkUserId it resolved from
 * an authenticated context.
 */
export const getAccessToken = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.object({ token: v.string(), scopes: scopeValidator }),
  handler: async (_ctx, args): Promise<{ token: string; scopes: string[] }> => {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      throw new GoogleAuthError(
        "CLERK_SECRET_KEY is not set on the Convex deployment"
      );
    }
    const provider = process.env.GOOGLE_OAUTH_PROVIDER ?? GOOGLE_PROVIDER;
    return await fetchGoogleOAuthToken(secret, args.clerkUserId, provider);
  },
});
