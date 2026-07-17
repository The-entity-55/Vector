"use client";

import { useUser } from "@clerk/nextjs";
import { Calendar, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Google integration card for Settings → Integrations.
 *
 * Unlike Telegram (a per-workspace bot token), Google is connected per-user via
 * Clerk-brokered OAuth. Connecting runs Clerk's `createExternalAccount` /
 * `reauthorize` flow to grant the Calendar + Gmail scopes; the backend later
 * exchanges the user's Clerk identity for a live Google access token.
 *
 * The scope strings must match those configured on the Clerk Google connection.
 */
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const REQUIRED_SCOPES = [CALENDAR_SCOPE, GMAIL_SCOPE];

export function GoogleConnectCard() {
  const { user, isLoaded } = useUser();
  const [connecting, setConnecting] = useState(false);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center rounded-lg border py-12">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const googleAccount = user?.externalAccounts.find(
    (account) => account.provider === "google"
  );
  const connected = googleAccount?.verification?.status === "verified";

  // approvedScopes is a space-separated string of everything the user granted.
  const approved = googleAccount?.approvedScopes?.split(/\s+/) ?? [];
  const missingScopes = REQUIRED_SCOPES.filter(
    (scope) => !approved.includes(scope)
  );
  const needsScopes = connected && missingScopes.length > 0;

  const startFlow = async () => {
    if (!user) return;
    setConnecting(true);
    try {
      const redirectUrl = window.location.href;
      // Reauthorize an existing Google account for the extra scopes, or create
      // a fresh connection. Both return a verification redirect we send the
      // user to; Clerk brings them back to redirectUrl when done.
      const result = googleAccount
        ? await googleAccount.reauthorize({
            redirectUrl,
            additionalScopes: REQUIRED_SCOPES,
          })
        : await user.createExternalAccount({
            strategy: "oauth_google",
            redirectUrl,
            additionalScopes: REQUIRED_SCOPES,
          });

      const target = result.verification?.externalVerificationRedirectURL;
      if (target) {
        window.location.href = target.href;
        return; // Navigating away — leave the spinner up.
      }
      toast.error("Couldn't start Google authorization. Try again.");
    } catch (error) {
      const message =
        error &&
        typeof error === "object" &&
        "errors" in error &&
        Array.isArray((error as { errors: unknown[] }).errors)
          ? ((error as { errors: { message?: string }[] }).errors[0]?.message ??
            "Failed to connect Google")
          : error instanceof Error
            ? error.message
            : "Failed to connect Google";
      toast.error(message);
    } finally {
      setConnecting(false);
    }
  };

  const fullyConnected = connected && !needsScopes;

  return (
    <div className="rounded-lg border">
      <div className="flex items-start gap-3 border-b p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-500">
          <Calendar className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Google</h2>
            {fullyConnected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="size-3" />
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Sync task due dates to Google Calendar. Connect your own account.
          </p>
        </div>
      </div>

      <div className="p-4">
        {fullyConnected ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              ✅ Your Google account is connected. Tasks assigned to you with a
              due date will appear on your calendar.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={startFlow}
              disabled={connecting}
            >
              {connecting && <Loader2 className="size-3.5 animate-spin" />}
              Reconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {needsScopes
                ? "Your Google account is connected but hasn't granted calendar access yet."
                : "Connect your Google account to sync task due dates to your calendar."}
            </p>
            <Button
              size="sm"
              className="self-start"
              onClick={startFlow}
              disabled={connecting}
            >
              {connecting && <Loader2 className="size-3.5 animate-spin" />}
              {needsScopes ? "Grant calendar access" : "Connect Google"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
