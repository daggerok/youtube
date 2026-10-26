const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = id => {
    const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
    assert.ok(m, `index.html must contain the inline ${id} block`);
    return m[1];
};
const { youtubeVideoId, mergeFullRefresh: mergeInVm } = vm.runInNewContext(
    `${block('url-utils')}\n${block('refresh-utils')}\n({ youtubeVideoId, mergeFullRefresh });`,
    { URL },
);
// The vm realm has its own Object prototype; compare plain copies.
const mergeFullRefresh = (...args) => JSON.parse(JSON.stringify(mergeInVm(...args)));
const app = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1];

// Channel videos as handleFetch builds them: canonical watch url, default status and note.
const channel = (id, extra = {}) => ({
    datetime: '2024-01-01T00:00:00Z', type: 'Video', name: `ch ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`, status: 'unwatched', note: '',
    created: '2024-05-01T00:00:00Z', updated: '2024-05-01T00:00:00Z', ...extra,
});
const row = (url, extra = {}) => ({
    datetime: '2023-01-01T00:00:00Z', type: 'Video', name: `row ${url}`, url,
    status: 'unwatched', note: '', created: '2023-01-02T00:00:00Z', updated: '2023-01-02T00:00:00Z', ...extra,
});
const urls = list => list.map(v => v.url);

test('video id is read from https youtube urls only', () => {
    assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=abc&t=5'), 'abc');
    assert.equal(youtubeVideoId('https://youtu.be/abc?t=5'), 'abc');
    assert.equal(youtubeVideoId('https://m.youtube.com/shorts/abc'), 'abc');
    assert.equal(youtubeVideoId('https://youtube.com/live/abc'), 'abc');
    assert.equal(youtubeVideoId('http://www.youtube.com/watch?v=abc'), '');
    assert.equal(youtubeVideoId('https://vimeo.com/123'), '');
    assert.equal(youtubeVideoId('https://www.youtube.com/@channel'), '');
});

test('hand-added https, http and non-youtube rows are kept with status and note', () => {
    const hand = [
        row('https://www.youtube.com/watch?v=other1', { status: 'watched', note: 'from a friend' }),
        row('http://www.youtube.com/watch?v=old', { status: 'watching', note: 'http' }),
        row('https://vimeo.com/123', { status: 'watched', note: 'vimeo' }),
    ];
    const out = mergeFullRefresh([channel('a'), channel('b')], hand);
    assert.deepEqual(urls(out), [
        'https://www.youtube.com/watch?v=a',
        'https://www.youtube.com/watch?v=b',
        ...urls(hand),
    ]);
    assert.deepEqual(out.slice(2), hand);
});

test('a row of a channel video is not duplicated and keeps its status and note', () => {
    const prev = [
        row('https://www.youtube.com/watch?v=a', { status: 'watched', note: 'seen' }),
        row('https://youtu.be/b?t=10', { status: 'watching', note: 'short form' }),
    ];
    const out = mergeFullRefresh([channel('a'), channel('b'), channel('c')], prev);
    assert.deepEqual(urls(out), ['a', 'b', 'c'].map(id => `https://www.youtube.com/watch?v=${id}`));
    assert.deepEqual(out.map(v => [v.status, v.note]), [['watched', 'seen'], ['watching', 'short form'], ['unwatched', '']]);
    // created and updated also come from the row, as before; title and date from the channel.
    assert.equal(out[0].created, '2023-01-02T00:00:00Z');
    assert.equal(out[0].name, 'ch a');
});

test('an http row with a channel video id is a different url and stays', () => {
    const out = mergeFullRefresh([channel('a')], [row('http://www.youtube.com/watch?v=a', { status: 'watched' })]);
    assert.deepEqual(urls(out), ['https://www.youtube.com/watch?v=a', 'http://www.youtube.com/watch?v=a']);
    assert.equal(out[0].status, 'unwatched');
});

test('order is the channel list, then hand-added rows in their old order', () => {
    const prev = [
        row('https://vimeo.com/2'),
        row('https://www.youtube.com/watch?v=b', { status: 'watched' }),
        row('https://example.com/x'),
        row('https://www.youtube.com/watch?v=zzz'),
        row('https://vimeo.com/1'),
    ];
    const out = mergeFullRefresh([channel('a'), channel('b')], prev);
    assert.deepEqual(urls(out), [
        'https://www.youtube.com/watch?v=a',
        'https://www.youtube.com/watch?v=b',
        'https://vimeo.com/2',
        'https://example.com/x',
        'https://www.youtube.com/watch?v=zzz',
        'https://vimeo.com/1',
    ]);
});

test('cache then sheet: sheet values win, first position stays, rows appear once', () => {
    const cache = [
        row('https://vimeo.com/1', { note: 'old note' }),
        row('https://www.youtube.com/watch?v=a', { status: 'watched', note: 'cached' }),
        row('https://example.com/x'),
    ];
    const sheet = [
        row('https://example.com/x', { status: 'watched' }),
        row('https://vimeo.com/1', { note: 'new note' }),
        row('https://www.youtube.com/watch?v=a', { status: 'unwatched', note: '' }),
    ];
    const out = mergeFullRefresh([channel('a')], [...cache, ...sheet]);
    assert.deepEqual(urls(out), ['https://www.youtube.com/watch?v=a', 'https://vimeo.com/1', 'https://example.com/x']);
    // An explicit "unwatched" and a cleared note on the sheet win over the cache.
    assert.deepEqual([out[0].status, out[0].note], ['unwatched', '']);
    assert.equal(out[1].note, 'new note');
    assert.equal(out[2].status, 'watched');
});

test('no previous rows gives the channel list as is', () => {
    const list = [channel('a'), channel('b')];
    assert.deepEqual(mergeFullRefresh(list, []), list);
    assert.deepEqual(mergeFullRefresh(list, undefined), list);
});

test('Full Refresh writes the merged list built from cache and sheet rows', () => {
    assert.match(app, /finalData = mergeFullRefresh\(processedNew, \[\.\.\.cachedData, \.\.\.\(sheetData \|\| \[\]\)\]\);/);
    assert.doesNotMatch(app, /finalData = processedNew;/);
});
