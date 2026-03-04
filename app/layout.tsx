import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/lib/language-context";
import PendingChangesToast from "@/components/PendingChangesToast";
import DocumentTitle from "@/components/DocumentTitle";
import AddAssetSuccessToast from "@/components/AddAssetSuccessToast";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "Financial Dashboard",
  description: "Your local finance central",
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
      <body className={`${manrope.variable} antialiased min-h-screen transition-colors duration-200`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <LanguageProvider>
            <DocumentTitle />
            <div className="layout-container flex h-full min-h-screen flex-col">
              <Header />
              <main className="flex-1 px-4 py-8 lg:px-40">
                {children}
              </main>
              <AddAssetSuccessToast />
              <PendingChangesToast />
            </div>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
