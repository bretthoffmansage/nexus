import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/AppProviders";
import { ConfigNotice } from "@/components/shell/ConfigNotice";
import { getEnvStatus } from "@/lib/env";
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
  title: {
    default: "Nexus",
    template: "%s · Nexus",
  },
  description:
    "Nexus — hosted knowledge workspace. Claudia executes governed work through the private Console Connector.",
  applicationName: "Nexus",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#282c34",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const env = getEnvStatus();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {!env.clerk || !env.convex ? <ConfigNotice status={env} /> : null}
        <AppProviders clerkPublishableKey={env.clerkPublishableKey} convexUrl={env.convexUrl}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
