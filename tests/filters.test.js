const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const filterScript = html.match(/<script id="filter-utils">([\s\S]*?)<\/script>/);
assert.ok(filterScript, 'index.html must contain the inline filter utilities');
const { compileTextFilter } = vm.runInNewContext(`${filterScript[1]}\n({ compileTextFilter });`);

test('plain phrases preserve spaces and match case-insensitively', () => {
    const matches = compileTextFilter('2022 Mentorship');
    assert.equal(matches('My 2022 MENTORSHIP session'), true);
    for (const value of ['2022 great Mentorship', '2022  Mentorship', '2022Mentorship']) {
        assert.equal(matches(value), false);
    }
    assert.equal(compileTextFilter(' Mentorship ')('Mentorship'), false);
    assert.equal(compileTextFilter(' ')('no-spaces'), false);
});

test('both AND operators require non-overlapping occurrences in order', () => {
    for (const operator of ['*', '&']) {
        const matches = compileTextFilter(`2022${operator}Mentorship`);
        assert.equal(matches('2022 wonderful Mentorship'), true);
        assert.equal(matches('2022Mentorship'), true);
        for (const value of ['Mentorship 2022', '2022 only', 'Mentorship only']) {
            assert.equal(matches(value), false);
        }
    }
    assert.equal(compileTextFilter('a*a')('a'), false);
    assert.equal(compileTextFilter('a*a')('aba'), true);
});

test('OR matches any alternative, including complete phrases', () => {
    const matches = compileTextFilter('2022 Mentorship|2016 Mentorship|2017 Mentorship');
    for (const year of [2022, 2016, 2017]) assert.equal(matches(`${year} Mentorship session`), true);
    assert.equal(matches('2020 Mentorship'), false);
    assert.equal(matches('2016 amazing Mentorship'), false);
    assert.equal(compileTextFilter('2022|Mentorship')('Mentorship alone'), true);
    assert.equal(compileTextFilter('2022|Mentorship')('2022 alone'), true);
});

test('arbitrary combinations give ordered AND precedence over OR', () => {
    const matches = compileTextFilter('2022*Mentorship&Live|2016&Mentorship|2017*Recorded');
    for (const value of ['2022 Mentorship Live', '2016 great Mentorship', '2017 Recorded']) {
        assert.equal(matches(value), true);
    }
    for (const value of ['2022 Mentorship', 'Live 2022 Mentorship', '2016 Recorded']) {
        assert.equal(matches(value), false);
    }
});

test('empty operands are ignored without turning trailing OR into match-all', () => {
    for (const query of ['', '*&||']) assert.equal(compileTextFilter(query)('anything'), true);
    for (const query of ['|foo|', 'foo*', '*foo', 'foo&&**']) {
        assert.equal(compileTextFilter(query)('foo'), true);
        assert.equal(compileTextFilter(query)('bar'), false);
    }
});

test('non-operator punctuation stays literal; missing values are safe', () => {
    assert.equal(compileTextFilter('[a].+?')('prefix [a].+? suffix'), true);
    assert.equal(compileTextFilter('[a].+?')('aaaa'), false);
    assert.equal(compileTextFilter('something')(null), false);
    assert.equal(compileTextFilter('something')(undefined), false);
    assert.equal(compileTextFilter('2022')(2022), true);
});
