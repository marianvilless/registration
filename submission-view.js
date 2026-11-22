/* Replace the existing admin detail panel renderer with a transient, standalone
   document. The document exists only in the administrator's browser tab; nothing
   is written to storage or sent to a PDF service. */
(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const hasValue = value => value !== '' && value !== false && value != null &&
    (!Array.isArray(value) || value.length > 0);

  function formatValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (value === true) return 'Agreed';
    return String(value);
  }

  function renderSubmission(record, receiptUrl) {
    const formData = record.form_data || {};
    const knownFields = new Set();
    const sections = FORM_SECTIONS.map(section => {
      const rows = section.fields.flatMap(([key, label]) => {
        if (key === 'receipt') return [];
        knownFields.add(key);
        const value = formData[key];
        if (!hasValue(value)) return [];
        return [`<div class="field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatValue(value))}</dd></div>`];
      });
      return rows.length ? `<section class="group"><h2>${escapeHtml(section.title)}</h2><dl>${rows.join('')}</dl></section>` : '';
    }).join('');

    const otherRows = Object.entries(formData).flatMap(([key, value]) => {
      if (knownFields.has(key) || !hasValue(value)) return [];
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
      return [`<div class="field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatValue(value))}</dd></div>`];
    });
    const otherSection = otherRows.length
      ? `<section class="group"><h2>Additional information</h2><dl>${otherRows.join('')}</dl></section>` : '';
    const receiptSection = record.receipt_path
      ? `<section class="group receipt"><h2>School fee receipt</h2><p><a href="${escapeHtml(receiptUrl || '#')}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${receiptUrl ? 'Open uploaded receipt (temporary secure link)' : 'Receipt link unavailable'}</a></p><p class="note">This private link expires after five minutes. The receipt is not embedded in this page.</p></section>`
      : `<section class="group receipt"><h2>School fee receipt</h2><p>Not uploaded</p></section>`;
    const name = record.student_name || [formData.givenName, formData.surname].filter(Boolean).join(' ') || record.student_id || 'Student submission';
    const updated = record.updated_at ? new Date(record.updated_at).toLocaleString() : '';

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)} — Student submission</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f4f1ed;color:#26232a;font:16px/1.55 Arial,sans-serif}.toolbar{max-width:900px;margin:24px auto 12px;display:flex;justify-content:space-between;align-items:center;gap:12px}.toolbar button{border:0;border-radius:6px;padding:12px 18px;background:#681d35;color:white;font:600 15px Arial,sans-serif;cursor:pointer}.toolbar a{color:#681d35}.sheet{max-width:900px;margin:0 auto 36px;padding:44px 52px;background:#fff;box-shadow:0 4px 24px #251b1b18}.school{color:#681d35;font-size:12px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase}.heading{border-bottom:2px solid #e4b34f;padding:0 0 22px;margin-bottom:26px}.heading h1{margin:7px 0 2px;font:700 30px/1.2 Georgia,serif}.heading p{margin:4px 0;color:#716d70}.group{margin:26px 0;break-inside:avoid}.group h2{margin:0 0 12px;padding-bottom:7px;border-bottom:1px solid #e9e2dd;color:#681d35;font:700 18px Georgia,serif}.group dl{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 22px}.field{min-width:0;break-inside:avoid}.field dt{margin-bottom:2px;color:#716d70;font-size:12px}.field dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}.receipt a{color:#681d35;overflow-wrap:anywhere}.note{font-size:12px;color:#716d70}.footer{border-top:1px solid #e9e2dd;padding-top:14px;color:#716d70;font-size:12px}.empty{color:#716d70}@media(max-width:640px){.toolbar{margin:14px;padding:0 4px}.sheet{margin:0;padding:26px 20px;box-shadow:none}.group dl{grid-template-columns:1fr}.heading h1{font-size:25px}}@media print{@page{size:auto;margin:16mm}body{background:#fff;font-size:11pt}.toolbar{display:none!important}.sheet{max-width:none;margin:0;padding:0;box-shadow:none}.heading{padding-bottom:14px}.heading h1{font-size:24pt}.group{margin:18px 0;break-inside:avoid}.group h2{font-size:14pt}.field dt{font-size:9pt}.footer{margin-top:24px}.receipt a{color:#26232a;text-decoration:none}}
      </style></head><body><div class="toolbar"><a href="javascript:window.close()">← Close submission</a><button type="button" onclick="window.print()">Print / Save as PDF</button></div><main class="sheet"><header class="heading"><div class="school">Marianville Secondary School · Confidential student record</div><h1>${escapeHtml(name)}</h1><p>Student ID: ${escapeHtml(record.student_id || '—')}</p>${updated ? `<p>Last updated: ${escapeHtml(updated)}</p>` : ''}</header>${sections || '<p class="empty">No submission details have been entered.</p>'}${otherSection}${receiptSection}<footer class="footer">Confidential — for authorized school staff only.</footer></main></body></html>`;
  }

  window.viewRecord = async record => {
    // Open synchronously from the administrator's click so popup blockers allow it.
    const page = window.open('', '_blank');
    if (!page) {
      alert('Allow pop-ups for this site to open the submission in a new tab.');
      return;
    }
    page.document.open();
    page.document.write('<!doctype html><title>Loading submission…</title><p style="font:16px Arial,sans-serif;padding:24px">Loading secure student submission…</p>');
    page.document.close();
    page.opener = null;

    let receiptUrl = '';
    try {
      if (record.receipt_path) {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(record.receipt_path, 300);
        if (!error) receiptUrl = data?.signedUrl || '';
      }
      if (page.closed) return;
      page.document.open();
      page.document.write(renderSubmission(record, receiptUrl));
      page.document.close();
      page.focus();
    } catch (error) {
      console.error('Could not open student submission', error);
      if (!page.closed) {
        page.document.open();
        page.document.write('<!doctype html><title>Submission unavailable</title><p style="font:16px Arial,sans-serif;padding:24px">Could not open this submission. Close this tab and try again.</p>');
        page.document.close();
      }
    }
  };
})();
