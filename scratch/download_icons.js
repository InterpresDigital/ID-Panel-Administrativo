const fs = require('fs');
const https = require('https');
const path = require('path');

const logoUrl = 'https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/3.png';
const publicDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (Status Code: ${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

async function main() {
  try {
    console.log('Downloading logo for PWA icons...');
    const icon192Path = path.join(publicDir, 'pwa-192.png');
    const icon512Path = path.join(publicDir, 'pwa-512.png');
    
    await download(logoUrl, icon192Path);
    console.log('pwa-192.png downloaded successfully.');
    
    // Copy the same image to pwa-512.png since PWA expects both sizes
    fs.copyFileSync(icon192Path, icon512Path);
    console.log('pwa-512.png created successfully.');
    console.log('PWA Icons generated successfully!');
  } catch (err) {
    console.error('Error downloading PWA icons:', err);
    process.exit(1);
  }
}

main();
