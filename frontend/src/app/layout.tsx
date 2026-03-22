import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CarbonEfficient Computing",
  description: "Carbon-aware HPC job scheduler",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <nav className="border-b border-border px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-primary flex items-center gap-2">
            CarbonEfficient
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/submit" className="hover:text-primary transition-colors">
              Submit Job
            </Link>
            <Link href="/history" className="hover:text-primary transition-colors">
              History
            </Link>
            <Link href="/analytics" className="hover:text-primary transition-colors">
              Analytics
            </Link>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
