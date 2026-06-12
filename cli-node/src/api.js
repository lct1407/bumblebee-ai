/**
 * api.js — REST and GraphQL helpers using Node 20 built-in fetch.
 * No runtime deps beyond what Node provides.
 */

export class GraphQLError extends Error {
  constructor(errors) {
    super(JSON.stringify(errors, null, 2));
    this.name = 'GraphQLError';
    this.errors = errors;
  }
}

/**
 * Execute a GraphQL operation against the server.
 * @param {string} endpoint  Full URL e.g. https://host/graphql
 * @param {string} query     GQL query or mutation string
 * @param {object} variables Variables map (optional)
 * @param {string} token     Bearer token (optional)
 * @returns {Promise<object>} data object from response
 */
export async function gql(endpoint, query, variables = {}, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const body = await res.json();
  if (body.errors?.length) throw new GraphQLError(body.errors);
  return body.data ?? {};
}

/**
 * POST to a REST endpoint. Returns parsed JSON body.
 * @param {string} url
 * @param {object} payload  JSON body
 * @param {string} token    Bearer token (optional)
 * @param {number} timeout  Milliseconds (default 15 000)
 */
export async function post(url, payload, token = null, timeout = 15_000) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return text; }
  } finally {
    clearTimeout(timer);
  }
}

/** Build GraphQL endpoint URL from a server base URL. */
export function gqlEndpoint(serverUrl) {
  return serverUrl.replace(/\/$/, '') + '/graphql';
}
