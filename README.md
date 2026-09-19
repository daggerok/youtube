# youtube

## prerequisites

```bash
jq -r '."Google YouTube Data API v3 API Key youtube"' google.json | pbcopy
```

## Column filters

All desktop and mobile column filters use the same case-insensitive syntax:

- `2022*Mentorship` or `2022&Mentorship`: match `2022` followed by `Mentorship`, with any text (or none) between them.
- `2022|Mentorship`: match either phrase.
- `2022 Mentorship|2016 Mentorship|2017 Mentorship`: match any of these exact phrases (ignoring case).
- `2022*Mentorship&Live|2016*Mentorship`: combine any number of operators. AND (`*`, `&`) binds more tightly than OR (`|`).

Spaces are literal, including spaces next to operators; they are not trimmed or treated as AND. Do not wrap queries in quotes. AND terms must occur in order, without overlapping. Empty operands are ignored while typing; an empty or operators-only filter imposes no restriction. Operators are reserved characters, with no escaping or parentheses syntax. Filters on different columns must all match.

### Tests

```bash
node --test tests/filters.test.js
```
