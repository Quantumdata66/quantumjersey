const https = require('https');

const email = process.env.QJ_ADMIN_EMAIL;
const password = process.env.QJ_ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Error: QJ_ADMIN_EMAIL and QJ_ADMIN_PASSWORD environment variables are required.");
  process.exit(1);
}

const SUPABASE_URL = "https://pbuntpobwsaddoexpmej.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBidW50cG9id3NhZGRvZXhwbWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzAxNTksImV4cCI6MjA5NzcwNjE1OX0.DfqwSTlLtGBrmM-AgwqE1yXRLklmefuJo9TtHxMI5hI";

async function runTests() {
  let matrix = {
    IDENTITY: {},
    PRODUCTS: {},
    STORAGE: {},
    CLEANUP: {}
  };

  function report(category, key, value) {
    matrix[category][key] = value;
  }

  try {
    // 1. Authenticate
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });

    if (!authRes.ok) {
      report("IDENTITY", "Authentication", "FAILED");
      console.log("Authentication failed. Cannot proceed.");
      process.exit(1);
    }
    const authData = await authRes.json();
    const token = authData.access_token;
    
    report("IDENTITY", "Authentication", "SUCCESS");

    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    
    report("IDENTITY", "User ID", !!payload.sub ? "YES" : "NO");
    const role = (payload.app_metadata && payload.app_metadata.role) ? payload.app_metadata.role : "ABSENT";
    report("IDENTITY", "app_metadata.role", role);

    if (role !== "admin") {
      console.log("User is not an admin. Aborting admin tests.");
      process.exit(1);
    }

    const headersWithAuth = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    let tempProductId = null;
    const tempImageName = `admin_test_img_${Date.now()}.jpg`;

    // --- PRODUCTS ---
    
    // 1. SELECT
    const selectRes = await fetch(`${SUPABASE_URL}/rest/v1/products?limit=1`, { headers: headersWithAuth });
    if (selectRes.ok) {
      report("PRODUCTS", "1. SELECT", "PASS (ALLOWED)");
    } else {
      report("PRODUCTS", "1. SELECT", "FAIL");
    }

    // 2. INSERT
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: { ...headersWithAuth, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        product_name: "Admin Test Product",
        category: "boots",
        price: 999,
        image_url: "test.jpg",
        in_stock: true
      })
    });
    const insertData = await insertRes.json().catch(()=>null);
    if (insertRes.ok && Array.isArray(insertData) && insertData.length > 0) {
       report("PRODUCTS", "2. INSERT", "PASS (ALLOWED)");
       tempProductId = insertData[0].id;
    } else {
       report("PRODUCTS", "2. INSERT", "FAIL");
    }

    // 3. UPDATE
    if (tempProductId) {
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${tempProductId}`, {
        method: 'PATCH',
        headers: { ...headersWithAuth, 'Prefer': 'return=representation' },
        body: JSON.stringify({ price: 1000 })
      });
      const updateData = await updateRes.json().catch(()=>null);
      if (updateRes.ok && Array.isArray(updateData) && updateData.length > 0 && updateData[0].price === 1000) {
        report("PRODUCTS", "3. UPDATE", "PASS (ALLOWED)");
      } else {
        report("PRODUCTS", "3. UPDATE", "FAIL");
      }
    } else {
      report("PRODUCTS", "3. UPDATE", "SKIPPED (Insert failed)");
    }

    // 4. DELETE
    if (tempProductId) {
      const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${tempProductId}`, {
        method: 'DELETE',
        headers: { ...headersWithAuth, 'Prefer': 'return=representation' }
      });
      const deleteData = await deleteRes.json().catch(()=>null);
      
      const verifyDeleteRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${tempProductId}`, { headers: headersWithAuth });
      const verifyDeleteData = await verifyDeleteRes.json();
      
      if (deleteRes.ok && verifyDeleteData.length === 0) {
        report("PRODUCTS", "4. DELETE", "PASS (ALLOWED)");
        report("CLEANUP", "Temporary product removed", "YES");
      } else {
        report("PRODUCTS", "4. DELETE", "FAIL");
        report("CLEANUP", "Temporary product removed", "NO");
      }
    } else {
      report("PRODUCTS", "4. DELETE", "SKIPPED");
      report("CLEANUP", "Temporary product removed", "N/A");
    }

    // --- STORAGE ---
    
    // 6. INSERT/upload
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${tempImageName}`, {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'image/jpeg'
       },
       body: 'temp_admin_data'
    });
    if (uploadRes.ok) {
       report("STORAGE", "6. INSERT/upload", "PASS (ALLOWED)");
    } else {
       report("STORAGE", "6. INSERT/upload", `FAIL (${uploadRes.status})`);
    }

    // 5. Public image GET
    const publicGetRes = await fetch(`${SUPABASE_URL}/storage/v1/object/public/product-images/${tempImageName}`);
    if (publicGetRes.ok) {
       report("STORAGE", "5. Public image GET", "PASS (ALLOWED)");
    } else {
       report("STORAGE", "5. Public image GET", "FAIL");
    }

    // 7. UPDATE/overwrite
    const updateStorageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${tempImageName}`, {
       method: 'PUT',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'image/jpeg'
       },
       body: 'overwrite_admin_data'
    });
    if (updateStorageRes.ok) {
       report("STORAGE", "7. UPDATE/overwrite", "PASS (ALLOWED)");
    } else {
       report("STORAGE", "7. UPDATE/overwrite", "FAIL");
    }

    // 8. DELETE
    const deleteStorageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images`, {
       method: 'DELETE',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({
         prefixes: [tempImageName]
       })
    });
    const checkFileDeleteGet = await fetch(`${SUPABASE_URL}/storage/v1/object/public/product-images/${tempImageName}`);
    if (deleteStorageRes.ok && !checkFileDeleteGet.ok) {
       report("STORAGE", "8. DELETE", "PASS (ALLOWED)");
       report("CLEANUP", "Temporary image removed", "YES");
    } else {
       report("STORAGE", "8. DELETE", "FAIL");
       report("CLEANUP", "Temporary image removed", "NO");
    }

    console.log("\n--- ADMIN VERIFICATION MATRIX ---");
    console.log("\nIDENTITY:");
    for (const [key, value] of Object.entries(matrix["IDENTITY"])) {
       console.log(`${key}: ${value}`);
    }
    
    console.log("\nPRODUCTS:");
    for (const [key, value] of Object.entries(matrix["PRODUCTS"])) {
       console.log(`${key}: ${value}`);
    }
    
    console.log("\nSTORAGE product-images:");
    for (const [key, value] of Object.entries(matrix["STORAGE"])) {
       console.log(`${key}: ${value}`);
    }

    console.log("\nCLEANUP:");
    for (const [key, value] of Object.entries(matrix["CLEANUP"])) {
       console.log(`${key}: ${value}`);
    }

  } catch (error) {
    console.error("Error during verification:", error.message);
  }
}

runTests();
