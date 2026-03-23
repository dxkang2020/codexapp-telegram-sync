import { CDPBridge } from './browser/cdp.js';
import { getCodexThreadSnapshot, sendToCodexComposer } from './codex-helpers.js';
import { loadLocalEnvFile } from './local-env.js';
import { loadCodexTelegramSyncState, saveCodexTelegramSyncState } from './sync-state.js';
import { browserSession } from './runtime.js';
const TELEGRAM_API = 'https://api.telegram.org';
const TELEGRAM_MESSAGE_LIMIT = 3900;
const CODEX_SYNC_DROP_LINE_PATTERNS = [
    /^已处理/i,
    /^已浏览/i,
    /^正在浏览/i,
    /^已编辑/i,
    /^背景信息已自动压缩$/i,
    /^\d+\s+个文件已更改$/i,
    /^[+-]\d+$/,
    /^撤销$/i,
    /^已运行/i,
    /^正在运行命令/i,
    /^shell$/i,
    /^\$\s+/,
    /^成功$/i,
    /^无输出$/i,
    /^request failed:/i,
];
function parsePositiveInt(value, fallbackValue) {
    const parsed = parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function collapseWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}
function normalizePromptText(value) {
    return collapseWhitespace(value);
}
function setSyncedThreadKey(state, threadKey) {
    const nextThreadKey = threadKey || null;
    if (state.syncedThreadKey === nextThreadKey) {
        return false;
    }
    state.syncedThreadKey = nextThreadKey;
    state.pendingReplies = [];
    state.recentTelegramInputs = [];
    state.candidate = null;
    return true;
}
function hasRecentUserTurn(beforeSnapshot, afterSnapshot, text) {
    const normalizedText = normalizePromptText(text);
    if (!normalizedText) {
        return false;
    }
    const beforeCount = beforeSnapshot.turns.length;
    const recentTurns = afterSnapshot.turns.slice(Math.max(0, beforeCount - 1));
    return recentTurns.some((turn) => normalizePromptText(turn.userText) === normalizedText);
}
function chunkTelegramText(text, maxLength = TELEGRAM_MESSAGE_LIMIT) {
    if (text.length <= maxLength) {
        return [text];
    }
    const chunks = [];
    let remaining = text;
    while (remaining.length > maxLength) {
        let splitPoint = remaining.lastIndexOf('\n', maxLength);
        if (splitPoint < 1)
            splitPoint = maxLength;
        chunks.push(remaining.slice(0, splitPoint));
        remaining = remaining.slice(splitPoint).trimStart();
    }
    if (remaining)
        chunks.push(remaining);
    return chunks;
}
function truncateTelegramText(text, maxLength = TELEGRAM_MESSAGE_LIMIT) {
    if (text.length <= maxLength)
        return text;
    return `${text.slice(0, Math.max(0, maxLength - 12)).trimEnd()}\n\n[truncated]`;
}
function normalizeTelegramCommand(text) {
    return text.replace(/^\/([a-z_]+)@[A-Za-z0-9_]+/, '/$1');
}
export function parseCodexTelegramCommand(text) {
    const raw = String(text || '').trim();
    const normalized = normalizeTelegramCommand(raw);
    const lower = normalized.toLowerCase();
    if (!normalized) {
        return { type: 'help' };
    }
    if (lower === '/start' || lower === '/help') {
        return { type: 'help' };
    }
    if (lower === '/chatid') {
        return { type: 'chatid' };
    }
    return { type: 'ask', text: raw };
}
function helpText() {
    return [
        'Telegram Sync',
        '',
        '/chatid  Show this chat id',
        '/help  Show this help',
        '',
        'Send normal messages to chat with the current synced Codex conversation.',
    ].join('\n');
}
export function sanitizeCodexTelegramSyncText(text) {
    const cleanedLines = [];
    for (const rawLine of String(text || '').split(/\r?\n/)) {
        const line = rawLine.replace(/\s+$/g, '');
        const trimmed = line.trim();
        if (!trimmed) {
            if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
                cleanedLines.push('');
            }
            continue;
        }
        if (CODEX_SYNC_DROP_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
            continue;
        }
        cleanedLines.push(line);
    }
    return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function truncateStableAssistantText(text) {
    const normalized = String(text || '').trim();
    if (!normalized) {
        return '';
    }
    const lastNewline = normalized.lastIndexOf('\n');
    if (lastNewline > 0) {
        return normalized.slice(0, lastNewline).trimEnd();
    }
    const sentenceMatches = Array.from(normalized.matchAll(/[。！？!?]/g));
    const lastSentence = sentenceMatches[sentenceMatches.length - 1];
    if (lastSentence && typeof lastSentence.index === 'number') {
        return normalized.slice(0, lastSentence.index + lastSentence[0].length).trimEnd();
    }
    return '';
}
function buildAssistantDelivery(currentText, deliveredText, allowPartial) {
    let finalText = currentText;
    if (allowPartial) {
        const stableText = truncateStableAssistantText(currentText);
        if (stableText) {
            finalText = stableText;
        }
        else if (deliveredText) {
            return null;
        }
    }
    if (!finalText || finalText === deliveredText) {
        return null;
    }
    if (deliveredText && finalText.startsWith(deliveredText)) {
        const appendedText = finalText.slice(deliveredText.length).replace(/^\s+/, '').trimEnd();
        if (!appendedText) {
            return null;
        }
        return {
            text: appendedText,
            nextDeliveredText: finalText,
        };
    }
    return {
        text: finalText,
        nextDeliveredText: finalText,
    };
}
function getDeliveredUnitMap(state, threadKey) {
    const existing = state.deliveredAssistantTexts.get(threadKey);
    if (existing) {
        return existing;
    }
    const created = new Map();
    state.deliveredAssistantTexts.set(threadKey, created);
    return created;
}
function getDeliveredUserMap(state, threadKey) {
    const existing = state.deliveredUserTexts.get(threadKey);
    if (existing) {
        return existing;
    }
    const created = new Map();
    state.deliveredUserTexts.set(threadKey, created);
    return created;
}
function markUserTurnAsDelivered(state, threadKey, turnKey, normalizedUserText) {
    if (!normalizedUserText) {
        return;
    }
    getDeliveredUserMap(state, threadKey).set(turnKey, normalizedUserText);
}
function markAssistantUnitsAsDelivered(state, threadKey, units) {
    if (!Array.isArray(units) || units.length === 0) {
        return;
    }
    const delivered = getDeliveredUnitMap(state, threadKey);
    for (const unit of units) {
        if (!unit?.unitKey || !unit?.nextDeliveredText) {
            continue;
        }
        delivered.set(unit.unitKey, unit.nextDeliveredText);
    }
}
function rememberSnapshotAsDelivered(snapshot, state) {
    state.activeThreadKey = snapshot.threadKey;
    state.initialized = true;
    state.candidate = null;
    const deliveredUsers = getDeliveredUserMap(state, snapshot.threadKey);
    const delivered = getDeliveredUnitMap(state, snapshot.threadKey);
    for (const turn of snapshot.turns) {
        const normalizedUserText = normalizePromptText(turn.userText);
        if (normalizedUserText) {
            deliveredUsers.set(turn.turnKey, normalizedUserText);
        }
        if (turn.isBusy || (turn.isLastTurn && snapshot.isBusy)) {
            continue;
        }
        for (const unit of turn.assistantUnits) {
            const sanitizedText = sanitizeCodexTelegramSyncText(unit.text);
            if (sanitizedText) {
                delivered.set(unit.unitKey, sanitizedText);
            }
        }
    }
}
export function createCodexTelegramBridgeState() {
    return {
        activeThreadKey: null,
        syncedThreadKey: null,
        deliveredUserTexts: new Map(),
        deliveredAssistantTexts: new Map(),
        candidate: null,
        pendingReplies: [],
        recentTelegramInputs: [],
        currentChatId: '',
        initialized: false,
    };
}
export function collectCodexTelegramDeliveries(snapshot, state, requiredStablePolls = 2) {
    if (!state.initialized || state.activeThreadKey !== snapshot.threadKey) {
        rememberSnapshotAsDelivered(snapshot, state);
        return [];
    }
    const deliveries = [];
    const deliveredUsers = getDeliveredUserMap(state, snapshot.threadKey);
    const delivered = getDeliveredUnitMap(state, snapshot.threadKey);
    for (const turn of snapshot.turns) {
        const assistantSyncAllowedForTurn = state.syncedThreadKey === snapshot.threadKey;
        const normalizedUserText = normalizePromptText(turn.userText);
        const deliveredUserText = deliveredUsers.get(turn.turnKey) || '';
        if (normalizedUserText && normalizedUserText !== deliveredUserText) {
            const mirroredFromTelegram = takeRecentTelegramInput(state, normalizedUserText);
            if (mirroredFromTelegram || state.syncedThreadKey !== snapshot.threadKey) {
                markUserTurnAsDelivered(state, snapshot.threadKey, turn.turnKey, normalizedUserText);
            }
            else {
                deliveries.push({
                    kind: 'user',
                    threadKey: snapshot.threadKey,
                    turnKey: turn.turnKey,
                    unitKeys: [],
                    userText: turn.userText,
                    text: turn.userText,
                    normalizedUserText,
                });
            }
        }
        const pendingUnits = turn.assistantUnits.map((unit) => {
            const currentText = sanitizeCodexTelegramSyncText(unit.text);
            const deliveredText = delivered.get(unit.unitKey) || '';
            if (!currentText) {
                return null;
            }
            if (currentText === deliveredText) {
                return null;
            }
            return {
                unitKey: unit.unitKey,
                currentText,
                deliveredText,
            };
        }).filter(Boolean);
        if (pendingUnits.length === 0) {
            continue;
        }
        if (turn.isLastTurn) {
            const signature = pendingUnits.map((unit) => `${unit.unitKey}:${unit.currentText}`).join('\n\n');
            if (state.candidate
                && state.candidate.threadKey === snapshot.threadKey
                && state.candidate.turnKey === turn.turnKey
                && state.candidate.signature === signature) {
                state.candidate.stablePolls += 1;
            }
            else {
                state.candidate = {
                    threadKey: snapshot.threadKey,
                    turnKey: turn.turnKey,
                    signature,
                    stablePolls: 1,
                };
            }
            if (state.candidate.stablePolls < requiredStablePolls) {
                continue;
            }
            state.candidate = null;
        }
        const allowPartialAssistantDelivery = Boolean(turn.isLastTurn && (turn.isBusy || snapshot.isBusy) && !turn.hasCompletedMarker);
        const readyUnits = pendingUnits.map((unit) => {
            const delivery = buildAssistantDelivery(unit.currentText, unit.deliveredText, allowPartialAssistantDelivery);
            if (!delivery) {
                return null;
            }
            return {
                unitKey: unit.unitKey,
                text: delivery.text,
                nextDeliveredText: delivery.nextDeliveredText,
            };
        }).filter(Boolean);
        if (readyUnits.length === 0) {
            continue;
        }
        const text = readyUnits.map((unit) => unit.text).filter(Boolean).join('\n\n').trim();
        if (!text)
            continue;
        if (!assistantSyncAllowedForTurn) {
            markAssistantUnitsAsDelivered(state, snapshot.threadKey, readyUnits);
            continue;
        }
        deliveries.push({
            kind: 'assistant',
            threadKey: snapshot.threadKey,
            turnKey: turn.turnKey,
            unitKeys: readyUnits.map((unit) => unit.unitKey),
            userText: turn.userText,
            text,
            readyUnits,
        });
    }
    return deliveries;
}
function rememberPendingReply(state, chatId, userText) {
    const normalizedUserText = normalizePromptText(userText);
    if (!normalizedUserText) {
        return;
    }
    state.pendingReplies.push({
        chatId,
        normalizedUserText,
        queuedAt: Date.now(),
    });
    if (state.pendingReplies.length > 50) {
        state.pendingReplies.splice(0, state.pendingReplies.length - 50);
    }
}
function rememberTelegramInput(state, chatId, userText) {
    const normalizedUserText = normalizePromptText(userText);
    if (!normalizedUserText) {
        return;
    }
    state.recentTelegramInputs.push({
        chatId,
        normalizedUserText,
        queuedAt: Date.now(),
    });
    if (state.recentTelegramInputs.length > 50) {
        state.recentTelegramInputs.splice(0, state.recentTelegramInputs.length - 50);
    }
}
function findPendingReplyMatch(state, delivery) {
    const normalizedUserText = normalizePromptText(delivery.userText);
    if (!normalizedUserText) {
        return null;
    }
    const matchIndex = state.pendingReplies.findIndex((entry) => entry.normalizedUserText === normalizedUserText);
    if (matchIndex < 0) {
        return null;
    }
    const match = state.pendingReplies[matchIndex];
    return match ? { chatId: match.chatId || null, matchIndex } : null;
}
function dropPendingReplyMatch(state, matchIndex) {
    if (!Number.isInteger(matchIndex) || matchIndex < 0 || matchIndex >= state.pendingReplies.length) {
        return;
    }
    state.pendingReplies.splice(matchIndex, 1);
}
function takeRecentTelegramInput(state, normalizedUserText) {
    const matchIndex = state.recentTelegramInputs.findIndex((entry) => entry.normalizedUserText === normalizedUserText);
    if (matchIndex < 0) {
        return null;
    }
    const [match] = state.recentTelegramInputs.splice(matchIndex, 1);
    return match?.chatId || null;
}
async function telegramRequest(token, method, body) {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Telegram ${method} failed with ${response.status}`);
    }
    const payload = await response.json();
    if (!payload.ok) {
        throw new Error(`Telegram ${method} error: ${payload.description || 'unknown error'}`);
    }
    return payload.result;
}
async function sendTelegramMessage(token, chatId, text) {
    const finalText = truncateTelegramText(text);
    if (!finalText.trim()) {
        return;
    }
    for (const chunk of chunkTelegramText(finalText)) {
        await telegramRequest(token, 'sendMessage', {
            chat_id: chatId,
            text: chunk,
        });
    }
}
async function getTelegramUpdates(token, offset, timeoutSeconds) {
    return telegramRequest(token, 'getUpdates', {
        offset,
        timeout: timeoutSeconds,
        allowed_updates: ['message'],
    });
}
function ensureCodexTelegramConfig(cwd) {
    loadLocalEnvFile(cwd, '.env');
    loadLocalEnvFile(cwd, '.env.local');
    process.env.CODEX_TELEGRAM_CDP_ENDPOINT ||= 'http://127.0.0.1:9222';
    process.env.CODEX_TELEGRAM_CDP_TARGET ||= 'codex';
    const botToken = process.env.CODEX_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
    if (!botToken) {
        throw new Error('缺少 Telegram bot token。请设置 CODEX_TELEGRAM_BOT_TOKEN。');
    }
    const allowedChatId = process.env.CODEX_TELEGRAM_ALLOWED_CHAT_ID || process.env.TELEGRAM_ALLOWED_CHAT_ID || '';
    if (!process.env.CODEX_TELEGRAM_CDP_ENDPOINT) {
        throw new Error('缺少 Codex 本地连接地址。先用 9222 方式启动 Codex。');
    }
    return {
        botToken,
        allowedChatId,
        pollTimeoutSeconds: parsePositiveInt(process.env.CODEX_TELEGRAM_POLL_TIMEOUT, 20),
        syncPollMs: parsePositiveInt(process.env.CODEX_TELEGRAM_SYNC_POLL_MS, 1500),
        stablePolls: parsePositiveInt(process.env.CODEX_TELEGRAM_STABLE_POLLS, 2),
    };
}
async function withCodexPage(fn) {
    try {
        return await browserSession(CDPBridge, fn);
    }
    catch (error) {
        throw new Error(`连接 Codex 失败：${String(error?.message || error)}`);
    }
}
function createSerializedCodexRunner() {
    let chain = Promise.resolve();
    return async function runSerializedCodex(fn) {
        const run = async () => withCodexPage(fn);
        const result = chain.then(run, run);
        chain = result.then(() => undefined, () => undefined);
        return result;
    };
}
async function handleCodexTelegramCommand(command, chatId, state, runOnCodex) {
    if (command.type === 'chatid') {
        return `Chat ID: ${chatId}`;
    }
    if (command.type === 'help') {
        return helpText();
    }
    state.currentChatId = chatId;
    const snapshot = await runOnCodex((page) => getCodexThreadSnapshot(page));
    if (!state.initialized || state.activeThreadKey !== snapshot.threadKey) {
        rememberSnapshotAsDelivered(snapshot, state);
    }
    if (state.syncedThreadKey !== snapshot.threadKey) {
        return '当前这条还没开启 Telegram 同步。先让桌面这条显性执行开启同步命令。';
    }
    try {
        await runOnCodex((page) => sendToCodexComposer(page, command.text));
        rememberTelegramInput(state, chatId, command.text);
        rememberPendingReply(state, chatId, command.text);
        return null;
    }
    catch (error) {
        const message = collapseWhitespace(String(error?.message || error));
        if (/still generating/i.test(message)) {
            return '当前线程刚好还在回复，等它结束后你再发一次。';
        }
        await sleep(800);
        const verifySnapshot = await runOnCodex((page) => getCodexThreadSnapshot(page));
        if (hasRecentUserTurn(snapshot, verifySnapshot, command.text)) {
            rememberTelegramInput(state, chatId, command.text);
            rememberPendingReply(state, chatId, command.text);
            return null;
        }
        throw error;
    }
}
async function runTelegramInboundLoop(config, state, runOnCodex) {
    let offset = 0;
    while (true) {
        try {
            const updates = await getTelegramUpdates(config.botToken, offset, config.pollTimeoutSeconds);
            for (const update of updates) {
                offset = update.update_id + 1;
                const message = update.message;
                const text = String(message?.text || '').trim();
                const chatId = String(message?.chat?.id || '');
                if (!text || !chatId) {
                    continue;
                }
                if (config.allowedChatId && chatId !== config.allowedChatId) {
                    await sendTelegramMessage(config.botToken, chatId, 'This bot is restricted to the configured chat.');
                    continue;
                }
                try {
                    const command = parseCodexTelegramCommand(text);
                    const reply = await handleCodexTelegramCommand(command, chatId, state, runOnCodex);
                    if (reply) {
                        await sendTelegramMessage(config.botToken, chatId, reply);
                    }
                }
                catch (error) {
                    const messageText = String(error?.message || error);
                    await sendTelegramMessage(config.botToken, chatId, `Request failed:\n${messageText}`);
                }
            }
        }
        catch (error) {
            console.error('[telegram-sync] Telegram 收消息失败:', error);
            await sleep(3000);
        }
    }
}
async function runCodexSyncLoop(config, state, runOnCodex) {
    while (true) {
        try {
            const snapshot = await runOnCodex((page) => getCodexThreadSnapshot(page));
            const externalSyncState = loadCodexTelegramSyncState();
            if (externalSyncState.syncedThreadKey !== state.syncedThreadKey) {
                setSyncedThreadKey(state, externalSyncState.syncedThreadKey);
                rememberSnapshotAsDelivered(snapshot, state);
            }
            if (!state.initialized || state.activeThreadKey !== snapshot.threadKey) {
                if (state.initialized && state.activeThreadKey !== snapshot.threadKey) {
                    state.pendingReplies = [];
                    state.recentTelegramInputs = [];
                }
                rememberSnapshotAsDelivered(snapshot, state);
            }
            else {
                const previousSyncedThreadKey = state.syncedThreadKey;
                const deliveries = collectCodexTelegramDeliveries(snapshot, state, config.stablePolls);
                if (state.syncedThreadKey !== previousSyncedThreadKey) {
                    saveCodexTelegramSyncState({
                        syncedThreadKey: state.syncedThreadKey,
                        title: state.syncedThreadKey ? snapshot.title : '',
                    });
                }
                const targetChatId = config.allowedChatId || state.currentChatId;
                for (const delivery of deliveries) {
                    if (delivery.kind === 'user') {
                        if (!targetChatId) {
                            markUserTurnAsDelivered(state, delivery.threadKey, delivery.turnKey, delivery.normalizedUserText);
                            continue;
                        }
                        const userText = String(delivery.text || '').trim();
                        const prefixedText = userText.includes('\n') ? `【Codex端请求】\n${userText}` : `【Codex端请求】${userText}`;
                        await sendTelegramMessage(config.botToken, targetChatId, prefixedText);
                        markUserTurnAsDelivered(state, delivery.threadKey, delivery.turnKey, delivery.normalizedUserText);
                        continue;
                    }
                    const pendingMatch = findPendingReplyMatch(state, delivery);
                    const finalChatId = pendingMatch?.chatId || targetChatId;
                    if (!finalChatId) {
                        markAssistantUnitsAsDelivered(state, delivery.threadKey, delivery.readyUnits);
                        continue;
                    }
                    await sendTelegramMessage(config.botToken, finalChatId, delivery.text);
                    if (pendingMatch) {
                        dropPendingReplyMatch(state, pendingMatch.matchIndex);
                    }
                    markAssistantUnitsAsDelivered(state, delivery.threadKey, delivery.readyUnits);
                }
            }
        }
        catch (error) {
            console.error('[telegram-sync] Codex 同步失败:', error);
        }
        await sleep(config.syncPollMs);
    }
}
export async function runCodexTelegramBridge(opts = {}) {
    const cwd = opts.cwd || process.cwd();
    const config = ensureCodexTelegramConfig(cwd);
    process.env.CODEX_TELEGRAM_CDP_TARGET ||= 'codex';
    if (!config.allowedChatId) {
        console.warn('[telegram-sync] Warning: no Telegram chat id restriction is configured.');
    }
    const state = createCodexTelegramBridgeState();
    state.currentChatId = config.allowedChatId || '';
    state.syncedThreadKey = loadCodexTelegramSyncState().syncedThreadKey;
    const runOnCodex = createSerializedCodexRunner();
    try {
        const initialSnapshot = await runOnCodex((page) => getCodexThreadSnapshot(page));
        rememberSnapshotAsDelivered(initialSnapshot, state);
    }
    catch (error) {
        console.warn('[telegram-sync] Warning: failed to capture the initial Codex thread snapshot.', error);
    }
    console.log('[telegram-sync] Codex Telegram sync bridge is listening for messages.');
    await Promise.all([
        runTelegramInboundLoop(config, state, runOnCodex),
        runCodexSyncLoop(config, state, runOnCodex),
    ]);
}
