/* Admin registration controls. Database RLS remains authoritative; this script only
   adds UI and never uses a service-role key. */
(() => {
  const waitForClient = callback => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.supabase && typeof window.supabase.from === 'function') {
        clearInterval(timer);
        callback(window.supabase);
      } else if (Date.now() - started > 15000) {
        clearInterval(timer);
        console.error('Registration admin tools: Supabase client did not initialize.');
      }
    }, 100);
  };

  waitForClient(client => {
    const workspace = document.querySelector('#adminWorkspace');
    if (!workspace) return;

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);

    async function readSetting() {
      const { data, error } = await client.from('registration_settings')
        .select('is_open').eq('singleton', true).maybeSingle();
      if (error) throw error;
      return data?.is_open ?? true;
    }

    async function updateStudentForm() {
      const form = document.querySelector('#registrationForm');
      if (!form) return;
      try {
        const open = await readSetting();
        const prior = form.querySelector('[data-registration-lock]');
        if (prior) prior.remove();
        const save = form.querySelector('button[type="submit"], button:not([type])');
        if (!open) {
          form.querySelectorAll('fieldset, button').forEach(el => { el.disabled = true; });
          const notice = document.createElement('div');
          notice.dataset.registrationLock = 'true';
          notice.className = 'notice';
          notice.setAttribute('role', 'status');
          notice.textContent = 'Registration is closed. Your saved information can no longer be changed. Please contact the school office if you need assistance.';
          form.prepend(notice);
        } else {
          form.querySelectorAll('fieldset, button').forEach(el => { el.disabled = false; });
          if (save) save.disabled = false;
        }
      } catch (error) {
        console.error('Could not read registration status', error);
      }
    }

    async function addAdminTools() {
      const title = workspace.querySelector('h2');
      const table = workspace.querySelector('table');
      if (!title || !table || workspace.querySelector('[data-admin-registration-tools]')) return;

      const panel = document.createElement('section');
      panel.dataset.adminRegistrationTools = 'true';
      panel.className = 'panel';
      panel.style.margin = '18px 0';
      panel.innerHTML = '<h3>Registration access</h3><p data-access-status class="hint">Checking status…</p><button type="button" class="button primary" data-toggle-access disabled>Loading…</button><p class="hint">Closing blocks student saves and uploads at the database level. Administrators can still edit submissions.</p>';
      title.closest('.row')?.insertAdjacentElement('afterend', panel);

      const status = panel.querySelector('[data-access-status]');
      const toggle = panel.querySelector('[data-toggle-access]');
      async function refresh() {
        try {
          const open = await readSetting();
          status.textContent = `Student registration is currently ${open ? 'OPEN' : 'CLOSED'}.`;
          toggle.textContent = open ? 'Close registration' : 'Reopen registration';
          toggle.dataset.open = String(open);
          toggle.disabled = false;
        } catch (error) {
          status.textContent = 'Could not load registration status. Run the updated Supabase setup SQL.';
          toggle.disabled = true;
          console.error(error);
        }
      }
      toggle.addEventListener('click', async () => {
        const nextOpen = toggle.dataset.open !== 'true';
        toggle.disabled = true;
        const { error } = await client.from('registration_settings').update({
          is_open: nextOpen, updated_at: new Date().toISOString()
        }).eq('singleton', true);
        if (error) {
          status.textContent = `Could not ${nextOpen ? 'reopen' : 'close'} registration: ${error.message}`;
          toggle.disabled = false;
          return;
        }
        await refresh();
      });
      await refresh();

      // Add a per-student editor beside the existing View action.
      const { data: records, error } = await client.from('registrations')
        .select('user_id,student_id,student_name,form_data')
        .order('updated_at', { ascending: false });
      if (error) {
        console.error('Could not load records for editing', error);
        return;
      }
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach((row, index) => {
        const record = records[index];
        const actions = row.lastElementChild;
        if (!record || !actions || actions.querySelector('[data-edit-student]')) return;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'button outline small';
        edit.dataset.editStudent = 'true';
        edit.textContent = 'Edit';
        edit.style.marginLeft = '6px';
        edit.addEventListener('click', () => showEditor(record));
        actions.append(edit);
      });
    }

    function showEditor(record) {
      let editor = workspace.querySelector('[data-student-editor]');
      if (!editor) {
        editor = document.createElement('section');
        editor.dataset.studentEditor = 'true';
        editor.className = 'panel';
        editor.style.marginTop = '18px';
        workspace.append(editor);
      }
      editor.innerHTML = `<h3>Edit registration · ${escapeHtml(record.student_name || record.student_id)}</h3>
        <p class="hint">Edit the display name and registration values. Keep the JSON valid; the student ID/login account is not changed here.</p>
        <label>Student display name<input data-student-name type="text"></label>
        <label>Registration data (JSON)<textarea data-form-json rows="18" spellcheck="false" style="width:100%;font-family:monospace"></textarea></label>
        <div class="actions"><button type="button" class="button primary" data-save-student>Save changes</button>
        <button type="button" class="button outline" data-cancel-edit>Cancel</button><p data-edit-message role="status"></p></div>`;
      editor.querySelector('[data-student-name]').value = record.student_name || '';
      editor.querySelector('[data-form-json]').value = JSON.stringify(record.form_data || {}, null, 2);
      editor.querySelector('[data-cancel-edit]').addEventListener('click', () => editor.remove());
      editor.querySelector('[data-save-student]').addEventListener('click', async event => {
        const save = event.currentTarget;
        const message = editor.querySelector('[data-edit-message]');
        let formData;
        try {
          formData = JSON.parse(editor.querySelector('[data-form-json]').value);
          if (!formData || Array.isArray(formData) || typeof formData !== 'object') throw new Error('Registration data must be a JSON object.');
        } catch (error) {
          message.textContent = `Invalid JSON: ${error.message}`;
          return;
        }
        save.disabled = true;
        const { error } = await client.from('registrations').update({
          student_name: editor.querySelector('[data-student-name]').value.trim(),
          form_data: formData,
          updated_at: new Date().toISOString()
        }).eq('user_id', record.user_id);
        save.disabled = false;
        if (error) {
          message.textContent = `Could not save changes: ${error.message}`;
          return;
        }
        message.textContent = 'Student registration updated.';
        record.student_name = editor.querySelector('[data-student-name]').value.trim();
        record.form_data = formData;
      });
      editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const observer = new MutationObserver(() => {
      addAdminTools();
      updateStudentForm();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addAdminTools();
    updateStudentForm();
  });
})();
