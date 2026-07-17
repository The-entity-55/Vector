"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Check, Loader2, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Telegram integration card for Settings → Integrations.
 *
 * Admins paste a BotFather token to connect the workspace bot; any member then
 * links their own Telegram account via a one-time deep link. The bot token is
 * never returned to the client — we only ever read connection *status*.
 */
export function TelegramConnectCard() {
  const status = useQuery(api.telegram.integrations.getIntegrationStatus);
  const connect = useAction(api.telegram.integrations.connect);
  const disconnect = useAction(api.telegram.integrations.disconnect);
  const createLinkCode = useMutation(api.telegram.integrations.createLinkCode);

  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [linking, setLinking] = useState(false);

  const handleConnect = async (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    setConnecting(true);
    try {
      const { botUsername } = await connect({ botToken: token.trim() });
      toast.success(
        botUsername ? `Connected @${botUsername}` : "Telegram bot connected"
      );
      setToken("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to connect bot"
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect();
      toast.success("Telegram disconnected");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect"
      );
    } finally {
      setDisconnecting(false);
    }
  };

  const handleLink = async () => {
    setLinking(true);
    try {
      const { deepLink } = await createLinkCode();
      window.open(deepLink, "_blank", "noopener,noreferrer");
      toast.success("Opening Telegram — tap Start to finish linking.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create link"
      );
    } finally {
      setLinking(false);
    }
  };

  if (status === undefined) {
    return (
      <div className="flex items-center justify-center rounded-lg border py-12">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const connected = status.connected && status.active;

  return (
    <div className="rounded-lg border">
      <div className="flex items-start gap-3 border-b p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-500">
          <Send className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Telegram</h2>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="size-3" />
                {status.botUsername ? `@${status.botUsername}` : "Connected"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Chat with the Vector agent and get workspace updates from Telegram.
          </p>
        </div>
      </div>

      <div className="p-4">
        {!connected ? (
          <form onSubmit={handleConnect} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tg-token" className="text-xs font-medium">
                Bot token
              </label>
              <Input
                id="tg-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456:ABC-DEF..."
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground">
                Create a bot with{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  @BotFather
                </a>{" "}
                and paste the token it gives you. Admins only.
              </p>
            </div>
            <Button
              type="submit"
              size="sm"
              className="self-start"
              disabled={connecting || !token.trim()}
            >
              {connecting && <Loader2 className="size-3.5 animate-spin" />}
              Connect
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
              <p className="text-xs font-medium">Your account</p>
              {status.linked ? (
                <p className="text-xs text-muted-foreground">
                  ✅ Your Telegram is linked. Message the bot anytime, or send
                  /help.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Link your Telegram to chat as yourself with the right
                  permissions.
                </p>
              )}
              <Button
                size="sm"
                variant={status.linked ? "outline" : "default"}
                className="self-start"
                onClick={handleLink}
                disabled={linking}
              >
                {linking && <Loader2 className="size-3.5 animate-spin" />}
                {status.linked ? "Re-link my Telegram" : "Connect my Telegram"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-[11px] text-muted-foreground">
                Disconnecting stops the bot for the whole workspace.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting && <Loader2 className="size-3.5 animate-spin" />}
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
