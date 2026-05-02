import { sendChatMessage } from './api.js';
import { requireAuth } from './utils.js';

const STORAGE_KEY = 'smartspendChatMessages';
const OPEN_KEY = 'smartspendChatOpen';
const MESSAGE_LIMIT = 20;
const HISTORY_LIMIT = 8;

const PAGE_PROMPTS = {
  'home.html': [
    'How am I doing this month?',
    'What should I review first on this dashboard?'
  ],
  'analytics.html': [
    'What does this analytics page tell me?',
    'Which category should I try to reduce?'
  ],
  'budget.html': [
    'How should I improve my budgets?',
    'How can I reach my savings goal faster?'
  ],
  'expense.html': [
    'How should I categorize this expense?',
    'What makes a good expense description?'
  ],
  'account.html': [
    'What can I manage on this account page?',
    'How can I improve my account security?'
  ]
};

if (requireAuth()) {
  initChatbot();
}

function initChatbot() {
  const page = getPageContext();
  const state = {
    page,
    open: sessionStorage.getItem(OPEN_KEY) === 'true',
    sending: false,
    messages: loadMessages(page)
  };

  const root = document.createElement('div');
  root.className = 'chatbot-shell';
  root.innerHTML = `
    <button class="chatbot-launcher" type="button" aria-expanded="${state.open}">
      <span class="chatbot-launcher__icon">AI</span>
      <span class="chatbot-launcher__label">Ask SmartSpend AI</span>
    </button>

    <section class="chatbot-panel ${state.open ? 'chatbot-panel--open' : ''}" aria-hidden="${state.open ? 'false' : 'true'}">
      <div class="chatbot-panel__header">
        <div>
          <p class="chatbot-panel__eyebrow">SmartSpend AI</p>
          <h2 class="chatbot-panel__title">SmartSpend assistant</h2>
        </div>
        <div class="chatbot-panel__actions">
          <button class="chatbot-action" type="button" aria-label="Start a new conversation">New chat</button>
          <button class="chatbot-close" type="button" aria-label="Close chat">×</button>
        </div>
      </div>

      <p class="chatbot-panel__context">
        Tailored for <strong>${escapeHtml(page.title)}</strong>
      </p>

      <div class="chatbot-prompts"></div>
      <div class="chatbot-messages"></div>

      <form class="chatbot-form">
        <textarea
          class="chatbot-input"
          rows="1"
          maxlength="1500"
          placeholder="Ask about your budgets, expenses, charts, or this page..."
        ></textarea>
        <button class="chatbot-send" type="submit">Send</button>
      </form>
    </section>
  `;

  document.body.appendChild(root);

  const launcher = root.querySelector('.chatbot-launcher');
  const panel = root.querySelector('.chatbot-panel');
  const closeBtn = root.querySelector('.chatbot-close');
  const newChatBtn = root.querySelector('.chatbot-action');
  const promptsEl = root.querySelector('.chatbot-prompts');
  const messagesEl = root.querySelector('.chatbot-messages');
  const form = root.querySelector('.chatbot-form');
  const input = root.querySelector('.chatbot-input');
  const sendBtn = root.querySelector('.chatbot-send');
  const POS_KEY = 'smartspendChatLauncherPos';
  let dragging = false;
  let moved = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let rafId = 0;
  let pendingX = 0;
  let pendingY = 0;

  function persistMessages() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages.slice(-MESSAGE_LIMIT)));
  }

  function persistOpenState() {
    sessionStorage.setItem(OPEN_KEY, String(state.open));
  }

  function setOpen(nextOpen) {
    state.open = nextOpen;
    launcher.setAttribute('aria-expanded', String(nextOpen));
    panel.classList.toggle('chatbot-panel--open', nextOpen);
    panel.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
    persistOpenState();

    if (nextOpen) {
      setTimeout(() => {
        input.focus();
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }, 60);
    }
  }

  function setSending(nextSending) {
    state.sending = nextSending;
    sendBtn.disabled = nextSending;
    input.disabled = nextSending;
    newChatBtn.disabled = nextSending;
    sendBtn.textContent = nextSending ? 'Thinking...' : 'Send';
    renderMessages();
  }

  function resetConversation() {
    if (state.sending) {
      return;
    }

    state.messages = createWelcomeThread(state.page);
    input.value = '';
    autoResizeTextarea(input);
    persistMessages();
    renderMessages();
    setOpen(true);
    input.focus();
  }

  function renderPrompts() {
    const prompts = PAGE_PROMPTS[state.page.path] || PAGE_PROMPTS['home.html'];
    promptsEl.innerHTML = prompts.map(prompt => `
      <button class="chatbot-prompt" type="button">${escapeHtml(prompt)}</button>
    `).join('');

    promptsEl.querySelectorAll('.chatbot-prompt').forEach((button, index) => {
      button.addEventListener('click', () => {
        handleSend(prompts[index]);
      });
    });
  }

  function renderMessages() {
    const items = [...state.messages];

    if (state.sending) {
      items.push({
        role: 'assistant',
        content: 'Thinking through your SmartSpend data...'
      });
    }

    messagesEl.innerHTML = items.map(message => `
      <div class="chatbot-message chatbot-message--${message.role}">
        <div class="chatbot-message__label">${message.role === 'assistant' ? 'SmartSpend AI' : 'You'}</div>
        <div class="chatbot-message__bubble">${formatMessage(message.content)}</div>
      </div>
    `).join('');

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function handleSend(rawText) {
    const text = String(rawText || '').trim();
    if (!text || state.sending) {
      return;
    }

    const history = state.messages
      .slice(-HISTORY_LIMIT)
      .map(({ role, content }) => ({ role, content }));

    state.messages.push({ role: 'user', content: text });
    state.messages = state.messages.slice(-MESSAGE_LIMIT);
    persistMessages();
    renderMessages();
    setOpen(true);

    input.value = '';
    autoResizeTextarea(input);
    setSending(true);

    try {
      const data = await sendChatMessage({
        message: text,
        messages: history,
        page: getPageContext()
      });

      state.messages.push({
        role: 'assistant',
        content: data.reply
      });
    } catch (error) {
      state.messages.push({
        role: 'assistant',
        content: `Sorry, I could not answer that right now. ${error.message || 'Please try again.'}`
      });
    } finally {
      state.messages = state.messages.slice(-MESSAGE_LIMIT);
      persistMessages();
      renderMessages();
      setSending(false);
    }
  }

  launcher.addEventListener('click', () => {
    if (moved) {
      moved = false;
      return;
    }
    setOpen(!state.open);
  });

  closeBtn.addEventListener('click', () => {
    setOpen(false);
  });

  newChatBtn.addEventListener('click', () => {
    resetConversation();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    handleSend(input.value);
  });

  input.addEventListener('input', () => {
    autoResizeTextarea(input);
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend(input.value);
    }
  });

  renderPrompts();
  renderMessages();

  function savePosition(left, top) {
    localStorage.setItem(POS_KEY, JSON.stringify({ left, top }));
  }

  function applySavedPosition() {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return;
    try {
      const pos = JSON.parse(raw);
      if (typeof pos.left === 'number' && typeof pos.top === 'number') {
        root.style.left = `${pos.left}px`;
        root.style.top = `${pos.top}px`;
        root.style.right = 'auto';
        root.style.bottom = 'auto';
      }
    } catch {
      // ignore malformed cache
    }
  }

  function flushDrag() {
    rafId = 0;
    const dx = pendingX - startX;
    const dy = pendingY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      moved = true;
    }

    const nextLeft = Math.min(
      window.innerWidth - launcher.offsetWidth - 8,
      Math.max(8, originLeft + dx)
    );
    const nextTop = Math.min(
      window.innerHeight - launcher.offsetHeight - 8,
      Math.max(8, originTop + dy)
    );

    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  function startDrag(clientX, clientY, nextPointerId = null) {
    if (window.innerWidth > 900) return;
    if (state.open) return;
    const rect = root.getBoundingClientRect();
    dragging = true;
    moved = false;
    pointerId = nextPointerId;
    startX = clientX;
    startY = clientY;
    originLeft = rect.left;
    originTop = rect.top;
    root.classList.add('chatbot-shell--draggable');
  }

  function moveDrag(clientX, clientY) {
    if (!dragging) return;
    pendingX = clientX;
    pendingY = clientY;
    if (!rafId) {
      rafId = requestAnimationFrame(flushDrag);
    }
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    pointerId = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    root.classList.remove('chatbot-shell--draggable');
    const rect = root.getBoundingClientRect();
    savePosition(rect.left, rect.top);
  }

  launcher.addEventListener('pointerdown', event => {
    startDrag(event.clientX, event.clientY, event.pointerId);
  });
  window.addEventListener('pointermove', event => {
    if (!dragging) return;
    if (pointerId != null && event.pointerId !== pointerId) return;
    moveDrag(event.clientX, event.clientY);
  });
  window.addEventListener('pointerup', event => {
    if (pointerId != null && event.pointerId !== pointerId) return;
    endDrag();
  });
  window.addEventListener('pointercancel', endDrag);

  if (window.innerWidth <= 900) {
    applySavedPosition();
  }

  if (state.open) {
    setOpen(true);
  }
}

function getPageContext() {
  const path = window.location.pathname.split('/').pop() || 'home.html';
  const title = document.title.replace(/^SmartSpend\s*[|—-]?\s*/i, '').trim() || 'SmartSpend';
  const heading =
    document.querySelector('h1')?.textContent?.trim() ||
    document.querySelector('.page-header__title')?.textContent?.trim() ||
    document.querySelector('.card-title')?.textContent?.trim() ||
    '';

  return { path, title, heading };
}

function loadMessages(page) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string');
    }
  } catch {
    // Ignore malformed session storage data.
  }

  return createWelcomeThread(page);
}

function createWelcomeThread(page) {
  return [
    {
      role: 'assistant',
      content: buildWelcomeMessage(page)
    }
  ];
}

function buildWelcomeMessage(page) {
  switch (page.path) {
    case 'analytics.html':
      return 'Hi, I am SmartSpend AI. I can explain your charts, highlight spending patterns, and suggest which categories to review next.';
    case 'budget.html':
      return 'Hi, I am SmartSpend AI. I can help you understand this budget page, think through savings goals, and suggest how to adjust category limits.';
    case 'expense.html':
      return 'Hi, I am SmartSpend AI. I can help you categorize expenses, describe purchases clearly, and understand how entries affect your budget.';
    case 'account.html':
      return 'Hi, I am SmartSpend AI. I can explain what you can manage on this account page and share practical security tips.';
    default:
      return 'Hi, I am SmartSpend AI. Ask me about your dashboard, budgets, expenses, charts, or how to use this website.';
  }
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMessage(content) {
  return escapeHtml(content).replace(/\n/g, '<br>');
}
