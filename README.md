<div align="center">
  <img src="docs/assets/hero.png" width="100%" alt="Citropy, with a conversation on the desktop and a rainfall chart reply on a phone">
  <p>
    <a href="https://github.com/tinuxongit/Citropy/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/tinuxongit/Citropy?label=release&color=0a0a09&labelColor=2a2826"></a>
    <a href="https://github.com/tinuxongit/Citropy/actions/workflows/checks.yml"><img alt="Checks" src="https://github.com/tinuxongit/Citropy/actions/workflows/checks.yml/badge.svg?branch=main"></a>
    <img alt="Linux, macOS, and Windows" src="https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-0a0a09.svg?labelColor=2a2826">
    <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-0a0a09.svg?labelColor=2a2826"></a>
  </p>
  <p>
    <a href="#install"><b>Install</b></a> &nbsp;&middot;&nbsp;
    <a href="#one-window-four-agents">Features</a> &nbsp;&middot;&nbsp;
    <a href="docs/guide.md">Guide</a> &nbsp;&middot;&nbsp;
    <a href="CHANGELOG.md">Changelog</a> &nbsp;&middot;&nbsp;
    <a href="https://github.com/tinuxongit/Citropy/releases/latest">Downloads</a>
  </p>
</div>

<br>

Citropy runs the coding agents you already pay for in one desktop app. Each conversation picks its own agent, model and permission mode, and can switch agents halfway without losing its history. Files, Git, terminals and the browser belong to the project, so every agent works on the same things you see.

## Install

**Linux and macOS**

```sh
curl -fsSL https://raw.githubusercontent.com/tinuxongit/Citropy/main/scripts/install.sh | sh
```

**Windows** in PowerShell

```powershell
irm https://raw.githubusercontent.com/tinuxongit/Citropy/main/scripts/install.ps1 | iex
```

You need Git and one coding agent. On first launch the setup guide installs and signs in to [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://github.com/openai/codex), [OpenCode](https://opencode.ai) or Google Antigravity. Antigravity downloads from Google. The other three install through npm, so they need Node.js. Citropy itself needs no Node.js or admin password, and updates itself from Settings.

<details>
<summary>Where it installs</summary>

| System | Build | Installed to |
| --- | --- | --- |
| Linux | x86_64 AppImage | `~/.local/bin/citropy`, plus an application menu entry |
| macOS | Apple Silicon and Intel | `~/Applications/Citropy.app` |
| Windows | x64 | `%LOCALAPPDATA%\Programs\citropy`, plus a Start menu entry |

</details>

<br>

## One window, four agents

Pick the agent and model for each conversation from one menu. Run Claude Code on one task and Codex on the next, or hand a conversation to another agent when the first runs out of usage. Extra accounts each get their own sign-in, and Settings > Providers sets which one new chats use.

<img src="docs/assets/agents.png" width="100%" alt="The model menu listing Claude Code, Codex, OpenCode and Antigravity, each linked to its default model">

## Review and commit

The Source control page groups changes into added, changed and deleted. Stage, unstage or revert a single hunk, read the diff beside the file list, and commit without leaving the app. AI commit writes the message in a separate session, so your conversation stays clean. You can also restore or branch from any earlier message.

<img src="docs/assets/changes.png" width="100%" alt="The Source control page pulled apart into its file list, commit box and diff">

## Answers you can use

Agents can reply with an interactive chart, table, calculator or mockup, drawn right inside the message. They build big pages in parts and can change one piece later without redrawing the rest. Turn visual replies off in Settings > Appearance.

<img src="docs/assets/visual.png" width="100%" alt="A rainfall chart reply comparing this week and last week, in dark and light themes">

## On your phone

Turn on Local sharing in Settings, scan the code with your phone's camera, and keep the same conversations going from the couch. Each code works once. Paired phones are listed in Settings, and you can remove one at any time.

<img src="docs/assets/phones.png" width="100%" alt="Two phones showing the conversation list and a chart reply, next to the Local sharing QR code and paired devices list">

## Everything else

<img src="docs/assets/bento.png" width="100%" alt="Tiles for the code editor, the browser with phone sizes, questions from the agent, SSH and Docker projects, usage and limits, the setup guide, and light and dark themes">

The [guide](docs/guide.md) covers every part of the app in detail.

## More

<details>
<summary>Uninstall</summary>

Conversations and settings live in `~/.citropy` and are kept.

```sh
curl -fsSL https://raw.githubusercontent.com/tinuxongit/Citropy/main/scripts/install.sh | sh -s -- --uninstall
```

```powershell
$s = irm https://raw.githubusercontent.com/tinuxongit/Citropy/main/scripts/install.ps1; & ([scriptblock]::Create($s)) -Uninstall
```

</details>

<details>
<summary>Build from source</summary>

Requires Node.js 22.18 or newer and Git.

```sh
git clone https://github.com/tinuxongit/Citropy.git
cd Citropy
npm install
npm run desktop
```

If the Electron download was skipped during `npm install`, run `npm run setup:desktop` once.

| Command | What it does |
| --- | --- |
| `npm run desktop:dev` | Desktop window with live reload. Uses separate data in `~/.citropy-dev` |
| `npm run dev` | Web development server, no desktop window |
| `npm start` | Web interface at http://127.0.0.1:4177 |
| `npm run typecheck` | TypeScript check |
| `npm test` | Test suite |
| `npm run desktop:package` | Build a release package into `release/` |
| `npm run screenshots` | Capture the app with sample data and rebuild the README images in `docs/assets` from `tests/readme-art`. Pass scene names, such as `chat git`, to capture only those and skip the images |

Packaging and publishing are in [docs/release.md](docs/release.md).

</details>

Issues and pull requests are welcome.

MIT licensed. See [LICENSE](LICENSE). The Citropy Sans font, a modified Google Sans Flex, is bundled under the SIL Open Font License.
