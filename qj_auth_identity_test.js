const email = process.env.QJ_TEST_EMAIL;
const password = process.env.QJ_TEST_PASSWORD;

if (!email || !password) {
  console.error("Error: QJ_TEST_EMAIL and QJ_TEST_PASSWORD environment variables are required.");
  process.exit(1);
}

const SUPABASE_URL = "https://pbuntpobwsaddoexpmej.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBidW50cG9id3NhZGRvZXhwbWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzAxNTksImV4cCI6MjA5NzcwNjE1OX0.DfqwSTlLtGBrmM-AgwqE1yXRLklmefuJo9TtHxMI5hI";

async function authenticate() {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      let safeErrorMsg = "Unknown error";
      try {
        const errorData = await response.json();
        safeErrorMsg = errorData.error_description || errorData.msg || errorData.message || safeErrorMsg;
      } catch (e) {}
      
      console.log("Authentication: FAILED");
      console.log(`HTTP Status: ${response.status}`);
      console.log(`Error Message: ${safeErrorMsg}`);
      process.exit(1);
    }

    const data = await response.json();
    console.log("Authentication: SUCCESS");

    const jwt = data.access_token;
    if (!jwt) {
      console.log("Error: No access token returned.");
      process.exit(1);
    }

    const parts = jwt.split('.');
    if (parts.length !== 3) {
      console.log("Error: Invalid JWT format.");
      process.exit(1);
    }

    // Inspect JWT payload in memory
    const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8');
    const payload = JSON.parse(payloadStr);

    const hasUserId = !!payload.sub;
    console.log(`User ID present: ${hasUserId ? 'YES' : 'NO'}`);

    const appMetadata = payload.app_metadata || {};
    let roleStatus = "ABSENT";
    
    if ('role' in appMetadata) {
      roleStatus = appMetadata.role === "admin" ? "ADMIN" : "NON-ADMIN";
    }

    console.log(`app_metadata.role: ${roleStatus}`);

    if (roleStatus === "ABSENT" || roleStatus === "NON-ADMIN") {
      console.log("NON-ADMIN IDENTITY CONFIRMED");
    }

  } catch (err) {
    console.log("Authentication: FAILED");
    console.log(`Error: ${err.message}`);
    process.exit(1);
  }
}

authenticate();
