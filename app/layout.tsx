import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";

import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MyPlanScheduler",
    template: "%s · MyPlanScheduler",
  },
  description: "Plan Today · Do More · Live Better",
  applicationName: "MyPlanScheduler",
  openGraph: {
    type: "website",
    siteName: "MyPlanScheduler",
    title: "MyPlanScheduler",
    description: "Plan Today · Do More · Live Better",
  },
  twitter: {
    card: "summary",
    title: "MyPlanScheduler",
    description: "Plan Today · Do More · Live Better",
  },
};

/**
 * Applies the saved theme before the first paint.
 *
 * Without this the page renders light, then flips to dark once React hydrates
 * and reads the preference — a visible flash on every load. It reads only the
 * local mirror, because Firestore is not available this early.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="bottom-center" closeButton theme="system" />
      </body>
    </html>
  );
}
