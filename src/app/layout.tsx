import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Superparty Manager AI",
  description: "Brained by Superparty Copilot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro">
      <head>
        <Script src="/auto-auth.js" strategy="beforeInteractive" />
      </head>
      <body className={`${inter.className} min-h-screen text-sm bg-background text-foreground`}>
        {children}
      </body>
    </html>
  );
}
