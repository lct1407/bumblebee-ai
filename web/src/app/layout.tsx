import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/lib/providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bumblebee v3",
  description: "Multi-agent concurrent task management",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Providers>
          <div className="flex min-h-screen">
            <aside className="w-56 border-r border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
              <Link href="/" className="text-lg font-bold tracking-tight">
                🐝 bumblebee
              </Link>
              <nav className="mt-6 flex flex-col gap-1 text-sm">
                <Link href="/" className="px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  Dashboard
                </Link>
                <Link href="/issues" className="px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  Issues
                </Link>
                <Link href="/plugins" className="px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  Plugins
                </Link>
                <Link href="/notifications" className="px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  Notifications
                </Link>
              </nav>
              <div className="mt-auto pt-6 text-xs text-zinc-500">v0.3.0</div>
            </aside>
            <main className="flex-1 p-6 overflow-x-auto">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
