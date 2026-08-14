CREATE TABLE IF NOT EXISTS denuncias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL CHECK (length(trim(titulo)) BETWEEN 3 AND 120),
  descricao TEXT NOT NULL CHECK (length(trim(descricao)) BETWEEN 3 AND 1000),
  grau_urgencia INTEGER NOT NULL CHECK (grau_urgencia BETWEEN 1 AND 4),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  contato TEXT,
  telefone TEXT,
  email TEXT,
  consentimento_contato INTEGER NOT NULL DEFAULT 0,
  contato_status TEXT NOT NULL DEFAULT 'NAO_CONTATADO'
    CHECK (contato_status IN ('NAO_CONTATADO', 'CONTATADO', 'SEM_RESPOSTA')),
  evidencia_url TEXT,
  verificacao_status TEXT NOT NULL DEFAULT 'AGUARDANDO_VALIDACAO'
    CHECK (verificacao_status IN ('AGUARDANDO_VALIDACAO', 'VALIDADA', 'REJEITADA')),
  confianca INTEGER NOT NULL DEFAULT 20 CHECK (confianca BETWEEN 0 AND 100),
  motivo_rejeicao TEXT,
  verificado_em TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'EM_ATENDIMENTO', 'CONCLUIDA')),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_denuncias_status ON denuncias(status);
CREATE INDEX IF NOT EXISTS idx_denuncias_localizacao ON denuncias(latitude, longitude);
CREATE TABLE IF NOT EXISTS verificacao_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  denuncia_id INTEGER NOT NULL REFERENCES denuncias(id),
  acao TEXT NOT NULL CHECK (acao IN ('VALIDADA', 'REJEITADA')),
  justificativa TEXT,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS contato_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  denuncia_id INTEGER NOT NULL REFERENCES denuncias(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  status TEXT NOT NULL CHECK (status IN ('NAO_CONTATADO', 'CONTATADO', 'SEM_RESPOSTA')),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'OPERADOR' CHECK (papel IN ('OPERADOR', 'ADMIN')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
