import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceImage = join(__dirname, 'imgs', 'pixlab2.PNG');
const publicDir = join(__dirname, 'client', 'public');

// Ensure public directory exists
if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

async function generateIcons() {
  try {
    console.log('Generating icons from', sourceImage);
    
    // Generate Apple touch icon (180x180px)
    await sharp(sourceImage)
      .resize(180, 180, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(join(publicDir, 'apple-touch-icon.png'));
    console.log('✓ Created apple-touch-icon.png (180x180)');
    
    // Generate favicon (32x32px)
    await sharp(sourceImage)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(join(publicDir, 'favicon.png'));
    console.log('✓ Created favicon.png (32x32)');
    
    // Generate additional favicon sizes for better browser support
    await sharp(sourceImage)
      .resize(16, 16, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(join(publicDir, 'favicon-16x16.png'));
    console.log('✓ Created favicon-16x16.png');
    
    await sharp(sourceImage)
      .resize(192, 192, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(join(publicDir, 'favicon-192x192.png'));
    console.log('✓ Created favicon-192x192.png');
    
    await sharp(sourceImage)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(join(publicDir, 'favicon-512x512.png'));
    console.log('✓ Created favicon-512x512.png');
    
    console.log('\nAll icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();

