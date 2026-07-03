// The backend serves this UI and the API from the same origin, so all calls are
// relative. To target a different API origin, set API_ORIGIN to its base URL
// (no trailing slash) and add that UI origin to CORS_ORIGINS on the backend.
const API_ORIGIN = '';
const API_BASE = `${API_ORIGIN}/api/v1`;
const STORAGE_KEY = 'chatAssistant.conversationId';
const MAX_MESSAGE_LENGTH = 2000;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_DURATION_MS = 120000;
const TERMINAL_STATUSES = ['succeeded', 'failed', 'canceled'];

const elements = {
  messages: document.getElementById('messages'),
  composer: document.getElementById('composer'),
  input: document.getElementById('message-input'),
  sendButton: document.getElementById('send-button'),
  validationHint: document.getElementById('validation-hint'),
  charCounter: document.getElementById('char-counter'),
  typingIndicator: document.getElementById('typing-indicator'),
  typingLabel: document.getElementById('typing-label'),
  errorBanner: document.getElementById('error-banner'),
  errorText: document.getElementById('error-text'),
  errorDismiss: document.getElementById('error-dismiss'),
  newConversation: document.getElementById('new-conversation'),
  conversationId: document.getElementById('conversation-id'),
  transactionsList: document.getElementById('transactions-list'),
  transactionsEmpty: document.getElementById('transactions-empty'),
  presence: document.getElementById('presence-indicator'),
  presenceLabel: document.getElementById('presence-label'),
};

const state = {
  conversationId: null,
  inFlight: false,
  transactions: new Map(),
  pollers: new Map(),
};

const HEALTH_TIMEOUT_MS = 60000;

const isTerminal = (status) => TERMINAL_STATUSES.includes(status);

const setPresence = (status, label) => {
  if (!elements.presence) {
    return;
  }
  elements.presence.classList.remove('is-connecting', 'is-online', 'is-offline');
  elements.presence.classList.add(`is-${status}`);
  if (elements.presenceLabel) {
    elements.presenceLabel.textContent = label;
  }
};

const checkBackendHealth = async () => {
  setPresence('connecting', 'Conectando…');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_ORIGIN}/health`, { signal: controller.signal });
    if (response.ok) {
      setPresence('online', 'Online');
    } else {
      setPresence('offline', 'Offline');
    }
  } catch {
    setPresence('offline', 'Offline');
  } finally {
    clearTimeout(timer);
  }
};

const shortId = (id) => (id ? `${id.slice(0, 8)}` : 'unknown');

const scrollMessagesToBottom = () => {
  elements.messages.scrollTop = elements.messages.scrollHeight;
};

const setConversationId = (id) => {
  state.conversationId = id;
  if (id) {
    localStorage.setItem(STORAGE_KEY, id);
    elements.conversationId.textContent = `Conversation ${shortId(id)}`;
    elements.conversationId.hidden = false;
  } else {
    localStorage.removeItem(STORAGE_KEY);
    elements.conversationId.hidden = true;
    elements.conversationId.textContent = '';
  }
};

const showError = (message) => {
  elements.errorText.textContent = message;
  elements.errorBanner.hidden = false;
};

const clearError = () => {
  elements.errorBanner.hidden = true;
  elements.errorText.textContent = '';
};

const setTyping = (visible, label) => {
  elements.typingIndicator.hidden = !visible;
  if (label) {
    elements.typingLabel.textContent = label;
  }
};

const validateMessage = (value) => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, hint: 'Enter a message to send.' };
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, hint: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` };
  }
  return { valid: true, hint: '' };
};

const refreshComposerState = () => {
  const value = elements.input.value;
  elements.charCounter.textContent = `${value.length} / ${MAX_MESSAGE_LENGTH}`;
  const { valid, hint } = validateMessage(value);
  elements.validationHint.textContent = state.inFlight ? '' : hint;
  elements.sendButton.disabled = state.inFlight || !valid;
};

const setInFlight = (value) => {
  state.inFlight = value;
  elements.input.disabled = value;
  refreshComposerState();
};

const autoResizeInput = () => {
  const el = elements.input;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
};

const createMessageElement = (role, content) => {
  const wrapper = document.createElement('div');
  wrapper.className = `message message-${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.setAttribute('aria-hidden', 'true');

  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'message-content';

  const roleLabel = document.createElement('span');
  roleLabel.className = 'message-role';
  roleLabel.textContent = role === 'user' ? 'You' : 'Assistant';

  const body = document.createElement('div');
  body.className = 'message-body';
  body.textContent = content;

  contentWrapper.appendChild(roleLabel);
  contentWrapper.appendChild(body);
  wrapper.appendChild(avatar);
  wrapper.appendChild(contentWrapper);
  return { wrapper, body };
};

const appendMessage = (role, content) => {
  const { wrapper, body } = createMessageElement(role, content);
  elements.messages.appendChild(wrapper);
  scrollMessagesToBottom();
  return body;
};

const renderHistory = (messages) => {
  elements.messages.innerHTML = '';
  messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .filter((message) => message.content && message.content.trim().length > 0)
    .forEach((message) => appendMessage(message.role, message.content));
};

const parseErrorResponse = async (response) => {
  try {
    const payload = await response.json();
    if (payload && payload.error && payload.error.message) {
      return payload.error.message;
    }
  } catch {
    return `Request failed with status ${response.status}`;
  }
  return `Request failed with status ${response.status}`;
};

const updateTransactionsEmptyState = () => {
  elements.transactionsEmpty.hidden = state.transactions.size > 0;
};

const renderTransactionCard = (transaction) => {
  const existing = state.transactions.get(transaction.id);
  const card = existing ? existing.element : document.createElement('div');
  card.className = `transaction-card transaction-${transaction.status}`;
  card.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'transaction-header';

  const type = document.createElement('span');
  type.className = 'transaction-type';
  type.textContent = transaction.type || 'transaction';

  const badge = document.createElement('span');
  badge.className = `transaction-status-badge status-${transaction.status} badge rounded-pill`;
  if (!isTerminal(transaction.status)) {
    const spinner = document.createElement('span');
    spinner.className = 'spinner spinner-border spinner-border-sm';
    spinner.setAttribute('role', 'status');
    badge.appendChild(spinner);
  }
  const badgeText = document.createElement('span');
  badgeText.textContent = transaction.status;
  badge.appendChild(badgeText);

  header.appendChild(type);
  header.appendChild(badge);

  const meta = document.createElement('div');
  meta.className = 'transaction-meta';

  const idLine = document.createElement('span');
  idLine.textContent = `id ${shortId(transaction.id)}`;

  const attemptsLine = document.createElement('span');
  const maxAttempts = transaction.maxAttempts != null ? transaction.maxAttempts : '-';
  const attempts = transaction.attempts != null ? transaction.attempts : 0;
  attemptsLine.textContent = `attempts ${attempts} / ${maxAttempts}`;

  meta.appendChild(idLine);
  meta.appendChild(attemptsLine);

  card.appendChild(header);
  card.appendChild(meta);

  if (transaction.status === 'failed' && transaction.error) {
    const errorLine = document.createElement('div');
    errorLine.className = 'transaction-error';
    errorLine.textContent =
      typeof transaction.error === 'string'
        ? transaction.error
        : transaction.error.message || 'Transaction failed.';
    card.appendChild(errorLine);
  }

  if (!existing) {
    elements.transactionsList.prepend(card);
    state.transactions.set(transaction.id, { element: card, data: transaction });
  } else {
    existing.data = transaction;
  }

  updateTransactionsEmptyState();
};

const stopPolling = (transactionId) => {
  const timer = state.pollers.get(transactionId);
  if (timer) {
    clearTimeout(timer);
    state.pollers.delete(transactionId);
  }
};

const fetchTransaction = async (transactionId) => {
  const response = await fetch(`${API_BASE}/transactions/${transactionId}`);
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
  const payload = await response.json();
  return payload.transaction;
};

const startPolling = (transactionId) => {
  if (state.pollers.has(transactionId)) {
    return;
  }
  const startedAt = Date.now();

  const poll = async () => {
    try {
      const transaction = await fetchTransaction(transactionId);
      renderTransactionCard(transaction);
      if (isTerminal(transaction.status)) {
        stopPolling(transactionId);
        return;
      }
    } catch {
      stopPolling(transactionId);
      return;
    }
    if (Date.now() - startedAt >= POLL_MAX_DURATION_MS) {
      stopPolling(transactionId);
      return;
    }
    const timer = setTimeout(poll, POLL_INTERVAL_MS);
    state.pollers.set(transactionId, timer);
  };

  const timer = setTimeout(poll, POLL_INTERVAL_MS);
  state.pollers.set(transactionId, timer);
};

const trackTransactionReference = async (transactionId, status) => {
  renderTransactionCard({
    id: transactionId,
    type: 'transaction',
    status: status || 'pending',
    attempts: 0,
    maxAttempts: null,
  });
  try {
    const transaction = await fetchTransaction(transactionId);
    renderTransactionCard(transaction);
    if (!isTerminal(transaction.status)) {
      startPolling(transactionId);
    }
  } catch {
    startPolling(transactionId);
  }
};

const trackTransactionDto = (transaction) => {
  renderTransactionCard(transaction);
  if (!isTerminal(transaction.status)) {
    startPolling(transaction.id);
  }
};

const clearTransactions = () => {
  state.pollers.forEach((timer) => clearTimeout(timer));
  state.pollers.clear();
  state.transactions.clear();
  elements.transactionsList.innerHTML = '';
  updateTransactionsEmptyState();
};

const parseSseFrame = (frame) => {
  const lines = frame.split('\n');
  let event = 'message';
  const dataLines = [];
  lines.forEach((rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  });
  if (dataLines.length === 0) {
    return null;
  }
  const raw = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
};

const handleStreamEvent = (event, data, context) => {
  if (event === 'token') {
    if (!context.firstTokenReceived) {
      context.firstTokenReceived = true;
      setTyping(false);
    }
    context.assistantContent += data.token || '';
    context.assistantBody.textContent = context.assistantContent;
    scrollMessagesToBottom();
    return;
  }
  if (event === 'tool') {
    const phase = data.phase === 'result' ? 'finished' : 'running';
    setTyping(true, `Tool ${data.name} ${phase}`);
    return;
  }
  if (event === 'transaction') {
    trackTransactionReference(data.transactionId, data.status);
    return;
  }
  if (event === 'done') {
    if (data.conversationId) {
      setConversationId(data.conversationId);
    }
    if (data.content) {
      context.assistantContent = data.content;
      context.assistantBody.textContent = data.content;
    }
    context.done = true;
    return;
  }
  if (event === 'error') {
    context.streamError = data.message || 'The assistant returned an error.';
  }
};

const streamChat = async (message, assistantBody) => {
  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: state.conversationId || undefined,
      message,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(await parseErrorResponse(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const context = {
    assistantBody,
    assistantContent: '',
    firstTokenReceived: false,
    done: false,
    streamError: null,
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex >= 0) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const parsed = parseSseFrame(frame);
      if (parsed) {
        handleStreamEvent(parsed.event, parsed.data, context);
      }
      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  const remaining = parseSseFrame(buffer.trim());
  if (remaining) {
    handleStreamEvent(remaining.event, remaining.data, context);
  }

  if (context.streamError) {
    throw new Error(context.streamError);
  }

  if (!context.assistantContent) {
    context.assistantBody.textContent = 'No response received.';
  }
};

const sendMessage = async (message) => {
  clearError();
  setInFlight(true);
  appendMessage('user', message);

  const assistantBody = appendMessage('assistant', '');
  setTyping(true, 'Assistant is typing');

  try {
    await streamChat(message, assistantBody);
  } catch (error) {
    assistantBody.textContent = 'Message failed.';
    showError(error.message || 'Unable to reach the assistant.');
  } finally {
    setTyping(false);
    setInFlight(false);
    elements.input.focus();
  }
};

const loadConversation = async (conversationId) => {
  try {
    const response = await fetch(
      `${API_BASE}/conversations/${conversationId}/messages`,
    );
    if (response.status === 404) {
      setConversationId(null);
      return;
    }
    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }
    const payload = await response.json();
    renderHistory(payload.messages || []);
    await loadConversationTransactions(conversationId);
  } catch (error) {
    showError(error.message || 'Unable to load conversation history.');
  }
};

const loadConversationTransactions = async (conversationId) => {
  try {
    const response = await fetch(
      `${API_BASE}/transactions?conversationId=${conversationId}&limit=50`,
    );
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    (payload.transactions || []).forEach((transaction) => trackTransactionDto(transaction));
  } catch {
    return;
  }
};

const startNewConversation = () => {
  clearError();
  clearTransactions();
  setConversationId(null);
  elements.messages.innerHTML = '';
  elements.input.value = '';
  refreshComposerState();
  autoResizeInput();
  elements.input.focus();
};

const init = () => {
  elements.input.addEventListener('input', refreshComposerState);
  elements.input.addEventListener('input', autoResizeInput);

  elements.composer.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = elements.input.value.trim();
    const { valid } = validateMessage(elements.input.value);
    if (!valid || state.inFlight) {
      return;
    }
    elements.input.value = '';
    refreshComposerState();
    autoResizeInput();
    sendMessage(message);
  });

  elements.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      elements.composer.requestSubmit();
    }
  });

  elements.errorDismiss.addEventListener('click', clearError);
  elements.newConversation.addEventListener('click', startNewConversation);

  const storedId = localStorage.getItem(STORAGE_KEY);
  if (storedId) {
    setConversationId(storedId);
    loadConversation(storedId);
  }

  refreshComposerState();
  autoResizeInput();
  updateTransactionsEmptyState();
  checkBackendHealth();
};

init();
