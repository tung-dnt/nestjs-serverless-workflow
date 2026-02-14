const DELIMETER = '~#';

class Solution {
  /**
   * @param {string[]} strs
   * @returns {string}
   */
  encode(strs) {
    if (strs.length === 0) return '';

    let result = '';
    for (const str of strs) {
      result += DELIMETER + str;
    }
    return result;
  }

  /**
   * @param {string} str
   * @returns {string[]}
   */
  decode(str) {
    const result = [];
    let delimeter = '';
    let currentSubStr = '';

    for (const char of str) {
      if (delimeter.length < DELIMETER.length) {
        delimeter += char;
        if (delimeter === DELIMETER) {
          result.push(currentSubStr);
          currentSubStr = '';
          delimeter = '';
        } else if (!DELIMETER.startsWith(delimeter)) {
          // This char can't be part of the delimiter; treat accumulated as normal text
          currentSubStr += delimeter;
          delimeter = '';
        }
      } else {
        // We had a full candidate that wasn't the delimiter; flush it
        currentSubStr += delimeter;
        delimeter = char;
        if (delimeter === DELIMETER) {
          result.push(currentSubStr);
          currentSubStr = '';
          delimeter = '';
        } else if (!DELIMETER.startsWith(delimeter)) {
          currentSubStr += delimeter;
          delimeter = '';
        }
      }
    }
    // Don't forget the last segment (after the last delimiter)
    result.push(currentSubStr + delimeter);
    return result;
  }
}

// Quick check
const sol = new Solution();
const encoded = sol.encode(['hello', 'world']);
console.log('Encoded:', JSON.stringify(encoded));
const decoded = sol.decode(encoded);
console.log('Decoded:', decoded);
// Expected: first segment is '' (before first ~#), then 'hello', then 'world'
