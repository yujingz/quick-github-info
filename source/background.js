const GITHUB_API_BASE_URL = "https://api.github.com/repos/";
const REPO_FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isValidRepoFullName(repoFullName) {
  return (
    typeof repoFullName === "string" &&
    REPO_FULL_NAME_RE.test(repoFullName) &&
    !repoFullName.split("/").some((part) => part === "." || part === "..")
  );
}

function buildGitHubApiUrl(repoFullName) {
  if (!isValidRepoFullName(repoFullName)) {
    throw new Error("Invalid GitHub repository name");
  }

  return GITHUB_API_BASE_URL + repoFullName.split("/").map(encodeURIComponent).join("/");
}

function sanitizeRepoData(data) {
  return {
    full_name: data.full_name,
    html_url: data.html_url,
    language: data.language || null,
    stargazers_count: Number(data.stargazers_count) || 0,
    forks_count: Number(data.forks_count) || 0
  };
}

async function fetchGitHubRepo(repoFullName) {
  const response = await fetch(buildGitHubApiUrl(repoFullName), {
    headers: {
      "Accept": "application/vnd.github+json"
    }
  });

  if (response.status === 404) {
    throw new Error("GitHub repository not found");
  }

  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("GitHub API rate limit exceeded");
  }

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  return sanitizeRepoData(await response.json());
}

function handleMessage(message, sender, sendResponse) {
  if (!message || message.type !== "QGI_FETCH_REPO") {
    return false;
  }

  fetchGitHubRepo(message.repoFullName)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(handleMessage);
}

if (typeof module !== "undefined") {
  module.exports = {
    buildGitHubApiUrl,
    fetchGitHubRepo,
    handleMessage,
    isValidRepoFullName,
    sanitizeRepoData
  };
}
