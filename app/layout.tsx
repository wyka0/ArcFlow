import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "AgentPay — Autonomous USDC payments with spending policies",
  description:
    "AgentPay lets an AI agent purchase services with USDC on Arc while a policy engine enforces spending limits.",
};

export const viewport: Viewport = {
  themeColor: "#f2f1ea",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-mono">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
