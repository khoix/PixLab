// Full decoder with all decompression steps
const code = process.argv[2] || 'BJ[q§JAvTe¸m~ÀGÏTdEm>;CjA³{D&´/Òj;ºË½z){TQ|8®ÍU3Tcx+u6$2d:+·-¸Â8cPºV2>$24°+DuF*¹bJ=[Æ9¸ki²N?D#;iu°;Zmi)v%XGqÆ°/ÒsN.·Bz)ÇA]AYjJÈ8$³u?µKaÃA]AZ-JÈÏ%UpkVo¼¹7\\ºV-/À8e:ºÇj°¶7cZºY!]´6z/v~TJ/ÒqN)nMµ}i8§)F!{*È5J=[Æ<¸Òu|R¹T{ÐzYJ,zKAC¸TQ+Ë¿ÉÎvTW´UAE¶kfNR\\¼';

// Base128 character set
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

function dictionaryDecompress(str) {
  if (!str.startsWith('\x02')) {
    return str;
  }
  
  const dictEnd = str.indexOf('\x03');
  if (dictEnd === -1) {
    return str;
  }
  
  const dictStr = str.substring(1, dictEnd);
  const dictionary = dictStr.split('\x00');
  let decompressed = str.substring(dictEnd + 1);
  
  for (let i = dictionary.length - 1; i >= 0; i--) {
    const token = `\x01${String.fromCharCode(32 + i)}\x01`;
    decompressed = decompressed.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), dictionary[i]);
  }
  
  return decompressed;
}

function decompressString(str) {
  // Order matters! Longer/more specific tokens must come first
  const replacements = [
    // Long/specific tokens first
    ['~I2', '"i":'],  // Must come before ~I
    ['~N2', '"n":'],  // Must come before ~n
    ['~T2', '"t":'],  // Must come before ~t
    ['~R2', '"r":'],  // Must come before ~r
    ['~Mu', '"musicVolume":'],
    ['~Lo', '"loadout":'],
    // Then shorter tokens
    ['~d', '"description":"'],
    ['~j', '"joystickPosition":'],
    ['~V', '"visionRadius":'],
    ['~l', '"currentLevel":'],
    ['~m', '"activeMods":'],
    ['~b', '"bossDrops":'],
    ['~I', '"inventory":'],
    ['~r', '"rarity":"'],
    ['~s', '"stats":'],
    ['~D', '"damage":'],
    ['~f', '"defense":'],
    ['~p', '"speed":'],
    ['~v', '"vision":'],
    ['~S', '"settings":'],
    ['~i', '"id":"'],
    ['~n', '"name":"'],
    ['~t', '"type":"'],
    ['~h', '"heal":'],
    ['~c', '"price":'],
    ['~w', '"weapon":'],
    ['~a', '"armor":'],
    ['~u', '"utility":'],
    ['~H', '"hp":'],
    ['~M', '"maxHp":'],
    ['~C', '"coins":'],
    ['~0', '"common"'],
    ['~1', '"rare"'],
    ['~2', '"epic"'],
    ['~3', '"legendary"'],
    ['~W', '"weapon"'],
    ['~A', '"armor"'],
    ['~U', '"utility"'],
    ['~X', '"consumable"'],
    ['~L', '"left"'],
    ['~R', '"right"'],
  ];
  
  let decompressed = str;
  for (const [token, pattern] of replacements) {
    decompressed = decompressed.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), pattern);
  }
  
  return decompressed;
}

// Decode
try {
  console.log('Step 1: Decoding base128...');
  const utf8Bytes = decodeBase128(code);
  const baseDecoded = new TextDecoder().decode(utf8Bytes);
  console.log('Base128 decoded length:', baseDecoded.length);
  
  console.log('\nStep 2: Decompressing dictionary...');
  const dictDecompressed = dictionaryDecompress(baseDecoded);
  console.log('Dictionary decompressed length:', dictDecompressed.length);
  
  console.log('\nStep 3: Decompressing tokens...');
  const json = decompressString(dictDecompressed);
  console.log('Token decompressed length:', json.length);
  console.log('Token decompressed (first 300 chars):', json.substring(0, 300));
  
  console.log('\nStep 4: Parsing JSON...');
  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    console.error('JSON parse error at position:', e.message);
    console.log('JSON around error:');
    const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
    console.log(json.substring(Math.max(0, pos - 50), Math.min(json.length, pos + 50)));
    throw e;
  }
  
  console.log('\n=== DECODED GAME STATE ===\n');
  console.log(JSON.stringify(data, null, 2));
  
  // Pretty print key info
  console.log('\n=== SUMMARY ===');
  if (data.l) console.log('Level:', data.l);
  if (data.s) {
    console.log('Stats:', {
      hp: data.s.H || data.s.hp,
      maxHp: data.s.M || data.s.maxHp,
      coins: data.s.C || data.s.coins,
      damage: data.s.damage,
      speed: data.s.speed,
      visionRadius: data.s.V || data.s.visionRadius
    });
  }
  if (data.I) console.log('Inventory items:', data.I.length);
  if (data.Lo) {
    console.log('Loadout:', {
      weapon: data.Lo.w ? 'Yes' : 'No',
      armor: data.Lo.a ? 'Yes' : 'No',
      utility: data.Lo.u ? 'Yes' : 'No'
    });
  }
  if (data.m) console.log('Active mods:', data.m.length);
  if (data.b) console.log('Boss drops:', data.b.length);
  if (data.S) console.log('Settings:', data.S);
  
} catch (error) {
  console.error('Error decoding:', error.message);
  console.error(error.stack);
}

