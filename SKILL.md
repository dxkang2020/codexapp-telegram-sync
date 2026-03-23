---
name: telegram-sync
description: 让 Codex 桌面对话和 Telegram 共享当前会话时使用。适用于首次配置 Telegram 桥接、启动或恢复桥接、把当前这条切到 Telegram 同步，以及关闭同步。
---

# Telegram Sync

## 目前支持情况

- macOS：已实际验证
- Windows：按同样思路可用，但还没有做过真机验证

## 先记住这条规则

- 同一时刻只能有一条对话在同步。
- 哪条对话最后显性执行了 `telegram-on`，哪条就是当前同步中的对话。
- 执行 `telegram-off` 后，当前这条就停止同步。
- 不要再依赖对话里的暗号、紫色 skill 标签，或隐藏标记。

## 首次配置

在这个 skill 目录里按下面顺序做：

1. 安装依赖：

```bash
npm install
```

2. 复制配置模板：

```bash
cp .env.example .env.local
```

3. 在 `.env.local` 里至少填这三个值：

```env
CODEX_TELEGRAM_CDP_ENDPOINT=http://127.0.0.1:9222
CODEX_TELEGRAM_BOT_TOKEN=你的_bot_token
CODEX_TELEGRAM_ALLOWED_CHAT_ID=你的_chat_id
```

4. 如果还不知道 `chat id`：
   先把 `CODEX_TELEGRAM_ALLOWED_CHAT_ID` 留空，启动桥接后给 bot 发 `/chatid`，拿到数字后填回 `.env.local`，再重启桥接。

5. 用 `9222` 方式启动 Codex。

macOS：

```bash
/Applications/Codex.app/Contents/MacOS/Codex --remote-debugging-port=9222
```

Windows：

```powershell
& "C:\Path\To\Codex\Codex.exe" --remote-debugging-port=9222
```

Windows 这条路径要换成对方自己机器上的实际安装位置。

6. 启动桥接：

```bash
node scripts/cli.js bridge
```

桥接启动后，这个终端要一直开着，不能关。

## 日常使用

在这个 skill 目录里运行：

- 开启当前这条同步：

```bash
node scripts/cli.js telegram-on
```

- 关闭当前这条同步：

```bash
node scripts/cli.js telegram-off
```

- 看现在到底跟的是哪条：

```bash
node scripts/cli.js telegram-status
```

Telegram 端只保留最小入口：

- 正常发消息
- `/chatid`
- `/help`

不要把 Telegram 当成线程管理面板。

## Agent 应该怎么做

如果用户是要“配置”：

- 先检查这个 skill 目录里有没有 `package.json`、`scripts/cli.js`、`.env.local`
- 再检查 `.env.local` 里是否已有 `CODEX_TELEGRAM_BOT_TOKEN`、`CODEX_TELEGRAM_ALLOWED_CHAT_ID`
- 再确认 Codex 是否按 `9222` 方式启动
- 如果是 Windows，不要假设安装路径固定，先让用户确认 `Codex.exe` 的实际位置
- 再确认桥接是否已经在跑
- 缺哪一步就补哪一步

如果用户是要“开启同步”：

- 不要让用户再去输入暗号
- 先运行一次：

```bash
node scripts/cli.js telegram-status --json
```

- 如果已经有别的对话在同步，而且不是当前这条，要先明确提醒用户：
  当前开启后，之前那条会停止同步，改为当前这条
- 直接在这个 skill 目录里显性执行：

```bash
node scripts/cli.js telegram-on
```

- 如果 `telegram-on` 的结果里出现 `PreviousThread`，也要把这件事明确告诉用户，不要轻描淡写带过
- 执行成功后，只用一句短中文确认已经开启

如果用户是要“关闭同步”：

- 直接在这个 skill 目录里显性执行：

```bash
node scripts/cli.js telegram-off
```

- 执行成功后，只用一句短中文确认已经关闭

## 分享给别人时需要什么

- Codex 桌面版
- Node 20 或更高版本
- `npm`
- Telegram bot token
- Telegram chat id
- 本机能用 `9222` 方式启动 Codex
- Windows 上如果安装路径不同，要把命令里的 `Codex.exe` 路径换成实际位置
