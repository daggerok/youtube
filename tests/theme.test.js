const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const themeScript = html.match(/<script id="theme-utils">([\s\S]*?)<\/script>/);
assert.ok(themeScript, 'index.html must contain the inline theme utilities');
const { isThemeMode, isNight, nextThemeMode, isDarkTheme, themeIcon, themeTitle } = vm.runInNewContext(
    `${themeScript[1]}\n({ isThemeMode, isNight, nextThemeMode, isDarkTheme, themeIcon, themeTitle });`,
);
const at = h => new Date(2026, 9, 31, h, 30);

test('night is 19:00 to 06:59 by the local clock', () => {
    assert.deepEqual([0, 6, 19, 23].map(h => isNight(at(h))), [true, true, true, true]);
    assert.deepEqual([7, 12, 18].map(h => isNight(at(h))), [false, false, false]);
});

test('a click cycles light, dark, auto; stored values are validated', () => {
    assert.equal(nextThemeMode('light'), 'dark');
    assert.equal(nextThemeMode('dark'), 'auto');
    assert.equal(nextThemeMode('auto'), 'light');
    assert.equal(isThemeMode('auto'), true);
    assert.equal(isThemeMode('blue'), false);
    assert.equal(isThemeMode(undefined), false);
});

test('auto follows the clock, manual modes do not', () => {
    assert.equal(isDarkTheme('auto', true), true);
    assert.equal(isDarkTheme('auto', false), false);
    assert.equal(isDarkTheme('dark', false), true);
    assert.equal(isDarkTheme('light', true), false);
});

test('icon: manual shows the other theme (sun on dark), auto shows the current one with an A', () => {
    assert.deepEqual({ ...themeIcon('dark', false) }, { icon: '☀', auto: false });
    assert.deepEqual({ ...themeIcon('light', true) }, { icon: '🌙', auto: false });
    assert.deepEqual({ ...themeIcon('auto', true) }, { icon: '🌙', auto: true });
    assert.deepEqual({ ...themeIcon('auto', false) }, { icon: '☀', auto: true });
    assert.match(themeTitle('auto', true), /night/);
    assert.match(themeTitle('dark', false), /automatic/);
});
