import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GlobalVox RSVP Campaigns",
  description: "Manage AI-voice-agent RSVP calling campaigns for GlobalVox events",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5 sm:px-6">
            <Link href="/campaigns" className="flex items-center gap-2.5 group">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white shadow-sm shadow-accent/30 transition-transform group-hover:scale-105">
                GV
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-[15px] font-semibold tracking-tight text-foreground">
                  GlobalVox
                </span>
                <span className="text-[11px] font-medium text-muted">
                  RSVP Campaigns
                </span>
              </span>
            </Link>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
