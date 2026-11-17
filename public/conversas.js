(() => {
  const $ = (selector) => document.querySelector(selector);
  const operator = document.body.dataset.conversa === 'central';
  const registration = new URLSearchParams(location.search).get('registro') || '';
  const validRegistration = /^[1-9]\d*$/.test(registration);
  const token = operator ? sessionStorage.getItem('sigou_token') : location.hash.slice(1);
  const path = operator ? '/api/conversas/' + registration : '/api/acompanhamento';
  const ownAuthor = operator ? 'CENTRAL' : 'CIDADAO';
  const authors = { CIDADAO: 'Cidadão', CENTRAL: 'Central' };
  const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const feedback = $('#conversation-feedback');
  const conversation = $('#conversation');
  const messages = $('#conversation-messages');
  const messageForm = $('#message-form');
  const messageText = $('#message-text');
  const suggestions = $('#message-suggestions');

  if (operator && !token) {
    location.replace('/login.html');
    return;
  }

  function showFeedback(text, error = false) {
    feedback.textContent = text;
    feedback.classList.toggle('conversation-error', error);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    if (operator && response.status === 401) {
      sessionStorage.removeItem('sigou_token');
      location.replace('/login.html');
      throw new Error('Sessão encerrada.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.erro || 'Não foi possível carregar a conversa.');
    return data;
  }

  function statusLabel(report) {
    if (report.verificacao_status === 'REJEITADA') return 'Não aprovada na verificação';
    if (report.status === 'CONCLUIDA') return 'Concluída';
    if (report.status === 'EM_ATENDIMENTO') return 'Em atendimento';
    if (report.verificacao_status === 'VALIDADA') return 'Validada, aguardando atendimento';
    return 'Recebida, aguardando verificação';
  }

  function renderMessage(message) {
    const item = document.createElement('li');
    item.className = 'conversation-message';
    item.classList.toggle('own', ownAuthor === message.autor);
    const label = document.createElement('strong');
    label.textContent = authors[message.autor];
    const time = document.createElement('time');
    const sentAt = new Date(Number(message.enviada_ms));
    time.dateTime = sentAt.toISOString();
    time.textContent = dateFormat.format(sentAt);
    const content = document.createElement('p');
    content.textContent = message.texto;
    item.append(label, time, content);
    return item;
  }

  async function loadConversation() {
    const { ocorrencia, mensagens } = await request(path);
    $('#conversation-number').textContent = 'Registro ' + ocorrencia.id;
    $('#conversation-title').textContent = ocorrencia.titulo;
    $('#conversation-state').textContent = statusLabel(ocorrencia);
    messages.replaceChildren(...mensagens.map(renderMessage));
    $('#no-messages').classList.toggle('hidden', mensagens.length > 0);
    if (operator) {
      $('#enable-tracking').classList.toggle('hidden', Boolean(ocorrencia.tem_acesso));
      messageForm.classList.toggle('hidden', !ocorrencia.tem_acesso);
    }
    conversation.classList.remove('hidden');
  }

  async function loadInbox() {
    const reports = await request('/api/conversas');
    const links = reports.map(report => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = '/mensagens.html?registro=' + report.id;
      if (String(report.id) === registration) link.setAttribute('aria-current', 'page');
      const title = document.createElement('strong');
      title.textContent = report.id + ' · ' + report.titulo;
      const details = document.createElement('small');
      const last = report.ultima_mensagem ? ' · Última mensagem: ' + authors[report.ultima_mensagem] : '';
      details.textContent = statusLabel(report) + last;
      link.append(title, details);
      item.append(link);
      return item;
    });
    $('#inbox').replaceChildren(...links);
    $('#inbox-empty').classList.toggle('hidden', links.length > 0);
  }

  async function refresh() {
    if (!operator) {
      if (!token) {
        showFeedback('Abra o link privado salvo no comprovante da ocorrência.');
        return;
      }
      await loadConversation();
      return;
    }
    await loadInbox();
    if (registration && !validRegistration) showFeedback('Informe um número de registro válido.', true);
    else if (validRegistration) await loadConversation();
    else showFeedback('Selecione uma conversa ou busque pelo número de registro.');
  }

  let busy = false;
  async function run(button, action) {
    if (busy) return;
    busy = true;
    if (button) button.disabled = true;
    showFeedback('');
    try { await action(); }
    catch (error) { showFeedback(error.message, true); }
    finally {
      if (button) button.disabled = false;
      busy = false;
    }
  }

  $('#refresh-conversation').addEventListener('click', event => {
    run(event.currentTarget, refresh);
  });
  function updateSuggestions() {
    suggestions.classList.toggle('hidden', messageText.value.length > 0);
  }

  suggestions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-draft]');
    if (!button || messageText.value) return;
    messageText.value = button.dataset.draft;
    updateSuggestions();
    messageText.focus();
  });
  messageText.addEventListener('input', updateSuggestions);
  updateSuggestions();

  messageForm.addEventListener('submit', event => {
    event.preventDefault();
    const draft = messageText.value.trim();
    if (!draft) return showFeedback('Escreva uma mensagem.', true);
    const submitted = messageText.value;
    run(event.submitter, async () => {
      const message = await request(path + '/mensagens', {
        method: 'POST', body: JSON.stringify({ texto: draft })
      });
      messages.append(renderMessage(message));
      $('#no-messages').classList.add('hidden');
      if (messageText.value === submitted) {
        messageText.value = '';
        updateSuggestions();
      }
      if (operator) await loadInbox().catch(() => {});
      showFeedback('Mensagem enviada.');
    });
  });

  if (operator) {
    if (validRegistration) $('#registration').value = registration;
    $('#generate-tracking').addEventListener('click', event => {
      run(event.currentTarget, async () => {
        const { chave_acompanhamento } = await request(path + '/link', { method: 'POST' });
        const link = new URL('/acompanhar.html', location.origin);
        link.hash = chave_acompanhamento;
        $('#issued-tracking-link').value = link.href;
        $('#issued-tracking').classList.remove('hidden');
        $('#enable-tracking').classList.add('hidden');
        messageForm.classList.remove('hidden');
        $('#issued-tracking-link').focus();
        showFeedback('Link gerado.');
      });
    });
    $('#copy-tracking').addEventListener('click', async () => {
      const field = $('#issued-tracking-link');
      try {
        await navigator.clipboard.writeText(field.value);
        showFeedback('Link copiado.');
      } catch {
        field.focus();
        field.select();
        showFeedback('Link selecionado. Use a opção de copiar do seu dispositivo.');
      }
    });
    $('#logout').addEventListener('click', async () => {
      try { await request('/api/auth/logout', { method: 'POST' }); }
      finally {
        sessionStorage.removeItem('sigou_token');
        location.replace('/login.html');
      }
    });
  }
  if (!operator) window.addEventListener('hashchange', () => location.reload());
  run($('#refresh-conversation'), refresh);
})();
