// ============================================================
// Quantum Jersey — Shared Input Validation Library
// ============================================================

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates customer contact and delivery details.
 * Ensures data complies with public.orders schema constraints.
 */
function validateCustomer(customer) {
  if (!customer || typeof customer !== 'object') {
    return { valid: false, error: 'Customer object is required.' };
  }

  const { name, email, phone, delivery_state, delivery_city, delivery_address, delivery_notes } = customer;

  // Name
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return { valid: false, error: 'Customer name must be between 2 and 100 characters.' };
  }

  // Email (mandatory for Paystack)
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Customer email is required for Paystack checkout.' };
  }
  const cleanEmail = email.trim();
  if (cleanEmail.length < 5 || cleanEmail.length > 255 || !EMAIL_REGEX.test(cleanEmail)) {
    return { valid: false, error: 'Invalid customer email address.' };
  }

  // Phone
  if (!phone || typeof phone !== 'string' || phone.trim().length < 7 || phone.trim().length > 25) {
    return { valid: false, error: 'Customer phone must be between 7 and 25 characters.' };
  }

  // State
  if (!delivery_state || typeof delivery_state !== 'string' || delivery_state.trim().length < 2 || delivery_state.trim().length > 50) {
    return { valid: false, error: 'Delivery state must be between 2 and 50 characters.' };
  }

  // City
  if (!delivery_city || typeof delivery_city !== 'string' || delivery_city.trim().length < 2 || delivery_city.trim().length > 50) {
    return { valid: false, error: 'Delivery city must be between 2 and 50 characters.' };
  }

  // Address
  if (!delivery_address || typeof delivery_address !== 'string' || delivery_address.trim().length < 5 || delivery_address.trim().length > 255) {
    return { valid: false, error: 'Delivery address must be between 5 and 255 characters.' };
  }

  // Notes (optional)
  let cleanNotes = null;
  if (delivery_notes && typeof delivery_notes === 'string') {
    cleanNotes = delivery_notes.trim().slice(0, 500);
  }

  return {
    valid: true,
    data: {
      name: name.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      delivery_state: delivery_state.trim(),
      delivery_city: delivery_city.trim(),
      delivery_address: delivery_address.trim(),
      delivery_notes: cleanNotes
    }
  };
}

/**
 * Validates client items array.
 * Rejects client-supplied prices or totals; only accepts IDs, sizes, quantities.
 */
function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'Order must contain at least one item.' };
  }

  if (items.length > 50) {
    return { valid: false, error: 'Order exceeds maximum permitted item count (50).' };
  }

  const cleanItems = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `Item at index ${i} is invalid.` };
    }

    const { id, size, quantity } = item;

    if (!id || typeof id !== 'string' || (!UUID_REGEX.test(id) && id.length > 64)) {
      return { valid: false, error: `Item at index ${i} has an invalid product identifier.` };
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0 || parsedQty > 50) {
      return { valid: false, error: `Item at index ${i} has an invalid quantity (must be between 1 and 50).` };
    }

    let cleanSize = null;
    if (size !== null && size !== undefined && size !== '') {
      if (typeof size === 'string') {
        cleanSize = size.trim().slice(0, 50) || null;
      } else {
        return { valid: false, error: `Item at index ${i} has an invalid size format.` };
      }
    }

    cleanItems.push({
      id: id.trim(),
      size: cleanSize,
      quantity: parsedQty
    });
  }

  return { valid: true, data: cleanItems };
}

/**
 * Validates a Paystack payment reference string.
 */
function validateReference(ref) {
  if (!ref || typeof ref !== 'string') return false;
  const clean = ref.trim();
  // Valid references are alphanumeric with dashes/underscores, 8 to 100 characters
  return /^[A-Za-z0-9_-]{8,100}$/.test(clean);
}

/**
 * Approved merchant origins for Paystack return callback URLs.
 * Production domain is quantumjersey.vercel.app.
 */
const APPROVED_PRODUCTION_ORIGINS = [
  'https://quantumjersey.vercel.app'
];

/**
 * Expected hostname pattern for Quantum Jersey Vercel Preview deployments.
 * Must match quantumjersey.vercel.app or quantumjersey-<branch-or-hash>.vercel.app.
 * Strictly prevents path traversal, lookalikes, attacker domains, or unrelated vercel.app projects.
 */
const PREVIEW_HOSTNAME_PATTERN = /^quantumjersey(-[a-z0-9-]+)?\.vercel\.app$/;

/**
 * Strictly parses and validates a Vercel deployment URL from environment variables.
 * Rejects non-HTTPS schemes, ports, paths, query strings, hashes, credentials,
 * and hostnames not matching the Quantum Jersey preview naming pattern.
 *
 * @param {string} raw - Value from process.env
 * @param {string} envVarName - Name of the environment variable for descriptive errors
 * @returns {{ valid: boolean, host?: string, error?: string }}
 */
function parseStrictVercelHost(raw, envVarName) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: `${envVarName} is missing or not a string.` };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: `${envVarName} is empty.` };
  }

  // Reject embedded whitespace
  if (/\s/.test(trimmed)) {
    return { valid: false, error: `${envVarName} contains whitespace.` };
  }

  // Reject http:// protocol explicitly
  if (/^http:\/\//i.test(trimmed)) {
    return { valid: false, error: `${envVarName} must use HTTPS, not HTTP.` };
  }

  // Reject other non-https protocols
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed) && !/^https:\/\//i.test(trimmed)) {
    return { valid: false, error: `${envVarName} uses an invalid or unsupported protocol.` };
  }

  const withProto = /^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withProto);
  } catch (_) {
    return { valid: false, error: `${envVarName} is malformed and cannot be parsed as a URL.` };
  }

  // Protocol must be https
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: `${envVarName} must use HTTPS.` };
  }

  // Must not contain credentials
  if (parsed.username || parsed.password) {
    return { valid: false, error: `${envVarName} contains user credentials.` };
  }

  // Must not contain custom ports
  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: `${envVarName} contains an unauthorized custom port "${parsed.port}".` };
  }

  // Path must be empty or root '/'
  if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname !== '') {
    return { valid: false, error: `${envVarName} contains unexpected path segments "${parsed.pathname}".` };
  }

  // Search/query string must be empty
  if (parsed.search) {
    return { valid: false, error: `${envVarName} contains unexpected query parameters.` };
  }

  // Hash fragment must be empty
  if (parsed.hash) {
    return { valid: false, error: `${envVarName} contains unexpected hash fragments.` };
  }

  const host = parsed.hostname.toLowerCase();

  // Validate hostname pattern
  if (!PREVIEW_HOSTNAME_PATTERN.test(host)) {
    return {
      valid: false,
      error: `${envVarName} is malformed or untrusted: hostname "${host}" does not match the approved Quantum Jersey preview naming pattern.`
    };
  }

  return { valid: true, host };
}

/**
 * Validates and extracts a trusted deployment hostname from process.env.VERCEL_URL.
 * Returns the clean hostname string if valid, null if unset/empty, or false if malformed/untrusted.
 */
function getTrustedPreviewHostname() {
  const raw = process.env.VERCEL_URL;
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  const parsed = parseStrictVercelHost(raw, 'VERCEL_URL');
  return parsed.valid ? parsed.host : false;
}

/**
 * Resolves and strictly validates the trusted deployment configuration for Preview environments.
 *
 * In Preview (VERCEL_ENV === 'preview'):
 * - Requires execution on the Vercel platform (process.env.VERCEL === '1').
 * - Requires a valid, platform-injected VERCEL_URL as the baseline deployment anchor.
 * - Optionally validates VERCEL_BRANCH_URL as an additional platform deployment anchor.
 * - If APP_BASE_URL is provided, it is NOT trusted as an independent authorization source;
 *   its candidate hostname MUST match one of the verified platform anchors (VERCEL_URL or VERCEL_BRANCH_URL).
 * - Rejects malformed values, unauthorized ports, paths, query strings, or conflicting hosts.
 * - Fails closed if platform anchors are missing or invalid.
 *
 * @returns {{ valid: boolean, primaryHost?: string, trustedHost?: string, trustedHosts?: string[], error?: string }}
 */
function resolvePreviewDeploymentConfig() {
  // 1. Verify Vercel platform environment indicator (cannot enable preview in arbitrary environment)
  if (process.env.VERCEL !== '1') {
    return {
      valid: false,
      error: 'Preview environment requires execution on Vercel platform (VERCEL=1).'
    };
  }

  // 2. Mandatory platform deployment URL anchor (VERCEL_URL)
  const rawVercelUrl = process.env.VERCEL_URL;
  if (!rawVercelUrl || typeof rawVercelUrl !== 'string' || !rawVercelUrl.trim()) {
    return {
      valid: false,
      error: 'Preview environment requires a valid trusted VERCEL_URL platform anchor.'
    };
  }

  const parsedVercel = parseStrictVercelHost(rawVercelUrl, 'VERCEL_URL');
  if (!parsedVercel.valid) {
    return {
      valid: false,
      error: parsedVercel.error
    };
  }
  const vercelHost = parsedVercel.host;

  // 3. Optional platform branch alias anchor (VERCEL_BRANCH_URL)
  const rawBranchUrl = process.env.VERCEL_BRANCH_URL;
  let branchHost = null;
  if (rawBranchUrl && typeof rawBranchUrl === 'string' && rawBranchUrl.trim()) {
    const parsedBranch = parseStrictVercelHost(rawBranchUrl, 'VERCEL_BRANCH_URL');
    if (!parsedBranch.valid) {
      return {
        valid: false,
        error: parsedBranch.error
      };
    }
    branchHost = parsedBranch.host;
  }

  // Platform deployment anchors directly provided by Vercel infrastructure
  const platformAnchors = [vercelHost, branchHost].filter(Boolean);

  // 4. Optional user-configured APP_BASE_URL (must tie to verified platform anchors)
  const rawAppBaseUrl = process.env.APP_BASE_URL;
  let appBaseHost = null;
  if (rawAppBaseUrl && typeof rawAppBaseUrl === 'string' && rawAppBaseUrl.trim()) {
    const parsedAppBase = parseStrictVercelHost(rawAppBaseUrl, 'APP_BASE_URL');
    if (!parsedAppBase.valid) {
      return {
        valid: false,
        error: parsedAppBase.error
      };
    }
    appBaseHost = parsedAppBase.host;

    // Do NOT trust APP_BASE_URL independently; must match a verified platform anchor
    if (!platformAnchors.includes(appBaseHost)) {
      return {
        valid: false,
        error: `Untrusted APP_BASE_URL: hostname "${appBaseHost}" does not match current Vercel deployment platform anchor (${platformAnchors.join(', ')}).`
      };
    }
  }

  // 5. Trusted preview hostnames are exclusively the platform-verified deployment anchors
  const trustedHosts = platformAnchors;

  // 6. Primary trusted host for callback URLs (prefers verified APP_BASE_URL, then VERCEL_BRANCH_URL, then VERCEL_URL)
  const primaryHost = appBaseHost || branchHost || vercelHost;

  return {
    valid: true,
    primaryHost,
    trustedHost: primaryHost,
    trustedHosts
  };
}

/**
 * Validates whether an origin is an approved merchant origin.
 * Strictly enforces HTTPS in production and preview environments.
 * Restricts localhost HTTP exclusively to local development.
 *
 * @param {string} origin
 * @returns {{ valid: boolean, error?: string, origin?: string }}
 */
function validateAppOrigin(origin) {
  if (!origin || typeof origin !== 'string') {
    return { valid: false, error: 'Origin must be a non-empty string.' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(origin.trim());
  } catch (_) {
    return { valid: false, error: 'Origin is not a valid URL.' };
  }

  const protocol = parsedUrl.protocol; // 'https:' or 'http:'
  const hostname = parsedUrl.hostname.toLowerCase();
  const port = parsedUrl.port;

  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const isPreview = vercelEnv === 'preview';
  const isLocalDev = !vercelEnv || vercelEnv === 'development';

  // 1. Localhost check: restricted exclusively to local development
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocalhost) {
    if (!isLocalDev) {
      return { valid: false, error: 'Localhost origins are not permitted in deployment environments.' };
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
      return { valid: false, error: 'Local development origin must use HTTP or HTTPS protocol.' };
    }
    const cleanOrigin = `${protocol}//${hostname}${port ? ':' + port : ''}`;
    return { valid: true, origin: cleanOrigin };
  }

  // 2. Non-localhost origins MUST use HTTPS
  if (protocol !== 'https:') {
    return { valid: false, error: 'Deployment origin must use HTTPS protocol.' };
  }

  // Reject non-standard ports on cloud deployments
  if (port && port !== '443') {
    return { valid: false, error: 'Custom ports are not permitted for deployment origins.' };
  }

  const fullOrigin = `https://${hostname}`;

  // 3. In production mode, origin validation is strictly restricted to APPROVED_PRODUCTION_ORIGINS
  if (vercelEnv === 'production') {
    if (APPROVED_PRODUCTION_ORIGINS.includes(fullOrigin)) {
      return { valid: true, origin: fullOrigin };
    }
    return { valid: false, error: `Origin "${fullOrigin}" is not an approved merchant origin in production.` };
  }

  // 4. Canonical production origin is always approved across environments
  if (APPROVED_PRODUCTION_ORIGINS.includes(fullOrigin)) {
    return { valid: true, origin: fullOrigin };
  }

  // 5. Preview origin evaluation (strictly enabled ONLY when VERCEL_ENV === 'preview')
  if (isPreview) {
    // Fail closed unless PAYSTACK_SECRET_KEY is configured with sk_test_ prefix
    const paystackKey = process.env.PAYSTACK_SECRET_KEY || '';
    if (!paystackKey.startsWith('sk_test_')) {
      return {
        valid: false,
        error: 'Preview deployment origin validation failed: PAYSTACK_SECRET_KEY must be configured with a test key (sk_test_).'
      };
    }

    // Hostname must match expected Quantum Jersey preview naming pattern
    if (!PREVIEW_HOSTNAME_PATTERN.test(hostname)) {
      return {
        valid: false,
        error: `Preview origin "${fullOrigin}" does not match the approved Quantum Jersey naming pattern.`
      };
    }

    // Resolve trusted preview deployment configuration (enforces VERCEL_URL or APP_BASE_URL)
    const previewConfig = resolvePreviewDeploymentConfig();
    if (!previewConfig.valid) {
      return {
        valid: false,
        error: previewConfig.error
      };
    }

    const trustedHosts = previewConfig.trustedHosts || [previewConfig.trustedHost];
    if (!trustedHosts.includes(hostname)) {
      return {
        valid: false,
        error: `Preview origin "${fullOrigin}" does not match trusted deployment hostname(s) [${trustedHosts.join(', ')}].`
      };
    }

    return { valid: true, origin: fullOrigin };
  }

  // 6. All other origins fail closed
  return { valid: false, error: `Origin "${fullOrigin}" is not an approved merchant origin.` };
}

/**
 * Validates the incoming HTTP request's Origin header for browser-initiated requests.
 *
 * Security Policy:
 * - If the Origin header is present, it is parsed as a URL and its complete origin
 *   is validated against the environment's approved origins using validateAppOrigin.
 * - Malformed, unparseable, or unapproved origins return { valid: false, error: '...' }.
 * - Substring matching is strictly forbidden.
 * - When the Origin header is absent (e.g. legitimate server-to-server calls, curl,
 *   backend test suites, or direct non-browser requests), the request is permitted ({ valid: true, isPresent: false }).
 *   NOTE: Absence of an Origin header does NOT constitute authentication; endpoints must
 *   continue to enforce all parameter validation, schema constraints, and cryptographic signatures.
 *
 * @param {Object} req - Incoming HTTP request
 * @returns {{ valid: boolean, error?: string, origin?: string|null, isPresent: boolean }}
 */
function validateRequestOrigin(req) {
  if (!req || typeof req !== 'object') {
    return { valid: false, error: 'Invalid request object.', isPresent: false };
  }

  const headers = req.headers || {};
  const originHeader = headers['origin'] || headers['Origin'];

  // Policy: When Origin is absent, allow request to proceed (server-to-server / non-browser)
  if (!originHeader || typeof originHeader !== 'string' || !originHeader.trim()) {
    return { valid: true, origin: null, isPresent: false };
  }

  const rawOrigin = originHeader.trim();

  // The value "null" is sent by browsers for sandboxed iframes or privacy-sensitive navigations.
  // It must be rejected as an untrusted origin.
  if (rawOrigin === 'null') {
    return { valid: false, error: 'Origin "null" is not permitted.', isPresent: true };
  }

  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch (_) {
    return { valid: false, error: `Malformed Origin header: "${rawOrigin}".`, isPresent: true };
  }

  // Validate complete origin (protocol + host)
  const originToCheck = parsed.origin;
  const validation = validateAppOrigin(originToCheck);

  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error || `Origin "${originToCheck}" is not approved.`,
      origin: originToCheck,
      isPresent: true
    };
  }

  return {
    valid: true,
    origin: validation.origin,
    isPresent: true
  };
}

/**
 * Resolves the trusted callback URL for Paystack checkout.
 * Resolves base URL from process.env.APP_BASE_URL, falling back to VERCEL_URL in preview
 * or the canonical production origin in production.
 * Validates origin strictly against approved origins.
 * Sanitizes return path (defaults to '/', strips trailing '.html' for Vercel cleanUrls).
 * Rejects arbitrary client-provided callback URLs.
 *
 * @param {string} [clientProvidedUrlOrPath] - Optional path or URL provided by client
 * @returns {{ valid: boolean, callbackUrl?: string, error?: string }}
 */
function resolveTrustedCallbackUrl(clientProvidedUrlOrPath) {
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const isPreview = vercelEnv === 'preview';

  // 1. Resolve and validate server base URL
  let serverBaseUrl;

  if (isPreview) {
    const previewConfig = resolvePreviewDeploymentConfig();
    if (!previewConfig.valid) {
      return {
        valid: false,
        error: `Server configuration error: ${previewConfig.error}`
      };
    }
    serverBaseUrl = `https://${previewConfig.primaryHost || previewConfig.trustedHost}`;
  } else if (vercelEnv === 'production') {
    // Production callback URL is strictly restricted to canonical production domain
    serverBaseUrl = 'https://quantumjersey.vercel.app';
  } else {
    // Default / unset fallback resolves to canonical production domain unless explicitly configured
    serverBaseUrl = process.env.APP_BASE_URL || 'https://quantumjersey.vercel.app';
  }

  const baseValidation = validateAppOrigin(serverBaseUrl);

  if (!baseValidation.valid) {
    return {
      valid: false,
      error: `Server APP_BASE_URL configuration error: ${baseValidation.error}`
    };
  }

  const trustedOrigin = baseValidation.origin;

  // 2. If client supplied a value, inspect it
  let returnPath = '/';

  if (clientProvidedUrlOrPath && typeof clientProvidedUrlOrPath === 'string') {
    const trimmed = clientProvidedUrlOrPath.trim();

    // If a full URL is supplied, validate its origin against approved origins
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      let clientParsed;
      try {
        clientParsed = new URL(trimmed);
      } catch (_) {
        return { valid: false, error: 'Client-supplied callback URL is malformed.' };
      }

      const clientOriginCheck = validateAppOrigin(clientParsed.origin);
      if (!clientOriginCheck.valid) {
        return {
          valid: false,
          error: `Client-supplied callback URL origin rejected: ${clientOriginCheck.error}`
        };
      }

      returnPath = clientParsed.pathname;
    } else if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
      // Relative path supplied
      returnPath = trimmed.split('?')[0].split('#')[0];
    } else {
      return { valid: false, error: 'Invalid callback path format.' };
    }
  }

  // 3. Normalize return path: strip trailing .html for clean Vercel routing
  const cleanPath = returnPath.replace(/\.html$/i, '') || '/';

  return {
    valid: true,
    callbackUrl: `${trustedOrigin}${cleanPath}`
  };
}

module.exports = {
  validateCustomer,
  validateItems,
  validateReference,
  validateAppOrigin,
  validateRequestOrigin,
  resolveTrustedCallbackUrl,
  resolvePreviewDeploymentConfig,
  parseStrictVercelHost,
  APPROVED_PRODUCTION_ORIGINS,
  PREVIEW_HOSTNAME_PATTERN,
  getTrustedPreviewHostname,
  EMAIL_REGEX,
  UUID_REGEX
};

