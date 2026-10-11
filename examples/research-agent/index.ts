/**
 * Research Agent Example - Sprint 13
 *
 * A demonstration of a REAL external AI agent integrating with AgentPay.
 *
 * This example demonstrates the complete end-to-end flow:
 * 1. Authenticates using AGENTPAY_API_KEY
 * 2. Requests market data for BTC
 * 3. Receives payment_required with payment intent
 * 4. Prints the payment intent for human approval
 * 5. In DEMO MODE: simulates payment completion (no real transaction)
 * 6. Polls for payment confirmation
 * 7. Retrieves and prints the service result
 *
 * The external agent is a STANDALONE TypeScript client - not part of the
 * Next.js browser application. It calls the REAL AgentPay API.
 *
 * Prerequisites:
 * - AgentPay server running at AGENTPAY_BASE_URL
 * - AGENTPAY_API_KEY set (from agent registration via /app UI)
 * - For demo mode: AGENTPAY_DEMO_MODE=true on the server
 *
 * Usage:
 * AGENTPAY_BASE_URL=https://agentpay-self.vercel.app \
 * AGENTPAY_API_KEY=ap_xxxxxxxxxxxx \
 * npx tsx examples/research-agent/index.ts
 *
 * With demo mode (for local testing):
 * AGENTPAY_DEMO_MODE=true AGENTPAY_BASE_URL=http://localhost:3000 \
 * AGENTPAY_API_KEY=ap_xxxxxxxxxxxx \
 * npx tsx examples/research-agent/index.ts
 */

import { AgentPayClient, AgentPayConfig } from "@/lib/agent/sdk";

const config: AgentPayConfig = {
  baseUrl: process.env.AGENTPAY_BASE_URL ?? "http://localhost:3000",
  apiKey: process.env.AGENTPAY_API_KEY ?? "",
};

const isDemoMode = process.env.AGENTPAY_DEMO_MODE === "true";

async function main() {
  if (!config.apiKey) {
    console.error("❌ AGENTPAY_API_KEY environment variable is required");
    console.error("   Get your API key by registering an agent in the AgentPay web UI (/app → Agent Registry)");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════");
  console.log("     AGENTPAY EXTERNAL AGENT - RESEARCH AGENT");
  console.log("═══════════════════════════════════════════════════");
  console.log(`   Agent:     research-agent`);
  console.log(`   Service:   market-data`);
  console.log(`   Base URL:  ${config.baseUrl}`);
  console.log(`   API Key:   ${config.apiKey.slice(0, 8)}...`);
  if (isDemoMode) {
    console.log(`   Mode:      🧪 DEMO MODE (simulated payment, NO real transaction)`);
  } else {
    console.log(`   Mode:      🏭 PRODUCTION (requires real human wallet approval)`);
  }
  console.log("═══════════════════════════════════════════════════\n");

  const agent = new AgentPayClient(config);

  // Step 1: Create a service request for market data
  console.log("📊  REQUESTING MARKET DATA FOR BTC...");
  const requestResult = await agent.createRequest({
    serviceId: "market-data",
    input: {
      symbol: "BTC",
      timeframe: "24h",
    },
    idempotencyKey: `research-btc-${Date.now()}`,
  });

  if (!requestResult.ok) {
    console.error("❌ Failed to create request:", requestResult.error);
    process.exit(1);
  }

  console.log("✅  REQUEST CREATED");
  console.log(`   Request ID: ${requestResult.requestId}`);
  console.log(`   Status:     ${requestResult.status}`);
  console.log("\n💳  PAYMENT REQUIRED");
  console.log(`   Intent ID:  ${requestResult.payment.intentId}`);
  console.log(`   Amount:     ${requestResult.payment.amount.amount} ${requestResult.payment.amount.currency}`);
  console.log(`   Recipient:  ${requestResult.payment.recipient}`);
  console.log(`   Chain ID:   ${requestResult.payment.chainId} (Arc Mainnet)`);
  console.log(`   Expires:    ${requestResult.payment.expiresAt}`);

  if (isDemoMode) {
    console.log("\n🧪  DEMO MODE: SIMULATING PAYMENT COMPLETION");
    console.log("   (No real Arc transaction - using simulated payment)\n");
    const demoResult = await agent.completeDemoPayment(requestResult.requestId);
    if (!demoResult.ok) {
      console.error("❌ Failed to complete demo payment:", demoResult.error);
      process.exit(1);
    }
    console.log("✅  DEMO PAYMENT COMPLETED");
    console.log(`   Trusted Payment ID: ${demoResult.trustedPaymentId}`);
    console.log(`   Demo Tx Hash:       ${demoResult.txHash}`);
  } else {
    console.log("\n⏳  WAITING FOR HUMAN WALLET APPROVAL");
    console.log("   Please go to the AgentPay web UI (/app → Pending Agent Requests)");
    console.log("   and click 'Approve Payment' for this request.\n");
  }

  // Step 2: Poll for payment confirmation and result
  console.log("\n🔄  POLLING FOR PAYMENT CONFIRMATION...");
  const result = await agent.waitForResult(requestResult.requestId, {
    intervalMs: 5000,
    timeoutMs: 300000, // 5 minutes
  });

  if (!result.ok) {
    console.error("❌ Failed to get result:", result.error);
    process.exit(1);
  }

  if (!result.result) {
    console.error("❌ No result returned");
    process.exit(1);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("     ✅  PAYMENT CONFIRMED & SERVICE FULFILLED");
  console.log("═══════════════════════════════════════════════════");
  console.log(`   Result ID:       ${result.result.id}`);
  console.log(`   Status:          ${result.result.status}`);
  console.log(`   Fulfilled At:    ${result.result.fulfilledAt}`);
  console.log(`   Trusted Payment: ${result.result.trustedPaymentId}`);

  if (result.result.output) {
    console.log("\n📋  SERVICE OUTPUT");
    console.log(JSON.stringify(result.result.output, null, 2));
  }

  if (result.result.error) {
    console.error("\n❌ Service Error:", result.result.error);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("     🎉  RESEARCH AGENT COMPLETED SUCCESSFULLY");
  console.log("═══════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});