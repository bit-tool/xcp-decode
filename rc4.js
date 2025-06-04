/**
 * Convert a binary string to its hexadecimal representation.
 * @param {string} str - The binary string to convert.
 * @returns {string} The hexadecimal representation.
 */
function bin2hex(str) {
  let output = '';
  for (let i = 0; i < str.length; i++) {
    const hex = str.charCodeAt(i).toString(16);
    output += hex.length < 2 ? '0' + hex : hex;
  }
  return output;
}

/**
 * Convert a hexadecimal string to its binary representation.
 * @param {string} hex - The hexadecimal string to convert.
 * @returns {string} The binary string.
 */
function hex2bin(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substr(i, 2), 16);
    if (isNaN(byte)) {
      throw new Error('Invalid hex character');
    }
    bytes.push(byte);
  }
  return String.fromCharCode(...bytes);
}

/**
 * Decode a chunk of data using a given key with RC4 and return as hex.
 * @param {string} key - The key in hex format.
 * @param {string} data - The data chunk in hex format.
 * @returns {string} The RC4-decoded data as hex.
 */
function rc4(key, data) {
  return bin2hex(rc4_bin(hex2bin(key), hex2bin(data)));
}

/**
 * RC4 symmetric cipher encryption/decryption.
 * @param {string} key - The key as a binary string.
 * @param {string} str - The data as a binary string.
 * @returns {string} The encrypted/decrypted result as a binary string.
 */
function rc4_bin(key, str) {
  const s = [];
  let j = 0;
  let res = '';

  for (let i = 0; i < 256; i++) {
    s[i] = i;
  }
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }

  let i = 0;
  j = 0;
  for (let y = 0; y < str.length; y++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    const k = s[(s[i] + s[j]) % 256];
    res += String.fromCharCode(str.charCodeAt(y) ^ k);
  }
  return res;
}

export default rc4;
