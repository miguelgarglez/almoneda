import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const serif = IBM_Plex_Serif({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "almoneda — public-domain artworks for paying agents",
  description: "An auction house where machines are the only bidders. Agents pay per call over x402 and get public-domain artworks with provenance and license proof.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
