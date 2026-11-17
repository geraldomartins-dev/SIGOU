const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sigou-address-migration-'));
Object.assign(process.env, { DB_CLIENT: 'sqlite', DB_PATH: path.join(temp, 'old.db'), DATA_DIR: temp });
const previous = new DatabaseSync(process.env.DB_PATH);
previous.exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8').replace('  endereco TEXT,', ''));
previous.prepare('INSERT INTO denuncias (titulo, descricao, grau_urgencia, latitude, longitude) VALUES (?, ?, ?, ?, ?)').run('Chamado antigo', 'Preservar o registro existente', 2, -23.2, -49.7);
previous.close();
const { getDatabase, closeDatabase } = require('../src/db');
const repository = require('../src/repositories/denunciaRepository');
test('migração adiciona endereço ao banco antigo sem perder chamados existentes', async () => {
  try {
    const db = await getDatabase();
    const old = await repository.findById(1);
    assert.equal(old.titulo, 'Chamado antigo');
    assert.equal(old.endereco, null);
    const created = await repository.create({ titulo: 'Novo chamado', descricao: 'Com endereço informado', grau_urgencia: 2, latitude: -23.2, longitude: -49.7, endereco: 'Rua Brasil, Ourinhos', confianca: 20 });
    assert.equal(created.endereco, 'Rua Brasil, Ourinhos');
    assert.equal((await db.get('SELECT COUNT(*) AS total FROM denuncias')).total, 2);
  } finally {
    await closeDatabase();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
