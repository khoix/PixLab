const part1 = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const part2 = 'abcdefghijkmnopqrstuvwxyz';
const part3 = '23456789';
const part4 = '-_!@#$%^&*()=+[]{}|;:,.<>?~`"\'';
const EXTENDED_CHARS = '\\/§©®°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ';

console.log('Part1 (uppercase):', part1.length);
console.log('Part2 (lowercase):', part2.length);
console.log('Part3 (digits):', part3.length);
console.log('Part4 (symbols):', part4.length);
console.log('Extended available:', EXTENDED_CHARS.length);

const base = part1.length + part2.length + part3.length + part4.length;
console.log('Base total:', base);
console.log('Need from extended:', 128 - base);

const test = part1 + part2 + part3 + part4 + EXTENDED_CHARS.substring(0, 128 - base);
console.log('Total length:', test.length);
console.log('Unique count:', new Set(test).size);

