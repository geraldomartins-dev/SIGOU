function notFound(req, res) {
  res.status(404).json({ erro: 'Rota não encontrada.' });
}

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ erro: 'A foto deve ter no máximo 5 MB.' });
  res.status(error.status || 500).json({ erro: error.status ? error.message : 'Erro interno do servidor.' });
}

module.exports = { notFound, errorHandler };
