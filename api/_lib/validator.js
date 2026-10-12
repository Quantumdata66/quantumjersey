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

    let cleanSize = 'Standard';
    if (size && typeof size === 'string') {
      cleanSize = size.trim().slice(0, 20);
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
 * Validates and extracts a trusted deployment hostname from process.env.VERCEL_URL.
 * Returns the clean hostname string if valid, null if unset/empty, or false if malformed/untrusted.
 */
function getTrustedPreviewHostname() {
  const raw = process.env.VERCEL_URL;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const noProto = trimmed.replace(/^https?:\/\//, '');
  const host = noProto.split('/')[0].split(':')[0];
  if (!PREVIEW_HOSTNAME_PATTERN.test(host)) {
    return false;
  }
  return host;
}

/**
 * Resolves and strictly validates the trusted deployment configuration for Preview environments.
 *
 * In Preview (VERCEL_ENV === 'preview'):
 * - Requires a valid trusted VERCEL_URL, OR an explicitly configured APP_BASE_URL whose
 *   HTTPS origin and hostname satisfy Quantum Jersey preview restrictions.
 * - Rejects malformed values in either setting.
 * - Rejects conflicts between VERCEL_URL and APP_BASE_URL.
 * - Fails closed if neither setting is validly provided.
 *
 * @returns {{ valid: boolean, trustedHost?: string, error?: string }}
 */
function resolvePreviewDeploymentConfig() {
  const rawVercelUrl = process.env.VERCEL_URL;
  const rawAppBaseUrl = process.env.APP_BASE_URL;

  let vercelHost = null;
  let appBaseHost = null;

  // 1. Inspect VERCEL_URL if provided
  if (rawVercelUrl && typeof rawVercelUrl === 'string' && rawVercelUrl.trim()) {
    const trimmed = rawVercelUrl.trim().toLowerCase();
    const noProto = trimmed.replace(/^https?:\/\//, '');
    const candidateHost = noProto.split('/')[0].split(':')[0];

    if (!PREVIEW_HOSTNAME_PATTERN.test(candidateHost)) {
      return {
        valid: false,
        error: 'Deployment environment value VERCEL_URL is malformed or untrusted.'
      };
    }
    vercelHost = candidateHost;
  }

  // 2. Inspect APP_BASE_URL if provided
  if (rawAppBaseUrl && typeof rawAppBaseUrl === 'string' && rawAppBaseUrl.trim()) {
    let parsedAppBase;
    try {
      parsedAppBase = new URL(rawAppBaseUrl.trim());
    } catch (_) {
      return {
        valid: false,
        error: 'Configured APP_BASE_URL is not a valid URL.'
      };
    }

    if (parsedAppBase.protocol !== 'https:') {
      return {
        valid: false,
        error: 'Configured APP_BASE_URL in preview must use HTTPS protocol.'
      };
    }

    if (parsedAppBase.port && parsedAppBase.port !== '443') {
      return {
        valid: false,
        error: 'Configured APP_BASE_URL in preview cannot use custom ports.'
      };
    }

    const candidateHost = parsedAppBase.hostname.toLowerCase();
    if (!PREVIEW_HOSTNAME_PATTERN.test(candidateHost)) {
      return {
        valid: false,
        error: `Configured APP_BASE_URL hostname "${candidateHost}" does not match approved preview naming pattern.`
      };
    }
    appBaseHost = candidateHost;
  }

  // 3. Require at least one valid setting in Preview
  if (!vercelHost && !appBaseHost) {
    return {
      valid: false,
      error: 'Preview environment requires a valid trusted VERCEL_URL or an explicitly configured APP_BASE_URL.'
    };
  }

  // 4. Reject conflicts if both are provided
  if (vercelHost && appBaseHost && vercelHost !== appBaseHost) {
    return {
      valid: false,
      error: `Configuration conflict: APP_BASE_URL hostname "${appBaseHost}" does not match VERCEL_URL "${vercelHost}".`
    };
  }

  // 5. Canonical trusted host for this preview deployment
  const trustedHost = vercelHost || appBaseHost;
  return {
    valid: true,
    trustedHost
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

  // 3. Canonical production origin is always approved
  if (APPROVED_PRODUCTION_ORIGINS.includes(fullOrigin)) {
    return { valid: true, origin: fullOrigin };
  }

  // 4. Preview origin evaluation (strictly enabled ONLY when VERCEL_ENV === 'preview')
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

    if (hostname !== previewConfig.trustedHost) {
      return {
        valid: false,
        error: `Preview origin "${fullOrigin}" does not match trusted deployment hostname "${previewConfig.trustedHost}".`
      };
    }

    return { valid: true, origin: fullOrigin };
  }

  // 5. All other origins fail closed
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
    serverBaseUrl = `https://${previewConfig.trustedHost}`;
  } else {
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
  APPROVED_PRODUCTION_ORIGINS,
  PREVIEW_HOSTNAME_PATTERN,
  getTrustedPreviewHostname,
  EMAIL_REGEX,
  UUID_REGEX
};

