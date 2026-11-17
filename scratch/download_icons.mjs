import https from "https";
import fs from "fs";
import path from "path";

const iconUrl = "https://d11n7da8rpqbjy.cloudfront.net/interpres/3626520308589.png";
const publicDir = "e:/AGENCIA DE MARKETING/PANEL ADMINISTRATIVO ID/public";

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    https.get(url, options, (response) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
        file.on('error', (err) => {
          fs.unlink(dest, () => reject(err));
        });
      } else {
        reject(new Error(`Failed to download: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function run() {
  try {
    console.log("Downloading icon-192.png with User-Agent...");
    await downloadImage(iconUrl, path.join(publicDir, "icon-192.png"));
    console.log("Downloading icon-512.png with User-Agent...");
    await downloadImage(iconUrl, path.join(publicDir, "icon-512.png"));
    console.log("Success! Local icons downloaded and saved to public/.");
  } catch (error) {
    console.error("Error downloading icons:", error);
  }
}

run();
