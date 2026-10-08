import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { allLinksIn, firstLinkIn, previewForUrl } from "./link-preview.ts";

describe("link previews", () => {
  it("finds a link inside a description", () => {
    const preview = firstLinkIn("see https://github.com/flutter/flutter for more");
    assert.equal(preview?.domain, "github.com");
    assert.equal(preview?.siteName, "GitHub");
  });

  it("derives a YouTube thumbnail from the URL alone", () => {
    assert.equal(
      previewForUrl("https://www.youtube.com/watch?v=abc123")?.thumbnailUrl,
      "https://img.youtube.com/vi/abc123/hqdefault.jpg",
    );
    assert.equal(
      previewForUrl("https://youtu.be/abc123")?.thumbnailUrl,
      "https://img.youtube.com/vi/abc123/hqdefault.jpg",
    );
  });

  it("falls back to the domain for an unrecognised host", () => {
    const preview = previewForUrl("https://www.example.co.uk/some/page?q=1");
    assert.equal(preview?.domain, "example.co.uk");
    assert.equal(preview?.siteName, null);
    assert.equal(preview?.thumbnailUrl, null);
  });

  it("does not treat trailing punctuation as part of the URL", () => {
    assert.equal(firstLinkIn("go to https://example.com.")?.url, "https://example.com");
  });

  it("returns null for text with no link and for unparseable input", () => {
    assert.equal(firstLinkIn("no links here at all"), null);
    // `http://` parses but has no host.
    assert.equal(previewForUrl("http://"), null);
    assert.equal(previewForUrl("not a url"), null);
    // A non-http scheme is not something a card can preview.
    assert.equal(previewForUrl("javascript:alert(1)"), null);
  });

  it("returns each distinct link once, in order", () => {
    const found = allLinksIn("https://a.com then https://b.com then https://a.com again");
    assert.deepEqual(found.map((l) => l.domain), ["a.com", "b.com"]);
  });
});
