export const DEFAULT_BROWSER_CONNECT_TIMEOUT = parseInt(process.env.CODEX_TELEGRAM_BROWSER_CONNECT_TIMEOUT ?? '30', 10);
export const DEFAULT_BROWSER_COMMAND_TIMEOUT = parseInt(process.env.CODEX_TELEGRAM_BROWSER_COMMAND_TIMEOUT ?? '60', 10);
export const DEFAULT_BROWSER_EXPLORE_TIMEOUT = parseInt(process.env.CODEX_TELEGRAM_BROWSER_EXPLORE_TIMEOUT ?? '120', 10);
export const DEFAULT_BROWSER_SMOKE_TIMEOUT = parseInt(process.env.CODEX_TELEGRAM_BROWSER_SMOKE_TIMEOUT ?? '60', 10);
/**
 * Timeout with seconds unit. Used for high-level command timeouts.
 */
export async function runWithTimeout(promise, opts) {
    return withTimeoutMs(promise, opts.timeout * 1000, `${opts.label ?? 'Operation'} timed out after ${opts.timeout}s`);
}
/**
 * Timeout with milliseconds unit. Used for low-level internal timeouts.
 */
export function withTimeoutMs(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
}
export async function browserSession(BrowserFactory, fn) {
    const mcp = new BrowserFactory();
    try {
        const page = await mcp.connect({ timeout: DEFAULT_BROWSER_CONNECT_TIMEOUT });
        return await fn(page);
    }
    finally {
        await mcp.close().catch(() => { });
    }
}
