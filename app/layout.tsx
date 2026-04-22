import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Centrifuge Analytics",
  description: "On-chain analytics for all Centrifuge tokenized assets",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
