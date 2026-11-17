const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sigou-test-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DB_PATH = path.join(tempDirectory, 'test.db');
process.env.DATA_DIR = tempDirectory;
process.env.CENTRAL_USER = 'operador';
process.env.CENTRAL_PASSWORD = 'sigou123';
process.env.ROUTING_ENABLED = 'false';

const { createApp } = require('../src/app');
const { closeDatabase } = require('../src/db');

test('fluxo REST completo: criar, listar, priorizar e concluir', async (context) => {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const loginPage = await (await fetch(`${baseUrl}/login.html`)).text();
  const centralPage = await (await fetch(`${baseUrl}/central.html`)).text();
  assert.match(loginPage, /Entrar na Central/);
  assert.match(centralPage, /Indicadores/);
  assert.equal((await fetch(`${baseUrl}/api/denuncias`)).status, 401);
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'operador', senha: 'sigou123' })
  });
  assert.equal(loginResponse.status, 200);
  const { token } = await loginResponse.json();
  const protectedHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const photoForm = new FormData();
  photoForm.set('titulo', 'Árvore na pista'); photoForm.set('descricao', 'Galhos bloqueando parte da pista');
  photoForm.set('grau_urgencia', '3'); photoForm.set('latitude', '-23.20'); photoForm.set('longitude', '-49.72');
  photoForm.set('endereco', 'Rua Paraná, 120, Ourinhos - SP');
  photoForm.set('telefone', '(43) 99999-9999'); photoForm.set('email', 'cidadao@example.com'); photoForm.set('consentimento_contato', 'true');
  photoForm.set('foto', new Blob([Buffer.from('89504e470d0a1a0a00000000', 'hex')], { type: 'image/png' }), 'evidencia.png');
  const photoReportResponse = await fetch(`${baseUrl}/api/denuncias`, { method: 'POST', body: photoForm });
  assert.equal(photoReportResponse.status, 201);
  const photoReport = await photoReportResponse.json();
  assert.match(photoReport.evidencia_url, /^\/uploads\//);
  assert.equal((await fetch(`${baseUrl}${photoReport.evidencia_url}`)).status, 200);
  assert.equal(photoReport.consentimento_contato, 1);
  assert.equal(photoReport.endereco, 'Rua Paraná, 120, Ourinhos - SP');
  const contacted = await (await fetch(`${baseUrl}/api/denuncias/${photoReport.id}/contato-status`, {
    method: 'PATCH', headers: protectedHeaders, body: JSON.stringify({ status: 'CONTATADO' })
  })).json();
  assert.equal(contacted.contato_status, 'CONTATADO');

  const createdResponse = await fetch(`${baseUrl}/api/denuncias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titulo: 'Semáforo apagado', descricao: 'Cruzamento sem sinalização',
      grau_urgencia: 4, latitude: -23.18, longitude: -49.72, endereco: '  Avenida Brasil, Jacarezinho - PR  '
    })
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.endereco, 'Avenida Brasil, Jacarezinho - PR');

  const reports = await (await fetch(`${baseUrl}/api/denuncias`, { headers: protectedHeaders })).json();
  assert.equal(reports.length, 2);
  assert.equal(reports.find((report) => report.id === created.id).endereco, created.endereco);
  assert.equal((await fetch(`${baseUrl}/api/enderecos?busca=a`)).status, 400);

  const ranking = await (await fetch(`${baseUrl}/api/denuncias/proxima`, {
    method: 'POST', headers: protectedHeaders,
    body: JSON.stringify({ latitude: -23.19, longitude: -49.73 })
  })).json();
  assert.equal(ranking.recomendada.id, created.id);
  assert.equal(ranking.classificacao[0].recomendada, true);
  assert.equal(ranking.recomendada.verificacao_status, 'AGUARDANDO_VALIDACAO');

  const lowReport = await (await fetch(`${baseUrl}/api/denuncias`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo: 'Buraco pequeno', descricao: 'Buraco aguardando confirmação da central', grau_urgencia: 1, latitude: -23.20, longitude: -49.75 })
  })).json();
  const beforeValidation = await (await fetch(`${baseUrl}/api/denuncias/proxima`, {
    method: 'POST', headers: protectedHeaders, body: JSON.stringify({ latitude: -23.551, longitude: -49.631 })
  })).json();
  assert.equal(beforeValidation.classificacao.some((item) => item.id === lowReport.id), false);

  const validated = await (await fetch(`${baseUrl}/api/denuncias/${lowReport.id}/verificacao`, {
    method: 'PATCH', headers: protectedHeaders, body: JSON.stringify({ status: 'VALIDADA' })
  })).json();
  assert.equal(validated.verificacao_status, 'VALIDADA');
  const afterValidation = await (await fetch(`${baseUrl}/api/denuncias/proxima`, {
    method: 'POST', headers: protectedHeaders, body: JSON.stringify({ latitude: -23.551, longitude: -49.631 })
  })).json();
  assert.equal(afterValidation.classificacao.some((item) => item.id === lowReport.id), true);

  const attending = await (await fetch(`${baseUrl}/api/denuncias/${created.id}/status`, {
    method: 'PATCH', headers: protectedHeaders, body: JSON.stringify({ status: 'EM_ATENDIMENTO' })
  })).json();
  assert.ok(attending.atendimento_iniciado_em);

  const updated = await (await fetch(`${baseUrl}/api/denuncias/${created.id}/status`, {
    method: 'PATCH', headers: protectedHeaders,
    body: JSON.stringify({ status: 'CONCLUIDA' })
  })).json();
  assert.equal(updated.status, 'CONCLUIDA');
  assert.ok(updated.concluido_em);

  const dashboardResponse = await fetch(`${baseUrl}/api/admin/dashboard?periodo=30`, { headers: protectedHeaders });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.equal(dashboard.resumo.total, 3);
  assert.equal(dashboard.resumo.concluidas, 1);
  assert.equal(dashboard.resumo.atendimentos_com_tempo, 1);
  assert.ok(dashboard.por_cidade.some((item) => item.total > 0));

  await fetch(`${baseUrl}/api/denuncias/${photoReport.id}/verificacao`, {
    method: 'PATCH', headers: protectedHeaders,
    body: JSON.stringify({ status: 'REJEITADA', justificativa: 'Relato duplicado confirmado.' })
  });
  const rejectedAction = await fetch(`${baseUrl}/api/denuncias/${photoReport.id}/status`, {
    method: 'PATCH', headers: protectedHeaders, body: JSON.stringify({ status: 'CONCLUIDA' })
  });
  assert.equal(rejectedAction.status, 409);
  assert.equal((await fetch(`${baseUrl}/api/admin/dashboard`)).status, 401);
  await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: protectedHeaders });
  assert.equal((await fetch(`${baseUrl}/api/denuncias`, { headers: protectedHeaders })).status, 401);
});

test('API rejeita ocorrência fora da área atendida', async (context) => {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/denuncias`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo: 'Local inválido', descricao: 'Fora da área atendida', grau_urgencia: 2, latitude: -30, longitude: -51 })
  });
  assert.equal(response.status, 400);
  for (const endereco of ['a'.repeat(301), { rua: 'Rua inválida' }]) {
    const invalid = await fetch(`http://127.0.0.1:${server.address().port}/api/denuncias`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Endereço inválido', descricao: 'Não deve ser salvo', grau_urgencia: 2, latitude: -23.2, longitude: -49.7, endereco })
    });
    assert.equal(invalid.status, 400);
  }
});
