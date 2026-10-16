import { FlowDetail } from "@/components/arcflow/flow-detail";

/**
 * Phase 25 — read-only flow detail route (`/app/flows/[id]`).
 *
 * The server component only awaits the route param; the flow is read on the
 * client through the connected wallet's Arc read client.
 */
export default async function FlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FlowDetail flowId={id} />;
}
