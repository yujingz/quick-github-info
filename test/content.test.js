const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatCount,
  formatRepoInfo,
  getRepoFullName,
  isGitHubHost,
  isGoogleRedirectUrl
} = require("../source/content.js");

test("extracts a repository name from a direct GitHub result URL", () => {
  assert.equal(getRepoFullName("https://github.com/nodejs/node"), "nodejs/node");
});

test("extracts a repository name from a deeper GitHub path", () => {
  assert.equal(
    getRepoFullName("https://github.com/microsoft/vscode/tree/main/src"),
    "microsoft/vscode"
  );
});

test("extracts a repository name from a Google redirect URL", () => {
  assert.equal(
    getRepoFullName(
      "/url?q=https%3A%2F%2Fgithub.com%2Ffacebook%2Freact%2Fblob%2Fmain%2FREADME.md",
      "https://www.google.com/search?q=react+github"
    ),
    "facebook/react"
  );
});

test("extracts a repository name from a non-dot-com Google redirect URL", () => {
  assert.equal(
    getRepoFullName(
      "https://www.google.co.jp/url?url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js",
      "https://www.google.co.jp/search?q=next.js+github"
    ),
    "vercel/next.js"
  );
});

test("ignores GitHub non-repository pages", () => {
  assert.equal(getRepoFullName("https://github.com/features/actions"), null);
  assert.equal(getRepoFullName("https://github.com/search?q=react"), null);
});

test("recognizes only GitHub hosts", () => {
  assert.equal(isGitHubHost("github.com"), true);
  assert.equal(isGitHubHost("www.github.com"), true);
  assert.equal(isGitHubHost("evil-github.com"), false);
});

test("recognizes Google redirect URLs", () => {
  assert.equal(isGoogleRedirectUrl(new URL("https://www.google.com/url?q=https://github.com/a/b")), true);
  assert.equal(isGoogleRedirectUrl(new URL("https://www.google.com.hk/url?q=https://github.com/a/b")), true);
  assert.equal(isGoogleRedirectUrl(new URL("https://www.google.com/search?q=github")), false);
});

test("formats repository counts and missing language", () => {
  assert.equal(formatCount(9999), "9,999");
  assert.equal(formatCount(12345), "12.3K");
  assert.equal(
    formatRepoInfo({ stargazers_count: 12345, forks_count: 67, language: null }),
    "Unknown - S: 12.3K, F: 67"
  );
});
