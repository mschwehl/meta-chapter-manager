const { expect } = require('@playwright/test');

function makeId(prefix) {
  const token = Date.now().toString(36).slice(-3) + Math.floor(Math.random() * 36).toString(36);
  return `${prefix}${token}`.slice(0, 5);
}

async function login(request, kuerzel, password) {
  const response = await request.post('/api/auth/login', {
    data: { kuerzel, password },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.token).toBeTruthy();
  return body;
}

async function authRequest(request, method, url, token, data) {
  const options = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (data !== undefined) options.data = data;
  return request.fetch(url, { method, ...options });
}

module.exports = {
  makeId,
  login,
  authRequest,
};
