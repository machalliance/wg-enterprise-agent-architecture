import { RepairDesk } from "@/app/_components/repair-desk";

export default async function SessionPage({
  params,
}: {
  readonly params: Promise<{ readonly sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <RepairDesk sessionId={sessionId} />;
}
