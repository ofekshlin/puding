import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Puding",
  description: "Ultra-low-latency stateful voice assistant",
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
