# SIGOU — Gestão de Ocorrências Urbanas

Aplicação full stack para registrar ocorrências geolocalizadas, visualizá-las no mapa e recomendar o próximo atendimento com base em urgência, distância e tempo de espera. A interface possui áreas separadas para o cidadão denunciante e para a central/equipe de atendimento. O cadastro e a posição da equipe são limitados ao estado de São Paulo e ao norte do Paraná.

## Estrutura

```text
database/              schema e dados de demonstração opcionais
public/                HTML, CSS e JavaScript do painel Leaflet
src/
  middleware/          respostas de erro
  repositories/        acesso ao SQLite
  routes/              endpoints REST
  services/            algoritmo de priorização
  utils/               fórmula de Haversine
  app.js                configuração do Express
  db.js                 conexão e criação automática do banco
  server.js             inicialização do servidor
test/                   testes unitários
```

## Executar localmente

Requer Node.js 22.5 ou mais recente (recomendado: Node 24).

```bash
npm install
npm start
```

Abra `http://localhost:3000` para o portal público. A Central possui páginas separadas: login em `http://localhost:3000/login.html` e painel protegido em `http://localhost:3000/central.html`. O banco `data/sigou.db` e as tabelas são criados automaticamente no primeiro início. Para desenvolvimento com reinício automático, use `npm run dev`. Para executar os testes, use `npm test`.

A Central de Atendimento exige autenticação. No primeiro banco local é criado o usuário `operador` com a senha provisória `sigou123`. Defina `CENTRAL_USER` e `CENTRAL_PASSWORD` antes do primeiro início para usar outras credenciais. Em produção, a senha provisória deve obrigatoriamente ser substituída.

No Windows PowerShell, se a política bloquear `npm.ps1`, use `npm.cmd install` e `npm.cmd start`.

Para inserir registros de demonstração após o banco ser criado, execute o conteúdo de `database/seed.sql` em um cliente SQLite. O seed é opcional e não é executado automaticamente para não duplicar dados.

## API REST

| Método | Endpoint | Finalidade |
|---|---|---|
| `POST` | `/api/denuncias` | Criar ocorrência |
| `GET` | `/api/denuncias` | Listar ocorrências pendentes/em atendimento |
| `POST` | `/api/denuncias/proxima` | Classificar pendentes a partir da posição da equipe |
| `PATCH` | `/api/denuncias/:id/status` | Alterar status |
| `PATCH` | `/api/denuncias/:id/verificacao` | Validar ou rejeitar uma denúncia |
| `GET` | `/api/health` | Verificar a API |
| `POST` | `/api/auth/login` | Autenticar operador da Central |

O cadastro público usa `multipart/form-data` e aceita uma foto JPG, PNG ou WebP de até 5 MB no campo `foto`. No celular, o navegador oferece câmera ou galeria automaticamente.

Exemplo de criação:

```json
{
  "titulo": "Semáforo apagado",
  "descricao": "Cruzamento movimentado sem sinalização.",
  "grau_urgencia": 4,
  "latitude": -23.1864,
  "longitude": -49.7162
}
```

A recomendação usa `score = (urgência × 10) − (distância em km × 2) + (horas de espera × 0,5)`. Em empates, prevalecem maior urgência e depois menor ID, tornando a resposta determinística.

## Verificação rápida

Novas denúncias começam como `AGUARDANDO_VALIDACAO`. Somente denúncias `VALIDADAS` participam normalmente da priorização. Ocorrências críticas (urgência 4) entram imediatamente como não confirmadas para não atrasar um possível atendimento urgente; a central deve validá-las em paralelo. Contato, descrição detalhada e link de evidência aumentam a pontuação inicial de confiança. Rejeições exigem justificativa e ficam registradas na auditoria.
