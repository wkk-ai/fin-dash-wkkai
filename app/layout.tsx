import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/lib/language-context";
import DocumentTitle from "@/components/DocumentTitle";
import AuthProvider from "@/components/AuthProvider";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Prevents iOS input auto-zoom
};

export const metadata: Metadata = {
  title: "Financial Dashboard",
  description: "Your local finance central",
  manifest: "/fin-dash-wkkai/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Finance",
  },
  icons: {
    icon: [
      { url: "/fin-dash-wkkai/favicon.svg", type: "image/svg+xml" },
      { url: "/fin-dash-wkkai/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/fin-dash-wkkai/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/fin-dash-wkkai/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/fin-dash-wkkai/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning className={`${manrope.variable} antialiased min-h-screen transition-colors duration-200`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <LanguageProvider>
            <DocumentTitle />
            <AuthProvider>
              {children}
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

