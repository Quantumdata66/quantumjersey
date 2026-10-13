// ============================================================
// Quantum Jersey — Serverless Client Configuration Endpoint
// ============================================================

const APPROVED_SANDBOX_SUPABASE_URL = "https://lsembtxswybbzxvjinmp.supabase.co";
const APPROVED_PRODUCTION_SUPABASE_URL = "https://pbuntpobwsaddoexpmej.supabase.co";

/**
 * Generates client configuration script based on the execution environment.
 *
 * Security Constraints:
 * 1. Strictly relies on platform-injected process.env.VERCEL_ENV.
 * 2. In Preview, strictly enforces SUPABASE_URL === APPROVED_SANDBOX_SUPABASE_URL.
 * 3. Never emits or references SUPABASE_SERVICE_ROLE_KEY, PAYSTACK_SECRET_KEY, or other secrets.
 * 4. Fails closed with non-success status and disabling token if preview configuration is missing or invalid.
 *
 * @param {Object} env - Environment variables object (defaults to process.env)
 * @returns {{ statusCode: number, content: string }}
 */
function generateConfigScript(env = process.env) {
  const vercelEnv = (env.VERCEL_ENV || '').trim().toLowerCase();

  // 1. Production Environment
  if (vercelEnv === 'production') {
    return {
      statusCode: 200,
      content: '// Quantum Jersey Production Environment\nwindow.QJ_ENV = "production";\n'
    };
  }

  // 2. Preview Environment
  if (vercelEnv === 'preview') {
    const rawUrl = (env.SUPABASE_URL || '').trim();
    const rawAnonKey = (env.SUPABASE_ANON_KEY || '').trim();

    // Fail closed if required sandbox configuration is absent
    if (!rawUrl || !rawAnonKey) {
      return {
        statusCode: 500,
        content: '// Quantum Jersey Preview Configuration Error: Missing SUPABASE_URL or SUPABASE_ANON_KEY\nwindow.QJ_ENV = "preview";\nwindow.QJ_CONFIG_ERROR = "Missing Preview Supabase configuration";\nwindow.QJ_SUPABASE_URL = "YOUR_PREVIEW_CONFIG_FAILED";\nwindow.QJ_SUPABASE_ANON_KEY = "DISABLED";\n'
      };
    }

    // Require SUPABASE_URL to point strictly to the approved sandbox project
    const normalizedUrl = rawUrl.replace(/\/+$/, '');
    if (normalizedUrl !== APPROVED_SANDBOX_SUPABASE_URL) {
      return {
        statusCode: 500,
        content: '// Quantum Jersey Preview Configuration Error: Untrusted or invalid Preview Supabase URL\nwindow.QJ_ENV = "preview";\nwindow.QJ_CONFIG_ERROR = "Untrusted or invalid Preview Supabase URL";\nwindow.QJ_SUPABASE_URL = "YOUR_PREVIEW_CONFIG_FAILED";\nwindow.QJ_SUPABASE_ANON_KEY = "DISABLED";\n'
      };
    }

    // Emit only public variables: QJ_ENV, QJ_SUPABASE_URL, QJ_SUPABASE_ANON_KEY
    return {
      statusCode: 200,
      content: `// Quantum Jersey Preview Environment\nwindow.QJ_ENV = "preview";\nwindow.QJ_SUPABASE_URL = ${JSON.stringify(normalizedUrl)};\nwindow.QJ_SUPABASE_ANON_KEY = ${JSON.stringify(rawAnonKey)};\n`
    };
  }

  // 3. Deliberate Local Development Path
  if (vercelEnv === 'development' || !vercelEnv) {
    const rawUrl = (env.SUPABASE_URL || '').trim();
    const rawAnonKey = (env.SUPABASE_ANON_KEY || '').trim();

    if (rawUrl && rawAnonKey) {
      return {
        statusCode: 200,
        content: `// Quantum Jersey Development Environment\nwindow.QJ_ENV = "development";\nwindow.QJ_SUPABASE_URL = ${JSON.stringify(rawUrl.replace(/\/+$/, ''))};\nwindow.QJ_SUPABASE_ANON_KEY = ${JSON.stringify(rawAnonKey)};\n`
      };
    }

    return {
      statusCode: 200,
      content: '// Quantum Jersey Development Environment (Default)\nwindow.QJ_ENV = "development";\n'
    };
  }

  // 4. Unknown environment values fail safely
  return {
    statusCode: 500,
    content: `// Quantum Jersey Configuration Error: Unrecognized VERCEL_ENV "${vercelEnv}"\nwindow.QJ_CONFIG_ERROR = "Unrecognized environment";\nwindow.QJ_SUPABASE_URL = "YOUR_PREVIEW_CONFIG_FAILED";\nwindow.QJ_SUPABASE_ANON_KEY = "DISABLED";\n`
  };
}

/**
 * Vercel Serverless Function handler
 */
module.exports = function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('// Method Not Allowed\n');
  }

  const { statusCode, content } = generateConfigScript(process.env);

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  return res.status(statusCode).send(content);
};

// Export internal functions for automated testing
module.exports.generateConfigScript = generateConfigScript;
module.exports.APPROVED_SANDBOX_SUPABASE_URL = APPROVED_SANDBOX_SUPABASE_URL;
module.exports.APPROVED_PRODUCTION_SUPABASE_URL = APPROVED_PRODUCTION_SUPABASE_URL;
