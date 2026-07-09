import { describe, expect, it } from "vitest";
import { redactLogText } from "../logger";

describe("redactLogText", () => {
  it.each([
    ["OPENAI_API_KEY=sk-x", "sk-x"],
    ["GITHUB_TOKEN=ghp_x", "ghp_x"],
    ['{"api_key":"sk-x"}', "sk-x"],
    ["Authorization: Basic YWJj", "YWJj"],
    ["Authorization: Bearer abc", "abc"],
    // Schemes are matched generically: enumerating Basic/Bearer/Digest let an
    // unlisted scheme (GitHub's `token`) be eaten as the credential, leaving
    // the real secret behind as `authorization: <redacted> ghs_x`.
    ["authorization: token ghs_x", "ghs_x"],
    ["Authorization: Digest xyz789", "xyz789"],
    ["Proxy-Authorization: Bearer px_1", "px_1"],
    ["Authorization: abc123", "abc123"],
    ["https://tok@example.com/r.git", "tok@"],
    ["https://u:p@h/x", "u:p@"],
    ["https://h/x?token=abc", "token=abc"],
  ] as const)("redacts secret material in %s", (input, secretFragment) => {
    const out = redactLogText(input);
    expect(out).not.toContain(secretFragment);
    expect(out).toContain("<redacted>");
  });

  it("still redacts every field on a multi-secret line", () => {
    const out = redactLogText("Authorization: Bearer tok1, X-Api-Key: k2");
    expect(out).not.toContain("tok1");
    expect(out).not.toContain("k2");
  });
});
