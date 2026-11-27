/* Secure prior-school certificate uploads for grades 9 and 11. */
(() => {
  const waitForClient = callback => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.supabase?.from) {
        clearInterval(timer);
        callback(window.supabase);
      } else if (Date.now() - started > 15000) clearInterval(timer);
    }, 100);
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  waitForClient(client => {
    let activeUserId = null;

    function currentGrade(form) {
      const field = form.querySelector('[name="grade"]') || form.querySelector('[name="gradeCompleted"]');
      return String(field?.value || '').trim().match(/9|11/)?.[0] || '';
    }

    async function addDocumentFields() {
      const form = document.querySelector('#registrationForm');
      if (!form || form.querySelector('[data-school-documents]')) return;
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;
      activeUserId = session.user.id;

      const section = document.createElement('fieldset');
      section.dataset.schoolDocuments = 'true';
      section.innerHTML = `<legend>Previous school certificates</legend>
        <p class="hint">Grade 9 students upload their Grade 8 certificate and selection certificate. Grade 11 students upload their Grade 10 certificate and selection certificate. Accepted: PDF, JPG or PNG, up to 5 MB each.</p>
        <div class="form-grid">
          <label data-certificate-label>Previous grade certificate<input data-certificate-file type="file" accept="application/pdf,image/jpeg,image/png"></label>
          <label>Selection certificate<input data-selection-file type="file" accept="application/pdf,image/jpeg,image/png"></label>
        </div>
        <p data-document-current class="hint"></p>
        <button type="button" class="button outline" data-save-documents>Save certificates</button>
        <p data-document-message role="status" aria-live="polite"></p>`;
      form.append(section);

      const label = section.querySelector('[data-certificate-label]');
      const updateLabel = () => {
        const grade = currentGrade(form);
        const previousGrade = grade === '9' ? 'Grade 8' : grade === '11' ? 'Grade 10' : '';
        label.firstChild.textContent = previousGrade ? `${previousGrade} certificate` : 'Previous grade certificate';
        section.querySelector('[data-document-message]').textContent = grade && !['9', '11'].includes(grade)
          ? 'Certificate uploads are currently requested for students entering Grade 9 or Grade 11.' : '';
      };
      form.addEventListener('change', event => {
        if (event.target.matches('[name="grade"], [name="gradeCompleted"]')) updateLabel();
      });
      updateLabel();

      const current = section.querySelector('[data-document-current]');
      const message = section.querySelector('[data-document-message]');
      const { data: saved, error: readError } = await client.from('registration_documents')
        .select('grade_level,certificate_path,selection_path').eq('user_id', session.user.id).maybeSingle();
      if (readError) {
        message.textContent = 'Certificate storage is not set up yet. Contact the school office.';
      } else if (saved) {
        current.textContent = `Saved documents for Grade ${saved.grade_level}: ${saved.certificate_path ? 'previous grade certificate' : ''}${saved.certificate_path && saved.selection_path ? ' and ' : ''}${saved.selection_path ? 'selection certificate' : ''}. Choose new files to replace them.`;
      }

      section.querySelector('[data-save-documents]').addEventListener('click', async event => {
        const button = event.currentTarget;
        const grade = currentGrade(form);
        const uploadFields = ['[data-certificate-file]', '[data-selection-file]'];
        const files = uploadFields.map(selector => section.querySelector(selector).files[0] || null);
        if (!['9', '11'].includes(grade)) {
          message.textContent = 'Enter or select Grade 9 or Grade 11 in the registration form before saving these certificates.';
          return;
        }
        if (!files.some(Boolean) && !saved) {
          message.textContent = 'Choose at least one certificate to upload.';
          return;
        }
        button.disabled = true;
        message.textContent = 'Uploading certificates securely…';
        const uploaded = [];
        try {
          const paths = { certificate_path: saved?.certificate_path || null, selection_path: saved?.selection_path || null };
          for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            if (!file) continue;
            if (file.size > 5 * 1024 * 1024) throw new Error('Each certificate must be 5 MB or smaller.');
            if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error('Certificates must be PDF, JPG or PNG files.');
            const path = `${session.user.id}/${Date.now()}-${index}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const { error } = await client.storage.from('student-certificates').upload(path, file, { contentType: file.type, upsert: false });
            if (error) throw error;
            uploaded.push(path);
            paths[index === 0 ? 'certificate_path' : 'selection_path'] = path;
          }
          const { error } = await client.from('registration_documents').upsert({
            user_id: session.user.id,
            grade_level: Number(grade),
            ...paths,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
          if (error) throw error;
          const replaced = [];
          if (files[0] && saved?.certificate_path) replaced.push(saved.certificate_path);
          if (files[1] && saved?.selection_path) replaced.push(saved.selection_path);
          if (replaced.length) await client.storage.from('student-certificates').remove(replaced);
          message.textContent = 'Your certificates have been saved successfully.';
          current.textContent = `Saved documents for Grade ${grade}: ${paths.certificate_path ? 'previous grade certificate' : ''}${paths.certificate_path && paths.selection_path ? ' and ' : ''}${paths.selection_path ? 'selection certificate' : ''}.`;
        } catch (error) {
          if (uploaded.length) await client.storage.from('student-certificates').remove(uploaded);
          console.error('Certificate upload failed', error);
          message.textContent = error.message || 'Could not save your certificates.';
        } finally {
          button.disabled = false;
        }
      });
    }

    const observer = new MutationObserver(() => addDocumentFields());
    observer.observe(document.body, { childList: true, subtree: true });
    addDocumentFields();
  });
})();
