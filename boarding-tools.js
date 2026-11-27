/* Student boarding status and separate admin boarding tab. */
(() => {
  const waitForClient = callback => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.supabase?.from) {
        clearInterval(timer);
        callback(window.supabase);
      } else if (Date.now() - started > 15000) {
        clearInterval(timer);
        console.error('Boarding tools: Supabase client did not initialize.');
      }
    }, 100);
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const statusText = application => {
    if (application.allocation_status === 'allocated') {
      return `Approved — you are assigned to ${application.block_name || 'your dormitory'}${application.room_number ? `, Room ${application.room_number}` : ''}.`;
    }
    if (application.allocation_status === 'waiting_list') return 'Your boarding application is on the waiting list. The school will contact you when space becomes available.';
    if (application.allocation_status === 'rejected') return 'Your boarding application was not approved. Please contact the school office if you have questions.';
    return 'Your application has been received and is awaiting a boarding decision.';
  };

  waitForClient(client => {
    let studentSectionPromise = null;
    let adminSetupPromise = null;

    async function addStudentPrompt() {
      const message = document.querySelector('#saveMessage');
      const form = document.querySelector('#registrationForm');
      if (!message || !form || form.querySelector('[data-boarding-prompt]')) return;
      if (!message.textContent.toLowerCase().includes('saved successfully')) return;
      const prompt = document.createElement('div');
      prompt.dataset.boardingPrompt = 'true';
      prompt.className = 'notice';
      prompt.innerHTML = '<strong>Would you like to apply for boarding space?</strong><div class="actions"><button type="button" class="button primary" data-open-boarding>Apply for boarding</button></div>';
      form.append(prompt);
      prompt.querySelector('[data-open-boarding]').addEventListener('click', async () => {
        await addStudentBoardingSection(true);
        document.querySelector('#boardingSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    async function addStudentBoardingSection(forceCreate = false) {
      if (studentSectionPromise) return studentSectionPromise;
      studentSectionPromise = (async () => {
        const workspace = document.querySelector('#studentWorkspace');
        if (!workspace || workspace.querySelector('[data-boarding-section]')) return;
        const { data: { session } } = await client.auth.getSession();
        if (!session) return;
        const { data, error } = await client.from('boarding_applications')
          .select('*,dormitory_blocks(name)').eq('user_id', session.user.id).maybeSingle();
        if (error) {
          console.error('Could not load boarding application', error);
          return;
        }
        if (!data && !forceCreate) return;

        const section = document.createElement('section');
        section.dataset.boardingSection = 'true';
        section.id = 'boardingSection';
        section.className = 'panel';
        section.innerHTML = `<h2>Boarding application</h2><p class="hint">Your boarding application and allocation information.</p>
          <div class="notice" data-boarding-status role="status"></div>
          <div data-boarding-form-wrap></div>`;
        workspace.append(section);
        const status = section.querySelector('[data-boarding-status]');
        if (data) {
          status.textContent = statusText({ ...data, block_name: data.dormitory_blocks?.name });
          section.querySelector('[data-boarding-form-wrap]').innerHTML = `<p><strong>Student:</strong> ${esc(data.student_name)}</p>
            <p><strong>Grade / class:</strong> ${esc(data.grade)} / ${esc(data.class)}</p>
            <p><strong>School fee amount:</strong> ${data.fee_amount == null ? '—' : `PGK ${Number(data.fee_amount).toFixed(2)}`}</p>
            <p data-receipt-link>School fee receipt: ${data.fee_receipt_path ? 'loading secure link…' : 'not uploaded'}</p>`;
          if (data.fee_receipt_path) {
            const { data: signed, error: signError } = await client.storage.from('boarding-fees').createSignedUrl(data.fee_receipt_path, 300);
            const receipt = section.querySelector('[data-receipt-link]');
            if (!signError && signed?.signedUrl) receipt.innerHTML = `School fee receipt: <a href="${esc(signed.signedUrl)}" target="_blank" rel="noopener noreferrer">Open receipt (5-minute link)</a>`;
            else receipt.textContent = 'School fee receipt link unavailable.';
          }
          return;
        }

        status.textContent = 'You have not applied for boarding yet.';
        section.querySelector('[data-boarding-form-wrap]').innerHTML = `<form data-boarding-form><div class="form-grid">
          <label>Student name<input name="student_name" required></label>
          <label>Grade<select name="grade" required><option value="">Select grade</option><option>9</option><option>10</option><option>11</option><option>12</option></select></label>
          <label>Class<input name="class" required placeholder="e.g. 9A"></label>
          <label>School fee payment amount (PGK)<input name="fee_amount" type="number" min="0" step="0.01" required></label>
          <label>School fee payment receipt<input name="fee_receipt" type="file" accept="image/jpeg,image/png,application/pdf" required></label>
        </div><button type="submit" class="button primary">Submit boarding application</button><p data-boarding-message role="status"></p></form>`;
        const form = section.querySelector('[data-boarding-form]');
        const message = section.querySelector('[data-boarding-message]');
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const button = event.submitter;
          button.disabled = true;
          message.textContent = 'Submitting application…';
          let uploadedPath = null;
          try {
            const file = form.elements.fee_receipt.files[0];
            if (!file || file.size > 5242880 || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) throw new Error('Upload a JPG, PNG or PDF receipt smaller than 5 MB.');
            const { data: { session: currentSession } } = await client.auth.getSession();
            const path = `${currentSession.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const { error: uploadError } = await client.storage.from('boarding-fees').upload(path, file, { contentType: file.type, upsert: false });
            if (uploadError) throw uploadError;
            uploadedPath = path;
            const { error: saveError } = await client.from('boarding_applications').upsert({
              user_id: currentSession.user.id,
              student_id: currentSession.user.email?.split('@')[0] || '',
              student_name: form.elements.student_name.value.trim(),
              grade: form.elements.grade.value,
              class: form.elements.class.value.trim(),
              fee_amount: Number(form.elements.fee_amount.value),
              fee_receipt_path: path,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
            if (saveError) throw saveError;
            message.textContent = 'Application submitted.';
            studentSectionPromise = null;
            section.remove();
            await addStudentBoardingSection();
          } catch (error) {
            if (uploadedPath) await client.storage.from('boarding-fees').remove([uploadedPath]);
            message.textContent = error.message || 'Could not submit application.';
          } finally {
            button.disabled = false;
          }
        });
      })().finally(() => { studentSectionPromise = null; });
      return studentSectionPromise;
    }

    function createAdminTabs(workspace) {
      if (workspace.dataset.boardingTabsReady === 'true') return workspace.querySelector('[data-boarding-tab-panel="boarding"]');
      workspace.dataset.boardingTabsReady = 'true';
      const originalContent = document.createDocumentFragment();
      while (workspace.firstChild) originalContent.append(workspace.firstChild);
      const tabs = document.createElement('div');
      tabs.className = 'actions';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Administration sections');
      tabs.style.marginBottom = '18px';
      tabs.innerHTML = '<button type="button" class="button primary" role="tab" aria-selected="true" aria-controls="admin-registration-tab" data-admin-tab="registration">Student registrations</button><button type="button" class="button outline" role="tab" aria-selected="false" aria-controls="admin-boarding-tab" data-admin-tab="boarding">Boarding</button>';
      const registrations = document.createElement('section');
      registrations.id = 'admin-registration-tab';
      registrations.dataset.boardingTabPanel = 'registration';
      registrations.setAttribute('role', 'tabpanel');
      registrations.append(originalContent);
      const boarding = document.createElement('section');
      boarding.id = 'admin-boarding-tab';
      boarding.dataset.boardingTabPanel = 'boarding';
      boarding.setAttribute('role', 'tabpanel');
      boarding.hidden = true;
      workspace.append(tabs, registrations, boarding);
      tabs.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => {
        const selected = button.dataset.adminTab;
        tabs.querySelectorAll('[data-admin-tab]').forEach(tab => {
          const active = tab === button;
          tab.setAttribute('aria-selected', String(active));
          tab.classList.toggle('primary', active);
          tab.classList.toggle('outline', !active);
        });
        registrations.hidden = selected !== 'registration';
        boarding.hidden = selected !== 'boarding';
      }));
      return boarding;
    }

    async function addAdminBoardingTools() {
      if (adminSetupPromise) return adminSetupPromise;
      const workspace = document.querySelector('#adminWorkspace');
      if (!workspace || !workspace.querySelector('table')) return;
      adminSetupPromise = (async () => {
        const { data: { session } } = await client.auth.getSession();
        if (session?.user?.app_metadata?.role !== 'admin') return;
        const boardingTab = createAdminTabs(workspace);
        if (!boardingTab || boardingTab.querySelector('[data-boarding-admin]')) return;
        const panel = document.createElement('section');
        panel.dataset.boardingAdmin = 'true';
        panel.className = 'panel';
        panel.innerHTML = `<h2>Boarding management</h2><p class="hint">Manage dormitory blocks, room capacity and boarding decisions.</p>
          <div class="form-grid"><label>Student name<input data-filter-name></label><label>Grade<input data-filter-grade></label>
          <label>Class<input data-filter-class></label><label>Block<select data-filter-block><option value="">All blocks</option></select></label></div>
          <div id="blockSettings"></div><div id="boardingDatabase"><p>Loading boarding applications…</p></div>`;
        boardingTab.append(panel);
        let blocks = [];
        let applications = [];
        async function load() {
          const [blockResult, appResult] = await Promise.all([
            client.from('dormitory_blocks').select('*').order('name'),
            client.from('boarding_applications').select('*').order('submitted_at', { ascending: false })
          ]);
          if (blockResult.error || appResult.error) {
            panel.querySelector('#boardingDatabase').textContent = 'Could not load boarding data. Check Supabase setup and admin access.';
            console.error(blockResult.error || appResult.error);
            return;
          }
          blocks = blockResult.data || [];
          applications = appResult.data || [];
          renderBlocks();
          await renderApplications();
        }
        function renderBlocks() {
          const root = panel.querySelector('#blockSettings');
          root.innerHTML = '<h3>Dormitory blocks and rooms</h3><div class="form-grid" data-block-rows></div><button type="button" class="button outline" data-add-block>Add block</button>';
          const rows = root.querySelector('[data-block-rows]');
          for (const block of blocks) {
            const card = document.createElement('div');
            card.className = 'panel';
            card.innerHTML = `<label>Block name<input data-block-name value="${esc(block.name)}"></label>
              <label>Space limit<input data-block-limit type="number" min="0" value="${Number(block.space_limit) || 0}"></label>
              <label>Room numbers<input data-block-rooms value="${esc((block.room_numbers || []).join(', '))}"></label>
              <button type="button" class="button primary small" data-save-block>Save block</button><p data-block-save-message role="status"></p>`;
            card.querySelector('[data-save-block]').addEventListener('click', async event => {
              const button = event.currentTarget;
              const feedback = card.querySelector('[data-block-save-message]');
              button.disabled = true;
              const roomNumbers = [...new Set(card.querySelector('[data-block-rooms]').value.split(',').map(value => value.trim()).filter(Boolean))];
              const { error } = await client.from('dormitory_blocks').update({
                name: card.querySelector('[data-block-name]').value.trim(),
                space_limit: Number(card.querySelector('[data-block-limit]').value) || 0,
                room_numbers: roomNumbers,
                updated_at: new Date().toISOString()
              }).eq('id', block.id);
              button.disabled = false;
              feedback.textContent = error ? `Could not save changes: ${error.message}` : 'Changes saved successfully.';
              if (!error) await load();
            });
            rows.append(card);
          }
          root.querySelector('[data-add-block]').addEventListener('click', async () => {
            const name = prompt('New block name');
            if (!name?.trim()) return;
            const { error } = await client.from('dormitory_blocks').insert({ name: name.trim(), space_limit: 0, room_numbers: Array.from({ length: 13 }, (_, index) => String(index + 1)) });
            if (error) alert(error.message); else await load();
          });
        }
        async function renderApplications() {
          const nameFilter = panel.querySelector('[data-filter-name]').value.toLowerCase();
          const gradeFilter = panel.querySelector('[data-filter-grade]').value.toLowerCase();
          const classFilter = panel.querySelector('[data-filter-class]').value.toLowerCase();
          const blockFilter = panel.querySelector('[data-filter-block]');
          const selectedBlock = blockFilter.value;
          blockFilter.innerHTML = '<option value="">All blocks</option>' + blocks.map(block => `<option value="${block.id}" ${String(block.id) === selectedBlock ? 'selected' : ''}>${esc(block.name)}</option>`).join('');
          const filtered = applications.filter(application => {
            const block = blocks.find(item => Number(item.id) === Number(application.allocated_block_id));
            return (!nameFilter || application.student_name?.toLowerCase().includes(nameFilter)) && (!gradeFilter || application.grade?.toLowerCase().includes(gradeFilter)) && (!classFilter || application.class?.toLowerCase().includes(classFilter)) && (!selectedBlock || Number(block?.id) === Number(selectedBlock));
          });
          const receiptLinks = await Promise.all(filtered.map(async application => {
            if (!application.fee_receipt_path) return '';
            const { data, error } = await client.storage.from('boarding-fees').createSignedUrl(application.fee_receipt_path, 300);
            return !error && data?.signedUrl ? data.signedUrl : '';
          }));
          const root = panel.querySelector('#boardingDatabase');
          root.innerHTML = `<h3>Boarding applications · ${filtered.length}</h3><div class="table-wrap"><table>
            <thead><tr><th>Student</th><th>Grade</th><th>Class</th><th>School fee</th><th>Receipt</th><th>Block</th><th>Room</th><th>Decision</th><th></th></tr></thead>
            <tbody>${filtered.map((application, index) => {
              const block = blocks.find(item => Number(item.id) === Number(application.allocated_block_id));
              const rooms = block?.room_numbers || [];
              return `<tr data-application="${esc(application.id)}"><td>${esc(application.student_name || application.student_id)}</td><td>${esc(application.grade || '—')}</td><td>${esc(application.class || '—')}</td>
                <td>${application.fee_amount == null ? '—' : `PGK ${Number(application.fee_amount).toFixed(2)}`}</td>
                <td>${receiptLinks[index] ? `<a href="${esc(receiptLinks[index])}" target="_blank" rel="noopener noreferrer">Open receipt</a>` : 'Unavailable'}</td>
                <td><select data-change-block><option value="">No dormitory</option>${blocks.map(item => `<option value="${item.id}" ${Number(item.id) === Number(application.allocated_block_id) ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></td>
                <td><select data-change-room><option value="">Select room</option>${rooms.map(room => `<option value="${esc(room)}" ${room === application.room_number ? 'selected' : ''}>${esc(room)}</option>`).join('')}</select></td>
                <td><select data-change-status><option value="pending" ${application.allocation_status === 'pending' ? 'selected' : ''}>Pending review</option><option value="allocated" ${application.allocation_status === 'allocated' ? 'selected' : ''}>Approved</option><option value="waiting_list" ${application.allocation_status === 'waiting_list' ? 'selected' : ''}>Waiting list</option><option value="rejected" ${application.allocation_status === 'rejected' ? 'selected' : ''}>Rejected</option></select></td>
                <td><button type="button" class="button primary small" data-save-allocation>Save decision</button><p data-decision-message role="status"></p></td></tr>`;
            }).join('')}</tbody></table></div>`;
          root.querySelectorAll('tbody tr').forEach(row => {
            const blockSelect = row.querySelector('[data-change-block]');
            const roomSelect = row.querySelector('[data-change-room]');
            blockSelect.addEventListener('change', () => {
              const block = blocks.find(item => Number(item.id) === Number(blockSelect.value));
              roomSelect.innerHTML = '<option value="">Select room</option>' + (block?.room_numbers || []).map(room => `<option value="${esc(room)}">${esc(room)}</option>`).join('');
            });
            row.querySelector('[data-save-allocation]').addEventListener('click', async event => {
              const button = event.currentTarget;
              const feedback = row.querySelector('[data-decision-message]');
              const blockValue = blockSelect.value;
              const decision = row.querySelector('[data-change-status]').value;
              const room = roomSelect.value || null;
              if (decision === 'allocated' && (!blockValue || !room)) {
                feedback.textContent = 'Choose a dormitory and room before approving.';
                return;
              }
              button.disabled = true;
              const { error } = await client.from('boarding_applications').update({
                allocated_block_id: blockValue ? Number(blockValue) : null,
                room_number: decision === 'allocated' ? room : null,
                allocation_status: decision,
                updated_at: new Date().toISOString()
              }).eq('id', row.dataset.application);
              button.disabled = false;
              feedback.textContent = error ? `Could not save decision: ${error.message}` : 'Decision saved successfully.';
              if (!error) await load();
            });
          });
        }
        panel.querySelectorAll('[data-filter-name], [data-filter-grade], [data-filter-class]').forEach(input => input.addEventListener('input', renderApplications));
        panel.querySelector('[data-filter-block]').addEventListener('change', renderApplications);
        await load();
      })().finally(() => { adminSetupPromise = null; });
      return adminSetupPromise;
    }

    const observer = new MutationObserver(() => {
      addStudentPrompt();
      const workspace = document.querySelector('#studentWorkspace');
      if (workspace && !workspace.classList.contains('hidden')) addStudentBoardingSection(false);
      addAdminBoardingTools();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addStudentPrompt();
    addAdminBoardingTools();
  });
})();
