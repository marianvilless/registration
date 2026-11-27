/* Boarding registration and admin allocation tools. */
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
    if (!application) return '';
    if (application.allocation_status === 'allocated') {
      const dorm = application.block_name || 'dormitory pending confirmation';
      const room = application.room_number ? `, Room ${application.room_number}` : ', room pending confirmation';
      return `Approved — you are assigned to ${dorm}${room}.`;
    }
    if (application.allocation_status === 'waiting_list') return 'Your boarding application is on the waiting list. The school will contact you when space becomes available.';
    if (application.allocation_status === 'rejected') return 'Your boarding application was not approved. Please contact the school office if you have questions.';
    return 'Your application has been received and is awaiting a boarding decision.';
  };

  waitForClient(client => {
    let studentSectionAdded = false;

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
        await addStudentBoardingSection();
        document.querySelector('#boardingSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    async function addStudentBoardingSection() {
      if (studentSectionAdded) {
        document.querySelector('#boardingSection')?.classList.remove('hidden');
        return;
      }
      const workspace = document.querySelector('#studentWorkspace');
      if (!workspace) return;
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      studentSectionAdded = true;
      const section = document.createElement('section');
      section.dataset.boardingSection = 'true';
      section.id = 'boardingSection';
      section.className = 'panel';
      section.innerHTML = `<h2>Boarding registration</h2>
        <p class="hint">Apply for a dormitory place and upload evidence of school fee payment.</p>
        <div class="notice" data-boarding-status role="status" hidden></div>
        <form id="boardingForm"><div class="form-grid">
          <label>Student name<input name="student_name" required></label>
          <label>Grade<select name="grade" required><option value="">Select grade</option><option>9</option><option>10</option><option>11</option><option>12</option></select></label>
          <label>Class<input name="class" required placeholder="e.g. 9A"></label>
          <label>School fee payment amount (PGK)<input name="fee_amount" type="number" min="0" step="0.01" required></label>
          <label>School fee payment receipt<input name="fee_receipt" type="file" accept="image/jpeg,image/png,application/pdf"></label>
        </div><button type="submit" class="button primary">Submit boarding application</button><p data-boarding-message role="status"></p></form>`;
      workspace.append(section);

      const form = section.querySelector('#boardingForm');
      const message = section.querySelector('[data-boarding-message]');
      const status = section.querySelector('[data-boarding-status]');
      const studentId = session.user.email?.split('@')[0] || '';

      async function loadApplication() {
        const { data, error } = await client.from('boarding_applications')
          .select('*,dormitory_blocks(name)').eq('user_id', session.user.id).maybeSingle();
        if (error) {
          message.textContent = 'Could not load your saved boarding application. Please try again.';
          console.error(error);
          return null;
        }
        if (!data) return null;
        form.elements.student_name.value = data.student_name || '';
        form.elements.grade.value = data.grade || '';
        form.elements.class.value = data.class || '';
        form.elements.fee_amount.value = data.fee_amount ?? '';
        const display = { ...data, block_name: data.dormitory_blocks?.name };
        status.textContent = statusText(display);
        status.hidden = false;
        return data;
      }
      await loadApplication();

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = event.submitter;
        submit.disabled = true;
        message.textContent = 'Submitting application…';
        let newlyUploadedPath = null;
        try {
          const { data: existing, error: existingError } = await client.from('boarding_applications')
            .select('fee_receipt_path').eq('user_id', session.user.id).maybeSingle();
          if (existingError) throw existingError;
          let receiptPath = existing?.fee_receipt_path || null;
          const file = form.elements.fee_receipt.files[0];
          if (file) {
            if (file.size > 5242880) throw new Error('The receipt must be smaller than 5 MB.');
            if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) throw new Error('The receipt must be JPG, PNG, or PDF.');
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            newlyUploadedPath = `${session.user.id}/${Date.now()}-${safeName}`;
            const { error } = await client.storage.from('boarding-fees').upload(newlyUploadedPath, file, { contentType: file.type, upsert: false });
            if (error) throw error;
            receiptPath = newlyUploadedPath;
          }
          if (!receiptPath) throw new Error('Please upload a school fee payment receipt.');

          const payload = {
            user_id: session.user.id,
            student_id: studentId,
            student_name: form.elements.student_name.value.trim(),
            grade: form.elements.grade.value.trim(),
            class: form.elements.class.value.trim(),
            fee_amount: Number(form.elements.fee_amount.value),
            fee_receipt_path: receiptPath,
            updated_at: new Date().toISOString()
          };
          const { error } = await client.from('boarding_applications').upsert(payload, { onConflict: 'user_id' });
          if (error) throw error;
          if (file && existing?.fee_receipt_path) await client.storage.from('boarding-fees').remove([existing.fee_receipt_path]);
          message.textContent = 'Your boarding application was submitted successfully.';
          await loadApplication();
        } catch (error) {
          if (newlyUploadedPath) await client.storage.from('boarding-fees').remove([newlyUploadedPath]);
          console.error('Could not submit boarding application', error);
          message.textContent = error.message || 'Could not submit the boarding application.';
        } finally {
          submit.disabled = false;
        }
      });
    }

    async function addAdminBoardingTools() {
      const workspace = document.querySelector('#adminWorkspace');
      if (!workspace || workspace.querySelector('[data-boarding-admin]') || !workspace.querySelector('table')) return;
      const { data: { session } } = await client.auth.getSession();
      if (session?.user?.app_metadata?.role !== 'admin') return;

      const panel = document.createElement('section');
      panel.dataset.boardingAdmin = 'true';
      panel.className = 'panel';
      panel.style.margin = '18px 0';
      panel.innerHTML = `<h3>Boarding allocation</h3>
        <div class="form-grid">
          <label>Student name<input data-filter-name></label><label>Grade<input data-filter-grade></label>
          <label>Class<input data-filter-class></label><label>Block<select data-filter-block><option value="">All blocks</option></select></label>
        </div><div id="blockSettings"></div><div id="boardingDatabase"><p>Loading boarding applications…</p></div>`;
      workspace.insertBefore(panel, workspace.querySelector('table')?.closest('.table-wrap') || workspace.lastElementChild);

      let blocks = [];
      let applications = [];
      async function load() {
        const [blockResult, applicationResult] = await Promise.all([
          client.from('dormitory_blocks').select('*').order('name'),
          client.from('boarding_applications').select('*').order('submitted_at', { ascending: false })
        ]);
        if (blockResult.error || applicationResult.error) {
          panel.querySelector('#boardingDatabase').textContent = 'Could not load boarding data. Check the Supabase SQL setup and admin access policies.';
          console.error(blockResult.error || applicationResult.error);
          return;
        }
        blocks = blockResult.data || [];
        applications = applicationResult.data || [];
        renderBlocks();
        renderApplications();
      }

      function renderBlocks() {
        const root = panel.querySelector('#blockSettings');
        root.innerHTML = '<h4>Dormitory blocks</h4><div class="form-grid" data-block-rows></div><button type="button" class="button outline" data-add-block>Add block</button>';
        const rows = root.querySelector('[data-block-rows]');
        for (const block of blocks) {
          const card = document.createElement('div');
          card.className = 'panel';
          card.innerHTML = `<label>Block name<input data-block-name value="${esc(block.name)}"></label>
            <label>Space limit<input data-block-limit type="number" min="0" value="${Number(block.space_limit) || 0}"></label>
            <label>Room numbers (comma separated)<input data-block-rooms value="${esc((block.room_numbers || []).join(', '))}"></label>
            <button type="button" class="button primary small" data-save-block>Save block</button>`;
          card.querySelector('[data-save-block]').addEventListener('click', async () => {
            const roomNumbers = [...new Set(card.querySelector('[data-block-rooms]').value.split(',').map(value => value.trim()).filter(Boolean))];
            const { error } = await client.from('dormitory_blocks').update({
              name: card.querySelector('[data-block-name]').value.trim(),
              space_limit: Number(card.querySelector('[data-block-limit]').value) || 0,
              room_numbers: roomNumbers,
              updated_at: new Date().toISOString()
            }).eq('id', block.id);
            if (error) alert(error.message); else await load();
          });
          rows.append(card);
        }
        root.querySelector('[data-add-block]').addEventListener('click', async () => {
          const name = prompt('New block name');
          if (!name?.trim()) return;
          const { error } = await client.from('dormitory_blocks').insert({
            name: name.trim(), space_limit: 0, room_numbers: Array.from({ length: 13 }, (_, index) => String(index + 1))
          });
          if (error) alert(error.message); else await load();
        });
      }

      function renderApplications() {
        const nameFilter = panel.querySelector('[data-filter-name]').value.toLowerCase();
        const gradeFilter = panel.querySelector('[data-filter-grade]').value.toLowerCase();
        const classFilter = panel.querySelector('[data-filter-class]').value.toLowerCase();
        const blockFilter = panel.querySelector('[data-filter-block]');
        const selectedBlock = blockFilter.value;
        blockFilter.innerHTML = '<option value="">All blocks</option>' + blocks.map(block => `<option value="${block.id}" ${String(block.id) === selectedBlock ? 'selected' : ''}>${esc(block.name)}</option>`).join('');
        const filtered = applications.filter(application => {
          const block = blocks.find(item => Number(item.id) === Number(application.allocated_block_id));
          return (!nameFilter || application.student_name?.toLowerCase().includes(nameFilter)) &&
            (!gradeFilter || application.grade?.toLowerCase().includes(gradeFilter)) &&
            (!classFilter || application.class?.toLowerCase().includes(classFilter)) &&
            (!selectedBlock || Number(block?.id) === Number(selectedBlock));
        });

        const root = panel.querySelector('#boardingDatabase');
        root.innerHTML = `<h4>Boarding applications · ${filtered.length}</h4>
          <div class="table-wrap"><table><thead><tr><th>Student</th><th>Grade</th><th>Class</th><th>Fee</th><th>Block</th><th>Room</th><th>Decision</th><th></th></tr></thead>
          <tbody>${filtered.map(application => {
            const block = blocks.find(item => Number(item.id) === Number(application.allocated_block_id));
            const rooms = block?.room_numbers || [];
            return `<tr data-application="${esc(application.id)}">
              <td>${esc(application.student_name || application.student_id)}</td><td>${esc(application.grade || '—')}</td><td>${esc(application.class || '—')}</td>
              <td>${application.fee_amount == null ? '—' : `PGK ${Number(application.fee_amount).toFixed(2)}`}<br>${application.fee_receipt_path ? 'Receipt uploaded' : 'Receipt missing'}</td>
              <td><select data-change-block><option value="">No dormitory</option>${blocks.map(item => `<option value="${item.id}" ${Number(item.id) === Number(application.allocated_block_id) ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></td>
              <td><select data-change-room><option value="">Select room</option>${rooms.map(room => `<option value="${esc(room)}" ${room === application.room_number ? 'selected' : ''}>${esc(room)}</option>`).join('')}</select></td>
              <td><select data-change-status><option value="pending" ${application.allocation_status === 'pending' ? 'selected' : ''}>Pending review</option><option value="allocated" ${application.allocation_status === 'allocated' ? 'selected' : ''}>Approved</option><option value="waiting_list" ${application.allocation_status === 'waiting_list' ? 'selected' : ''}>Waiting list</option><option value="rejected" ${application.allocation_status === 'rejected' ? 'selected' : ''}>Rejected</option></select></td>
              <td><button type="button" class="button primary small" data-save-allocation>Save decision</button></td></tr>`;
          }).join('')}</tbody></table></div>`;

        root.querySelectorAll('tbody tr').forEach(row => {
          const blockSelect = row.querySelector('[data-change-block]');
          const roomSelect = row.querySelector('[data-change-room]');
          blockSelect.addEventListener('change', () => {
            const block = blocks.find(item => Number(item.id) === Number(blockSelect.value));
            roomSelect.innerHTML = '<option value="">Select room</option>' + (block?.room_numbers || []).map(room => `<option value="${esc(room)}">${esc(room)}</option>`).join('');
          });
          row.querySelector('[data-save-allocation]').addEventListener('click', async () => {
            const blockValue = blockSelect.value;
            const room = roomSelect.value || null;
            const decision = row.querySelector('[data-change-status]').value;
            if (decision === 'allocated' && (!blockValue || !room)) {
              alert('Choose a dormitory and room before approving this application.');
              return;
            }
            const { error } = await client.from('boarding_applications').update({
              allocated_block_id: blockValue ? Number(blockValue) : null,
              room_number: decision === 'allocated' ? room : null,
              allocation_status: decision,
              updated_at: new Date().toISOString()
            }).eq('id', row.dataset.application);
            if (error) alert(error.message); else await load();
          });
        });
      }

      panel.querySelectorAll('[data-filter-name], [data-filter-grade], [data-filter-class]').forEach(input => input.addEventListener('input', renderApplications));
      panel.querySelector('[data-filter-block]').addEventListener('change', renderApplications);
      await load();
    }

    const observer = new MutationObserver(() => {
      addStudentPrompt();
      addAdminBoardingTools();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addStudentPrompt();
    addAdminBoardingTools();
  });
})();
