import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Big Boss",
  description: "Cellular Automata Lab",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
        <header className="shrink-0 border-b border-zinc-800 bg-zinc-950">
          <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-2 sm:px-6">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Big Boss</h1>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
