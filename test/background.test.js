const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGitHubApiUrl,
  isValidRepoFullName,
  sanitizeRepoData
} = require("../source/background.js");

test("validates GitHub repository full names", () => {
  assert.equal(isValidRepoFullName("owner/repo"), true);
  assert.equal(isValidRepoFullName("owner.name/repo-name"), true);
  assert.equal(isValidRepoFullName("owner/repo/extra"), false);
  assert.equal(isValidRepoFullName("../repo"), false);
});

test("builds the GitHub repository API URL", () => {
  assert.equal(
    buildGitHubApiUrl("facebook/react"),
    "https://api.github.com/repos/facebook/react"
  );
});

test("sanitizes GitHub API data before returning it to the content script", () => {
  assert.deepEqual(
    sanitizeRepoData({
      full_name: "facebook/react",
      html_url: "https://github.com/facebook/react",
      language: "JavaScript",
      stargazers_count: "123",
      forks_count: 45,
      private: false
    }),
    {
      full_name: "facebook/react",
      html_url: "https://github.com/facebook/react",
      language: "JavaScript",
      stargazers_count: 123,
      forks_count: 45
    }
  );
});
