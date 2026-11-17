import { isGoogleTokenExpired } from "../services/gmailApiService.ts";

console.log("=== PROBANDO DETECCIÓN DE EXPIRACIÓN ===");

// Caso 1: Token nulo o indefinido
console.log("Caso 1 (Sin token):", isGoogleTokenExpired(undefined) === true ? "PASS" : "FAIL");

// Caso 2: Sin marca de tiempo (como estaba en Firestore)
const oldConfig = {
  accessToken: "token_viejo",
  connected: true,
  userEmail: "admin@interpresdigital.com"
};
console.log("Caso 2 (Sin marca de tiempo -> debe dar expirado TRUE):", isGoogleTokenExpired(oldConfig) === true ? "PASS" : "FAIL");

// Caso 3: Token obtenido hace 10 minutos
const validConfig = {
  accessToken: "token_nuevo",
  connected: true,
  tokenObtainedAt: Date.now() - (10 * 60 * 1000)
};
console.log("Caso 3 (Token reciente -> debe dar expirado FALSE):", isGoogleTokenExpired(validConfig) === false ? "PASS" : "FAIL");

// Caso 4: Token obtenido hace 60 minutos
const expiredConfig = {
  accessToken: "token_expirado",
  connected: true,
  tokenObtainedAt: Date.now() - (60 * 60 * 1000)
};
console.log("Caso 4 (Token de hace 1h -> debe dar expirado TRUE):", isGoogleTokenExpired(expiredConfig) === true ? "PASS" : "FAIL");

console.log("=== PRUEBAS DE DETECCIÓN FINALIZADAS ===");
