import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { VectorMount } from "@/components/voice/vector-mount";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return (
    <WorkspaceShell orgSlug={orgSlug}>
      {children}
      <VectorMount />
    </WorkspaceShell>
  );
}
