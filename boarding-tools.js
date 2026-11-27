/* Boarding portal UI and admin block allocation. */
(() => {
  const waitForClient = callback => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.supabase && typeof window.supabase.from === 'function') {
        clearInterval(timer); callback(window.supabase);
      } else if (Date.now() - started > 15000) clearInterval(timer);
    }, 100);
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }

  waitForClient(client => {
    const observer = new MutationObserver(() => {
      addStudentPrompt(); addStudentBoardingSection(); addAdminBoardingTools();
    });
    observer.observe(document.body,{childList:true,subtree:true});

    function addStudentPrompt() {
      const message = document.querySelector('#saveMessage');
      const form = document.querySelector('#registrationForm');
      if (!message || !form || form.querySelector('[data-boarding-prompt]')) return;
      if (!message.textContent.toLower().includes('saved successfully')) return;
      const prompt = document.createElement('div');
      prompt.dataset.boardingPrompt='true'; prompt.className='notice';
      prompt.innerHTML=`<strong>Would you like to apply for boarding space?</strong><div class="actions"><button type="button" class="button primary" data-open-boarding>Apply for boarding</button></div>`;
      form.append(prompt);
      prompt.querySelector('[data-open-boarding]').addEventListener('click',()=>{
        document.querySelector('#boardingSection')?.scrollIntoView({behavior:'smooth',block:'start'});
      });
    }

    async function addStudentBoardingSection() {
      const workspace = document.querySelector('#studentWorkspace');
      if (!workspace || workspace.querySelector('[data-boarding-section]')) return;
      const sessionResult = await client.auth.getSession();
      const session=sessionResult.data?.session;
      if (!session) return;

      const section=document.createElement('section'); section.dataset.boardingSection='true'; section.id='boardingSection'; section.className='panel';
      section.innerHTML=`<h2>Boarding registration</h2><p class="hint">Apply for a dormitory place and upload evidence of school fee payment.</p>
        <form id="boardingForm">
          <div class="form-grid">
            <label>Student name<input name="student_name" required></label>
            <label>Grade<input name="grade" required placeholder="e.g. 9"></label>
            <label>Class<input name="class" required placeholder="e.g. 9A"></label>
            <label>School fee payment amount (PGK)<input name="fee_amount" type="number" min="0" step="0.01" required></label>
            <label>School fee payment receipt<input name="fee_receipt" type="file" accept="image/jpeg,image/png,application/pdf" required></label>
          </div>
          <button type="submit" class="button primary">Submit boarding application</button><p id="boardingMessage" role="status"></p>
        </form>`;
      workspace.append(section);

      const form=section.querySelector('#boardingForm');
      const studentId=session.user.email?.split('@')[0]||'';
      const {data}=await client.from('boarding_applications').select('*').eq('user_id',session.user.id).maybeSingle();
      if(data){
        form.student_name.value=data.student_name||''; form.elements.grade.value=data.grade||''; form.elements.class.value=data.class||''; form.elements.fee_amount.value=data.fee_amount||'';
        section.querySelector('#boardingMessage').textContent=data.allocated_block_id?'Your boarding application has been allocated.':'Your boarding application is pending allocation.';
      }
      form.addEventListener('submit',async event=>{
        event.preventDefault(); const submit=event.submitter; submit.disabled=true;
        const message=section.querySelector('#boardingMessage'); message.textContent='Submitting application…';
        try{
          const file=form.elements.fee_receipt.files[0];
          let receiptPath=null;
          if(file){
            if(file.size>5242880) throw new Error('The receipt must be smaller than 5 MB.');
            const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
            const path=`${session.user.id}/${Date.now()}-${safeName}`;
            const {error}=await client.storage.from('boarding-fees').upload(path,file,{contentType:file.type,upsert:false});
            if(error) throw error; receiptPath=path;
          }
          const payload={user_id:session.user.id,student_id:studentId,student_name:form.elements.student_name.value.trim(),grade:form.elements.grade.value.trim(),class:form.elements.class.value.trim(),fee_amount:Number(form.elements.fee_amount.value),fee_receipt_path:receiptPath,updated_at:new Date().toISOString()};
          const {error}=await client.from('boarding_applications').upsert(payload,{onConflict:'user_id'}); if(error) throw error;
          message.textContent='Your boarding application was submitted successfully.';
        }catch(error){message.textContent=error.message||'Could not submit the boarding application.';}finally{submit.disabled=false;}
      });
    }

    async function addAdminBoardingTools() {
      const workspace=document.querySelector('#adminWorkspace');
      if(!workspace||workspace.querySelector('[data-boarding-admin]')) return;
      if(!workspace.querySelector('table')) return;

      const sessionResult=await client.auth.getSession();
      const role=sessionResult.data?.session?.user?.app_metadata?.role;
      if(role!=='admin') return;

      const panel=document.createElement('section'); panel.dataset.boardingAdmin='true'; panel.className='panel'; panel.style.margin='18px 0';
      panel.innerHTML=`<h3>Boarding allocation settings</h3><div id="boardingFilters" class="form-grid"><label>Student name<input data-filter-name></label><label>Grade<input data-filter-grade></label><label>Class<input data-filter-class></label><label>Block<select data-filter-block><option value="">All blocks</option></select></label></div><div id="blockSettings"></div><div id="boardingDatabase"><p>Loading boarding applications…</p></div>`;
      workspace.insertBefore(panel,workspace.querySelector('table')?.closest('.table-wrap')||workspace.lastElementChild);

      let blocks=[],applications=[];
      async function load(){
        const [blockResult,applicationResult]=await Promise.all([
          client.from('dormitory_blocks').select('*').order('name'),
          client.from('boarding_applications').select('*').order('submitted_at',{ascending:false})
        ]);
        if(blockResult.error||applicationResult.error){panel.querySelector('#boardingDatabase').textContent='Could not load boarding data. Run the updated Supabase SQL.';return;}
        blocks=blockResult.data||[]; applications=applicationResult.data||[];
        renderBlocks(); renderApplications();
      }

      function renderBlocks(){
        const root=panel.querySelector('#blockSettings');
        root.innerHTML=`<h4>Dormitory blocks</h4><div class="form-grid" id="blockRows"></div><button type="button" class="button outline" data-add-block>Add block</button>`;
        const rows=root.querySelector('#blockRows');
        for(const block of blocks){
          const el=document.createElement('div'); el.className='panel';
          el.innerHTML=`<label>Block name<input data-block-name value="${esc(block.name)}"></label><label>Space limit<input data-block-limit type="number" min="0" value="${block.space_limit}"></label><label>Room numbers (comma separated)<input data-block-rooms value="${esc((block.room_numbers||[]).join(', '))}"></label><button type="button" class="button primary small" data-save-block>Save block</button>`;
          el.querySelector('[data-save-block]').addEventListener('click',async()=>{
            const roomNumbers=el.querySelector('[data-block-rooms]').value.split(',').map(v=>v.trim()).filter(Boolean);
            const {error}=await client.from('dormitory_blocks').update({name:el.querySelector('[data-block-name]').value.trim(),space_limit:Number(el.querySelector('[data-block-limit]').value)||0,room_numbers:roomNumbers,updated_at:new Date().toISOString()}).eq('id',block.id);
            if(error) alert(error.message); else load();
          }); rows.append(el);
        }
        root.querySelector('[data-add-block]').addEventListener('click',async()=>{
          const name=prompt('New block name'); if(!name)return;
          const {error}=await client.from('dormitory_blocks').insert({name:name.trim(),space_limit:0,room_numbers:Array.from({length:13},(_,i)=>String(i+1))}); if(error)alert(error.message); else load();
        });
      }

      function renderApplications(){
        const filterName=panel.querySelector('[data-filter-name]').value?.toLowerCase()||'';
        const filterGrade=panel.querySelector('[data-filter-grade]').value?.toLowerCase()||'';
        const filterClass=panel.querySelector('[data-filter-class]').value?.toLowerCase()||'';
        const filterBlock=panel.querySelector('[data-filter-block]').value||'';
        const select=panel.querySelector('[data-filter-block]');
        select.innerHTML='<option value="">All blocks</option>'+blocks.map(b=>`<option value="${b.id}" ${String(b.id)===filterBlock?'selected':''}>${esc(b.name)}</option>`).join('');

        const filtered=applications.filter(a=>{
          const block=blocks.find(b=>b.id===a.allocated_block_id);
          return (!filterName||a.student_name?.toLowerCase().includes(filterName))&&(!filterGrade||a.grade?.toLowerCase().includes(filterGrade))&&(!filterClass||a.class?.toLowerCase().includes(filterClass))&&(!filterBlock||block?.id===Number(filterBlock));
        });
        const root=panel.querySelector('#boardingDatabase');
        root.innerHTML=`<h4>Boarding database · ${filtered.length} application(s)</h4><div class="table-wrap"><table><thead><tr><th>Student</th><th>Grade</th><th>Class</th><th>Fee</th><th>Receipt</th><th>Block</th><th>Room</th><th></th></tr></thead><tbody>${filtered.map(a=>`<tr><td>${esc(a.student_name||a.student_id)}</td><td>${esc(a.grade||'—')}</td><td>${esc(a.class||'—')}</td><td>${esc(a.fee_amount==null?'—':`PGK ${Number(a.fee_amount).toFixed(2)}`)}</td><td>${a.fee_receipt_path?'Uploaded':'—'}</td><td><select data-change-block>${blocks.map(b=>`<option value="${b.id}" ${b.id===a.allocated_block_id?'selected':''}>${esc(b.name)}</option>`).join('')}<option value="" ${!a.allocated_block_id?'selected':''}>Unallocated</option></select></td><td><select data-change-room><option value="">Select room</option>${((blocks.find(b=>b.id===a.allocated_block_id)?.room_numbers)||[]).map(r=>`<option ${r===a.room_number?'selected':''}>${esc(r)}</option>`).join('')}</select></td><td><button type="button" class="button outline small" data-save-allocation>Save</button></td></tr>`).join('')}</tbody></table></div>`;
        root.querySelectorAll('[data-save-allocation]').forEach((button,index)=>button.addEventListener('click',async()=>{
          const row=button.closest('tr'),app=filtered[index];
          const blockValue=row.querySelector('[data-change-block]').value;
          const room=row.querySelector('[data-change-room]').value||null;
          const {error}=await client.from('boarding_applications').update({allocated_block_id:blockValue?Number(blockValue):null,room_number:room,allocation_status:blockValue?'allocated':'pending',updated_at:new Date().toISOString()}).eq('id',app.id);
          if(error)alert(error.message); else load();
        });
      }

      panel.querySelectorAll('[data-filter-name],[data-filter-grade],[data-filter-class],[data-filter-block]').forEach(input=>input.addEventListener('input',renderApplications));
      panel.querySelector('[data-filter-block]').addEventListener('change',renderApplications);
      await load();
    }

    addStudentPrompt(); addStudentBoardingSection(); addAdminBoardingTools();
  });
})();
