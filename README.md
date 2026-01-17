# Browser

**A browser that thinks the way you do.**

The ADHD-friendly browser. Open source and free forever.

[![Work in Progress](https://img.shields.io/badge/status-work%20in%20progress-yellow)](https://github.com/usefulventures/browser)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## What is Browser?

Browser is a minimal, tree-based web browser built for minds that wander on purpose. Instead of drowning in 50 tabs or losing your train of thought, Browser keeps your browsing history as a visual tree—so you can see exactly how you got here and easily find your way back.

Built by [Useful Ventures](https://usefulventures.co).

## Features

### Branches of thought

Every click creates a branch. Your browsing history becomes a tree, not a list. See how your ideas connect and trace your path through the web.

### Breadcrumb history

Always know exactly how you got to the current page. The path from your starting point is visible at the top of every page—you never lose the thread.

### Pin your favorites

Keep your most-used sites one click away. Pin up to 6 sites to the top of your sidebar and access them instantly from anywhere.

### Absolute minimalism

No clutter. No distractions. Just your content and your path. Everything else gets out of the way.

### And more

- **Ad and tracker blocking** — Built-in content blocking with EasyList and EasyPrivacy
- **Full-text history search** — Search the actual content of pages you've visited
- **Automatic reader view** — Distraction-free reading powered by Mozilla Readability
- **Password manager integration** — Works with Bitwarden, 1Password, and macOS Keychain
- **Dark theme** — Easy on the eyes, follows system preferences
- **Userscript support** — Extend functionality with custom scripts

## Screenshots

<img alt="Tree-based navigation with breadcrumb history" src="http://minbrowser.org/tour/img/tasks.png" width="650"/>

## Who is this for?

**ADHD minds** — Your path stays visible. No more losing where you came from or forgetting where you were headed.

**Researchers** — Follow rabbit holes without anxiety. Every branch shows how your ideas connect.

**The curious** — Explore freely. Your way back is always there when you need it.

## Installing

### Download

Download the latest release from the [releases page](https://github.com/usefulventures/browser/releases).

### Linux

- **Debian/Ubuntu**: `sudo dpkg -i /path/to/download.deb`
- **Fedora/RHEL**: `sudo rpm -i /path/to/download.rpm --ignoreos`
- **AppImage**: Make executable and run directly

### macOS

Download the `.dmg` for your architecture (Intel or Apple Silicon) and drag to Applications.

### Windows

Download and run the installer.

## Developing

Browser is built on [Electron](https://www.electronjs.org/) and uses vanilla JavaScript with Browserify for module bundling.

### Prerequisites

- [Node.js](https://nodejs.org) v14 or higher

### Setup

```bash
# Clone the repository
git clone https://github.com/usefulventures/browser.git
cd browser

# Install dependencies
npm install

# Start in development mode
npm run start
```

After making changes, press `Alt+Ctrl+R` (or `Opt+Cmd+R` on Mac) to reload the browser UI without restarting.

### Project structure

```
browser/
├── main/               # Electron main process
├── js/                 # Renderer process modules
│   ├── branches/       # Tree navigation system
│   ├── navbar/         # Top navigation bar & breadcrumbs
│   ├── searchbar/      # Omnibox and search plugins
│   ├── places/         # History and full-text search
│   └── util/           # Utilities and settings
├── css/                # Stylesheets
├── pages/              # Internal pages (settings, new tab, etc.)
├── localization/       # Multi-language support
└── ext/                # External libraries
```

### Building binaries

```bash
# Windows
npm run buildWindows

# macOS (Intel)
npm run buildMacIntel

# macOS (Apple Silicon)
npm run buildMacArm

# Linux (Debian)
npm run buildDebian

# Linux (RPM)
npm run buildRedhat

# Linux (AppImage)
npm run buildAppImage
```

**macOS**: Requires Xcode and command-line tools installed.

**Windows**: Requires Visual Studio. Run `npm config set msvs_version 2019` if needed.

## Contributing

We're building this in public and want contributors.

### Code contributions

1. Fork the repository
2. Create a feature branch
3. Make your changes (we use [Standard](https://standardjs.com/) code style)
4. Submit a pull request

### Translations

Browser supports 20+ languages. To add or update a translation:

1. Find your language code from [Chromium's list](https://source.chromium.org/chromium/chromium/src/+/main:ui/base/l10n/l10n_util.cc;l=68-259)
2. Copy `localization/languages/en-US.json` to `[your-language-code].json`
3. Translate the strings
4. Submit a pull request

## Open source

Browser is **MIT licensed** and free forever. Use it, fork it, make it yours.

| | |
|---|---|
| **License** | MIT — No restrictions |
| **Cost** | Free for individuals |
| **Hackable** | Built to be extended |
| **Community** | You shape the roadmap |

## Schools and organizations

Need support, training, or custom features? We'll build it.

**Contact us**: [hello@usefulventures.co](mailto:hello@usefulventures.co)

## Acknowledgments

Browser is built on top of [Min Browser](https://github.com/minbrowser/min), a fast, minimal browser by [@pfroud](https://github.com/pfroud) and contributors. We're grateful for their work in creating a solid, privacy-focused foundation.

---

Built by [Useful Ventures](https://usefulventures.co) • [GitHub](https://github.com/usefulventures/browser) • [Contact](mailto:hello@usefulventures.co)
