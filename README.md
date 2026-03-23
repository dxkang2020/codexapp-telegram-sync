# Telegram Sync

让 Codex 桌面当前对话和 Telegram 共享同一条会话。

这套包分两部分：

- `SKILL.md`：给 Codex agent 用
- `scripts/`：真正运行的桥接程序

## 适合什么场景

- 电脑上主要用 Codex
- 人不在电脑旁边时，用 Telegram 看进度、继续发消息
- Telegram 只保留聊天和查看，不负责切线程

## 目前支持情况

- macOS：已实际验证
- Windows：按同样思路可用，但还没有做过真机验证

## 安装

把整个 `telegram-sync` 目录复制到你自己的 Codex skills 目录里，然后在这个目录运行：

```bash
npm install
cp .env.example .env.local
```

## 配置

在 `.env.local` 里至少填这三个值：

```env
CODEX_TELEGRAM_CDP_ENDPOINT=http://127.0.0.1:9222
CODEX_TELEGRAM_BOT_TOKEN=你的_bot_token
CODEX_TELEGRAM_ALLOWED_CHAT_ID=你的_chat_id
```

如果你还不知道 `chat id`，可以先把它留空，启动桥接后给 bot 发 `/chatid`，拿到数字后再填回去。

## 启动

先用 `9222` 方式启动 Codex。

macOS：

```bash
/Applications/Codex.app/Contents/MacOS/Codex --remote-debugging-port=9222
```

Windows：

```powershell
& "C:\Path\To\Codex\Codex.exe" --remote-debugging-port=9222
```

上面这条 Windows 路径需要换成你自己机器上的实际安装位置。

再启动桥接：

```bash
node scripts/cli.js bridge
```

这个终端要一直开着。

## 日常使用

在想同步的那条桌面对话里，让 agent 显性执行：

```bash
node scripts/cli.js telegram-on
```

关闭同步：

```bash
node scripts/cli.js telegram-off
```

查看当前同步状态：

```bash
node scripts/cli.js telegram-status
```

## Telegram 端保留什么

- 正常发消息
- `/chatid`
- `/help`

不提供切线程、开新线程这类控制命令。
