import {
  EmailAuthProvider,
  GoogleAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, listAll, ref, type StorageReference } from "firebase/storage";

import { db, storage } from "./firebase";

/**
 * Every collection under `users/{uid}`. Tasks are handled first and apart, so
 * their attachment metadata and files are removed before them. A new collection
 * must be added here, or it would be orphaned by account deletion; the Flutter
 * app keeps the same list (lib/core/account_service.dart).
 */
export const USER_COLLECTIONS = [
  "boards",
  "lists",
  "categories",
  "notes",
  "reminders",
  "holidays",
  "focusSessions",
  "projectFlows",
  "flowStages",
  "flowTaskLinks",
] as const;

/** Deletes every document in a collection, 400 per batch (the limit is 500). */
async function deleteCollection(path: string[]): Promise<void> {
  const [first, ...rest] = path;
  const col = collection(db, first, ...rest);
  for (;;) {
    const snap = await getDocs(query(col, limit(400)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Deletes every file under a Storage folder, however deeply nested. */
async function deleteFolder(folder: StorageReference): Promise<void> {
  const listing = await listAll(folder);
  await Promise.all(listing.items.map((item) => deleteObject(item)));
  for (const prefix of listing.prefixes) await deleteFolder(prefix);
}

/**
 * Removes everything stored for `uid`: attachment files and metadata, tasks,
 * flows and every other collection, then the user document. Safe to run again
 * after a partial failure: each step only deletes what is still there. Nothing
 * outside `users/{uid}` is touched, so shared data is never affected.
 */
export async function deleteUserData(uid: string): Promise<void> {
  // 1. Attachment files, then their metadata under each task.
  try {
    await deleteFolder(ref(storage, `users/${uid}`));
  } catch (e) {
    // Nothing stored yet is fine; anything else must stop the deletion so the
    // files are not orphaned.
    if ((e as { code?: string }).code !== "storage/object-not-found") throw e;
  }
  const tasks = await getDocs(collection(db, "users", uid, "tasks"));
  for (const task of tasks.docs) {
    await deleteCollection(["users", uid, "tasks", task.id, "attachments"]);
  }

  // 2. Tasks, then everything else under the user.
  await deleteCollection(["users", uid, "tasks"]);
  for (const name of USER_COLLECTIONS) await deleteCollection(["users", uid, name]);
  await deleteDoc(doc(db, "users", uid));
}

/** How the user proves it is them, which depends on how they signed up. */
export function reauthMethod(user: User): "password" | "google" | "other" {
  const ids = user.providerData.map((p) => p.providerId);
  if (ids.includes("password")) return "password";
  if (ids.includes("google.com")) return "google";
  return "other";
}

/**
 * Permanently deletes the account: re-authenticates (Firebase refuses to delete
 * an old session), removes the data, then deletes the Auth account LAST, so a
 * failure part-way can be retried while the person can still sign in.
 */
export async function deleteAccount(user: User, password?: string): Promise<void> {
  const method = reauthMethod(user);
  if (method === "password") {
    if (!user.email || !password) throw new Error("Enter your password to confirm.");
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else if (method === "google") {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  } else {
    throw new Error("This sign-in method cannot be confirmed here.");
  }

  await deleteUserData(user.uid);
  await deleteUser(user);
}
