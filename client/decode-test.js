// Simple decoder for testing
const code = process.argv[2] || 'BJ[q§JAvTe¸m~ÀGÏTdEm>;CjA³{D&´/Òj;ºË½z){TQ|8®ÍU3Tcx+u6$2d:+·-¸Â8cPºV2>$24°+DuF*¹bJ=[Æ9¸ki²N?D#;iu°;Zmi)v%XGqÆ°/ÒsN.·Bz)ÇA]AYjJÈ8$³u?µKaÃA]AZ-JÈÏ%UpkVo¼¹7\\ºV-/À8e:ºÇj°¶7cZºY!]´6z/v~TJ/ÒqN)nMµ}i8§)F!{*È5J=[Æ<¸Òu|R¹T{ÐzYJ,zKAC¸TQ+Ë¿ÉÎvTW´UAE¶kfNR\\¼';

// Base128 character set (must match codec.ts)
const part1 = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const part2 = 'abcdefghijkmnopqrstuvwxyz';
const part3 = '23456789';
const part4 = '-_!@#$%^&*()=+[]{}|;:,.<>?~`"\'';
const EXTENDED_CHARS = '\\/§©®°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ';
const baseCount = part1.length + part2.length + part3.length + part4.length;
const neededFromExtended = 128 - baseCount;
const BASE128_CHARS = part1 + part2 + part3 + part4 + EXTENDED_CHARS.substring(0, neededFromExtended);

function decodeBase128(encoded) {
  const bytes = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  
  for (const char of encoded) {
    const value = BASE128_CHARS.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid base128 character: ${char}`);
    }
    
    buffer = (buffer << 7) | value;
    bitsInBuffer += 7;
    
    while (bitsInBuffer >= 8) {
      bytes.push((buffer >> (bitsInBuffer - 8)) & 0xFF);
      bitsInBuffer -= 8;
    }
  }
  
  return new Uint8Array(bytes);
}

// Decode
try {
  const utf8Bytes = decodeBase128(code);
  const decoded = new TextDecoder().decode(utf8Bytes);
  console.log('Decoded (first 500 chars):');
  console.log(decoded.substring(0, 500));
  console.log('\nFull length:', decoded.length);
} catch (error) {
  console.error('Error decoding:', error.message);
}

