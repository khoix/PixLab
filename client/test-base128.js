// Build character set with exact count (dynamically calculated)
const part1 = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 uppercase (no I, O)
const part2 = 'abcdefghijkmnopqrstuvwxyz'; // 25 lowercase (no l)
const part3 = '23456789'; // 8 digits (no 0, 1)
const part4 = '-_!@#$%^&*()=+[]{}|;:,.<>?~`"\''; // Common symbols (30 chars)
const EXTENDED_CHARS = '\\/§©®°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ';

// Calculate: base = part1 + part2 + part3 + part4, need 128 total
const baseCount = part1.length + part2.length + part3.length + part4.length;
const neededFromExtended = 128 - baseCount;
const BASE128_CHARS_RAW = part1 + part2 + part3 + part4 + EXTENDED_CHARS.substring(0, neededFromExtended);

console.log('Length:', BASE128_CHARS_RAW.length);
console.log('Unique:', new Set(BASE128_CHARS_RAW).size);
console.log('Expected: 128');

if (BASE128_CHARS_RAW.length === 128 && new Set(BASE128_CHARS_RAW).size === 128) {
  console.log('✓ Valid base128 character set!');
} else {
  console.log('✗ Invalid - need exactly 128 unique characters');
  process.exit(1);
}

