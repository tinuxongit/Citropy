# Changelog

Each release publishes its section below as the release notes, which the app shows before updating.

## 0.10.0

### Added
- Google Antigravity is a provider alongside Claude Code, Codex, and OpenCode.
- A setup guide on first launch walks you through signing in to your agents and opening a project.
- Visual replies. Agents can answer with an interactive chart, table, calculator, or mockup shown inside the message. They can build big pages in parts and change an earlier visual without rewriting it. Turn them off in Settings > Appearance.
- Settings > Connections. Sign in to websites such as email or shopping once in Citropy's browser, and agents use that sign-in when you mention the site.
- Citropy skills. Write a skill once in Settings > Skills and every agent can use it in every project.
- Type `@` to tag a tool in your message, such as `@browser`, `@terminal`, `@subagents`, `@visual`, or `@image`, and the agent uses it for that message.
- Select code in the editor, right-click, and choose Add to chat.
- A dots background, and new pickers for theme, background, and interface size in Settings > Appearance.
- Each extra account gets its own sign-in, and you choose which account new chats use with the Use button in Settings > Providers.

### Changed
- The top bar and sidebar are joined into one surface, and light mode has a new look.
- Settings > Providers, Projects, and Environments have a cleaner layout, with accounts, folders, and servers in simple lists.
- The account picker is gone from the message box. Choose the account in Settings > Providers instead.
- The thin separators between the buttons below the message box are gone.
- The Add server project menu skips the server heading when you have only one server, and its options read "Open a folder…" and "Add SSH server…".
- Skills show as cards with an on/off switch.

### Fixed
- Visual replies that size themselves to the window, such as a phone mockup, show in full instead of being cut off.
- "Worked for" counts the time an agent spent thinking. Before, a long think could show as a few seconds.
- When an OpenCode model uses up its output limit before replying, the chat says so and suggests a lower effort, instead of ending with no answer.

## 0.9.0

### Added
- Shift-click or Shift-drag in the sidebar to select several conversations or projects, then finish, archive, delete, or remove them together.

### Changed
- On phones, the top bar buttons, sidebar rows, message buttons, and code block buttons are larger and easier to tap.
- On phones, the Running agents pop-up spans the screen above the bottom tab bar.
- Wide tables in replies scroll sideways instead of splitting words like "00:00" across lines.
- The conversation and project menus, the snooze menu, and the usage limits card slide out from the edge of the sidebar.
- "Generate title" moved into the Rename dialog as a Generate button.
- The project menu button shows three dots instead of a pencil.
- The Move up and Move down menu items are gone. Drag conversations and projects to reorder them.
- The jump to latest button is a small round arrow.
- Buttons grow slightly on hover and shrink when pressed.
- Pop-ups no longer have an outline.

### Fixed
- The Conversation details button works on phones and narrow windows. Before, the card never appeared there.
- Switching back to Citropy while text in a chat is selected keeps the selection instead of moving focus to the message box.

## 0.8.0

### Added
- Settings > Diagnostics shows Citropy's total memory and CPU use, in a summary card and in the process table headings.

### Changed
- The app uses the new Citropy Sans font.
- The model picker has a new design.
- An agent's work steps fold separately from its final answer.
- Thinking stays open while it streams.
- Tabs behave like Chrome tabs.
- Window corners are rounded again, and the window has no outline.
- Your messages use a shorter bubble.
- On large windows, text and controls grow a little with the window. The UI size setting still applies on top.
- The side panel keeps its share of the window when you resize it, and can be made wider than before.
- The stop button is larger and uses the accent color.
- New installs start with the plain background instead of the ASCII animation.
- The terminal uses a newer version of xterm.
- Citropy uses less memory. Very long open chats unload their oldest messages while you read the latest ones and load them again when you scroll up. Chats idle for an hour release their messages on the server. The code editor stops its TypeScript checker after two minutes without a TypeScript file open.
- The usage pop-up loads only your limits, so it opens faster.
- Terminals keep up with fast output, such as long build logs, with much less work.
- Closing a project also clears the browser data saved for it.

### Fixed
- A chat no longer shows "Thinking" after the reply has finished. This happened when you sent a message while the agent was handling a finished background task.
- Timers longer than an hour show hours, such as "16h 40m", instead of "999m 32s".
- Opening and closing the terminal panel no longer leaks memory.
- Drawings no longer keep removed images in memory.
- Copy and cut in the code editor's menu work when Citropy is opened over the local network. Paste explains to use the keyboard shortcut when the clipboard can't be read there.
- Drawing works when Citropy is opened over the local network.
- Branching a chat copies only the screenshots that the new chat still uses.
- Screenshots in long chats load faster.
- Deleting all of a draft's text and files removes the saved draft.
- Site icons next to links are fetched once per site instead of once per link.
- Restore options that can't be chosen look disabled.

## 0.7.0

### Added
- An Inbox replaces Notifications, with tabs, an "Unread only" filter, and day headings.
- A new loading icon: one blob splits into three drops, turns, and joins back together.
- The new chat screen shows "What's next for <project>?" above the message box.
- The Conversations page in Usage can be sorted and filtered by project.
- An open chat stays visible in the sidebar when its project folder is closed.
- The Git and GitHub buttons use their real logos.

### Changed
- Icons across the app are redrawn as solid shapes with thin cut-out details, including the left bar, sidebar, Git, GitHub, Settings, Usage, folders, servers, and the update button.
- Left bar icons grow slightly on hover and shrink when pressed. Conversation and panel tabs do the same.
- The left bar groups its buttons into soft rounded blobs instead of separating them with lines.
- Projects are a plain list, with each project's chats indented under its folder.
- The Local and Servers sections slide open and closed like projects.
- The sidebar search bar has a new look and no outline.
- Usage opens on Limits, shown as full-width provider cards.
- The Git section has a new layout, with the file list and code viewer in separate rounded panels.
- Messages stop at 75% of the chat width, so long messages wrap.
- Outlines and dividers use the same soft color as conversation details.
- The message box no longer shows a grey outline when focused.
- Chat titles in the sidebar are brighter and easier to read.

### Fixed
- Projects animate open and closed in long lists again. Before, lists over 40 rows closed instantly.
- Closing a project no longer shows its open chat twice.
- Chats inside projects no longer have extra space above or below.
- Hovering over a tab no longer moves its text.
- Sidebar rows without a logo line up with the rows that have one.

## 0.6.1

### Added
- A 24-hour clock option in Settings.
- The main chat has a visible scrollbar you can drag.
- A working conversation stays visible in the sidebar while its project is collapsed.

### Changed
- An agent's work folds into one "N steps" row that shows the latest step while it works, and a "Worked for" row when it finishes.
- Side panels slide open and closed smoothly.
- The Latest button has a new design.
- Notifications and running agents take less space.
- Running shells appear only in conversation details, no longer above the message box.
- Menus and pop-ups have rounder corners, and clickable items show a pointer cursor.
- Color themes tint the whole interface.
- The newest reply always shows its time and copy button.

### Fixed
- The browser panel no longer stays black after the sidebar reopens.
- The Latest button no longer turns see-through on hover.
- Short shell commands no longer flash in the shell lists.
- Jumping to an older command opens its folded steps.
- Claude models appear in the right order without duplicates.

## 0.6.0

### Added
- Usage reports estimate API costs by provider and model, with input, cache, output, and speed breakdowns.
- Import conversation history from Claude Code, Codex, and OpenCode.
- Manage conversations in tabs, search from the title bar, and open Settings, Usage, and running agents from the profile menu.

### Changed
- Navigation, window controls, and settings pages use a more consistent layout.
- Removed Chat mode, language selection, and support for Pi and Cursor.

### Fixed
- SSH connections can reconnect after an interrupted session.
- macOS terminal services start correctly when the system temporary path is long.

## 0.5.7

### Improved
- Long conversations load recent messages first, with older messages available on demand and through search.
- Live updates follow the conversations retained in the interface, with tool progress and text deltas combined before transmission. Streaming avoids repeatedly encoding retained text and tool output.
- Large GitHub diffs use the virtualized diff viewer. Task reviews load file patches as they are opened.
- Reopening highlighted diffs reuses cached tokens within the existing memory budget. Simultaneous requests for the same highlighting share one worker operation.
- Secondary screens, drawing and notes load when they are needed, reducing initial JavaScript transfer.
- Background tool updates measure only changed content when checking conversation cache sizes.
- Indexed conversation searches filter matching messages before reading their text.
- Sidebar updates reuse virtualized row measurements when the row order stays the same.
- Terminal panes reuse successful graphics capability detection.
- Resource diagnostics measure CPU between updates and share overlapping collection requests.

### Removed
- Computer use, including desktop control tools, screen sharing, settings and native helpers.

## 0.5.6

### Fixed
- Stopping an accepted plan while it switches modes prevents it from starting implementation afterward.
- Subagents that are still starting count toward the four-agent limit.
- Branched and restored conversations retain attachment references when rebuilding history for the agent.
- Custom answers to Cursor's questions reach the agent, including any selected choices.
- Starting a Codex chat keeps other conversations responsive while it discovers MCP servers.
- Loading a large conversation history no longer briefly disconnects all chats when other updates arrive.
- Codex's asynchronous questions show an answer panel and remain available after the response finishes.
- Stopped conversations reject late approval requests, including tools previously set to always allow.
- Invalid permission replies cannot approve a tool, and conversations stay marked as waiting until all approvals are answered.
- Settings changed while an earlier update is applying take effect in the next response.
- Sending a message during a live settings change waits for the update and survives a failed provider reconfiguration.
- Updated packaging dependencies with security fixes.

## 0.5.5

### Added
- A new logo, a lemon half slice on a yellow square.
- Back and forward buttons in the title bar to return to the page or conversation you were on.
- After an update, Citropy shows what's new once it's finished replying.
- A content width setting in Appearance for how wide conversations, the chat box and settings pages get.
- An option to show the background on every page, not only in conversations.
- Dim, blur and reading area controls for the ASCII background.

### Changed
- The sidebar always lists every open folder in Code mode. The Sidebar mode setting is gone.
- The running agents button moved from the sidebar footer and side strip to the title bar.
- The ASCII background draws on the graphics card and uses less processor time.

### Fixed
- Claude's effort choices no longer include stray entries parsed from its help text.
- The macOS window buttons line up with the title bar.
- A link that fails to open now shows an error instead of doing nothing.

### Added
- Keyboard shortcuts to open Settings with Ctrl+, and choose a project folder with Ctrl+O, using Cmd on macOS.
- Computer control on Sway through screen sharing and direct virtual input, without a VNC server.
- Chat mode, next to Code in the mode switch at the top of the window. Chat conversations can browse the web and search and read files anywhere on your computer, but can't run commands, edit files, or start subagents.
- Local sharing. Pair a phone or tablet on the same network by scanning a QR code, then use Citropy from it. On Linux, Citropy offers to open the firewall port when ufw blocks it.
- An agents panel listing every running agent with its status, memory, and CPU use. Turn off one agent or all idle ones.
- After a turn that edits files, the conversation shows which files changed with added and removed line counts. Click it to review the changes.
- Swipe from the screen edge to open and close the sidebars on touch screens.
- Agents can hover, wait for the page, pick dropdown options, upload files, swipe, emulate dark mode or reduced motion, and read console errors and failed requests in the shared browser. When the browser tab is on screen, you can watch the agent's pointer move and click.

### Changed
- A calmer, warmer look with more consistent spacing, type sizes, and section pages.
- The interface defaults to 90% size with a mouse, and stays at 100% on touch screens.
- Navigation lives in the sidebar footer by default. The side strip is still available in Appearance settings, and phones use it as a bottom tab bar.
- Clicking the current page's navigation button again toggles the sidebar.
- On narrow windows, opening one side panel closes the other when both won't fit.

### Fixed
- View-only computer sessions can use ScreenCast portals without RemoteDesktop support.
- Computer tools accept numeric arguments serialized as strings by MCP clients, including pointer coordinates, wait durations, and screenshot widths.
- Wayland capture releases PipeWire buffers promptly and reports a stalled stream instead of returning an old screenshot as a fresh frame.
- Screenshots of unchanged Wayland screens keep working instead of timing out on damage-only capture.
- Questions and approvals from Claude Code no longer time out before the 30-minute answer window ends.
- The on-screen keyboard on phones no longer pushes the app out of view.

## 0.5.3

### Fixed
- Long conversation titles no longer overlap the sidebar action buttons on touch screens.

## 0.5.2

### Added
- Drawing selection, moving, copying, pasting, and deleting marks, with a layers list for selecting and hiding items.
- Paste images and screenshots into drawings, with saved images restored when you return.
- A shared custom color picker for drawings and appearance settings, including a magnified picker for colors inside the desktop app.
- Claude Code workflow agents appear in the conversation's subagent activity.

### Changed
- Sidebar transitions do less work while preserving smooth motion. The reading-area blur reuses prepared image layers instead of repainting its canvas on each frame.
- Composer tabs move with the composer when sidebars open and close, avoiding unnecessary tab animations.
- Drawings start with a blank canvas and use smoother freehand strokes.
- Confirmation cards appear beside the action that opened them.

### Fixed
- Rapid sidebar toggles no longer leave the reading area behind the chat or push message headers past the chat edge.
- The reading-area blur fades across its edges without a sharp cutoff, and the Citropy title keeps the right contrast during sidebar transitions.
- The current screen stays visible while Settings and other pages load.
- Selected drawing layers preserve their stacking order while being dragged.
- Queued messages keep their order when a turn ends or a stop finishes while another message is being prepared.
- Claude Code waits for steered messages to be read before completing the turn and reports messages left unread when stopped.
- Claude session, weekly, and model limits are recognized for usage-limit recovery.
- Conversation history requests can retry after an earlier response has arrived.

## 0.5.1

### Added
- OpenCode 2 support. Citropy detects whether OpenCode 1 or 2 is installed and connects the right way, with models, chats, permission prompts, questions, subagents, steering, compaction, slash commands, and writing titles and commit messages. Thanks to @anmolkcs for reporting the broken OpenCode sync (#26). <3
- An OpenCode version choice in Settings > Providers, to pick OpenCode 1 or 2 yourself instead of detecting it automatically.

### Changed
- Long replies use less CPU to save streamed text while preserving every committed update.
- Conversation search reuses a background index and cancels work when a query is replaced or its client disconnects.
- Inactive browser tabs reduce background activity while remaining available for browser tools.
- Terminal tabs resume from their last output position instead of replaying unchanged history.
- Idle terminals release GPU renderers, and rapid tab switches avoid rebuilding them.
- Large conversations use fewer navigation controls, with keyboard access to every message.
- Streaming replies spend less time copying conversation state.
- Production assets use precompressed downloads, and Git status needs fewer subprocesses.
- The app opens before provider discovery finishes, and completed plans no longer force history recovery on startup.
- Checkpoints reuse file metadata and batch native Git updates, remote environments retire old builds, and container source changes preserve dependency layers.
- Link icons have bounded requests and stop loading when no clients need them.

### Fixed
- OpenCode 2 no longer fails to load its models with "Unrecognized flag: --verbose".
- Choosing OpenCode 2 uses the separate `opencode2` command when OpenCode 1 is also installed, and early OpenCode 2 beta versions are recognized.
- The OpenCode update check follows the OpenCode version in use, instead of reporting OpenCode 1 updates for an OpenCode 2 install.
- Malformed WebSocket frames close the affected connection without crashing the server.
- Concurrent syntax highlighting no longer corrupts cache accounting.
- Automatic quota resumption checks the selected provider account and preserves known limits during outages.
- Deleting conversations releases their checkpoint references.
- Discard changes is reachable with the keyboard.
- Scripted macOS updates download and verify the selected release before stopping the app.

## 0.4.14

### Added
- A new Usage overview with daily, weekly, and monthly charts, provider and model breakdowns, period comparisons, and a table view. Local provider logs include work outside Citropy; Cursor shows usage from Citropy conversations.
- Separate Usage pages for account limits and saved conversations, with sortable conversation totals.
- Search from the browser address bar, with Google, DuckDuckGo, Bing, or Brave Search as your preferred search engine.
- Browser buttons to stop loading, copy the current link, and open it in your usual browser.
- Reasoning effort controls for the models that write conversation titles, commit messages, and code reviews.
- Snooze conversations for a number of minutes, hours, or days, or until a reported usage limit resets.
- A Discard plan button that cancels the remaining steps and clears the plan tab.
- An Opaque pop-ups setting for fully solid menus, pop-ups, and question and permission cards.
- Video thumbnails in attachments and tool results, with playback in the video viewer.

### Changed
- Queued messages have position numbers and consistently aligned controls, without the extra heading bar.
- The work-details arrow slides into view beside Thinking when reasoning arrives.
- Settings use consistent menus, and model pickers include an animated reasoning-effort slider.
- Browser size, mobile mode, and rotation controls share a more compact toolbar. The empty page and page preview follow the selected device size.
- Streaming long replies, switching conversations, resizing panels, and the animated text background do less work on the interface thread.
- Resume-at-reset and snooze-until-reset options use switches with clearer explanations.
- More interface icons use neutral colors, and image previews brighten on hover.

### Fixed
- Thinking no longer disappears or shifts the chat when the first reasoning text arrives. Its entrance animation stays intact.
- Queued messages keep their attachments and position if preparation fails or sending is interrupted before delivery.
- Unsupported links in replies display as text instead of opening another copy of the app.
- Selecting a named pipe as context no longer leaves message preparation waiting indefinitely.
- Closing an interactive terminal also closes shells that ignore the termination signal.
- Models are told to check Citropy's available provider accounts and models before declaring a requested cross-provider subagent unavailable.
- Snoozed conversations appear in their own group when the sidebar is organized by workspace.
- Back closes page dialogs and popovers in mobile browser mode, and tabs close in Citropy when their page closes itself.
- Changes made to project settings while a previous save is pending stay in the form instead of being replaced by the older response.

## 0.4.13

### Added
- Panel tabs, and the button that shows the panels, get a dot when a panel opens in the background or its command finishes while you're looking elsewhere.
- A collapsed project folder shows the working icon when a conversation inside it is working or waiting for you.
- Zoom buttons for videos. Videos open filling the window.
- A volume slider that pops up above the volume button.
- Hovering the video seek bar shows the time under your cursor.

### Changed
- New conversations appear at the top of their project instead of the bottom.
- Videos attached in the chat open in the same viewer as images, with the name above the video.
- A cleaner video player: controls sit on a soft gradient, the seek bar is a thin line without a handle, and the time reads "0:10 / 0:35".
- Double-clicking a video no longer switches to full screen.
- Question and permission cards, and menus and popovers, stay at least 95% solid however see-through you set the app, and fade smoothly.
- When a question and a permission request arrive together, they show one at a time, oldest first.
- The release notes arrows hide at the newest and oldest release instead of showing a button that does nothing.
- The Latest button has slightly rounded corners instead of a pill shape.

### Fixed
- Question and permission cards no longer turn see-through while they slide in or out.
- The chat no longer jumps and flickers when the agent's text folds into Work details as it keeps working.
- Dragging the video seek bar no longer crackles, and the progress bar moves smoothly while playing.
- A question and a permission request arriving together no longer squeeze into one row with overlapping buttons.
- "Ran 1 command" and similar summaries, and the Latest button, now highlight when you hover them.

## 0.4.12

### Added
- Arrows next to "What's in" in the update popover page through the notes of earlier releases.
- A copy button on code blocks in the chat.
- A Plan tab on the message box shows the agent's checklist while steps remain.

### Changed
- Questions and permission requests from the agent rise out of the message box as a wide tab, joined to it like the Git and shell tabs.
- Stopping a shell the agent started now stops only that command. The agent keeps working instead of stopping too.
- A new video player with play, a seek bar, time, mute, and full screen. Controls hide while the video plays, and Space, K, M, F, and the arrow keys work.

### Fixed
- Clicking anywhere outside the image closes the image viewer.
- Closed four security flaws in how the code editor cleans up HTML before showing it.

## 0.4.11

### Fixed
- Typing past the first line in the message box no longer scrolls the chat or shows the Latest button.

## 0.4.10

### Fixed
- Terminals open again on macOS. Every terminal failed to start in 0.4.9.

## 0.4.9

### Added
- Themes now combine a color with a separate dark or light mode, including a custom color.
- A setting for how far the background image focus spreads.

### Changed
- Composer tabs slide in and out.
- The Git and running shells panels close when you click outside them.

### Fixed
- The chat keeps following new messages when the window or UI scale changes.
- Opening a review from the Git panel closes the panel, so clicks in the review are no longer lost.
