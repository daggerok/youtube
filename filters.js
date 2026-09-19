// Shared by every desktop and mobile column filter.
// OR separates alternatives; * and & join literal phrases in occurrence order.
function compileTextFilter(query) {
    const alternatives = String(query ?? '').toLowerCase().split('|')
        .map(alternative => alternative.split(/[*&]/).filter(term => term !== ''))
        .filter(terms => terms.length > 0);

    // Ignore empty operands while typing, rather than making an empty OR match all.
    if (alternatives.length === 0) return () => true;

    return value => {
        const text = String(value ?? '').toLowerCase();
        return alternatives.some(terms => {
            let offset = 0;
            return terms.every(term => {
                const index = text.indexOf(term, offset);
                if (index === -1) return false;
                offset = index + term.length;
                return true;
            });
        });
    };
}

const FILTER_HELP = 'Case-insensitive literal phrases; spaces are literal. Use * or & for AND in order, | for OR. AND is evaluated before OR.';

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { compileTextFilter };
}
