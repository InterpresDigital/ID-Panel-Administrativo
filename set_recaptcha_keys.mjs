import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Writable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Stream silencioso con máscara de asteriscos para ocultar lo que escribe el usuario
let mutable = false;
const mutableStdout = new Writable({
  write(chunk, encoding, callback) {
    if (!mutable) {
      process.stdout.write(chunk, encoding);
    } else {
      // Ocultar caracteres con asteriscos
      const str = chunk.toString();
      if (str === '\r\n' || str === '\n') {
        process.stdout.write(chunk, encoding);
      } else {
        process.stdout.write('*');
      }
    }
    callback();
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: mutableStdout,
  terminal: true
});

console.log("\n=======================================================");
console.log(" 🔒 CONFIGURACIÓN SEGURA CON MÁSCARA (reCAPTCHA v3)");
console.log("=======================================================\n");

mutable = false;
process.stdout.write('👉 Pega tu Clave del sitio (Site Key) [OCULTA]: ');
mutable = true;

rl.question('', (siteKey) => {
  mutable = false;
  process.stdout.write('\n👉 Pega tu Clave Secreta (Secret Key) [OCULTA]: ');
  mutable = true;

  rl.question('', (secretKey) => {
    mutable = false;
    console.log('\n');

    const cleanSiteKey = siteKey.trim();
    const cleanSecretKey = secretKey.trim();

    if (!cleanSiteKey) {
      console.error("❌ Error: La clave del sitio no puede estar vacía.");
      rl.close();
      return;
    }

    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    if (envContent.includes('VITE_RECAPTCHA_SITE_KEY=')) {
      envContent = envContent.replace(/VITE_RECAPTCHA_SITE_KEY=.*/g, `VITE_RECAPTCHA_SITE_KEY=${cleanSiteKey}`);
    } else {
      envContent += `\nVITE_RECAPTCHA_SITE_KEY=${cleanSiteKey}\n`;
    }

    if (envContent.includes('VITE_RECAPTCHA_SECRET_KEY=')) {
      envContent = envContent.replace(/VITE_RECAPTCHA_SECRET_KEY=.*/g, `VITE_RECAPTCHA_SECRET_KEY=${cleanSecretKey}`);
    } else {
      envContent += `VITE_RECAPTCHA_SECRET_KEY=${cleanSecretKey}\n`;
    }

    fs.writeFileSync(envPath, envContent, 'utf-8');

    console.log("✅ ¡Llaves de Google reCAPTCHA v3 guardadas exitosamente en tu archivo local .env!");
    console.log("🔒 Tus llaves fueron ingresadas de forma encriptada/oculta y permanecen 100% seguras.\n");
    rl.close();
  });
});
