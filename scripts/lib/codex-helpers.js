const THREAD_QUERY = [
  '[data-testid*="thread"]',
  '[class*="thread-list"] a',
  '[class*="thread-list"] button',
  '[role="listbox"] [role="option"]',
].join(', ');

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeThreadTitle(value) {
  return collapseWhitespace(value).toLowerCase();
}

function buildListThreadsJs() {
  return `
    (function() {
      function textOf(node) {
        return String(node?.innerText || node?.textContent || '')
          .replace(/\\s+/g, ' ')
          .trim();
      }

      function looksActive(node) {
        if (!node) return false;
        if (
          node.matches?.('[aria-selected="true"], [aria-current="page"], [data-state="active"], [data-active="true"], [aria-pressed="true"]')
        ) {
          return true;
        }

        const markedAncestor = node.closest?.(
          '[aria-selected="true"], [aria-current="page"], [data-state="active"], [data-active="true"], [aria-pressed="true"]'
        );
        if (markedAncestor) return true;

        const nodes = [node, node.parentElement, node.closest?.('li, a, button, [role="option"], [role="listitem"]')].filter(Boolean);
        return nodes.some((entry) => {
          const className = String(entry.className || '').toLowerCase();
          return /(^|\\s)(active|selected|current)(\\s|$)/.test(className);
        });
      }

      const candidates = Array.from(document.querySelectorAll(${JSON.stringify(THREAD_QUERY)}));
      const results = [];

      for (const node of candidates) {
        const title = textOf(node).slice(0, 140);
        if (!title || title.length < 2) continue;

        const rect = node.getBoundingClientRect?.();
        const visible = !rect || (rect.width > 0 && rect.height > 0);
        if (!visible) continue;

        results.push({
          index: results.length + 1,
          title,
          active: looksActive(node),
        });
      }

      return results;
    })()
  `;
}

function buildCurrentThreadFallbackJs() {
  return `
    (function() {
      function textOf(node) {
        return String(node?.innerText || node?.textContent || '')
          .replace(/\\s+/g, ' ')
          .trim();
      }

      const preferred = [
        document.querySelector('main h1'),
        document.querySelector('main h2'),
        document.querySelector('[data-testid="conversation"] h1'),
        document.querySelector('[role="main"] h1'),
      ].find(Boolean);

      const preferredText = textOf(preferred);
      if (preferredText) return preferredText.slice(0, 140);

      const title = textOf(document.querySelector('title')) || textOf({ innerText: document.title });
      return title.slice(0, 140);
    })()
  `;
}

function buildThreadSnapshotJs() {
  return `
    (function() {
      function collapse(value) {
        return String(value || '')
          .replace(/\\s+/g, ' ')
          .trim();
      }

      function textOf(node) {
        return collapse(node?.innerText || node?.textContent || '');
      }

      function formattedTextOf(node) {
        if (!node) return '';

        const blockTags = new Set([
          'P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN',
          'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        ]);

        function cleanText(value) {
          return String(value || '')
            .replace(/\\u00a0/g, ' ')
            .replace(/[ \\t\\f\\v]+/g, ' ');
        }

        function renderChildren(parent) {
          return Array.from(parent.childNodes || []).map((child) => renderNode(child)).join('');
        }

        function renderList(list) {
          const isOrdered = String(list.tagName || '').toLowerCase() === 'ol';
          const items = Array.from(list.children || []).filter((child) => String(child.tagName || '').toLowerCase() === 'li');
          return items.map((item, index) => {
            const prefix = isOrdered ? String(index + 1) + '. ' : '• ';
            const content = renderChildren(item).trim();
            return content ? prefix + content : prefix.trim();
          }).join('\\n');
        }

        function renderNode(current) {
          if (!current) return '';

          if (current.nodeType === Node.TEXT_NODE) {
            return cleanText(current.textContent || '');
          }

          if (current.nodeType !== Node.ELEMENT_NODE) {
            return '';
          }

          const element = current;
          const tagName = String(element.tagName || '').toUpperCase();

          if (tagName === 'BR') {
            return '\\n';
          }

          if (tagName === 'OL' || tagName === 'UL') {
            return '\\n' + renderList(element) + '\\n';
          }

          const content = renderChildren(element);
          if (blockTags.has(tagName)) {
            const trimmed = content.trim();
            return trimmed ? '\\n' + trimmed + '\\n' : '';
          }

          return content;
        }

        return renderNode(node)
          .replace(/\\n{3,}/g, '\\n\\n')
          .split('\\n')
          .map((line) => line.replace(/[ \\t]+$/g, ''))
          .join('\\n')
          .trim();
      }

      function currentTitle() {
        const preferred = [
          document.querySelector('main h1'),
          document.querySelector('main h2'),
          document.querySelector('[data-testid="conversation"] h1'),
          document.querySelector('[role="main"] h1'),
        ].find(Boolean);
        const preferredText = textOf(preferred);
        if (preferredText) return preferredText.slice(0, 140);

        const title = textOf(document.querySelector('title')) || textOf({ innerText: document.title });
        return title.slice(0, 140);
      }

      function hasTrailingThinking(value) {
        return /(?:^|\\n)\\s*(正在思考|思考中|thinking)\\s*$/i.test(String(value || '').trim());
      }

      function buttonTexts(turn) {
        return Array.from(turn.querySelectorAll('button'))
          .map((button) => textOf(button))
          .filter(Boolean)
          .slice(0, 30);
      }

      const turns = Array.from(document.querySelectorAll('[data-content-search-turn-key]'));
      const title = currentTitle();
      const firstTurnKey = String(turns[0]?.getAttribute('data-content-search-turn-key') || '').trim();
      const threadKey = firstTurnKey || (title ? 'title:' + collapse(title).toLowerCase() : 'unknown');
      const lastTurnText = String(turns[turns.length - 1]?.innerText || turns[turns.length - 1]?.textContent || '');
      const stopVisible = Array.from(document.querySelectorAll('button')).some((button) => {
        const label = collapse(button.getAttribute('aria-label') || button.innerText || button.textContent || '');
        return /^(停止|stop)$/i.test(label);
      });

      return {
        threadKey,
        title,
        isBusy: stopVisible || hasTrailingThinking(lastTurnText),
        turns: turns.map((turn, index) => {
          const rawTurnText = String(turn.innerText || turn.textContent || '');
          const assistantUnits = Array.from(turn.querySelectorAll('[data-content-search-unit-key*=":assistant"]'))
            .map((unit) => ({
              unitKey: String(unit.getAttribute('data-content-search-unit-key') || '').trim(),
              text: formattedTextOf(unit),
            }))
            .filter((unit) => unit.unitKey && unit.text);
          const userText = Array.from(turn.querySelectorAll('[data-content-search-unit-key*=":user"]'))
            .map((unit) => String(unit.innerText || unit.textContent || '').trim())
            .filter(Boolean)
            .join('\\n\\n');
          const buttons = buttonTexts(turn);
          const hasCompletedMarker = buttons.some((text) => /^已处理/i.test(text) || /^processed/i.test(text));
          return {
            turnKey: String(turn.getAttribute('data-content-search-turn-key') || '').trim(),
            userText,
            assistantUnits,
            buttonTexts: buttons,
            hasCompletedMarker,
            isBusy: hasTrailingThinking(rawTurnText) || buttons.some((text) => /^(停止|stop)$/i.test(text)),
            isLastTurn: index === turns.length - 1,
          };
        }),
      };
    })()
  `;
}

async function listCodexThreads(page) {
  const threads = await page.evaluate(buildListThreadsJs());
  return Array.isArray(threads) ? threads : [];
}

export async function getCurrentCodexThread(page) {
  const threads = await listCodexThreads(page);
  const active = threads.find((thread) => thread.active);
  if (active) {
    return active;
  }

  const fallbackTitle = collapseWhitespace(String(await page.evaluate(buildCurrentThreadFallbackJs()) || ''));
  if (!fallbackTitle || normalizeThreadTitle(fallbackTitle) === 'codex') {
    return null;
  }

  return {
    index: 0,
    title: fallbackTitle,
    active: true,
  };
}

export async function getCodexThreadSnapshot(page) {
  const snapshot = await page.evaluate(buildThreadSnapshotJs());
  const title = collapseWhitespace(String(snapshot?.title || ''));
  const threadKey = collapseWhitespace(String(snapshot?.threadKey || ''))
    || (title ? `title:${normalizeThreadTitle(title)}` : 'unknown');
  const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : [];

  return {
    threadKey,
    title,
    turns: turns.map((turn) => ({
      turnKey: collapseWhitespace(String(turn?.turnKey || '')),
      userText: String(turn?.userText || ''),
      assistantUnits: Array.isArray(turn?.assistantUnits)
        ? turn.assistantUnits.map((unit) => ({
            unitKey: collapseWhitespace(String(unit?.unitKey || '')),
            text: String(unit?.text || ''),
          })).filter((unit) => unit.unitKey && unit.text)
        : [],
      buttonTexts: Array.isArray(turn?.buttonTexts)
        ? turn.buttonTexts.map((value) => String(value || '')).filter(Boolean)
        : [],
      hasCompletedMarker: Boolean(turn?.hasCompletedMarker),
      isBusy: Boolean(turn?.isBusy),
      isLastTurn: Boolean(turn?.isLastTurn),
    })),
    isBusy: Boolean(snapshot?.isBusy),
  };
}

export async function sendToCodexComposer(page, text) {
  const result = await page.evaluate(`
    (async function(inputText) {
      function collapse(value) {
        return String(value || '')
          .replace(/\\s+/g, ' ')
          .trim();
      }

      function findComposer() {
        return document.querySelector('[data-codex-composer="true"], .ProseMirror[data-codex-composer="true"], .ProseMirror, textarea');
      }

      function getTurnState() {
        const turns = Array.from(document.querySelectorAll('[data-content-search-turn-key]'));
        const lastTurn = turns[turns.length - 1];
        const userText = Array.from(lastTurn?.querySelectorAll?.('[data-content-search-unit-key*=":user"]') || [])
          .map((node) => collapse(node?.innerText || node?.textContent || ''))
          .filter(Boolean)
          .join('\\n\\n');
        return {
          count: turns.length,
          userText,
        };
      }

      function waitFrame() {
        return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      }

      function waitMs(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      function findSubmitButton(composer) {
        const root = composer.closest('.border-token-border.relative.flex.flex-col')
          || composer.closest('.rounded-3xl')
          || composer.parentElement?.parentElement?.parentElement
          || composer.parentElement;
        const footer = root?.querySelector('.composer-footer') || root;
        const buttons = Array.from(footer?.querySelectorAll('button') || []);
        return buttons.length > 0 ? buttons[buttons.length - 1] : null;
      }

      async function waitForSubmission(beforeState, expectedText) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await waitFrame();
          await waitMs(75);
          const state = getTurnState();
          if (state.count > beforeState.count || state.userText === expectedText) {
            return true;
          }
        }
        return false;
      }

      function pressEnter(composer) {
        const eventInit = {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        };
        composer.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        composer.dispatchEvent(new KeyboardEvent('keypress', eventInit));
        composer.dispatchEvent(new KeyboardEvent('keyup', eventInit));
      }

      const composer = findComposer();
      if (!composer) {
        throw new Error('Could not find Codex composer input');
      }

      const beforeState = getTurnState();
      const normalizedInput = collapse(inputText);
      composer.focus();

      if (composer.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(composer, inputText);
        } else {
          composer.value = inputText;
        }
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        composer.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection?.removeAllRanges();
        selection?.addRange(range);
        selection?.deleteFromDocument();

        const tail = document.createRange();
        tail.selectNodeContents(composer);
        tail.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(tail);

        const inserted = document.execCommand('insertText', false, inputText);
        if (!inserted) {
          composer.textContent = inputText;
        }

        if (typeof InputEvent === 'function') {
          composer.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: inputText,
          }));
        } else {
          composer.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      await waitFrame();
      await waitFrame();

      const submit = findSubmitButton(findComposer() || composer);
      if (!submit) {
        return { submitted: false, reason: 'missing_submit' };
      }

      const submitLabel = collapse(submit.getAttribute('aria-label') || submit.innerText || submit.textContent || '');
      if (/^(停止|stop)$/i.test(submitLabel)) {
        return { submitted: false, reason: 'busy' };
      }

      submit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      submit.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      if (typeof submit.click === 'function') submit.click();

      if (await waitForSubmission(beforeState, normalizedInput)) {
        return { submitted: true, reason: '' };
      }

      const fallbackComposer = findComposer() || composer;
      fallbackComposer.focus();
      pressEnter(fallbackComposer);
      if (await waitForSubmission(beforeState, normalizedInput)) {
        return { submitted: true, reason: '' };
      }

      await waitFrame();
      const finalComposer = findComposer() || composer;
      const finalText = collapse(finalComposer.tagName === 'TEXTAREA'
        ? finalComposer.value
        : finalComposer.innerText || finalComposer.textContent || '');

      return {
        submitted: false,
        reason: finalText === collapse(inputText) ? 'stuck' : '',
      };
    })(${JSON.stringify(text)})
  `);

  if (result?.reason === 'busy') {
    throw new Error('Codex is still generating. Wait for the current reply to finish, then try again.');
  }
  if (result?.reason === 'stuck') {
    throw new Error('Codex composer kept the text without submitting.');
  }
  if (!result?.submitted) {
    throw new Error('Could not submit the Codex composer input.');
  }

  await page.wait(0.5);
}
