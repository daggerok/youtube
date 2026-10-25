const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1];

// Top-level helpers: one-liners end on their own line, blocks end with "    };" or "    ]);".
const pick = (name) => {
    const m = app.match(new RegExp(`\\n    const ${name} = (?:[^\\n]*;(?=\\n)|[^\\n]*[{[]\\n[\\s\\S]*?\\n    (?:\\}|\\]\\));)`));
    assert.ok(m, `${name} must exist`);
    return m[0];
};

// Real nid/qt/sr/videoSheetRow and both writers, with a recorded fake Sheets client.
const load = (respond = () => ({})) => {
    const calls = [];
    const sa = async (p, tok, init = {}) => {
        const call = { method: init.method || 'GET', path: decodeURIComponent(p), body: init.body ? JSON.parse(init.body) : null };
        calls.push(call);
        return respond(call);
    };
    const src = ['nid', 'qt', 'sr', 'videoSheetRow', 'writeVideosToSheet', 'writeVideoRowToSheet'].map(pick).join('\n');
    const api = new Function('sa', `${src}\nreturn { writeVideosToSheet, writeVideoRowToSheet };`)(sa);
    return { ...api, calls };
};

const video = (id, extra = {}) => ({
    datetime: '2024-01-01T00:00:00Z', type: 'Video', name: `n${id}`,
    url: `https://www.youtube.com/watch?v=${id}`, status: 'unwatched', note: '',
    created: '2024-01-02T00:00:00Z', updated: '2024-01-02T00:00:00Z', ...extra,
});

test('full write overwrites rows in place first, then clears only the tail', async () => {
    const { writeVideosToSheet, calls } = load();
    await writeVideosToSheet('tok', 'sid', 'YT_chan', [video('a'), video('b')]);
    assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), [
        'PUT /spreadsheets/sid/values/YT_chan!A2:H3?valueInputOption=RAW',
        'POST /spreadsheets/sid/values/YT_chan!A4:H:clear',
    ]);
    assert.equal(calls[0].body.values.length, 2);
    assert.equal(calls[0].body.values[1][3], 'https://www.youtube.com/watch?v=b');
});

test('a failed full write never clears the sheet', async () => {
    const { writeVideosToSheet, calls } = load(c => {
        if (c.method === 'PUT') throw Object.assign(new Error('Google API 500'), { status: 500 });
        return {};
    });
    await assert.rejects(writeVideosToSheet('tok', 'sid', 'YT_chan', [video('a')]), /500/);
    assert.equal(calls.length, 1);
    assert.ok(!calls.some(c => c.path.endsWith(':clear')));
});

test('an empty list clears the data rows and keeps the header', async () => {
    const { writeVideosToSheet, calls } = load();
    await writeVideosToSheet('tok', 'sid', "YT-my chan's", []);
    assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), [
        "POST /spreadsheets/sid/values/'YT-my chan''s'!A2:H:clear",
    ]);
});

test('a status or note change rewrites only the row holding that url', async () => {
    const changed = video('c', { status: 'watched', note: 'done' });
    const { writeVideoRowToSheet, calls } = load(c => (c.method === 'GET'
        ? { values: [[video('a').url], [], [changed.url], [video('d').url]] }
        : {}));
    await writeVideoRowToSheet('tok', 'sid', 'YT_chan', changed);
    assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), [
        'GET /spreadsheets/sid/values/YT_chan!D2:D',
        'PUT /spreadsheets/sid/values/YT_chan!A4:H4?valueInputOption=RAW',
    ]);
    assert.deepEqual(calls[1].body.values, [[
        changed.datetime, 'Video', 'nc', changed.url, 'watched', 'done', changed.created, changed.updated,
    ]]);
});

test('the first row maps to sheet row 2', async () => {
    const changed = video('a', { status: 'watching' });
    const { writeVideoRowToSheet, calls } = load(c => (c.method === 'GET' ? { values: [[changed.url]] } : {}));
    await writeVideoRowToSheet('tok', 'sid', 'YT_chan', changed);
    assert.equal(calls[1].path, '/spreadsheets/sid/values/YT_chan!A2:H2?valueInputOption=RAW');
});

test('a url missing from the sheet is appended, nothing is cleared', async () => {
    const changed = video('z');
    const { writeVideoRowToSheet, calls } = load(() => ({}));
    await writeVideoRowToSheet('tok', 'sid', 'YT_chan', changed);
    assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), [
        'GET /spreadsheets/sid/values/YT_chan!D2:D',
        'POST /spreadsheets/sid/values/YT_chan!A1:H1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    ]);
    assert.equal(calls[1].body.values[0][3], changed.url);
});

test('status and note edits sync one row, list syncs keep the full write', () => {
    assert.match(app, /syncToGoogle\(next, currentHandle, next\.find\(v => v\.url === url\)\)/);
    assert.match(app, /syncToGoogle\(nextVideos, currentHandle, nextVideos\.find\(v => v\.url === url\)\)/);
    assert.match(app, /if \(changedVideo\) await writeVideoRowToSheet\(token, sid, tab, changedVideo\);\s*else await writeVideosToSheet\(token, sid, tab, videosToSave\);/);
    assert.doesNotMatch(app, /A2:H'\)\)\}:clear`[\s\S]*?A2:H'\);/);
});
