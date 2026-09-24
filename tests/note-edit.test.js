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
    const nameCell = source.match(/<td\b[^>]*\bonDoubleClick=\{\(\) => openNoteEditor\(v\)\}[^>]*>[\s\S]*?\btitle=\{v\.name\}/);
    assert.ok(nameCell, 'the desktop Name cell must call openNoteEditor(v) on double click');
});

test('opening the editor re-opens rows but keeps an in-progress draft', () => {
    const openNoteEditor = source.match(/const openNoteEditor = \(video\) => \{[\s\S]*?\n        \};/);
    assert.ok(openNoteEditor, 'openNoteEditor must exist');
    // Double-clicks inside the open editor bubble to its cell; the guard must skip them.
    assert.match(openNoteEditor[0], /if \(editNoteUrl === video\.url\) return;/);
});
