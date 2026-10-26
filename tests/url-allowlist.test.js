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

test('script, other schemes and lookalike hosts are never linked', () => {
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

test('sheet rows are kept and only allowlisted urls become links', () => {
    // Rows are no longer filtered by the allowlist, only blank urls are dropped.
    assert.match(app, /\}\)\.filter\(v => v\.url\);/);
    assert.doesNotMatch(app, /filter\(v => isYoutubeUrl\(v\.url\)\)/);
    // No raw url ever reaches an href; both video links use the allowlist.
    assert.doesNotMatch(app, /href=\{v\.url\}/);
    assert.equal(app.match(/href=\{[^}]*v\.url[^}]*\}/g).length, 2);
    assert.equal(app.match(/href=\{youtubeHref\(v\.url\)\}/g).length, 2);
    // Each link is rendered only when the allowlist passes, otherwise the url is plain text.
    assert.equal(app.match(/\{youtubeHref\(v\.url\) \? \(\s*<a\b/g).length, 2);
    assert.match(app, /\) : \(\s*<span data-unlinked-url="true"[^>]*>\s*\{v\.url\}\s*<\/span>/);
    assert.match(app, /\{!youtubeHref\(v\.url\) && \(\s*<p data-unlinked-url="true"[^>]*>\{v\.url\}<\/p>/);
});

test('http, other hosts and script urls get no href', () => {
    for (const url of ['http://www.youtube.com/watch?v=hand', 'https://vimeo.com/123', 'javascript:alert(1)']) {
        assert.equal(youtubeHref(url), undefined, url);
    }
    assert.equal(youtubeHref('https://www.youtube.com/watch?v=a'), 'https://www.youtube.com/watch?v=a');
});
