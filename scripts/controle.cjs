const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const mode = process.argv[2];
let config;
function fail(message) { throw new Error(message); }
function components() {
  try {
    const pkg = require('../package.json');
    for (const name of Object.keys(pkg.dependencies)) require(name);
    require('node:sqlite');
    require('../src/app');
  } catch { fail('Faltam componentes ou algum arquivo esta incompleto. Abra 1_INSTALAR_SIGOU.bat para reparar.'); }
}
function configuration() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, 'PORT=3000\nDB_CLIENT=sqlite\nCENTRAL_USER=operador\nCENTRAL_PASSWORD=sigou123\nROUTING_ENABLED=false\n', { flag: 'wx' });
    console.log('Configuracao simples criada. O banco integrado sera preparado automaticamente.');
  }
  config = require('../src/config');
  if (process.env.PORT && (!/^\d+$/.test(process.env.PORT) || Number(process.env.PORT) < 1 || Number(process.env.PORT) > 65535)) fail('O numero PORT no arquivo .env e invalido.');
  if (!['sqlite', 'mysql'].includes(config.DB_CLIENT)) fail('O tipo de banco em .env e desconhecido. A configuracao existente foi preservada.');
  if (!Number.isInteger(config.PORT) || config.PORT < 1 || config.PORT > 65535) fail('O numero PORT no arquivo .env e invalido.');
}
async function tcp(host, port) {
  return new Promise(resolve => {
    const socket = net.connect({host, port});
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(1500);
    socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.once('timeout', () => done(false));
  });
}
async function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {windowsHide:true, stdio:'ignore', ...options});
    child.once('error', reject); child.once('exit', code => resolve(code));
  });
}
async function mysqlReady(prepare) {
  const mysql = require('mysql2/promise');
  const opts = config.MYSQL;
  if (!await tcp(opts.host, opts.port)) {
    if (['localhost', '127.0.0.1', '::1'].includes(opts.host)) {
      console.log('O banco esta desligado. Tentando iniciar o MySQL deste computador...');
      // Nao altera senhas, nao substitui bancos e nao instala outro banco sobre o existente.
      const ps = "$ErrorActionPreference='Stop'; Get-Service | Where-Object { $_.Name -match '^(mysql|mariadb)' -and $_.Status -ne 'Running' } | Start-Service";
      await run('powershell.exe', ['-NoProfile','-Command', ps]).catch(() => {});
      if (!await tcp(opts.host, opts.port) && fs.existsSync('C:/xampp/mysql/bin/mysqld.exe')) {
        const child = spawn('C:/xampp/mysql/bin/mysqld.exe', ['--defaults-file=C:/xampp/mysql/bin/my.ini','--standalone'], {cwd:'C:/xampp/mysql/bin', detached:true, windowsHide:true, stdio:'ignore'});
        child.on('error', () => {}); child.unref();
      }
      for (let i=0; i<20 && !await tcp(opts.host, opts.port); i++) await wait(500);
    }
  }
  let connection;
  try {
    const {database, ...credentials} = opts;
    connection = await mysql.createConnection({...credentials, connectTimeout:5000});
    if (prepare) {
      if (!/^[a-zA-Z0-9_]+$/.test(database)) fail('O nome do banco precisa conter apenas letras, numeros e sublinhado.');
      await connection.query('CREATE DATABASE IF NOT EXISTS `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    }
    await connection.query('USE ??', [database]);
    await connection.query('SELECT 1');
  } catch (error) {
    const code = error.code || '';
    if (code === 'ER_ACCESS_DENIED_ERROR') fail('O MySQL recusou o usuario ou a senha salvos em .env. Os dados foram preservados; confira o acesso ao banco.');
    if (code === 'ER_BAD_DB_ERROR') fail('O banco ainda nao foi preparado. Execute 1_INSTALAR_SIGOU.bat.');
    fail('Nao foi possivel preparar/conectar ao MySQL (' + code + '). Abra o XAMPP Control Panel e clique Start ao lado de MySQL; tente novamente. Se for um servico do Windows, use Executar como administrador no arquivo do ResolveJá. Nao troque para outro banco se quiser manter suas denuncias.');
  } finally { if (connection) await connection.end(); }
}
async function checkDatabase(prepare) {
  if (config.DB_CLIENT === 'mysql') await mysqlReady(prepare);
  const db = require('../src/db');
  try { await (await db.getDatabase()).get('SELECT 1 AS ok'); }
  catch { fail('O banco nao ficou pronto. Confira se a pasta permite gravar arquivos e se o banco esta disponivel. Seus dados nao foram apagados.'); }
  finally { await db.closeDatabase(); }
}
function openBrowser(url) {
  if (process.env.SIGOU_NO_BROWSER === '1') return;
  const child = spawn('powershell.exe', ['-NoProfile','-Command', "Start-Process '" + url + "'"], {windowsHide:true, stdio:'ignore'});
  child.on('error', () => console.log('Abra no navegador: ' + url));
  child.unref();
}
async function health(url) {
  try { const res = await fetch(url + '/api/health', {signal:AbortSignal.timeout(1500)}); return res.ok ? await res.json() : null; }
  catch { return null; }
}
async function main() {
  components(); configuration();
  if (mode === 'prepare') { await checkDatabase(true); console.log('Banco e componentes conferidos.'); return; }
  if (mode !== 'start') fail('Operacao desconhecida.');
  const url = 'http://localhost:' + config.PORT;
  const instance = crypto.createHash('sha256').update(root.toLowerCase()).digest('hex');
  if (await tcp('127.0.0.1', config.PORT)) {
    const status = await health(url);
    if (status?.app === 'sigou' && status.instance === instance) {
      console.log('O ResolveJá desta pasta ja esta funcionando. Abrindo ' + url); openBrowser(url); return;
    }
    fail('O endereco ' + url + ' esta ocupado por outro programa ou por uma versao antiga do ResolveJá. Feche somente a janela antiga do ResolveJá e tente de novo.');
  }
  await checkDatabase(false);
  console.log('Iniciando e aguardando a confirmacao do ResolveJá...');
  const child = spawn(process.execPath, [path.join(root, 'src/server.js')], {cwd:root, stdio:'inherit', windowsHide:true});
  let ended = false;
  child.once('error', () => { ended = true; });
  child.once('exit', () => { ended = true; });
  for (let i=0; i<60; i++) {
    if (ended) fail('O servidor parou antes de ficar pronto. Veja o erro acima; execute o instalador para reparar componentes.');
    const status = await health(url);
    if (status?.app === 'sigou' && status.instance === instance && status.pid === child.pid) {
      console.log('RESOLVEJÁ FUNCIONANDO: ' + url + '\nMantenha esta janela aberta. Para encerrar, pressione Ctrl+C.');
      openBrowser(url);
      process.on('SIGINT', () => { if (!ended) child.kill('SIGINT'); });
      process.on('SIGTERM', () => { if (!ended) child.kill('SIGTERM'); });
      await new Promise(resolve => { if (ended) resolve(); else child.once('exit', resolve); });
      if (child.exitCode && child.exitCode !== 0) fail('O servidor foi interrompido por um erro. Veja a mensagem acima.');
      return;
    }
    await wait(500);
  }
  child.kill();
  fail('O ResolveJá nao confirmou a inicializacao dentro do prazo. O navegador nao foi aberto. Confira o banco e tente novamente.');
}
main().catch(error => { console.error('\nNAO FOI POSSIVEL CONTINUAR: ' + error.message); process.exitCode = 1; });
