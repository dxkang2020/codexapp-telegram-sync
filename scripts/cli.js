#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { loadLocalEnvFile } from './lib/local-env.js';
import { CDPBridge } from './lib/browser/cdp.js';
import { browserSession } from './lib/runtime.js';
import { getCurrentCodexThread, getCodexThreadSnapshot } from './lib/codex-helpers.js';
import { getCodexTelegramSyncStatePath, loadCodexTelegramSyncState, saveCodexTelegramSyncState } from './lib/sync-state.js';
import { runCodexTelegramBridge } from './lib/bridge.js';

const __filename = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(__filename);
const skillDir = path.resolve(scriptDir, '..');

function ensureEnv() {
  loadLocalEnvFile(skillDir, '.env');
  loadLocalEnvFile(skillDir, '.env.local');

  process.env.CODEX_TELEGRAM_CDP_ENDPOINT ||= 'http://127.0.0.1:9222';
  process.env.CODEX_TELEGRAM_CDP_TARGET ||= 'codex';
}

function wantsJson(argv) {
  return argv.includes('--json') || (argv.includes('--format') && argv[argv.indexOf('--format') + 1] === 'json');
}

function printResult(value, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify([value], null, 2)}\n`);
    return;
  }

  for (const [key, raw] of Object.entries(value)) {
    const text = String(raw ?? '');
    if (!text) {
      continue;
    }
    process.stdout.write(`${key}: ${text}\n`);
  }
}

async function withCodexPage(fn) {
  ensureEnv();
  return browserSession(CDPBridge, fn);
}

async function runTelegramOn(json) {
  const result = await withCodexPage(async (page) => {
    const previousState = loadCodexTelegramSyncState();
    const snapshot = await getCodexThreadSnapshot(page);
    const current = await getCurrentCodexThread(page);
    const currentThread = current ? (current.index > 0 ? `${current.index}. ${current.title}` : current.title) : (snapshot.title || snapshot.threadKey);
    const previousThread = previousState.title || previousState.syncedThreadKey || '';

    saveCodexTelegramSyncState({
      syncedThreadKey: snapshot.threadKey,
      title: current?.title || snapshot.title || '',
    });

    const isSameThread = Boolean(previousState.syncedThreadKey && previousState.syncedThreadKey === snapshot.threadKey);
    const isSwitchingThread = Boolean(previousState.syncedThreadKey && previousState.syncedThreadKey !== snapshot.threadKey);

    return {
      Status: isSameThread ? 'Telegram sync already enabled' : (isSwitchingThread ? 'Telegram sync switched to current thread' : 'Telegram sync enabled'),
      Thread: currentThread,
      PreviousThread: isSwitchingThread ? previousThread : '',
      Notice: isSwitchingThread ? 'Enabling this thread stops sync for the previous thread.' : '',
      StateFile: getCodexTelegramSyncStatePath(),
    };
  });
  printResult(result, json);
}

function runTelegramOff(json) {
  saveCodexTelegramSyncState({
    syncedThreadKey: null,
    title: '',
  });
  printResult({
    Status: 'Telegram sync disabled',
    StateFile: getCodexTelegramSyncStatePath(),
  }, json);
}

function runTelegramStatus(json) {
  const state = loadCodexTelegramSyncState();
  printResult({
    Status: state.syncedThreadKey ? 'Telegram sync enabled' : 'Telegram sync disabled',
    Thread: state.title || state.syncedThreadKey || '',
    UpdatedAt: state.updatedAt || '',
    StateFile: getCodexTelegramSyncStatePath(),
  }, json);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const json = wantsJson(args);
  ensureEnv();

  if (command === 'bridge') {
    await runCodexTelegramBridge({ cwd: skillDir });
    return;
  }

  if (command === 'telegram-on') {
    await runTelegramOn(json);
    return;
  }

  if (command === 'telegram-off') {
    runTelegramOff(json);
    return;
  }

  if (command === 'telegram-status') {
    runTelegramStatus(json);
    return;
  }

  process.stdout.write([
    'Usage:',
    '  node scripts/cli.js bridge',
    '  node scripts/cli.js telegram-on',
    '  node scripts/cli.js telegram-off',
    '  node scripts/cli.js telegram-status',
  ].join('\n') + '\n');
}

main().catch((error) => {
  process.stderr.write(`${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
