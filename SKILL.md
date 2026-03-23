---
name: telegram-sync
description: Use when you want to share the current Codex desktop conversation with Telegram. Covers first-time bridge setup, starting or restoring the bridge, switching the current conversation into Telegram sync, and turning sync off.
---

# Telegram Sync

## Current support

- macOS: verified
- Windows: same setup approach, but not yet verified on a real machine

## Core rule

- Only one conversation can be synced at a time.
- The conversation that most recently runs `telegram-on` becomes the active synced conversation.
- Running `telegram-off` stops sync for the current conversation.
- Do not rely on hidden markers, old trigger phrases, or skill-chip-only signals.

## First-time setup

Inside this skill directory, do the following:

1. Install dependencies:

```bash
npm install
```

2. Copy the config template:

```bash
cp .env.example .env.local
```

3. Fill in at least these three values in `.env.local`:

```env
CODEX_TELEGRAM_CDP_ENDPOINT=http://127.0.0.1:9222
CODEX_TELEGRAM_BOT_TOKEN=your_bot_token
CODEX_TELEGRAM_ALLOWED_CHAT_ID=your_chat_id
```

4. If you do not know the `chat id` yet:
   Leave `CODEX_TELEGRAM_ALLOWED_CHAT_ID` empty, start the bridge, send `/chatid` to the bot, then paste the value back into `.env.local` and restart the bridge.

5. Start Codex with the `9222` option.

macOS:

```bash
/Applications/Codex.app/Contents/MacOS/Codex --remote-debugging-port=9222
```

Windows:

```powershell
& "C:\Path\To\Codex\Codex.exe" --remote-debugging-port=9222
```

Replace the Windows path with the real installation path on that machine.

6. Start the bridge:

```bash
node scripts/cli.js bridge
```

Keep that terminal window open after the bridge starts.

## Daily use

Inside this skill directory:

- Turn sync on for the current conversation:

```bash
node scripts/cli.js telegram-on
```

- Turn sync off:

```bash
node scripts/cli.js telegram-off
```

- Check which conversation is currently synced:

```bash
node scripts/cli.js telegram-status
```

Telegram stays minimal:

- Normal chat messages
- `/chatid`
- `/help`

Do not treat Telegram as a thread management panel.

## Agent behavior

If the user wants setup:

- Check whether this skill directory already has `package.json`, `scripts/cli.js`, and `.env.local`
- Check whether `.env.local` already contains `CODEX_TELEGRAM_BOT_TOKEN` and `CODEX_TELEGRAM_ALLOWED_CHAT_ID`
- Confirm that Codex is running with the `9222` option
- On Windows, do not assume the install path; ask the user to confirm the real `Codex.exe` path first
- Confirm that the bridge is already running
- Fill in any missing step before reporting back

If the user wants to turn sync on:

- Do not tell the user to enter an old trigger phrase
- First run:

```bash
node scripts/cli.js telegram-status --json
```

- If a different conversation is already synced, clearly warn the user that turning sync on here will stop sync for the previous conversation
- Explicitly run:

```bash
node scripts/cli.js telegram-on
```

- If the result includes `PreviousThread`, clearly tell the user that sync was switched away from the previous conversation
- After success, reply with one short Chinese sentence confirming that sync is on

If the user wants to turn sync off:

- Explicitly run:

```bash
node scripts/cli.js telegram-off
```

- After success, reply with one short Chinese sentence confirming that sync is off

## Requirements for sharing

- Codex desktop app
- Node 20 or newer
- `npm`
- Telegram bot token
- Telegram chat id
- A local Codex app that can be started with the `9222` option
- On Windows, replace the sample `Codex.exe` path with the real one on that machine
