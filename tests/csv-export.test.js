const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const csvScript = html.match(/<script id="csv-utils">([\s\S]*?)<\/script>/);
assert.ok(csvScript, 'index.html must contain the inline csv utilities');
const { VIDEO_CSV_HEADERS, csvDateParts, videoCsvRow } = vm.runInNewContext(
    `${csvScript[1]}\n({ VIDEO_CSV_HEADERS, csvDateParts, videoCsvRow });`,
);
const app = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1];

const video = {
    datetime: '2024-03-05T14:07:09Z',
    type: 'Live',
    status: 'watching',
    name: 'Q&A, "part 2"',
    url: 'https://www.youtube.com/watch?v=abc123',
    note: 'line one\nline "two"',
};

test('a valid row keeps the previous column layout', () => {
    assert.equal(VIDEO_CSV_HEADERS.length, 8);
    assert.equal(
        videoCsvRow(video),
        '"2024-03-05T14:07:09.000Z","2024-03-05","14:07:09.000","Live","watching","Q&A, ""part 2""",'
            + '"https://www.youtube.com/watch?v=abc123","line one\nline ""two"""',
    );
});

test('blank and garbled dates export empty date cells instead of throwing', () => {
    for (const datetime of ['', undefined, null, 'not a date', '2024-13-45']) {
        assert.deepEqual([...csvDateParts(datetime)], ['', '', '']);
        const row = videoCsvRow({ ...video, datetime });
        assert.ok(row.startsWith('"","","","Live",'), `${datetime} -> ${row}`);
    }
});

test('type, status and url are quote-escaped like the free-text fields', () => {
    const row = videoCsvRow({
        datetime: '2024-03-05T14:07:09Z',
        type: 'Vid"eo,x',
        status: 'a"b',
        name: undefined,
        url: 'https://youtu.be/x?a="1",b',
        note: undefined,
    });
    assert.equal(
        row,
        '"2024-03-05T14:07:09.000Z","2024-03-05","14:07:09.000","Vid""eo,x","a""b","",'
            + '"https://youtu.be/x?a=""1"",b",""',
    );
    assert.equal(videoCsvRow({ ...video, status: '' }).split(',')[4], '"unwatched"');
});

test('the export button uses the shared row builder', () => {
    assert.match(app, /processedVideos\.map\(videoCsvRow\)/);
    assert.doesNotMatch(app, /toISOString\(\);\s*const dateStr/);
});
