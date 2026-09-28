const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(app, 'index.html must contain the inline React app');
const source = app[1];

test('double-clicking the Name column cell opens the note editor', () => {
    // The Name cell holds the video title (and its note) in the desktop table.
    // The double-click event is forwarded so the caret can follow the click position.
    const nameCell = source.match(/<td\b[^>]*\bonDoubleClick=\{event => openNoteEditor\(v, event\)\}[^>]*>[\s\S]*?\btitle=\{v\.name\}/);
    assert.ok(nameCell, 'the desktop Name cell must pass the double-click event to openNoteEditor');
});

test('opening the editor re-opens rows but keeps an in-progress draft', () => {
    const openNoteEditor = source.match(/const openNoteEditor = \(video, event\) => \{[\s\S]*?\n        \};/);
    assert.ok(openNoteEditor, 'openNoteEditor must exist');
    // Double-clicks inside the open editor bubble to its cell; the guard must skip them.
    assert.match(openNoteEditor[0], /if \(editNoteUrl === video\.url\) return;/);
});

test('openNoteEditor remembers the clicked caret, else falls back to the note length', () => {
    // Option 1: the clicked offset wins. Option 2: end of the note (or the beginning if empty).
    const openNoteEditor = source.match(/const openNoteEditor = \(video, event\) => \{[\s\S]*?\n        \};/)[0];
    const build = (editNoteUrl, noteCaretRef, noteCaretAppliedRef, caretFn) => {
        const seen = {};
        const open = new Function(
            'editNoteUrl', 'setEditNoteUrl', 'setEditNoteText', 'caretOffsetFromNotePoint', 'noteCaretRef', 'noteCaretAppliedRef', 'noteViewRef', 'window',
            `${openNoteEditor}\nreturn openNoteEditor;`,
        )(
            editNoteUrl, u => { seen.url = u; }, t => { seen.text = t; }, caretFn,
            noteCaretRef, noteCaretAppliedRef, seen,
            { scrollX: 4, scrollY: 2048 },
        );
        return { open, seen };
    };

    // Clicked on the note text -> caret lands exactly where the user clicked (option 1).
    let ref = { current: null };
    let applied = { current: true };
    let { open, seen } = build(null, ref, applied, () => 7);
    open({ url: 'x', note: 'hello world' }, { /* event */ });
    assert.equal(seen.url, 'x');
    assert.equal(seen.text, 'hello world');
    assert.equal(ref.current, 7, 'caret should be the clicked offset');
    assert.equal(applied.current, false, 'opening must re-arm the one-time caret placement');
    assert.deepEqual(seen.current, { x: 4, y: 2048 },
        'opening must snapshot the viewport before the editor mounts');

    // Clicked elsewhere / pencil button / no caret resolved -> end of the note (option 2).
    ref = { current: null };
    ({ open } = build(null, ref, { current: true }, () => null));
    open({ url: 'y', note: 'abcdef' }, {});
    assert.equal(ref.current, 6, 'caret should fall back to the end of the note');

    // Empty note -> the beginning.
    ref = { current: null };
    ({ open } = build(null, ref, { current: true }, () => null));
    open({ url: 'z', note: '' }, {});
    assert.equal(ref.current, 0, 'an empty note places the caret at the beginning');
});

test('openNoteEditor keeps the in-progress draft when the same row is re-opened', () => {
    const openNoteEditor = source.match(/const openNoteEditor = \(video, event\) => \{[\s\S]*?\n        \};/)[0];
    const build = (editNoteUrl) => new Function(
        'editNoteUrl', 'setEditNoteUrl', 'setEditNoteText', 'caretOffsetFromNotePoint', 'noteCaretRef', 'noteCaretAppliedRef', 'noteViewRef', 'window',
        `${openNoteEditor}\nreturn openNoteEditor;`,
    )(
        editNoteUrl, () => { throw new Error('must not re-open'); }, () => { throw new Error('must not reset'); }, () => 0,
        { current: 0 }, { current: false }, { current: null }, { scrollX: 0, scrollY: 0 },
    );
    assert.doesNotThrow(() => build('same').call(null, { url: 'same', note: 'draft' }, {}));
});

test('caretOffsetFromNotePoint maps a double-click on the note to a character offset', () => {
    const caretSrc = source.match(/const caretOffsetFromNotePoint = \(event\) => \{[\s\S]*?\n    \};/)[0];
    const build = (document) => new Function('document', `${caretSrc}\nreturn caretOffsetFromNotePoint;`)(document);
    const noteText = { nodeType: 3, data: 'hello world' };
    const noteEl = { contains: node => node === noteText };
    const event = closest => ({ clientX: 5, clientY: 6, target: { closest: sel => (sel === '[data-note-text]' ? closest : null) } });

    // Standard browsers: caretPositionFromPoint returns the offset inside the note text node.
    assert.equal(
        build({ caretPositionFromPoint: () => ({ offsetNode: noteText, offset: 6 }) })(event(noteEl)),
        6,
        'caret should land at the clicked character',
    );

    // WebKit/Safari: caretRangeFromPoint is the fallback source of the offset.
    assert.equal(
        build({ caretRangeFromPoint: () => ({ startContainer: noteText, startOffset: 3 }) })(event(noteEl)),
        3,
        'caretRangeFromPoint should be used when caretPositionFromPoint is unavailable',
    );

    // The click was not on the note text (title, empty cell, ...) -> caller falls back.
    assert.equal(build({})(event(null)), null, 'a click off the note must return null');
    // A non-text node, or a text node outside the note paragraph, is ignored.
    assert.equal(build({ caretPositionFromPoint: () => ({ offsetNode: { nodeType: 1 }, offset: 2 }) })(event(noteEl)), null);
    assert.equal(build({ caretPositionFromPoint: () => ({ offsetNode: { nodeType: 3 }, offset: 2 }) })(event(noteEl)), null);
});

test('the note editor is marked so the caret helper only trusts clicks on the note text', () => {
    // Both the desktop and mobile note paragraphs carry the marker the helper looks for.
    const markers = source.match(/<p data-note-text="true"/g) || [];
    assert.equal(markers.length, 2, 'both note paragraphs must be marked with data-note-text');
});

test('focusNoteEditor focuses once and drops the caret at the requested offset', () => {
    const focusSrc = source.match(/const focusNoteEditor = \(element\) => \{[\s\S]*?\n        \};/)[0];
    // `noteViewRef` + `window` are injected so the extracted helper can freeze the viewport in Node.
    const build = (noteCaretRef, noteCaretAppliedRef, fit = () => {}, win, noteViewRef) => new Function(
        'fitNoteEditorToContent', 'noteCaretRef', 'noteCaretAppliedRef', 'noteViewRef', 'window',
        `${focusSrc}\nreturn focusNoteEditor;`,
    )(
        fit, noteCaretRef, noteCaretAppliedRef,
        noteViewRef || { current: null },
        win || { scrollX: 0, scrollY: 0, scrollTo() { throw new Error('viewport must not move'); } },
    );
    const makeEl = value => {
        const calls = [];
        return {
            value,
            calls,
            focus(opts) { calls.push(opts && opts.preventScroll ? 'focus(preventScroll)' : 'focus'); },
            setSelectionRange(a, b) { calls.push(['setSelectionRange', a, b]); },
        };
    };

    // First mount: focus without scrolling + place the caret at the stored offset.
    const applied = { current: false };
    const el = makeEl('hello world');
    build({ current: 4 }, applied)(el);
    assert.deepEqual(el.calls, ['focus(preventScroll)', ['setSelectionRange', 4, 4]]);
    assert.equal(applied.current, true);

    // Re-render (typing): the guard stops the caret from being reset.
    build({ current: 4 }, applied)(el);
    assert.deepEqual(el.calls, ['focus(preventScroll)', ['setSelectionRange', 4, 4]], 'the caret must not move on re-render');

    // A missing element (unmount) is a no-op.
    assert.doesNotThrow(() => build({ current: 0 }, { current: false })(null));

    // The offset is clamped into range, and null means "end of the text".
    assert.deepEqual((() => { const e = makeEl('hello'); build({ current: 999 }, { current: false })(e); return e.calls; })(),
        ['focus(preventScroll)', ['setSelectionRange', 5, 5]], 'an out-of-range offset clamps to the end');
    const endEl = makeEl('abc');
    build({ current: null }, { current: false })(endEl);
    assert.deepEqual(endEl.calls, ['focus(preventScroll)', ['setSelectionRange', 3, 3]], 'null offset means the end of the text');
});

test('the note editors focus through the shared ref with preventScroll, not autoFocus', () => {
    // autoFocus made React focus the textarea before it was fitted to its content, which
    // scrolled notes taller than the window up to their first line on double-click.
    const autoFocusAttrs = source.match(/<textarea[^>]*\bautoFocus\b/g) || [];
    assert.equal(autoFocusAttrs.length, 0, 'no note editor may carry autoFocus');
    assert.match(source, /element\.focus\(\{ preventScroll: true \}\)/,
        'the shared ref must focus with preventScroll so opening never scrolls');
});

test('the hidden viewport copy of the editor never takes focus or arms the caret', () => {
    const focusSrc = source.match(/const focusNoteEditor = \(element\) => \{[\s\S]*?\n        \};/)[0];
    const build = (noteCaretRef, noteCaretAppliedRef) => new Function(
        'fitNoteEditorToContent', 'noteCaretRef', 'noteCaretAppliedRef', 'noteViewRef', 'window',
        `${focusSrc}\nreturn focusNoteEditor;`,
    )(
        () => {}, noteCaretRef, noteCaretAppliedRef,
        { current: null },
        { scrollX: 0, scrollY: 0, scrollTo() { throw new Error('viewport must not move'); } },
    );
    const makeEl = (value, offsetParent) => {
        const calls = [];
        return {
            value,
            offsetParent,
            calls,
            focus(opts) { calls.push(opts && opts.preventScroll ? 'focus(preventScroll)' : 'focus'); },
            setSelectionRange(a, b) { calls.push(['setSelectionRange', a, b]); },
        };
    };

    // Desktop visible / mobile hidden (or the other way around below 1440px): the
    // display:none copy bails before focus, so the visible copy still gets both.
    const applied = { current: false };
    const hidden = makeEl('hello world', null);
    build({ current: 4 }, applied)(hidden);
    assert.deepEqual(hidden.calls, [], 'the hidden copy must not focus or place the caret');
    assert.equal(applied.current, false, 'the hidden copy must not arm the one-time caret placement');

    const visible = makeEl('hello world', {});
    build({ current: 4 }, applied)(visible);
    assert.deepEqual(visible.calls, ['focus(preventScroll)', ['setSelectionRange', 4, 4]],
        'the visible copy still focuses and places the caret afterwards');
});

test('focusNoteEditor snaps the viewport back if focusing or the caret still scrolled', () => {
    const focusSrc = source.match(/const focusNoteEditor = \(element\) => \{[\s\S]*?\n        \};/)[0];
    const win = {
        scrollX: 0,
        scrollY: 1396,
        scrollTo(x, y) { this.scrollX = x; this.scrollY = y; this.restored = [x, y]; },
    };
    const focusNoteEditor = new Function(
        'fitNoteEditorToContent', 'noteCaretRef', 'noteCaretAppliedRef', 'noteViewRef', 'window',
        `${focusSrc}\nreturn focusNoteEditor;`,
    )(
        () => {}, { current: 0 }, { current: false },
        { current: { x: 0, y: 2048 } }, // snapshot taken in openNoteEditor, before the swap
        win,
    );

    // Mounting/focusing moved the page (transient scroll clamp, a browser ignoring
    // preventScroll, …); the helper must restore the exact pre-open scroll position.
    const el = {
        value: 'a very long note',
        offsetParent: {},
        focus() { /* the page already moved before this call */ },
        setSelectionRange() {},
    };
    focusNoteEditor(el);
    assert.deepEqual(win.restored, [0, 2048], 'the viewport must return to where the user was');
    assert.equal(win.scrollY, 2048);
});

test('both note editors use the shared focus + caret ref', () => {
    const refs = source.match(/ref=\{focusNoteEditor\}/g) || [];
    assert.equal(refs.length, 2, 'desktop and mobile note editors must use focusNoteEditor');
});
