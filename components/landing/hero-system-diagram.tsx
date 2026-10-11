"use client";

import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { useState, useEffect, useRef } from "react";

const ORANGE = "#ea580c";
const GRAY = "hsl(var(--border))";
const FOREGROUND = "hsl(var(--foreground))";
const MUTED = "hsl(var(--muted-foreground))";
const CARD = "hsl(var(--card))";

const NODES = [
  { id: "agent", label: "AGENT", subLabel: "DECISION", y: 60 },
  { id: "policy", label: "POLICY", subLabel: "ENGINE", y: 130 },
  { id: "intent", label: "PAYMENT", subLabel: "INTENT", y: 200 },
  { id: "wallet", label: "WALLET", subLabel: "SIGNATURE", y: 270 },
  { id: "arc", label: "ARC", subLabel: "SETTLEMENT", y: 340 },
  { id: "verify", label: "VERIFIED", subLabel: "PAYMENT", y: 410 },
  { id: "fulfill", label: "SERVICE", subLabel: "FULFILLMENT", y: 480 },
];

const CONNECTIONS = [
  { from: "agent", to: "policy" },
  { from: "policy", to: "intent" },
  { from: "intent", to: "wallet" },
  { from: "wallet", to: "arc" },
  { from: "arc", to: "verify" },
  { from: "verify", to: "fulfill" },
];

const SIDE_LABELS = [
  { id: "agent", y: 60, text: "AGENT DECISION" },
  { id: "policy", y: 130, text: "SERVER POLICY" },
  { id: "intent", y: 200, text: "IMMUTABLE INTENT" },
  { id: "wallet", y: 270, text: "EXPLICIT AUTH" },
  { id: "arc", y: 340, text: "ARC SETTLEMENT" },
  { id: "verify", y: 410, text: "PAYMENT VERIFY" },
  { id: "fulfill", y: 480, text: "GATED RESULT" },
];

const VB_WIDTH = 600;
const VB_HEIGHT = 540;
const CENTER_X = VB_WIDTH / 2;
const NODE_WIDTH = 104;
const NODE_X = CENTER_X - NODE_WIDTH / 2;

const ACTIVE_DURATION = 800;
const PACKET_DURATION = 500;
const TRANSITION_DURATION = 200;
const PULSE_DURATION = 800;
const FULL_CYCLE = 8500;

function Node({
  node,
  index,
  isActive,
  pulseKey,
}: {
  node: typeof NODES[0];
  index: number;
  isActive: boolean;
  pulseKey: number;
}) {
  const borderColor = isActive ? ORANGE : GRAY;
  const titleColor = isActive ? ORANGE : FOREGROUND;
  const strokeWidth = isActive ? 2 : 1;
  const dotColor = isActive ? ORANGE : GRAY;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      style={{ transformOrigin: "center" }}
    >
      {/* Pulse ring (only when active) */}
      {isActive && (
        <motion.circle
          key={`pulse-${pulseKey}`}
          cx={CENTER_X}
          cy={node.y}
          initial={{ r: NODE_WIDTH / 2 + 4, opacity: 0.3 }}
          animate={{ r: NODE_WIDTH / 2 + 16, opacity: 0 }}
          transition={{ duration: PULSE_DURATION, ease: "easeOut" }}
          fill="none"
          stroke={ORANGE}
          strokeWidth={1.5}
        />
      )}

      {/* Node background */}
      <rect
        x={NODE_X}
        y={node.y - 26}
        width={NODE_WIDTH}
        height={52}
        rx={0}
        fill={CARD}
        stroke={borderColor}
        strokeWidth={strokeWidth}
      />

      {/* Main label */}
      <text
        x={CENTER_X}
        y={node.y - 8}
        textAnchor="middle"
        fill={titleColor}
        fontSize={10}
        fontFamily="var(--font-mono), monospace"
        fontWeight={600}
        letterSpacing="0.1em"
        className="select-none"
      >
        {node.label}
      </text>

      {/* Sub label */}
      <text
        x={CENTER_X}
        y={node.y + 12}
        textAnchor="middle"
        fill={MUTED}
        fontSize={7}
        fontFamily="var(--font-mono), monospace"
        fontWeight={500}
        letterSpacing="0.08em"
        className="select-none"
      >
        {node.subLabel}
      </text>

      {/* Active indicator dot */}
      <circle
        cx={NODE_X + NODE_WIDTH - 10}
        cy={node.y}
        r={4}
        fill={dotColor}
      />
    </motion.g>
  );
}

function Connector({
  fromY,
  toY,
  progress,
}: {
  fromY: number;
  toY: number;
  progress: number;
}) {
  const segmentLength = toY - fromY;
  const packetY = fromY + segmentLength * progress;

  return (
    <motion.g>
      {/* Base connector (always gray) */}
      <line
        x1={CENTER_X}
        y1={fromY + 26}
        x2={CENTER_X}
        y2={toY - 26}
        stroke={GRAY}
        strokeWidth={1}
      />

      {/* Orange active segment following packet */}
      {progress > 0 && progress < 1 && (
        <motion.line
          x1={CENTER_X}
          y1={fromY + 26}
          x2={CENTER_X}
          y2={packetY}
          stroke={ORANGE}
          strokeWidth={2}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: PACKET_DURATION * 0.8, ease: "linear" }}
        />
      )}

      {/* Moving packet */}
      {progress > 0 && progress < 1 && (
        <motion.circle
          cx={CENTER_X}
          cy={packetY}
          r={3}
          fill={ORANGE}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 100 }}
        />
      )}
    </motion.g>
  );
}

function SideLabels({
  activeNodeId,
  reducedMotion,
}: {
  activeNodeId: string | null;
  reducedMotion: boolean;
}) {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
    >
      {/* Left side labels */}
      {SIDE_LABELS.map((l) => {
        const isActive = activeNodeId === l.id;
        return (
          <motion.text
            key={`lbl-${l.text}`}
            x={20}
            y={l.y}
            textAnchor="start"
            fill={isActive ? ORANGE : MUTED}
            fontSize={6}
            fontFamily="var(--font-mono), monospace"
            fontWeight={500}
            letterSpacing="0.1em"
            className="select-none"
            transition={reducedMotion ? undefined : { duration: 200 }}
          >
            {l.text}
          </motion.text>
        );
      })}

      {/* Right side status markers */}
      {NODES.map((node) => {
        const isActive = activeNodeId === node.id;
        return (
          <motion.g
            key={`status-${node.id}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + NODES.indexOf(node) * 0.06 }}
          >
            <circle
              cx={VB_WIDTH - 60}
              cy={node.y}
              r={3}
              fill={isActive ? ORANGE : GRAY}
            />
            <motion.text
              x={VB_WIDTH - 50}
              y={node.y + 3}
              textAnchor="start"
              fill={isActive ? ORANGE : MUTED}
              fontSize={6}
              fontFamily="var(--font-mono), monospace"
              fontWeight={500}
              letterSpacing="0.08em"
              className="select-none"
              transition={reducedMotion ? undefined : { duration: 200 }}
            >
              {isActive ? "ACTIVE" : "PENDING"}
            </motion.text>
          </motion.g>
        );
      })}
    </motion.g>
  );
}

export function HeroSystemDiagram() {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);
  const cycleRef = useRef<NodeJS.Timeout | null>(null);
  const [connectorProgress, setConnectorProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Animation cycle
  useEffect(() => {
    if (reducedMotion) {
      setActiveIndex(1); // POLICY as default for reduced motion
      return;
    }

    let cancelled = false;
    let currentIndex = 0;

    const runCycle = () => {
      if (cancelled) return;

      // Activate current node
      setActiveIndex(currentIndex);
      setPulseKey((k) => k + 1);

      const isLastNode = currentIndex === NODES.length - 1;

      // After active duration, either animate packet to next node or loop
      const step1Timeout = setTimeout(() => {
        if (cancelled) return;

        if (!isLastNode) {
          // Animate packet to next node
          const connKey = `${NODES[currentIndex].id}-${NODES[currentIndex + 1].id}`;
          setConnectorProgress((prev) => ({ ...prev, [connKey]: 0 }));

          // Animate packet progress from 0 to 1 over PACKET_DURATION
          const startTime = Date.now();
          const animatePacket = () => {
            if (cancelled) return;
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / PACKET_DURATION, 1);
            setConnectorProgress((prev) => ({ ...prev, [connKey]: progress }));
            if (progress < 1) {
              requestAnimationFrame(animatePacket);
            } else {
              // Packet arrived, move to next node
              currentIndex = (currentIndex + 1) % NODES.length;
              setConnectorProgress((prev) => {
                const next = { ...prev };
                delete next[connKey];
                return next;
              });
              runCycle(); // Continue cycle
            }
          };
          animatePacket();
        } else {
          // Last node - loop back to first
          currentIndex = 0;
          runCycle();
        }
      }, ACTIVE_DURATION);

      cycleRef.current = step1Timeout;
    };

    runCycle();

    return () => {
      cancelled = true;
      if (cycleRef.current) clearTimeout(cycleRef.current);
    };
  }, [reducedMotion]);

  if (!mounted) {
    return (
      <div
        className="relative w-full max-w-[760px] mx-auto"
        style={{ aspectRatio: `${VB_WIDTH} / ${VB_HEIGHT}` }}
        aria-hidden="true"
      />
    );
  }

  const activeNodeId = NODES[activeIndex].id;
  const activeNode = NODES[activeIndex];

  return (
    <div className="relative w-full max-w-[760px] mx-auto">
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        className="block w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={reducedMotion
          ? "AgentPay payment flow diagram (static): Agent Decision to Policy Engine to Payment Intent to Wallet Signature to Arc Settlement to Verified Payment to Service Fulfillment"
          : "AgentPay payment flow diagram (animated): Agent Decision to Policy Engine to Payment Intent to Wallet Signature to Arc Settlement to Verified Payment to Service Fulfillment"}
      >
        {/* Vertical center connector line */}
        <line
          x1={CENTER_X}
          y1={34}
          y2={506}
          x2={CENTER_X}
          stroke={GRAY}
          strokeWidth={1}
        />

        {/* Connection lines with packet animation */}
        {CONNECTIONS.map((conn, i) => {
          const fromNode = NODES.find((n) => n.id === conn.from);
          const toNode = NODES.find((n) => n.id === conn.to);
          if (!fromNode || !toNode) return null;

          const connKey = `${conn.from}-${conn.to}`;
          const progress = connectorProgress[connKey] ?? 0;

          return (
            <Connector
              key={`conn-${conn.from}-${conn.to}`}
              fromY={fromNode.y}
              toY={toNode.y}
              progress={progress}
            />
          );
        })}

        {/* Nodes */}
        {NODES.map((node, i) => (
          <Node
            key={node.id}
            node={node}
            index={i}
            isActive={node.id === activeNodeId}
            pulseKey={pulseKey}
          />
        ))}

        {/* Side annotations */}
        <SideLabels activeNodeId={activeNodeId} reducedMotion={reducedMotion} />
      </svg>
    </div>
  );
}