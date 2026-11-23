// Marianville Assistant — a local FAQ helper. It does not send messages or student data externally.
(function () {
  const faq = [
    {
      keywords: ['register', 'registration', 'apply', 'application', 'sign up'],
      answer: 'To register, open the Student Registration page and sign in using the student ID and password issued by the school administrator. Complete every required section, review it carefully, and save the registration.'
    },
    {
      keywords: ['document', 'documents', 'upload', 'receipt', 'fee', 'picture', 'scan'],
      answer: 'The registration form includes a section for a school fee receipt. Upload a JPG, PNG, or PDF that is no larger than 5 MB. Confirm the school requirements for any additional documents.'
    },
    {
      keywords: ['login', 'log in', 'sign in', 'password', 'student id', 'credential'],
      answer: 'Use the student ID and password issued by Marianville Secondary School. Enter the ID on the Student Registration page without adding @students.marianville.edu.pg. If you cannot sign in, contact the school administrator.'
    },
    {
      keywords: ['close', 'closed', 'open', 'reopen', 'deadline', 'date'],
      answer: 'Registration may be closed temporarily by school administration. You can confirm the current closing date or reopening status with the Marianville school office.'
    },
    {
      keywords: ['news', 'notice', 'update', 'information'],
      answer: 'Visit the News & Notices page for school updates and reminders. For urgent or time-sensitive information, please confirm directly with the school office.'
    },
    {
      keywords: ['contact', 'office', 'phone', 'email', 'address'],
      answer: 'Please contact Marianville Secondary School directly through the contact details published by the school. This assistant cannot confirm private account or school office details.'
    },
    {
      keywords: ['save', 'submit', 'review', 'edit'],
      answer: 'Use the Save button after reviewing your information. Administrators may close or reopen registration and, for approved staff, manage submitted information through the Staff Portal.'
    }
  ];

  const fallback = 'I can help with registration steps, sign-in questions, receipts, and news. Please contact the school office for official dates, fees, documents, or account-specific help.';

  function normalize(text) {
    return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function findAnswer(question) {
    const text = normalize(question);
    let best = null;
    let bestScore = 0;

    for (const item of faq) {
      const score = item.keywords.reduce((total, keyword) =>
        total + (text.includes(keyword) ? 1 : 0), 0);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
    return bestScore ? best.answer : fallback;
  }

  function addMessage(text, type) {
    const message = document.createElement('div');
    message.className = `assistant-message ${type}`;
    message.textContent = text;
    document.getElementById('assistantMessages').appendChild(message);
    message.scrollIntoView({ block: 'nearest' });
  }

  function ask(question) {
    const clean = question.trim();
    if (!clean) return;
    addMessage(clean, 'user');
    document.getElementById('assistantInput').value = '';
    window.setTimeout(() => addMessage(findAnswer(clean), 'bot'), 180);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('assistantToggle');
    const panel = document.getElementById('assistantPanel');
    const close = document.getElementById('assistantClose');
    const form = document.getElementById('assistantForm');

    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) document.getElementById('assistantInput').focus();
    }

    toggle.addEventListener('click', () => setOpen(panel.hidden));
    close.addEventListener('click', () => {
      setOpen(false);
      toggle.focus();
    });

    form.addEventListener('submit', (event) => {
      event.preventEvent;
    });

    document.getElementById('assistantForm').addEventListener('submit', (event) => {
      event.preventDefault();
      ask(document.getElementById('assistantInput').value);
    });

    document.querySelectorAll('[data-question]').forEach((button) => {
      button.addEventListener('click', () => ask(button.dataset.question));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) {
        setOpen(false);
        toggle.focus();
      }
    });
  });
})();
