import type { Metadata } from "next";
import { Suspense } from "react";
import { Figtree, Fraunces } from "next/font/google";
import { NavProgress } from "@/components/nav-progress";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KLEF 13",
  description: "Group financial records for KLEF 13",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/tab-klef13.jpg", type: "image/jpeg", sizes: "1024x1024" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/favicon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
