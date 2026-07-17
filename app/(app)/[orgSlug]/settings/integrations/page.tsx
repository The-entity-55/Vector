import { GoogleConnectCard } from "@/components/integrations/google-connect-card";
import { TelegramConnectCard } from "@/components/integrations/telegram-connect-card";

/**
 * Integrations settings: connect external services to this workspace. Today
 * this is Telegram (chat with the Vector agent + push notifications) and Google
 * (sync task due dates to Google Calendar).
 */
export default function IntegrationsSettingsPage() {
  return (
    <>
      <div>
        <h1 className="text-base font-semibold">Integrations</h1>
        <p className="text-xs text-muted-foreground">
          Connect Vector to the tools your team already uses.
        </p>
      </div>
      <TelegramConnectCard />
      <GoogleConnectCard />
    </>
  );
}
