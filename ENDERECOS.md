# Endereço e localização de ocorrências

No cadastro, informe o nome da rua e clique em Localizar no mapa. Inclua a cidade para distinguir ruas com o mesmo nome. Escolha um dos resultados e confira o ponto no mapa. Arraste o marcador ou clique no mapa para ajustar o local da ocorrência.

O endereço é opcional e fica salvo como referência textual. O ponto marcado é a localização usada pelo Google Maps. Ao editar um endereço encontrado, é necessário localizar ou marcar novamente para evitar enviar o ponto antigo. Um número informado permanece no campo mesmo quando a busca só conhece a rua.

A busca usa Photon/OpenStreetMap por ação explícita, com cache, limite global de chamadas, tempo máximo de espera e filtro da área atendida. O serviço comunitário não garante disponibilidade. O provedor pode ser alterado com GEOCODING_URL para outra instância Photon.

O índice local usa o [CNEFE](https://www.ibge.gov.br/estatisticas/sociais/populacao/38734-cadastro-nacional-de-enderecos-para-fins-estatisticos.html) e a [Base de Faces de Logradouros](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/28971-base-de-faces-de-logradouros-do-brasil.html) do IBGE, Censo 2022. A malha municipal identifica os municípios que cruzam os limites do ResolveJá. O índice inclui os pontos e trechos que ficam dentro da área e agrupa as referências por logradouro e localidade. Quando há um trecho próximo da mesma rua, o marcador usa a posição desse trecho. Para buscar o número do imóvel, informe o município e o número. O ResolveJá consulta o Photon e pode usar a referência de rua do IBGE se o provedor não encontrar o endereço.

Para recriar o índice, instale `pyshp` (3.1 ou superior) e `shapely` (2 ou superior) em um ambiente Python e execute `python scripts/importar-logradouros-cnefe.py --cache caminho-para-armazenar-os-downloads`. O importador usa os limites de `src/utils/serviceArea.js` e gera `src/data/logradouros-cnefe.json.gz`. O ResolveJá usa o arquivo já gerado e precisa apenas do Node.js em execução.

Ao aproximar o mapa no cadastro ou na Central, o ResolveJá desenha as faces de ruas com nome do IBGE sobre o OpenStreetMap. A camada vem de `src/data/trechos-ibge.json.gz`, também gerado pelo importador, e pode ser exibida mesmo se o mapa de fundo estiver indisponível. Use `--faces-only` para atualizar só a camada de trechos a partir dos municípios do índice local. A cobertura dos trechos segue o Censo 2022.

Documentação e condições do serviço: https://github.com/komoot/photon

O endereço aparece nos cartões, recomendações e marcadores da Central. A migração adiciona apenas a coluna opcional endereco e preserva os registros existentes.

A busca compara os nomes das ruas e a cidade antes de exibir sugestões. Tolera acentos, abreviações do tipo de via, letras repetidas e pequenas diferenças de escrita; não usa uma rua diferente só porque compartilha uma palavra. Solicita mais candidatos ao provedor e exibe até cinco compatíveis.

A busca usa a região visível no mapa para priorizar ruas próximas. Quando encontra uma via da camada local, a sugestão identifica o **Trecho visível no mapa (IBGE)**. Informe a cidade ou aproxime o mapa do local se houver ruas com o mesmo nome.

Quando a base não encontra o endereço, o cadastro permite abrir a busca textual no Google Maps e colar as coordenadas do ponto encontrado. Para municípios reconhecidos, também oferece aproximar o mapa da cidade sem marcar uma ocorrência automaticamente. A cobertura da base externa continua limitada: a ausência de uma rua não é corrigida inventando coordenadas.
