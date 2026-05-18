const { test, expect } = require('@playwright/test');
const { makeId, login, authRequest } = require('../helpers/api');

test.describe.configure({ mode: 'serial' });

const state = {
  adminToken: '',
  chapterId: '',
  chapterAdmin: '',
  memberUser: '',
  eventId: '',
};

test('public endpoints smoke', async ({ request }) => {
  const statusResponse = await request.get('/api/status');
  expect(statusResponse.ok()).toBeTruthy();

  const openapiYaml = await request.get('/api/openapi.yaml');
  expect(openapiYaml.ok()).toBeTruthy();
  await expect(openapiYaml.text()).resolves.toContain('openapi:');

  const openapiUi = await request.get('/api/openapi');
  expect(openapiUi.ok()).toBeTruthy();
  await expect(openapiUi.text()).resolves.toContain('SwaggerUIBundle');

  const sseWithoutToken = await request.get('/api/sse');
  expect(sseWithoutToken.status()).toBe(401);

  const registerOptions = await request.get('/api/auth/register/options');
  expect(registerOptions.ok()).toBeTruthy();
  await expect(registerOptions.json()).resolves.toEqual(expect.any(Array));
});

test('auth and protected profile routes', async ({ request }) => {
  const auth = await login(request, 'admin', 'admin');
  state.adminToken = auth.token;
  expect(auth.orgaAdmin).toBeTruthy();

  const me = await authRequest(request, 'GET', '/api/me', state.adminToken);
  expect(me.ok()).toBeTruthy();
  const meBody = await me.json();
  expect(meBody.kuerzel).toBe('admin');

  const search = await authRequest(request, 'GET', '/api/users/search?q=ad', state.adminToken);
  expect(search.ok()).toBeTruthy();

  const meWithoutToken = await request.get('/api/me');
  expect(meWithoutToken.status()).toBe(401);
});

test('orga strategy can be updated and read back', async ({ request }) => {
  const getBefore = await authRequest(request, 'GET', '/api/orga', state.adminToken);
  expect(getBefore.ok()).toBeTruthy();
  const org = await getBefore.json();

  const setTimer = await authRequest(request, 'PUT', '/api/orga', state.adminToken, {
    name: org.name,
    orgAdmins: org.orgAdmins,
    gitSyncStrategy: 'timer-based',
  });
  expect(setTimer.ok()).toBeTruthy();

  const getAfterTimer = await authRequest(request, 'GET', '/api/orga', state.adminToken);
  expect(getAfterTimer.ok()).toBeTruthy();
  const timerBody = await getAfterTimer.json();
  expect(timerBody.gitSyncStrategy).toBe('timer-based');

  const setAction = await authRequest(request, 'PUT', '/api/orga', state.adminToken, {
    name: timerBody.name,
    orgAdmins: timerBody.orgAdmins,
    gitSyncStrategy: 'action-based',
  });
  expect(setAction.ok()).toBeTruthy();
});

test('chapter and user setup plus org membership boundary', async ({ request }) => {
  state.chapterId = makeId('c');
  state.chapterAdmin = makeId('a');
  state.memberUser = makeId('m');

  const createChapter = await authRequest(request, 'POST', '/api/chapters', state.adminToken, {
    id: state.chapterId,
    name: `Test ${state.chapterId}`,
    sparten: [{ id: 'tt', name: 'Tischtennis', admins: [] }],
  });
  expect(createChapter.status()).toBe(201);

  const createChapterAdminUser = await authRequest(request, 'POST', '/api/admin/users', state.adminToken, {
    kuerzel: state.chapterAdmin,
    vorname: 'Chapter',
    name: 'Admin',
    orgeinheit: 'TEST',
    kontakte: [],
  });
  expect(createChapterAdminUser.status()).toBe(201);

  const createMemberUser = await authRequest(request, 'POST', '/api/admin/users', state.adminToken, {
    kuerzel: state.memberUser,
    vorname: 'Member',
    name: 'User',
    orgeinheit: 'TEST',
    kontakte: [],
  });
  expect(createMemberUser.status()).toBe(201);

  const directory = await authRequest(request, 'GET', '/api/chapters/directory', state.adminToken);
  expect(directory.ok()).toBeTruthy();

  const orgAddMembership = await authRequest(
    request,
    'POST',
    `/api/admin/users/${state.memberUser}/chapter`,
    state.adminToken,
    {
      chapterId: state.chapterId,
      sparte: 'tt',
      status: 'aktiv',
    }
  );
  expect(orgAddMembership.status()).toBe(403);
});

test('chapter admin can manage memberships while org admin cannot', async ({ request }) => {
  const chapterRes = await authRequest(request, 'GET', `/api/chapters/${state.chapterId}`, state.adminToken);
  expect(chapterRes.ok()).toBeTruthy();
  const chapter = await chapterRes.json();

  const grantChapterAdmin = await authRequest(request, 'PUT', `/api/chapters/${state.chapterId}`, state.adminToken, {
    ...chapter,
    admins: [state.chapterAdmin],
  });
  expect(grantChapterAdmin.ok()).toBeTruthy();

  const chapterAdminAuth = await login(request, state.chapterAdmin, state.chapterAdmin);
  const chapterToken = chapterAdminAuth.token;

  const addMembership = await authRequest(
    request,
    'POST',
    `/api/admin/users/${state.memberUser}/chapter`,
    chapterToken,
    {
      chapterId: state.chapterId,
      sparte: 'tt',
      status: 'aktiv',
    }
  );
  expect(addMembership.ok()).toBeTruthy();

  const patchMembership = await authRequest(
    request,
    'PATCH',
    `/api/admin/users/${state.memberUser}/chapter`,
    chapterToken,
    {
      chapterId: state.chapterId,
      sparte: 'tt',
      status: 'passiv',
      austrittsgrund: 'sonstiges',
    }
  );
  expect(patchMembership.ok()).toBeTruthy();

  const deleteMembership = await authRequest(
    request,
    'DELETE',
    `/api/admin/users/${state.memberUser}/chapter`,
    chapterToken,
    {
      chapterId: state.chapterId,
      sparte: 'tt',
    }
  );
  expect(deleteMembership.ok()).toBeTruthy();
});

test('chapter admin event workflow works', async ({ request }) => {
  const chapterAdminAuth = await login(request, state.chapterAdmin, state.chapterAdmin);
  const chapterToken = chapterAdminAuth.token;

  const createEvent = await authRequest(request, 'POST', '/api/events', chapterToken, {
    chapterId: state.chapterId,
    sparte: 'tt',
    datum: '2026-05-16',
    von: '10:00',
    bis: '12:00',
    ort: 'Sporthalle',
  });
  expect(createEvent.status()).toBe(201);
  const eventBody = await createEvent.json();
  state.eventId = eventBody.id;

  const approveEvent = await authRequest(request, 'POST', `/api/events/${state.eventId}/approve`, chapterToken, {
    chapterId: state.chapterId,
    kommentar: 'ok',
  });
  expect(approveEvent.ok()).toBeTruthy();

  const listApproved = await authRequest(request, 'GET', '/api/events?status=freigegeben', chapterToken);
  expect(listApproved.ok()).toBeTruthy();
  const events = await listApproved.json();
  expect(Array.isArray(events)).toBeTruthy();
  expect(events.some(ev => ev.id === state.eventId)).toBeTruthy();
});

test('request flow, docs/verify smoke, and sync endpoints', async ({ request }) => {
  const requestUser = makeId('r');
  const chapterRequestUser = makeId('u');

  const register = await request.post('/api/auth/register', {
    data: {
      kuerzel: requestUser,
      name: 'Request',
      vorname: 'Candidate',
      businessMail: `${requestUser}@example.org`,
      bemerkung: 'API test',
    },
  });
  expect(register.status()).toBe(201);

  const registerWithTarget = await request.post('/api/auth/register', {
    data: {
      kuerzel: chapterRequestUser,
      name: 'Chapter',
      vorname: 'Candidate',
      businessMail: `${chapterRequestUser}@example.org`,
      chapterId: state.chapterId,
      sparte: 'tt',
      bemerkung: 'Bitte in Tischtennis aufnehmen',
    },
  });
  expect(registerWithTarget.status()).toBe(201);

  const chapterAdminAuth = await login(request, state.chapterAdmin, state.chapterAdmin);
  const chapterToken = chapterAdminAuth.token;

  const chapterRequestsRes = await authRequest(request, 'GET', '/api/admin/requests', chapterToken);
  expect(chapterRequestsRes.ok()).toBeTruthy();
  const chapterRequests = await chapterRequestsRes.json();
  expect(chapterRequests.some(r => r.kuerzel === chapterRequestUser)).toBeTruthy();
  expect(chapterRequests.some(r => r.kuerzel === requestUser)).toBeFalsy();

  const approveByChapterAdmin = await authRequest(request, 'POST', `/api/admin/requests/${chapterRequestUser}/approve`, chapterToken);
  expect(approveByChapterAdmin.ok()).toBeTruthy();

  const chapterApprovedUserRes = await authRequest(request, 'GET', `/api/admin/users/${chapterRequestUser}`, state.adminToken);
  expect(chapterApprovedUserRes.ok()).toBeTruthy();
  const chapterApprovedUser = await chapterApprovedUserRes.json();
  expect(Array.isArray(chapterApprovedUser.chapters)).toBeTruthy();
  expect(chapterApprovedUser.chapters.length).toBe(0);
  expect((chapterApprovedUser.kontakte || []).some(k => k.typ === 'email' && k.wert === `${chapterRequestUser}@example.org` && k.attribut === 'business')).toBeTruthy();

  const listRequests = await authRequest(request, 'GET', '/api/admin/requests', state.adminToken);
  expect(listRequests.ok()).toBeTruthy();
  const openRequests = await listRequests.json();
  expect(openRequests.some(r => r.kuerzel === requestUser)).toBeTruthy();

  const approveRequest = await authRequest(request, 'POST', `/api/admin/requests/${requestUser}/approve`, state.adminToken);
  expect(approveRequest.ok()).toBeTruthy();

  const verifyPdfMissing = await authRequest(request, 'POST', '/api/verify/pdf', state.adminToken);
  expect(verifyPdfMissing.status()).toBe(400);

  const verifyWordMissing = await authRequest(request, 'POST', '/api/verify/generate-word', state.adminToken, {});
  expect(verifyWordMissing.status()).toBe(400);

  const docsList = await authRequest(request, 'GET', '/api/docs', state.adminToken);
  expect(docsList.ok()).toBeTruthy();

  const sync = await authRequest(request, 'POST', '/api/sync', state.adminToken, {});
  expect(sync.ok()).toBeTruthy();
  const syncBody = await sync.json();
  expect(Object.prototype.hasOwnProperty.call(syncBody, 'pushed')).toBeTruthy();
  expect(syncBody.syncStrategy).toBeTruthy();
  expect(Object.prototype.hasOwnProperty.call(syncBody, 'pendingPushCount')).toBeTruthy();

  const syncStatus = await authRequest(request, 'GET', '/api/sync/status', state.adminToken);
  expect(syncStatus.ok()).toBeTruthy();
  const syncStatusBody = await syncStatus.json();
  expect(Object.prototype.hasOwnProperty.call(syncStatusBody, 'pendingPushCount')).toBeTruthy();
  expect(syncStatusBody.syncStrategy).toBeTruthy();

  const gitStatus = await authRequest(request, 'POST', '/api/admin/git', state.adminToken, { args: ['status', '--short'] });
  expect(gitStatus.ok()).toBeTruthy();

  const sysInfo = await authRequest(request, 'GET', '/api/admin/sysinfo', state.adminToken);
  expect(sysInfo.ok()).toBeTruthy();
});
