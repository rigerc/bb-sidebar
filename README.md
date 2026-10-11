# BB Sidebar

A stable thread list for [bb](https://github.com/get-bb/bb). Threads stay where you put them while status, snooze, and settle actions remain close at hand.

![BB Sidebar in light mode](docs/screenshots/sidebar-light.jpeg)

![BB Sidebar in dark mode](docs/screenshots/sidebar-dark.jpeg)

![BB Sidebar empty state](docs/screenshots/sidebar-empty.jpeg)

## Features

- Manual ordering plus Recent activity, Date created, and Project sort modes
- Subtle project grouping for projects with multiple active threads
- Pinned, Active, Inactive, Snoozed, Parked, and Settled shelves
- Project filtering
- Configurable New thread and New project buttons, plus optional thread row actions
- Sidebar spacing, visible details, toolbar placement, and press-and-hold selection settings
- Shift-click range selection, Ctrl/Cmd-click individual selection, and bulk pin, read/unread, park, and settle actions
- Asciimoji faces and pickers beside sidebar titles when the Asciimoji plugin is enabled
- Optional project colors with per-project color selection. Names stay colored in every mode; show stripes in full and collapsed mode, full mode only, or grouped projects only
- Automatic project icons with custom overrides
- Expandable child-thread indicators with running and attention states
- Live status, branch, pull request, and provider details
- Workspace port discovery, hover-card details, and optional browser links
- A Clean button in Settled that previews and closes live terminals and verified thread-owned listening ports, while protecting Active and Working threads
- Configurable inactive-thread and automatic cleanup rules
- Native bb navigation, split, rename, archive, and delete flows
- Project submenu on thread cards for settings, rename, local paths, and removal
- Regenerate a thread title from its last three accepted user messages
- Automatically retry missing thread titles once in the background, respecting the selected AI title service and manual edits

## Install

```sh
bb plugin install git:https://github.com/rigerc/bb-sidebar.git@feat/sidebar-quick-actions-multiselect-asciimoji
```

Then choose **BB Sidebar** under **Settings > Appearance > Sidebar**.

This fork requires bb 0.46.0 or newer. If the upstream sidebar is already installed,
bb will require you to remove it before switching sources; removing it clears its
plugin-owned shelf and ordering settings.

## Quick buttons and selection

Under **Settings > Plugins > BB Sidebar > Sidebar layout**, choose **Sidebar quick
actions** to show New thread, New project, or both, in your preferred order. New
thread opens the composer in the selected project scope. New project adds an
existing folder on a connected machine to BB. Place the toolbar at the top or
bottom, and show labels or icons only.

Choose compact, standard, or spacious thread spacing; toggle the project filter,
branch and machine details, provider icons, and open port indicators. An active
project filter remains visible so you can clear it.

Toggle **Snooze thread button** and **Settle thread button** independently to hide
either shortcut on thread rows. Both are shown by default. The thread context
menu still offers these actions.

**Thread row actions** configures up to four host/plugin actions beside each row.
Choose whether they appear on hover or stay visible. Touch devices always show
them. Choice actions open a picker; archive and delete retain bb's confirmation
dialogs. Unavailable plugin actions are skipped until their plugin is enabled.

**Hold to select** is enabled by default. Hold a thread for half a second, then
tap or click other threads to toggle them without opening them. Moving, scrolling,
or releasing before the hold completes cancels the gesture. Clear selection or
press **Escape** to return to opening threads normally.

Click a thread, then hold **Shift** and click another to select the visible range.
**Ctrl/Cmd-click** toggles individual threads; **Ctrl/Cmd-Shift-click** adds a range.
With a thread focused, **Shift+Enter** or **Shift+Space** selects a range. The bulk
toolbar shows the selection count; **Escape** clears it. Collapsed shelves and
filtered-out threads are excluded. Park and Settle are available only when every
selected thread is idle, and failed actions leave their threads selected for retry.

Enable sidebar faces in the **Asciimoji** plugin's settings to show its animated
faces and face picker beside titles. Asciimoji remains optional.

## Development

```sh
npm install
npm run build
bb plugin install path:. --yes
```

## Credits

This project includes code adapted from [bb-plugin-t3sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar). Its MIT copyright notice remains in [LICENSE](LICENSE).

The sidebar design and interactions are directly inspired by [T3 Code](https://github.com/pingdotgg/t3code), which is also released under the MIT License. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.

Park threads while waiting on someone else. Use **Park thread** in the context menu and **Resume** when ready. Parked threads have no timer and are excluded from automatic cleanup. Opening one leaves it parked; new thread activity brings it back to Active.

Use **Parent** in a thread's context menu to search threads in the same project, choose a parent, or select **None** to remove it. The current parent is checked; the thread itself and its descendants are excluded.

### Contributors

Thank you to everyone who has contributed to BB Sidebar:

- [@a-kras](https://github.com/a-kras): Child threads settings, sorting, and provider icons ([#3](https://github.com/yusuf8834/bb-sidebar/pull/3)); pinned order, animated reordering, child-thread drag and drop, and full thread trees ([#6](https://github.com/yusuf8834/bb-sidebar/pull/6))
- [@amrtawfik160](https://github.com/amrtawfik160): pull-request lookups only for visible rows ([#5](https://github.com/yusuf8834/bb-sidebar/pull/5))
- [@banjerluke](https://github.com/banjerluke): row and card actions on touch devices ([#2](https://github.com/yusuf8834/bb-sidebar/pull/2))
- [@elianiva](https://github.com/elianiva): bounded browser storage and quota-error recovery ([#1](https://github.com/yusuf8834/bb-sidebar/pull/1))
