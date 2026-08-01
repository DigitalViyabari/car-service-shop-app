import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Digital Viyabari Car Service",
  description: "Multi-branch automotive service management",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
