import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
function stripWrappingQuotes(value) {
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}
export function loadLocalEnvFile(cwd = process.cwd(), filename = '.env.local') {
    const envPath = resolve(cwd, filename);
    if (!existsSync(envPath)) {
        return null;
    }
    const content = readFileSync(envPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const matched = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!matched) {
            continue;
        }
        const [, key, rawValue] = matched;
        process.env[key] = stripWrappingQuotes(rawValue.trim());
    }
    return envPath;
}
