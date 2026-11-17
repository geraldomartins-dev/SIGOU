const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('acompanha e troca mensagens por link privado, inclusive em registro concluído', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'resolveja-acompanhamento-'));
  Object.assign(process.env, {
    DB_CLIENT: 'sqlite', DB_PATH: path.join(folder, 'test.db'), DATA_DIR: folder,
    CENTRAL_USER: 'teste-local', CENTRAL_PASSWORD: 'teste-local-pass', DOTENV_CONFIG_QUIET: 'true'
  });
  const { createApp } = require('../src/app');
  const { getDatabase, closeDatabase } = require('../src/db');
  const db = await getDatabase();
  const server = await new Promise((resolve) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function request(route, { token, body, method, status = 200 } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + '/api' + route, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = await response.json();
    assert.equal(response.status, status, route + ': ' + (json.erro || ''));
    if (route.startsWith('/acompanhamento') || route.startsWith('/conversas') || (route === '/denuncias' && status === 201)) {
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
    return json;
  }

  const location = { latitude: -22.9797, longitude: -49.8706, grau_urgencia: 3 };
  const first = await request('/denuncias', {
    method: 'POST', status: 201,
    body: { ...location, titulo: 'Semáforo apagado', descricao: 'Relato de teste no cruzamento.', email: 'teste@example.test', consentimento_contato: true }
  });
  const second = await request('/denuncias', {
    method: 'POST', status: 201,
    body: { ...location, titulo: 'Buraco na pista', descricao: 'Outro relato de teste.' }
  });
  assert.match(first.chave_acompanhamento, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(first.chave_acompanhamento, second.chave_acompanhamento);
  const citizen = first.chave_acompanhamento;
  const operatorRoute = '/conversas/' + first.id;
  const operator = (await request('/auth/login', {
    method: 'POST', body: { usuario: 'teste-local', senha: 'teste-local-pass' }
  })).token;

  await request('/acompanhamento', { status: 404 });
  await request('/acompanhamento', { token: 'x'.repeat(32), status: 404 });
  await request('/acompanhamento', { token: operator, status: 404 });
  await request(operatorRoute, { token: citizen, status: 401 });
  const opened = await request('/acompanhamento', { token: citizen });
  assert.deepEqual(opened, {
    ocorrencia: { id: first.id, titulo: first.titulo, status: 'PENDENTE', verificacao_status: 'AGUARDANDO_VALIDACAO' },
    mensagens: []
  });
  await request('/acompanhamento/mensagens', {
    token: citizen, method: 'POST', status: 400, body: { texto: ' '.repeat(3) }
  });
  const question = await request('/acompanhamento/mensagens', {
    token: citizen, method: 'POST', status: 201, body: { texto: 'Qual o andamento?', autor: 'CENTRAL', denuncia_id: second.id }
  });
  assert.equal(question.autor, 'CIDADAO');
  const other = await request('/acompanhamento', { token: second.chave_acompanhamento });
  assert.deepEqual(other.mensagens, []);
  assert.equal(other.ocorrencia.id, second.id);
  assert.equal((await request(operatorRoute, { token: operator })).mensagens[0].texto, question.texto);

  const reply = await request(operatorRoute + '/mensagens', {
    token: operator, method: 'POST', status: 201, body: { texto: 'A equipe recebeu o chamado.' }
  });
  assert.equal(reply.autor, 'CENTRAL');
  await request('/denuncias/' + first.id + '/verificacao', {
    token: operator, method: 'PATCH', body: { status: 'VALIDADA' }
  });
  for (const status of ['EM_ATENDIMENTO', 'CONCLUIDA']) {
    await request('/denuncias/' + first.id + '/status', { token: operator, method: 'PATCH', body: { status } });
    assert.equal((await request('/acompanhamento', { token: citizen })).ocorrencia.status, status);
  }
  const completed = await request('/acompanhamento', { token: citizen });
  assert.deepEqual(completed.mensagens, [question, reply]);
  const inbox = await request('/conversas', { token: operator });
  assert.equal(inbox[0].id, first.id);
  assert.equal(inbox[0].ultima_mensagem, 'CENTRAL');

  const legacy = await db.run('INSERT INTO denuncias (titulo, descricao, grau_urgencia, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
    ['Chamado anterior', 'Registrado antes do acompanhamento.', location.grau_urgencia, location.latitude, location.longitude]);
  const legacyRoute = '/conversas/' + legacy.insertId;
  assert.equal(Boolean((await request(legacyRoute, { token: operator })).ocorrencia.tem_acesso), false);
  const link = await request(legacyRoute + '/link', { token: operator, method: 'POST', status: 201 });
  await request(legacyRoute + '/link', { token: operator, method: 'POST', status: 409 });
  assert.equal((await request('/acompanhamento', { token: link.chave_acompanhamento })).ocorrencia.id, legacy.insertId);
});
