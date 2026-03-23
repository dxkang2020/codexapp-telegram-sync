import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function getCodexTelegramSyncStatePath() {
    return path.resolve(__dirname, '../../var/telegram-sync-state.json');
}
export function loadCodexTelegramSyncState() {
    const syncStatePath = getCodexTelegramSyncStatePath();
    if (!existsSync(syncStatePath)) {
        return {
            syncedThreadKey: null,
            title: '',
            updatedAt: '',
        };
    }
    try {
        const raw = readFileSync(syncStatePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            syncedThreadKey: parsed?.syncedThreadKey ? String(parsed.syncedThreadKey) : null,
            title: parsed?.title ? String(parsed.title) : '',
            updatedAt: parsed?.updatedAt ? String(parsed.updatedAt) : '',
        };
    }
    catch {
        return {
            syncedThreadKey: null,
            title: '',
            updatedAt: '',
        };
    }
}
export function saveCodexTelegramSyncState(nextState) {
    const syncStatePath = getCodexTelegramSyncStatePath();
    mkdirSync(path.dirname(syncStatePath), { recursive: true });
    const normalizedState = {
        syncedThreadKey: nextState.syncedThreadKey ? String(nextState.syncedThreadKey) : null,
        title: nextState.title ? String(nextState.title) : '',
        updatedAt: new Date().toISOString(),
    };
    writeFileSync(syncStatePath, JSON.stringify(normalizedState, null, 2));
    return normalizedState;
}
