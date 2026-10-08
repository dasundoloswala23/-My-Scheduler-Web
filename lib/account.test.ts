import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Account deletion must cover every collection the apps write. Reading the
 * source of both lists keeps them from drifting: a new collection added to one
 * client and not the other would be orphaned by deletion.
 */
describe("account deletion covers every collection", () => {
  const web = readFileSync(new URL("./account.ts", import.meta.url), "utf8");
  const names = [...web.matchAll(/^  "([a-zA-Z]+)",$/gm)].map((m) => m[1]);

  it("includes the Project Flow collections", () => {
    for (const c of ["projectFlows", "flowStages", "flowTaskLinks"]) {
      assert.ok(names.includes(c), `${c} must be deleted with the account`);
    }
  });

  it("includes every other collection the app writes", () => {
    for (const c of ["boards", "lists", "categories", "notes", "reminders", "holidays", "focusSessions"]) {
      assert.ok(names.includes(c), c);
    }
  });

  it("deletes tasks and their attachments apart, before the rest", () => {
    assert.ok(web.indexOf('"attachments"') < web.indexOf("USER_COLLECTIONS) await"));
  });

  it("deletes the Auth account after the data, never before", () => {
    assert.ok(web.indexOf("await deleteUserData(user.uid)") < web.indexOf("await deleteUser(user)"));
  });
});
