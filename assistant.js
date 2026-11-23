// Marianville Assistant — local FAQ assistant. No messages or data are sent externally.
(function () {
  const faq = [
    { keywords: ['register', 'registration', 'apply', 'application', 'sign up'], answer: 'Open the Student Registration page and sign in with the student ID and password issued by the school administrator. Complete each section, review it carefully, then use Save.' },
    { keywords: ['document', 'documents', 'upload', 'receipt', 'fee', 'picture', 'scan'], answer: 'The form includes a school fee receipt section. Upload a JPG, PNG or PDF no larger than 5 MB. Confirm any additional documents with the school office.' },
    { keywords: ['login', 'log in', 'sign in', 'password', 'student id', 'credential'], answer: 'Use the student ID and password issued by Marianville Secondary School. If you cannot sign in, contact the school administrator. Never share your password here.' },
    { keywords: ['close', 'closed', 'open', 'reopen', 'deadline', 'date'], answer: 'The school may close or reopen registration through its administration controls. Confirm the current status and deadlines directly with the Marianville school office.' },
    { keywords: ['news', 'notice', 'update', 'information'], answer: 'Visit News & Articles for school updates. For urgent or time-sensitive information, confirm directly with the school office.' },
    { keywords: ['contact', 'office', 'phone', 'email', 'address'], answer: 'Please contact Marianville Secondary School through the contact details published by the school. This assistant cannot confirm private accounts or office details.' },
    { keywords: ['save', 'submit', 'review', 'edit'], answer: 'Use Save after reviewing your information. An authorized administrator may close or reopen registration and manage approved submitted records.' }
  ];
  const fallback = 'I can help with registration steps, sign-in questions, receipts and news. Please contact the school office for official dates, fees, documents or account-specific help.';
  const normalize = text => text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  function findAnswer(question) {
    const text = normalize(question);
    let best = null;
    let bestScore = 0;
    for (const item of faq) {
      const score = item.keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
      if (score > bestScore) { best = item; bestScore = score; }
    }
    return bestScore ? best.answer : fallback;
  }

  function addMessage(text, type) {
    const box = document.getElementById('assistantMessages');
    const message = document.createElement('div');
    message.className = `assistant-message ${type}`;
    message.textContent = text;
    box.appendChild(message);
    box.scrollTop = box.scrollHeight;
  }

  function ask(question) {
    const clean = question.trim();
    if (!clean) return;
    addMessage(clean, 'user');
    const input = document.getElementById('assistantInput');
    input.value = '';
    window.setTimeout(() => addMessage(findAnswer(clean), 'bot'), 180);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const widget = document.createElement('div');
    widget.innerHTML = `
      <button id="assistantToggle" class="assistant-toggle" type="button" aria-expanded="false" aria-controls="assistantPanel">
        <span aria-hidden="true">M</span><span>Marianville Assistant</span>
      </button>
      <aside id="assistantPanel" class="assistant-panel" aria-label="Marianville Assistant" hidden>
        <header class="assistant-header">
          <div><strong>Marianville Assistant</strong><small>Website help</small></div>
          <button id="assistantClose" class="assistant-close" type="button" aria-label="Close Marianville Assistant">×</button>
        </header>
        <div id="assistantMessages" class="assistant-messages" aria-live="polite">
          <div class="assistant-message bot">Hello! I can help with registration and general website questions.</div>
        </div>
        <div class="assistant-suggestions" aria-label="Suggested questions">
          <button type="button" data-question="How do I register">How do I register?</button>
          <button type="button" data-question="What documents do I need">What documents do I need?</button>
          <button type="button" data-question="How do I log in">How do I log in?</button>
        </div>
        <form id="assistantForm" class="assistant-form">
          <label class="sr-only" for="assistantInput">Ask Marianville Assistant</label>
          <input id="assistantInput" type="text" autocomplete="off" maxlength="300" placeholder="Ask a question…">
          <button type="submit">Send</button>
        </form>
        <p class="assistant-disclaimer">Please do not enter private or student information.</p>
      </aside>`;
    document.body.appendChild(widget);

    const toggle = document.getElementById('assistantToggle');
    const panel = document.getElementById('assistantPanel');
    const close = document.getElementById('assistantClose');
    const input = document.getElementById('assistantInput');

    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) input.focus();
    }

    toggle.addEventListener('click', () => setOpen(panel.hidden));
    close.addEventListener('click', () => { setOpen(false); toggle.focus(); });
    document.getElementById('assistantForm').addEventListener('submit', event => {
      event.preventDefault();
      ask(input.value);
    });
    document.querySelectorAll('[data-question]').forEach(button => {
      button.addEventListener('click', () => ask(button.dataset.question));
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); }
    });
  });
})();
