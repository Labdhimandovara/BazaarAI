import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RazorBuy AI",
  description: "India's Agentic AI Commerce Buyer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
