const fs = require('fs');
const https = require('https');
const path = require('path');

const logoUrl = 'https://d11n7da8rpqbjy.cloudfront.net/interpres/3626520308589.png';
const publicDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    https.get(url, options, (response) => {
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
