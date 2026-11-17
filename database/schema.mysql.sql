CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(120) NOT NULL,
  usuario VARCHAR(80) NOT NULL UNIQUE, senha_hash VARCHAR(255) NOT NULL, senha_salt VARCHAR(255) NOT NULL,
  papel ENUM('OPERADOR', 'ADMIN') NOT NULL DEFAULT 'OPERADOR', ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS denuncias (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, titulo VARCHAR(120) NOT NULL,
  descricao VARCHAR(1000) NOT NULL, grau_urgencia TINYINT UNSIGNED NOT NULL,
  latitude DECIMAL(10,7) NOT NULL, longitude DECIMAL(10,7) NOT NULL,
  endereco VARCHAR(300),
  cidade VARCHAR(120), regiao VARCHAR(160),
  contato VARCHAR(255), telefone VARCHAR(30), email VARCHAR(255),
  consentimento_contato BOOLEAN NOT NULL DEFAULT FALSE,
  contato_status ENUM('NAO_CONTATADO', 'CONTATADO', 'SEM_RESPOSTA') NOT NULL DEFAULT 'NAO_CONTATADO',
  evidencia_url TEXT,
  verificacao_status ENUM('AGUARDANDO_VALIDACAO', 'VALIDADA', 'REJEITADA') NOT NULL DEFAULT 'AGUARDANDO_VALIDACAO',
  confianca TINYINT UNSIGNED NOT NULL DEFAULT 20, motivo_rejeicao VARCHAR(1000), verificado_em DATETIME(3),
  status ENUM('PENDENTE', 'EM_ATENDIMENTO', 'CONCLUIDA') NOT NULL DEFAULT 'PENDENTE',
  atendimento_iniciado_em DATETIME(3), concluido_em DATETIME(3),
  criado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_denuncias_status (status), INDEX idx_denuncias_verificacao (verificacao_status),
  INDEX idx_denuncias_localizacao (latitude, longitude), INDEX idx_denuncias_criado_em (criado_em),
  CONSTRAINT chk_denuncias_urgencia CHECK (grau_urgencia BETWEEN 1 AND 4),
  CONSTRAINT chk_denuncias_confianca CHECK (confianca BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verificacao_auditoria (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, denuncia_id INT UNSIGNED NOT NULL,
  acao ENUM('VALIDADA', 'REJEITADA') NOT NULL, justificativa VARCHAR(1000),
  criado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (denuncia_id),
  CONSTRAINT fk_verificacao_denuncia FOREIGN KEY (denuncia_id) REFERENCES denuncias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contato_auditoria (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, denuncia_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED, status ENUM('NAO_CONTATADO', 'CONTATADO', 'SEM_RESPOSTA') NOT NULL,
  criado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (denuncia_id), INDEX (usuario_id),
  CONSTRAINT fk_contato_denuncia FOREIGN KEY (denuncia_id) REFERENCES denuncias(id) ON DELETE CASCADE,
  CONSTRAINT fk_contato_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash VARCHAR(255) NOT NULL PRIMARY KEY, usuario_id INT UNSIGNED NOT NULL,
  expira_em DATETIME(3) NOT NULL, criado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX (usuario_id), INDEX (expira_em),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS acessos_acompanhamento (
  denuncia_id INT UNSIGNED NOT NULL PRIMARY KEY,
  chave_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  CONSTRAINT fk_acompanhamento_denuncia FOREIGN KEY (denuncia_id) REFERENCES denuncias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensagens_denuncia (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  denuncia_id INT UNSIGNED NOT NULL,
  autor ENUM('CIDADAO', 'CENTRAL') NOT NULL,
  texto VARCHAR(1000) NOT NULL,
  enviada_ms BIGINT UNSIGNED NOT NULL,
  INDEX idx_mensagens_denuncia (denuncia_id, id),
  CONSTRAINT fk_mensagens_acompanhamento FOREIGN KEY (denuncia_id) REFERENCES acessos_acompanhamento(denuncia_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
