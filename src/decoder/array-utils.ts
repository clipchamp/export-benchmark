function buildPattern(search: ArrayLike<unknown>): number[] {
    const table = new Array<number>(search.length).fill(0);
    let maxPrefix = 0;

    for (let patternIndex = 1; patternIndex < search.length; ++patternIndex) {
        while (maxPrefix > 0 && search[patternIndex] !== search[maxPrefix]) {
            maxPrefix = table[maxPrefix - 1];
        }

        if (search[maxPrefix] === search[patternIndex]) {
            ++maxPrefix;
        }

        table[patternIndex] = maxPrefix;
    }

    return table;
}

/**
 * Generic Knuth-Morris-Pratt algorithm for finding a sequence (string, subarray) in a larger sequence.
 *
 * @param text - the larger sequence of elements of type T in which to find the search sequence.
 * @param search - the shorter search sequence of elements of type T.
 * @returns an array of numbers, representing the start offsets of all occurrences of `search`
 * inside `text`.
 */
export function searchPattern<T>(text: ArrayLike<T>, search: ArrayLike<T>): number[] {
    const pattern = buildPattern(search);
    const matches: number[] = [];

    let textIndex = 0;
    let patternIndex = 0;

    while (textIndex < text.length) {
        if (text[textIndex] === search[patternIndex]) {
            ++textIndex;
            ++patternIndex;
        }

        if (patternIndex === search.length) {
            matches.push(textIndex - patternIndex);
            patternIndex = pattern[patternIndex - 1];
        } else if (text[textIndex] !== search[patternIndex]) {
            if (patternIndex === 0) {
                ++textIndex;
            } else {
                patternIndex = pattern[patternIndex - 1];
            }
        }
    }

    return matches;
}

export function startsWith<T>(text: ArrayLike<T>, prefix: ArrayLike<T>): boolean {
    for (let i = 0, ii = prefix.length; i < ii; ++i) {
        if (text[i] !== prefix[i]) {
            return false;
        }
    }

    return true;
}
