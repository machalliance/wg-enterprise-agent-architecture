import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian Terminus — Archetype 3",
  description:
    "Goal-directed, task-oriented agent. One bounded job, a scoped toolset, a definite stop.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Waypoint's typefaces, self-contained: the same fonts.css the Archetype 4
            control plane and the Archetype 5 dashboard serve, woff2 inlined, so the
            three prototypes set type identically and nothing is fetched at runtime. */}
        <link href="/fonts.css" rel="stylesheet" />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
