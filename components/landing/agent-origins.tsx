"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const ORIGINS = [
  {
    id: "custom",
    label: "CUSTOM AGENTS",
    description: "Developer-built for specific tasks.",
  },
  {
    id: "apps",
    label: "AI APPLICATIONS",
    description: "Task-driven agents within AI apps.",
  },
  {
    id: "user",
    label: "USER AGENTS",
    description: "Operating on behalf of a user.",
  },
  {
    id: "platforms",
    label: "AGENT PLATFORMS",
    description: "Third-party frameworks & ecosystems.",
  },
];

export function AgentOrigins() {
  return (
    <section id="origins" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: AGENT_ORIGINS
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">003</span>
      </motion.div>

      <div className="max-w-5xl mx-auto">
        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease }}
          className="text-center mb-12"
        >
          <p className="text-4xl sm:text-5xl lg:text-6xl tracking-tight font-bold leading-[1.1] mb-6">
            <span className="text-accent">AI</span> AGENTS
            <br />
            COME FROM <span className="text-accent">ANYWHERE</span>.
          </p>
          <p className="text-lg text-muted-foreground font-mono leading-relaxed max-w-2xl mx-auto">
            AgentPay does not build or own the agent. It provides the payment infrastructure an agent can use
            to safely access paid services.
          </p>
        </motion.div>

        {/* Origin cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {ORIGINS.map((origin, i) => (
            <motion.div
              key={origin.id}
              custom={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.5, ease }}
              className="border-2 border-foreground p-6 hover:border-accent hover:bg-accent/5 transition-colors duration-200"
            >
              <span className="text-sm font-bold uppercase text-accent font-mono mb-3 block">
                {origin.label}
              </span>
              <p className="text-sm text-muted-foreground font-mono leading-relaxed">
                {origin.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: 0.3, duration: 0.5, ease }}
          className="text-center mt-12"
        >
          <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground font-mono max-w-2xl mx-auto">
            Examples of where agents can originate. Not official AgentPay integrations unless explicitly stated.
          </p>
        </motion.div>
      </div>
    </section>
  );
}