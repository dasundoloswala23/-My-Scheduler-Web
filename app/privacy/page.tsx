import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { PRIVACY_SECTIONS } from "@/lib/legal-content";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" sections={PRIVACY_SECTIONS} />;
}
