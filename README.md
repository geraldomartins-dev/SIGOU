# SIGOU — versão beta

O SIGOU recebe denúncias de problemas urbanos, mostra os locais no mapa e ajuda a equipe a escolher automaticamente o próximo atendimento.

Você não precisa saber programar. Siga as instruções abaixo na ordem.

## O que é necessário

- Um computador com Windows 10 ou 11.
- Internet para carregar o mapa.
- Celular e computador na mesma rede Wi‑Fi, caso queira acessar pelo celular.

## Instalação fácil no Windows

### 1. Instale o Node.js

1. Acesse [nodejs.org/pt/download](https://nodejs.org/pt/download).
2. Baixe a versão **LTS** para Windows.
3. Abra o arquivo baixado e clique em **Next** até aparecer **Install**.
4. Clique em **Install**, depois em **Finish** e reinicie o computador.

Esse passo só precisa ser feito uma vez.

### 2. Instale o SIGOU

1. Abra a pasta `PROJETO SIGOU`.
2. Clique duas vezes em `1_INSTALAR_SIGOU.bat`.
3. Aguarde a mensagem **Instalação concluída**.
4. Pressione qualquer tecla para fechar a janela.

### 3. Inicie o SIGOU

1. Clique duas vezes em `2_INICIAR_SIGOU.bat`.
2. Aguarde alguns segundos; o portal abrirá no navegador.
3. Mantenha a janela **Servidor SIGOU** aberta enquanto usar o sistema.

Nas próximas vezes, use somente `2_INICIAR_SIGOU.bat`.

## Endereços e login

No computador onde o SIGOU está instalado:

- Portal: [http://localhost:3000](http://localhost:3000)
- Central: [http://localhost:3000/login.html](http://localhost:3000/login.html)

Login inicial:

```text
Usuário: operador
Senha: sigou123
```

> Essa senha é provisória e deve ser substituída antes de usar dados reais.

## Acessar pelo celular

O celular não precisa instalar o projeto.

1. Conecte o celular e o computador à mesma rede Wi‑Fi.
2. No computador, pressione `Windows + R`, digite `cmd` e pressione Enter.
3. Digite `ipconfig` e pressione Enter.
4. Procure **Endereço IPv4**, parecido com `192.168.0.15`.
5. No navegador do celular, digite o endereço seguido de `:3000`.

Exemplo:

```text
http://192.168.0.15:3000
```

Se não abrir, permita o Node.js no Firewall do Windows e confirme que os aparelhos estão no mesmo Wi‑Fi.

### GPS no celular

Navegadores permitem GPS somente em páginas seguras (`HTTPS`). Em `localhost`, ele funciona no próprio computador. Para localização em tempo real em outros celulares, o SIGOU precisa ser publicado em um endereço HTTPS.

## Fazer uma denúncia

1. Preencha título e descrição.
2. Escolha a urgência.
3. Se quiser receber contato, informe telefone ou e-mail e marque a autorização.
4. Tire uma foto ou escolha uma imagem.
5. Toque no mapa para marcar o local.
6. Clique em **Enviar denúncia**.

Em risco imediato à vida, ligue diretamente para `190`, `192` ou `193`.

## Usar a Central

1. Abra a Central e faça login.
2. Autorize a localização quando o navegador perguntar.
3. O sistema indicará automaticamente o próximo serviço.
4. Se nada estiver validado, mostrará qual denúncia deve ser validada primeiro.
5. Use **Ligar**, **WhatsApp** ou **E-mail** apenas quando houver autorização.
6. Atualize o atendimento para **Atender** ou **Concluir**.

## Dados e cópia de segurança

No modo simples (SQLite), as denúncias ficam em `data\sigou.db`. No modo MySQL, ficam no banco `sigou` administrado pelo phpMyAdmin. As fotos continuam em `data\uploads`.

Para fazer backup:

1. Feche a janela **Servidor SIGOU**.
2. Copie a pasta `data` inteira para um pendrive ou local seguro.

Não compartilhe essa pasta: ela pode conter fotos, telefones e e-mails.

## Problemas comuns

### A janela fecha ao iniciar

O Node.js provavelmente não está instalado. Faça novamente o primeiro passo.

### “Porta 3000 em uso”

O SIGOU já está aberto. Feche a janela antiga **Servidor SIGOU** e tente de novo.

### O mapa não aparece

Confira a internet e pressione `Ctrl + F5` na página.

### O GPS não funciona

- Ative a localização do aparelho.
- Autorize a localização no navegador.
- Em celular, use uma versão publicada em HTTPS.
- Use a posição manual como alternativa.

### O celular não abre o endereço

- Confirme que ambos estão no mesmo Wi‑Fi.
- Confira novamente o Endereço IPv4.
- Permita o Node.js no Firewall do Windows.
- Mantenha **Servidor SIGOU** aberto.

## Parar o sistema

Feche a janela **Servidor SIGOU**. O endereço deixará de funcionar até abrir `2_INICIAR_SIGOU.bat` novamente.

## Para desenvolvedores

Requer Node.js 22.5 ou superior.

```bash
npm install
npm start
npm test
```

Usa Express, MySQL/MariaDB ou SQLite, Leaflet e OpenStreetMap.

### Usar MySQL pelo phpMyAdmin

1. No phpMyAdmin, clique em **Novo**, informe `sigou` e crie o banco com agrupamento `utf8mb4_unicode_ci`.
2. Copie `.env.example` e renomeie a cópia para `.env`.
3. Abra `.env` no Bloco de Notas e preencha `DB_USER` e `DB_PASSWORD` com o login do MySQL.
4. Confirme que `DB_CLIENT=mysql` e `DB_NAME=sigou`.
5. Execute `npm install` e depois `npm start`.

Na primeira inicialização, o servidor executa `database/schema.mysql.sql`, cria as tabelas e cria o usuário inicial definido por `CENTRAL_USER` e `CENTRAL_PASSWORD`. O arquivo `.env` é ignorado pelo Git para não publicar senhas.

Para voltar ao banco local sem phpMyAdmin, use `DB_CLIENT=sqlite` no `.env`.

Antes de uso público real, configure HTTPS, credenciais próprias, política de privacidade, backups e proteção adequada dos dados pessoais.
