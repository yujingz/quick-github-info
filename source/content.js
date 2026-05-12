(function quickGitHubInfo(global) {
  const PROCESSED_ATTR = "data-qgi-processed";
  const REPO_ATTR = "data-qgi-repo";
  const INFO_CLASS = "qgi-github-info";
  const SKIP_OWNER_NAMES = new Set([
    "about",
    "apps",
    "collections",
    "enterprise",
    "events",
    "explore",
    "features",
    "github-copilot",
    "login",
    "marketplace",
    "new",
    "notifications",
    "orgs",
    "pricing",
    "search",
    "settings",
    "signup",
    "topics",
    "trending"
  ]);

  const repoInfoCache = new Map();
  let scanTimer = null;

  function getRepoFullName(href, baseUrl) {
    if (!href) {
      return null;
    }

    let url;
    try {
      url = new URL(href, baseUrl || (global.location && global.location.href));
    } catch (error) {
      return null;
    }

    if (isGoogleRedirectUrl(url)) {
      const redirectedUrl = url.searchParams.get("q") || url.searchParams.get("url");
      if (!redirectedUrl) {
        return null;
      }

      try {
        url = new URL(redirectedUrl);
      } catch (error) {
        return null;
      }
    }

    if (!isGitHubHost(url.hostname)) {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    const owner = decodeURIComponent(parts[0]);
    const repo = decodeURIComponent(parts[1]).replace(/\.git$/i, "");
    if (!owner || !repo || SKIP_OWNER_NAMES.has(owner.toLowerCase())) {
      return null;
    }

    return `${owner}/${repo}`;
  }

  function isGitHubHost(hostname) {
    const normalized = hostname.toLowerCase();
    return normalized === "github.com" || normalized === "www.github.com";
  }

  function isGoogleRedirectUrl(url) {
    const hostname = url.hostname.toLowerCase();
    return (
      (hostname === "google.com" || hostname.startsWith("www.google.") || hostname.endsWith(".google.com")) &&
      url.pathname === "/url"
    );
  }

  function looksLikeSearchResultAnchor(anchor) {
    return Boolean(anchor.querySelector("h3") || anchor.closest("#search, #rso, [role='main']"));
  }

  function formatCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "?";
    }

    return new Intl.NumberFormat("en", {
      notation: number >= 10000 ? "compact" : "standard",
      maximumFractionDigits: 1
    }).format(number);
  }

  function formatRepoInfo(data) {
    const language = data.language || "Unknown";
    return `${language} - S: ${formatCount(data.stargazers_count)}, F: ${formatCount(data.forks_count)}`;
  }

  function requestRepoInfo(repoFullName) {
    return new Promise((resolve, reject) => {
      if (!global.chrome || !global.chrome.runtime || !global.chrome.runtime.sendMessage) {
        reject(new Error("chrome.runtime.sendMessage is not available"));
        return;
      }

      global.chrome.runtime.sendMessage(
        { type: "QGI_FETCH_REPO", repoFullName },
        (response) => {
          const lastError = global.chrome.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }

          if (!response || !response.ok) {
            reject(new Error(response && response.error ? response.error : "No response from extension"));
            return;
          }

          resolve(response.data);
        }
      );
    });
  }

  function fetchRepoInfo(repoFullName) {
    if (!repoInfoCache.has(repoFullName)) {
      repoInfoCache.set(repoFullName, requestRepoInfo(repoFullName));
    }

    return repoInfoCache.get(repoFullName);
  }

  function createInfoElement(text) {
    const element = document.createElement("span");
    element.className = INFO_CLASS;
    element.textContent = ` | ${text}`;
    element.style.color = "#188038";
    element.style.fontSize = "0.85em";
    element.style.fontWeight = "400";
    element.style.whiteSpace = "nowrap";
    return element;
  }

  async function annotateAnchor(anchor) {
    if (!anchor || anchor.getAttribute(PROCESSED_ATTR) === "1" || !looksLikeSearchResultAnchor(anchor)) {
      return false;
    }

    const repoFullName = getRepoFullName(anchor.href);
    if (!repoFullName) {
      return false;
    }

    anchor.setAttribute(PROCESSED_ATTR, "1");
    anchor.setAttribute(REPO_ATTR, repoFullName);

    const target = anchor.querySelector("h3") || anchor;
    const infoElement = createInfoElement("GitHub info...");
    target.appendChild(infoElement);

    try {
      infoElement.textContent = ` | ${formatRepoInfo(await fetchRepoInfo(repoFullName))}`;
    } catch (error) {
      infoElement.textContent = " | GitHub info unavailable";
      infoElement.title = error.message;
      infoElement.style.color = "#5f6368";
    }

    return true;
  }

  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const anchors = scope.querySelectorAll("a[href*='github.com'], a[href^='/url?'], a[href*='google.'][href*='/url?']");
    anchors.forEach((anchor) => {
      annotateAnchor(anchor);
    });
    return anchors.length;
  }

  function scheduleScan() {
    if (scanTimer) {
      return;
    }

    scanTimer = global.setTimeout(() => {
      scanTimer = null;
      scan(document);
    }, 150);
  }

  function installContentScript() {
    scan(document);

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  function runWhenReady() {
    if (!global.document) {
      return null;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installContentScript, { once: true });
      return null;
    }

    return installContentScript();
  }

  if (typeof module !== "undefined") {
    module.exports = {
      formatCount,
      formatRepoInfo,
      getRepoFullName,
      isGitHubHost,
      isGoogleRedirectUrl,
      looksLikeSearchResultAnchor
    };
  }

  runWhenReady();
})(typeof globalThis !== "undefined" ? globalThis : window);
