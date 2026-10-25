const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const urlScript = html.match(/<script id="url-utils">([\s\S]*?)<\/script>/);
assert.ok(urlScript, 'index.html must contain the inline url utilities');
const { isYoutubeUrl, youtubeHref } = vm.runInNewContext(
    `${urlScript[1]}\n({ isYoutubeUrl, youtubeHref });`,
    { URL },
);
const app = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1];

test('https youtube watch and short urls are kept', () => {
    for (const url of [
        'https://www.youtube.com/watch?v=abc123',
        'https://youtube.com/watch?v=abc123',
        'https://m.youtube.com/watch?v=abc123',
        'https://youtu.be/abc123',
    ]) {
        assert.equal(isYoutubeUrl(url), true, url);
        assert.equal(youtubeHref(url), url);
    }
});

test('script, other schemes and lookalike hosts are dropped', () => {
    for (const url of [
        'javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        ' javascript:alert(1)',
        '\tjavascript:alert(1)',
        'java\nscript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'http://www.youtube.com/watch?v=abc123',
        'https://www.youtube.com.evil.example/watch?v=abc123',
        'https://evil.example/?u=https://www.youtube.com',
        '//www.youtube.com/watch?v=abc123',
        'not a url',
        '',
        undefined,
        null,
    ]) {
        assert.equal(isYoutubeUrl(url), false, String(url));
        assert.equal(youtubeHref(url), undefined);
    }
});

test('sheet rows and both video links go through the allowlist', () => {
    assert.match(app, /\}\)\.filter\(v => isYoutubeUrl\(v\.url\)\);/);
    assert.doesNotMatch(app, /href=\{v\.url\}/);
    assert.equal(app.match(/href=\{youtubeHref\(v\.url\)\}/g).length, 2);
});
