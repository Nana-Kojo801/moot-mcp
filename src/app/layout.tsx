import type { Metadata, Viewport } from "next";
import { Public_Sans, Spline_Sans_Mono, Zilla_Slab } from "next/font/google";
import "./globals.css";

const slab = Zilla_Slab({ subsets: ["latin"], weight: ["600", "700"], style: ["normal", "italic"], variable: "--font-slab" });
const sans = Public_Sans({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-sans" });
const mono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Moot",
  description: "Every household deserves a parliament. Propose house rules by voice, debate them, and vote.",
};

export const viewport: Viewport = {
  themeColor: "#1E4D3B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${slab.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
