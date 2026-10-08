/**
 * The wording of the Privacy Policy and Terms. It describes what the apps
 * actually do and promises nothing they cannot keep. Keep it in step with the
 * Flutter app's lib/features/legal/legal_content.dart, which carries the same
 * text.
 */
export interface LegalSection {
  heading: string;
  body: string;
}

export const APP_NAME = "MyPlanScheduler";
export const LEGAL_UPDATED = "October 2026";

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "Who this applies to",
    body: `${APP_NAME} is a personal planner: boards, tasks, calendar, notes, reminders and project flows. This policy explains what it stores and why.`,
  },
  {
    heading: "What we store",
    body: "Your sign-in details (an email address, or the identity returned by Google or Apple), your display name, and everything you create in the app: tasks, subtasks, boards, lists, categories, notes, reminders, project flows, holidays you add, your settings, and files you attach to tasks.",
  },
  {
    heading: "Where it is stored",
    body: "Your data is stored in Google Firebase: Authentication for sign-in, Cloud Firestore for your planner data, and Cloud Storage for attached files. Access rules restrict each account to its own data. In the browser, reminders only appear while the site is open; on phones and desktops they are scheduled on your own device and are not sent through any other service.",
  },
  {
    heading: "What we do not do",
    body: "We do not sell your data, show advertising, or use your tasks for advertising or profiling. The apps do not include third-party analytics or advertising SDKs.",
  },
  {
    heading: "Permissions",
    body: "Notifications are used only to remind you about your own tasks. You can turn them off in Settings or in your browser or device settings. The apps ask for access to files or photos only when you choose to attach one.",
  },
  {
    heading: "Keeping and deleting your data",
    body: "Your data is kept until you delete it. Settings, then Delete account, removes your tasks, boards, notes, flows, attachments and sign-in from our servers. Deletion cannot be undone. Copies may remain briefly in routine backups operated by the hosting provider.",
  },
  {
    heading: "Security",
    body: "Data is sent over encrypted connections and protected by account-based access rules. No online service can promise perfect security, so keep your password private and use a strong one.",
  },
  { heading: "Children", body: "The app is not directed to children under 13." },
  { heading: "Changes", body: "If this policy changes, the new text and its date will appear here." },
  {
    heading: "Contact",
    body: "Questions or requests about your data can be sent to the developer through the contact details on this app's store listing.",
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "Using the app",
    body: `By creating an account or using ${APP_NAME} you agree to these terms. Use the app lawfully and only for your own planning.`,
  },
  {
    heading: "Your account",
    body: "You are responsible for keeping your sign-in details private and for activity under your account. Tell us if you believe it was accessed without your permission.",
  },
  {
    heading: "Your content",
    body: "Everything you put in the app remains yours. You give us permission only to store and display it to you so the app can work. Do not upload content you do not have the right to use.",
  },
  {
    heading: "Reminders and availability",
    body: "Reminders depend on your device, its operating system settings (battery optimisation, Do Not Disturb, notification permission) and your network. In a browser they only appear while the site is open. They may be delayed or missed, so do not rely on the app as the only way to remember anything safety-critical, time-critical or legal.",
  },
  {
    heading: "Backups",
    body: "Keep your own copy of anything important. We take care with your data but cannot guarantee that it will never be lost or unavailable.",
  },
  {
    heading: "Ending your use",
    body: "You can stop at any time and delete your account in Settings. We may suspend accounts that abuse the service.",
  },
  {
    heading: "Liability",
    body: "The app is provided as is. To the extent the law allows, we are not liable for indirect or consequential loss arising from its use.",
  },
  {
    heading: "Changes",
    body: "These terms may be updated; continuing to use the app after a change means you accept it.",
  },
];
