Quick GitHub Info
=================

A Chrome extension to quickly show info of a GitHub repo in google's search result.

This extension supports Manifest V3 and Google Search result updates after the initial page load.

## Development

```bash
pnpm generate:icon
pnpm test
pnpm prepare:chrome
pnpm verify:chrome
pnpm package
```

Load the `source/` directory in Chrome's extension manager for local testing.
The Chrome Web Store package is generated at `dist/quick-github-info-0.2.0.zip`.

[Install Link](https://chrome.google.com/webstore/detail/quick-github-info/mcofeafeflnpkheodkeoehbllblhaapf)

### Before
![](https://github.com/yujingz/quick-github-info/blob/master/before.png?raw=1)

### After
![](https://github.com/yujingz/quick-github-info/blob/master/after.png?raw=1)
