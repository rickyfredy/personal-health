// Thin fetch wrapper: JSON in/out, credentials included, throws
// ApiError{status, message, errors} for non-2xx responses.
export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new ApiError(res.status, body?.error || 'Request failed', body?.errors);
  }
  return body;
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  listConsumptions: (params) => request('/api/consumptions?' + new URLSearchParams(params)),
  consumptionMeta: () => request('/api/consumptions/meta'),
  createConsumption: (data) =>
    request('/api/consumptions', { method: 'POST', body: JSON.stringify(data) }),
  updateConsumption: (id, data) =>
    request(`/api/consumptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteConsumption: (id) => request(`/api/consumptions/${id}`, { method: 'DELETE' }),
  moveConsumption: (id, direction) =>
    request(`/api/consumptions/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) }),

  summaryMatrix: (params) =>
    request('/api/summary/matrix' + (params ? '?' + new URLSearchParams(params) : '')),
  summaryFeeds: (params) =>
    request('/api/summary/feeds' + (params ? '?' + new URLSearchParams(params) : '')),
  summaryDaily: (params) =>
    request('/api/summary/daily' + (params ? '?' + new URLSearchParams(params) : '')),
  ngtChanges: (params) =>
    request('/api/ngt/changes' + (params ? '?' + new URLSearchParams(params) : ''))
};