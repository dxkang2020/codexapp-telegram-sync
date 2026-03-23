# Telegram Sync

Share your current Codex desktop conversation with Telegram.

This package has two parts:

- `SKILL.md` for Codex agents
- `scripts/` for the actual bridge

## Best for

- Using Codex desktop as your main workspace
- Checking progress and continuing the same conversation from Telegram when you are away
- Keeping Telegram focused on chatting instead of thread management

## Current support

- macOS: verified
- Windows: same setup approach, but not yet verified on a real machine

## Install

Copy the entire `telegram-sync` folder into your Codex `skills` directory, then run:

```bash
npm install
cp .env.example .env.local
```

## Configure

Fill in at least these three values in `.env.local`:

```env
CODEX_TELEGRAM_CDP_ENDPOINT=http://127.0.0.1:9222
CODEX_TELEGRAM_BOT_TOKEN=your_bot_token
CODEX_TELEGRAM_ALLOWED_CHAT_ID=your_chat_id
```

If you do not know your Telegram `chat id` yet, leave it empty for now, start the bridge, send `/chatid` to the bot, then paste the value back into `.env.local`.

## Start

Start Codex with the `9222` option first.

macOS:

```bash
/Applications/Codex.app/Contents/MacOS/Codex --remote-debugging-port=9222
```

Windows:

```powershell
& "C:\Path\To\Codex\Codex.exe" --remote-debugging-port=9222
```

Replace the Windows path with the real installation path on your machine.

Then start the bridge:

```bash
node scripts/cli.js bridge
```

Keep that terminal window open.

## Daily use

In the desktop conversation you want to sync, have the agent explicitly run:

```bash
node scripts/cli.js telegram-on
```

Turn sync off:

```bash
node scripts/cli.js telegram-off
```

Check the current sync status:

```bash
node scripts/cli.js telegram-status
```

## What stays in Telegram

- Normal chat messages
- `/chatid`
- `/help`

Telegram is intentionally kept simple. It does not manage threads, create new conversations, or switch between them.
