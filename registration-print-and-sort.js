/* Print signature lines and admin boarding list sorting. */
(() => {
  function addStudentSignatures() {
    const form = document.querySelector('#registrationForm');
    if (!form) return;

    let signatures = form.querySelector('[data-print-signatures]');
    if (!signatures) {
      signatures = document.createElement('fieldset');
      signatures.dataset.printSignatures = 'true';
      signatures.className = 'print-signatures';
      signatures.innerHTML = `<legend>Signatures (to be completed in person at school)</legend>
        <p>By signing below, the student and parent/guardian confirm the information provided in this registration.</p>
        <div class="signature-grid">
          <div><div class="signature-line"></div><strong>Student signature</strong><small>Name: ____________________________________</small><small>Date: __________________</small></div>
          <div><div class="signature-line"></div><strong>Parent / guardian signature</strong><small>Name: ____________________________________</small><small>Date: __________________</small></div>
        </div>`;
    }

    // Keep this as the final section even when optional certificate fields are added.
    if (form.lastElementChild !== signatures) form.append(signatures);
  }

  function addPrintStyles() {
    if (document.querySelector('#registration-print-signature-styles')) return;
    const style = document.createElement('style');
    style.id = 'registration-print-signature-styles';
    style.textContent = `
      .print-signatures { margin-top: 2rem; break-inside: avoid; }
      .signature-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2.5rem; margin-top:1.5rem; }
      .signature-grid > div { display:flex; flex-direction:column; gap:.45rem; }
      .signature-line { height:2.5rem; border-bottom:1px solid #222; }
      .signature-grid small { display:block; }
      @media print { .print-signatures { break-inside:avoid; page-break-inside:avoid; } }
      @media(max-width:600px) { .signature-grid { grid-template-columns:1fr; } }
    `;
    document.head.append(style);
  }

  function addBoardingSortControl() {
    const panel = document.querySelector('[data-boarding-admin]');
    if (!panel || panel.querySelector('[data-boarding-sort]')) return;
    const filters = panel.querySelector('.form-grid');
    const database = panel.querySelector('#boardingDatabase');
    if (!filters || !database) return;

    const wrapper = document.createElement('label');
    wrapper.dataset.sortWrapper = 'true';
    wrapper.innerHTML = `Sort applications
      <select data-boarding-sort aria-label="Sort boarding applications">
        <option value="default">Recently submitted</option>
        <option value="grade-asc">Grade: low to high</option>
        <option value="grade-desc">Grade: high to low</option>
        <option value="class-asc">Class: A to Z</option>
        <option value="class-desc">Class: Z to A</option>
        <option value="fee-desc">School fee: highest to lowest</option>
      </select>`;
    filters.insertAdjacentElement('afterend', wrapper);
    wrapper.querySelector('[data-boarding-sort]').addEventListener('change', sortBoardingRows);
  }

  function sortBoardingRows() {
    const panel = document.querySelector('[data-boarding-admin]');
    const select = panel?.querySelector('[data-boarding-sort]');
    const body = panel?.querySelector('#boardingDatabase tbody');
    if (!select || !body) return;
    const mode = select.value;
    const currentRows = [...body.querySelectorAll('tr')];
    const sortedRows = [...currentRows].sort((a, b) => {
      const aCells = a.cells;
      const bCells = b.cells;
      if (mode === 'grade-asc' || mode === 'grade-desc') {
        const difference = Number.parseInt(aCells[1]?.textContent, 10) - Number.parseInt(bCells[1]?.textContent, 10);
        return mode === 'grade-asc' ? difference : -difference;
      }
      if (mode === 'class-asc' || mode === 'class-desc') {
        const result = (aCells[2]?.textContent || '').localeCompare(bCells[2]?.textContent || '', undefined, { numeric: true, sensitivity: 'base' });
        return mode === 'class-asc' ? result : -result;
      }
      if (mode === 'fee-desc') {
        const amount = cell => Number((cell?.textContent || '').replace(/[^\d.]/g, '')) || 0;
        return amount(bCells[3]) - amount(aCells[3]);
      }
      return 0;
    });

    // Avoid unnecessary DOM mutations (and observer loops) when already sorted.
    if (sortedRows.some((row, index) => row !== currentRows[index])) sortedRows.forEach(row => body.append(row));
  }

  addPrintStyles();
  addStudentSignatures();
  addBoardingSortControl();

  const observer = new MutationObserver(() => {
    addStudentSignatures();
    addBoardingSortControl();
    sortBoardingRows();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
