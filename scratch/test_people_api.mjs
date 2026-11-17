import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAPSWHvKgO7RwYfHFcFfB_SsRWyNr0gHJU",
  authDomain: "interpres-digital.firebaseapp.com",
  projectId: "interpres-digital",
  storageBucket: "interpres-digital.firebasestorage.app",
  messagingSenderId: "245157317579",
  appId: "1:245157317579:web:b755a426c8b55628ef444e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testPeopleApi() {
  console.log("Cargando token desde Firestore...");
  const settingsSnap = await getDoc(doc(db, "settings", "booking_settings"));
  const settings = settingsSnap.data();
  const token = settings.googleConfig?.accessToken;

  if (!token) {
    console.error("No se encontró token de acceso de Google.");
    return;
  }

  console.log(`Token cargado para: ${settings.googleConfig.userEmail}`);
  console.log("Probando Google People API...");

  const testEmail = "test_cont_sync@example.com";
  const testName = "Cliente Sync Test";
  const testPhone = "+52 55 1234 5678";
  const testCompany = "Agencia de Prueba";

  console.log(`\n1. Buscando contacto existente con email: ${testEmail}...`);
  let resourceName = null;
  let etag = null;

  try {
    const searchRes = await fetch(
      `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(testEmail)}&readMask=names,emailAddresses`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    console.log("Status búsqueda:", searchRes.status);
    const searchData = await searchRes.json();
    
    if (searchRes.ok) {
      const results = searchData.results || [];
      console.log(`Resultados de búsqueda: ${results.length} encontrados`);
      for (const result of results) {
        const person = result.person;
        const emails = person.emailAddresses || [];
        if (emails.some(e => e.value?.toLowerCase() === testEmail.toLowerCase())) {
          resourceName = person.resourceName;
          etag = person.etag;
          console.log(`✓ Encontrado: ${resourceName} (etag: ${etag})`);
          break;
        }
      }
    } else {
      console.error("Error al buscar:", searchData);
    }
  } catch (err) {
    console.error("Excepción en búsqueda:", err);
  }

  const contactData = {
    names: [
      {
        givenName: testName,
        familyName: "Prueba"
      }
    ],
    emailAddresses: [
      {
        value: testEmail,
        type: 'work'
      }
    ],
    phoneNumbers: [
      {
        value: testPhone,
        type: 'mobile'
      }
    ],
    organizations: [
      {
        name: testCompany,
        title: "Test Lead",
        type: 'work'
      }
    ],
    biographies: [
      {
        value: `Sincronizado desde script de prueba\nFecha: ${new Date().toISOString()}`
      }
    ]
  };

  if (resourceName) {
    console.log(`\n2. Actualizando contacto existente: ${resourceName}...`);
    try {
      const updateUrl = `https://people.googleapis.com/v1/${resourceName}:updateContact?updatePersonFields=names,emailAddresses,phoneNumbers,organizations,biographies`;
      const updateRes = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...contactData,
          etag: etag
        })
      });
      console.log("Status actualización:", updateRes.status);
      const updateData = await updateRes.json();
      if (updateRes.ok) {
        console.log("✓ Contacto actualizado con éxito:", updateData.resourceName);
      } else {
        console.error("Error al actualizar:", updateData);
      }
    } catch (err) {
      console.error("Excepción al actualizar:", err);
    }
  } else {
    console.log("\n2. Creando nuevo contacto...");
    try {
      const createUrl = `https://people.googleapis.com/v1/people:createContact`;
      const createRes = await fetch(createUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(contactData)
      });
      console.log("Status creación:", createRes.status);
      const createData = await createRes.json();
      if (createRes.ok) {
        console.log("✓ Contacto creado con éxito:", createData.resourceName);
      } else {
        console.error("Error al crear:", createData);
      }
    } catch (err) {
      console.error("Excepción al crear:", err);
    }
  }
}

testPeopleApi();
