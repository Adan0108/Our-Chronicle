import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Our Chronicle — a home for your memories",
  description: "A local-first digital scrapbook. Little moments, kept close.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
