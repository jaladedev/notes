import type { Metadata } from "next";
import { ToastProvider } from "@/components/ToastProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

// Adapted from school_app's app/layout.tsx (SHA 466c538).
// NavigationProgress and OfflineAttendanceSync (a write-queue for
// attendance, which doesn't exist here) are still dropped.
// ServiceWorkerRegister is back in -- own new service worker
// (public/sw.js), a read-cache, not school_app's write-queue one.

export const metadata: Metadata = {
  title: "Notes",
  description: "Lesson notes, delivered.",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#faf7f0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper font-body text-ink antialiased">
        <ToastProvider />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
