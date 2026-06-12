import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Bumblebee — Multi-Agent Concurrent Task Management",
  description:
    "Multiple AI agents working concurrently on the same project. LangGraph orchestration, scope-leased file safety, event-sourced state, plugin-ready.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Set data-theme + dark class before paint to prevent FOUC. The app's CSS
            vars key on data-theme; fumadocs (/docs) keys on the dark class. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='bumblebee.theme';var v=localStorage.getItem(k);var r=(v==='light'||v==='dark')?v:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var d=document.documentElement;d.setAttribute('data-theme',r);d.classList.toggle('dark',r==='dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
