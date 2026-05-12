import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const EXTENSION_DIR = path.join(ROOT, "source");
const CACHED_CHROME_ROOT = path.join(ROOT, ".cache/chrome-for-testing/chrome");
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  findCachedChromeForTesting(),
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
].filter(Boolean);
const FIXTURE_HOST = "www.google.com";
const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <title>Google Search Fixture</title>
  </head>
  <body>
    <main id="search" role="main">
      <div class="g">
        <a href="https://github.com/facebook/react">
          <h3>facebook/react: The library for web and native user interfaces</h3>
        </a>
      </div>
    </main>
  </body>
</html>`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findCachedChromeForTesting() {
  if (!existsSync(CACHED_CHROME_ROOT)) {
    return null;
  }

  for (const versionDir of readdirSync(CACHED_CHROME_ROOT)) {
    const platformDir = path.join(CACHED_CHROME_ROOT, versionDir);
    if (!statSync(platformDir).isDirectory()) {
      continue;
    }

    for (const bundleDir of readdirSync(platformDir)) {
      const bundleRoot = path.join(platformDir, bundleDir);
      if (!statSync(bundleRoot).isDirectory()) {
        continue;
      }

      const executable = path.join(
        bundleRoot,
        "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
      );
      if (existsSync(executable)) {
        return executable;
      }
    }
  }

  return null;
}

async function waitForJson(url, timeoutMs = 10000) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(150);
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ""}`);
}

async function createFixtureServer(workDir) {
  const keyPath = path.join(workDir, "fixture-key.pem");
  const certPath = path.join(workDir, "fixture-cert.pem");
  const result = spawnSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-subj",
    `/CN=${FIXTURE_HOST}`,
    "-addext",
    `subjectAltName=DNS:${FIXTURE_HOST}`
  ], {
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    throw new Error(`Could not generate a temporary HTTPS certificate with openssl: ${result.stderr}`);
  }

  const server = https.createServer({
    key: await readFile(keyPath),
    cert: await readFile(certPath)
  }, (request, response) => {
    if (!request.url.startsWith("/search")) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8"
    });
    response.end(FIXTURE_HTML);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function request(ws, method, params = {}) {
  const id = request.nextId++;
  ws.send(JSON.stringify({ id, method, params }));

  return new Promise((resolve, reject) => {
    request.pending.set(id, { resolve, reject });
  });
}
request.nextId = 1;
request.pending = new Map();

async function connectToPage(wsUrl) {
  const ws = new WebSocket(wsUrl);

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      return;
    }

    const pending = request.pending.get(message.id);
    if (!pending) {
      return;
    }

    request.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  return ws;
}

async function evaluate(ws, expression) {
  const result = await request(ws, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }

  return result.result.value;
}

async function waitForInjectedInfo(ws, timeoutMs = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const info = await evaluate(
      ws,
      `Array.from(document.querySelectorAll(".qgi-github-info")).map((element) => element.textContent.trim())`
    );

    if (info.length > 0 && info.some((text) => !text.includes("GitHub info..."))) {
      return info;
    }

    await sleep(500);
  }

  const links = await evaluate(
    ws,
    `Array.from(document.querySelectorAll("a[href*='github.com'], a[href^='/url?']")).slice(0, 10).map((a) => a.href)`
  );
  const pageState = await evaluate(
    ws,
    `({
      title: document.title,
      url: location.href,
      bodyText: document.body ? document.body.innerText.slice(0, 500) : ""
    })`
  );
  throw new Error(`No injected GitHub info found. Page state: ${JSON.stringify(pageState)}. Links seen: ${JSON.stringify(links)}`);
}

async function waitForPageReady(ws, expectedUrlPart, timeoutMs = 10000) {
  const start = Date.now();
  let lastState = null;

  while (Date.now() - start < timeoutMs) {
    const state = await evaluate(
      ws,
      `({ url: location.href, readyState: document.readyState, title: document.title })`
    );
    lastState = state;

    if (state.url.includes(expectedUrlPart) && state.readyState !== "loading") {
      return state;
    }

    await sleep(200);
  }

  throw new Error(`Timed out waiting for ${expectedUrlPart}. Last page state: ${JSON.stringify(lastState)}`);
}

async function stopChrome(chrome) {
  if (chrome.exitCode !== null || chrome.signalCode !== null) {
    return;
  }

  chrome.kill();
  await Promise.race([
    new Promise((resolve) => chrome.once("exit", resolve)),
    sleep(3000)
  ]);
}

async function removeProfileDir(profileDir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      if (attempt === 4) {
        console.warn(`Warning: could not remove temporary Chrome profile ${profileDir}: ${error.message}`);
        return;
      }

      await sleep(500);
    }
  }
}

async function main() {
  const chromePath = CHROME_PATHS.find(Boolean);
  if (!chromePath) {
    throw new Error("Chrome for Testing or Chromium not found. Run `pnpm prepare:chrome` or set CHROME_PATH.");
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "quick-github-info-"));
  const profileDir = path.join(workDir, "chrome-profile");
  const fixtureServer = await createFixtureServer(workDir);
  const port = 9222 + Math.floor(Math.random() * 1000);
  const searchUrl = `https://${FIXTURE_HOST}/search?q=facebook%2Freact%20github`;
  const chromeArgs = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    `--disable-extensions-except=${EXTENSION_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
    `--host-resolver-rules=MAP ${FIXTURE_HOST}:443 127.0.0.1:${fixtureServer.port},EXCLUDE localhost`,
    "--no-proxy-server",
    "--ignore-certificate-errors",
    "--no-first-run",
    "--no-default-browser-check",
    searchUrl
  ];

  if (process.env.HEADLESS === "0") {
    chromeArgs.splice(chromeArgs.length - 1, 0, "--window-size=1200,900");
  } else {
    chromeArgs.splice(chromeArgs.length - 1, 0, "--headless=new", "--disable-gpu");
  }

  const chrome = spawn(chromePath, chromeArgs, {
    stdio: "ignore"
  });

  try {
    const tabs = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const page = tabs.find((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
    if (!page) {
      throw new Error("Could not find a debuggable Chrome page.");
    }

    const ws = await connectToPage(page.webSocketDebuggerUrl);
    await request(ws, "Runtime.enable");
    await request(ws, "Page.enable");
    const navigation = await request(ws, "Page.navigate", { url: searchUrl });
    if (navigation.errorText) {
      throw new Error(`Chrome navigation failed: ${navigation.errorText}`);
    }
    await waitForPageReady(ws, "/search");

    const info = await waitForInjectedInfo(ws);
    const url = await evaluate(ws, "location.href");
    ws.close();

    console.log(JSON.stringify({ ok: true, url, info }, null, 2));
  } finally {
    await stopChrome(chrome);
    await fixtureServer.close();
    await removeProfileDir(workDir);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
