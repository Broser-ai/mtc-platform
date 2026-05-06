import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTC — Master Team Console",
  description: "Universal AI orchestration platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-[#0a0a0f] text-[#e8e8f0] antialiased">{children}</body>
    </html>
  );
}
