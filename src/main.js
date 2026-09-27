import { createClient } from '@supabase/supabase-js'
import './style.css'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const db = url && key && !url.includes('your-project') ? createClient(url, key) : null
const app = document.querySelector('#app')
const state = { user: null, profile: null, page: 'beranda', questions: [], answers: {}, index: 0, ends: 0, timer: null, attempt: null }
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c])
const msg = (text, bad = false) => { const el = document.querySelector('#notice'); if (el) { el.textContent = text; el.className = bad ? 'notice bad' : 'notice' } }
const button = (label, action, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`

async function init() {
  if (db) {
    const { data } = await db.auth.getUser(); state.user = data.user
    if (state.user) await loadProfile()
    db.auth.onAuthStateChange((_event, session) => { state.user = session?.user ?? null; setTimeout(async () => { if (state.user) await loadProfile(); else state.profile = null; render() }, 0) })
  }
  render()
}
async function loadProfile() {
  const { data, error } = await db.from('peserta').select('id,nama,role').eq('auth_user_id', state.user.id).single()
  if (error) { state.profile = null; return }
  state.profile = data
}
function frame(body) {
  app.innerHTML = `<header><div class="wrap head"><a class="brand" href="#beranda">Pengen Jadi Umbi<span>Latihan CPNS</span></a><nav aria-label="Navigasi utama"><a href="#beranda">Beranda</a><a href="#materi">Materi</a><a href="#jadwal">Jadwal</a>${state.user ? '<a href="#riwayat">Riwayat</a>' : ''}${state.profile?.role === 'admin' ? '<a href="#admin">Admin</a>' : ''}</nav><div>${state.user ? button('Keluar','logout','class="secondary"') : '<a class="button" href="#login">Masuk</a>'}</div></div></header><main class="wrap"><p id="notice" class="notice" role="status" aria-live="polite"></p>${body}</main><footer class="wrap">Platform latihan independen. Bukan situs resmi BKN; verifikasi informasi seleksi di sumber resmi.</footer>`
}
function render() {
  state.page = location.hash.slice(1) || 'beranda'
  if (!db) { frame(`<section class="hero"><h1>Pengen Jadi Umbi</h1><p>Aplikasi sudah siap dikonfigurasi. Hubungkan Supabase melalui variabel lingkungan Cloudflare Pages untuk mengaktifkan konten dan login.</p></section>`); return }
  if (state.page === 'login') return login()
  if (state.page === 'simulasi') return simulation()
  if (state.page === 'admin') return admin()
  if (state.page === 'materi') return materials()
  if (state.page === 'jadwal') return schedule()
  if (state.page === 'riwayat') return history()
  frame(`<section class="hero"><span class="eyebrow">Belajar lebih terarah</span><h1>Persiapan CPNS, satu langkah setiap hari.</h1><p>Latihan dari soal yang sudah ditinjau, lihat pembahasan, dan pantau kemajuan Anda.</p>${state.user ? button('Mulai latihan SKD','start-skd') + ' ' + button('Mulai latihan SKB','start-skb','class="secondary"') : '<a class="button" href="#login">Masuk untuk latihan</a>'}</section><div class="grid"><article><h2>SKD</h2><p>Latihan TWK, TIU, dan TKP dengan hasil per subtes.</p></article><article><h2>SKB</h2><p>Soal berdasarkan instansi dan formasi yang tersedia.</p></article><article><h2>Materi & jadwal</h2><p>Baca materi terkurasi dan cek tautan pengumuman resmi.</p></article></div>`)
}
function login() { frame(`<section class="panel narrow"><h1>Masuk atau daftar</h1><p>Gunakan email dan kata sandi. Periksa email untuk konfirmasi pendaftaran bila diminta.</p><form id="auth-form"><label>Nama (untuk akun baru)<input name="nama" autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Kata sandi<input name="password" type="password" required minlength="8" autocomplete="current-password"></label><div class="actions"><button name="mode" value="signin">Masuk</button><button name="mode" value="signup" class="secondary">Daftar</button></div></form></section>`) }
async function materials() {
  frame('<h1>Materi belajar</h1><p>Materi di bawah sudah ditinjau admin.</p><div id="listing" class="stack">Memuat…</div>')
  const { data, error } = await db.from('materi_publik').select('judul,konten,sub_topik,kode').order('judul').limit(50)
  const el = document.querySelector('#listing'); if (!el) return
  el.innerHTML = error ? `<p class="error">${esc(error.message)}</p>` : data.length ? data.map(m => `<article><span class="eyebrow">${esc(m.kode)} · ${esc(m.sub_topik)}</span><h2>${esc(m.judul)}</h2><p class="prose">${esc(m.konten)}</p></article>`).join('') : '<article>Belum ada materi yang disetujui.</article>'
}
async function schedule() {
  frame('<h1>Jadwal CPNS</h1><p>Selalu cocokkan tanggal dengan pengumuman resmi pada tautan sumber.</p><div id="listing" class="stack">Memuat…</div>')
  const { data, error } = await db.from('jadwal_cpns').select('judul_tahap,tanggal_mulai,tanggal_selesai,sumber_url,terakhir_disinkron').eq('terverifikasi',true).order('tanggal_mulai')
  const el = document.querySelector('#listing'); if (!el) return
  el.innerHTML = error ? `<p class="error">${esc(error.message)}</p>` : data.length ? data.map(j => `<article><h2>${esc(j.judul_tahap)}</h2><p>${esc(j.tanggal_mulai)}${j.tanggal_selesai ? ` – ${esc(j.tanggal_selesai)}` : ''}</p><a href="${esc(j.sumber_url)}" target="_blank" rel="noopener noreferrer">Lihat sumber resmi ↗</a></article>`).join('') : '<article>Belum ada jadwal yang diverifikasi admin.</article>'
}
async function history() {
  if (!state.user) return location.hash = '#login'
  frame('<h1>Riwayat latihan</h1><div id="listing" class="stack">Memuat…</div>')
  const { data, error } = await db.from('percobaan_tes').select('id,kode,status,skor_twk,skor_tiu,skor_tkp,started_at,finished_at').order('started_at',{ascending:false}).limit(30)
  const el = document.querySelector('#listing'); if (!el) return
  el.innerHTML = error ? `<p class="error">${esc(error.message)}</p>` : data.length ? data.map(a => `<article><h2>${esc(a.kode)} · ${esc(a.status)}</h2><p>${new Date(a.started_at).toLocaleString('id-ID')} · TWK ${a.skor_twk ?? 0} · TIU ${a.skor_tiu ?? 0} · TKP ${a.skor_tkp ?? 0}</p>${a.status === 'selesai' ? button('Lihat pembahasan','review',`data-id="${a.id}"`) : ''}</article>`).join('') : '<article>Belum ada latihan.</article>'
}
async function start(kode) {
  if (kode === 'SKB') { msg('Latihan SKB memerlukan pemilihan formasi. Fitur ini menyusul setelah bank soal formasi tersedia.',true); return }
  if (!state.user) return location.hash = '#login'
  const { data, error } = await db.rpc('mulai_latihan', { p_kode: kode, p_jumlah: 10 })
  if (error) return msg(error.message,true)
  state.attempt = data
  state.questions = data.soal
  state.answers = {}; state.index = 0; state.ends = Date.now() + 15 * 60 * 1000
  location.hash = '#simulasi'; simulation()
}
function simulation() {
  if (!state.attempt || !state.questions.length) { frame('<h1>Latihan</h1><p>Sesi belum dimulai. Kembali ke beranda untuk memulai.</p>'); return }
  const q = state.questions[state.index]
  const options = Object.entries(q.pilihan || {}).map(([k,v]) => `<label class="option"><input type="radio" name="answer" value="${esc(k)}" ${state.answers[q.id] === k ? 'checked' : ''}> <strong>${esc(k)}.</strong> ${esc(v)}</label>`).join('')
  frame(`<section class="panel"><div class="row"><span class="eyebrow">${esc(q.subtes)} · Soal ${state.index+1}/${state.questions.length}</span><strong id="clock" role="timer"></strong></div><h1>${esc(q.pertanyaan)}</h1><div class="options">${options}</div><div class="actions">${button('Sebelumnya','prev',state.index === 0 ? 'disabled' : '')}${button('Berikutnya','next',state.index === state.questions.length-1 ? 'disabled' : '')}${button('Selesai & nilai','finish','class="secondary"')}</div></section>`)
  clearInterval(state.timer); tick(); state.timer = setInterval(tick,1000)
}
function tick() { const el = document.querySelector('#clock'); const remaining = Math.max(0,Math.ceil((state.ends-Date.now())/1000)); if (el) el.textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`; if (!remaining) finish(true) }
async function finish(expired = false) {
  if (!state.attempt) return
  if (!expired && !confirm('Kumpulkan jawaban dan akhiri latihan?')) return
  clearInterval(state.timer)
  const id = state.attempt.percobaan_id
  state.attempt = null
  const { error } = await db.rpc('selesaikan_latihan',{ p_percobaan_id:id, p_jawaban:state.answers })
  if (error) { frame(`<p class="error">Gagal mengirim: ${esc(error.message)}</p>`); return }
  location.hash = '#riwayat'; await history(); await review(id)
}
async function review(id) {
  const { data, error } = await db.rpc('hasil_latihan',{p_percobaan_id:id})
  if (error) return msg(error.message,true)
  frame(`<h1>Hasil latihan ${esc(data.kode)}</h1><p class="scores">TWK ${data.skor_twk} · TIU ${data.skor_tiu} · TKP ${data.skor_tkp}</p><div class="stack">${data.pembahasan.map((q,i) => `<article><span class="eyebrow">${esc(q.subtes)} · ${i+1}</span><h2>${esc(q.pertanyaan)}</h2><p>Jawaban Anda: <strong>${esc(q.jawaban_dipilih || 'Kosong')}</strong></p><p>${q.subtes === 'TKP' ? `Bobot: ${esc(JSON.stringify(q.bobot_jawaban))}` : `Kunci: ${esc(q.kunci_jawaban)}`}</p><p class="prose">${esc(JSON.stringify(q.pembahasan_detail))}</p></article>`).join('')}</div>`)
}
async function admin() {
  if (state.profile?.role !== 'admin') { frame('<h1>Akses admin diperlukan</h1>'); return }
  frame(`<h1>Panel admin</h1><div class="grid"><article><h2>Unggah PDF</h2><form id="upload-form"><label>Judul<input name="judul" required></label><label>Kategori<select name="kode"><option>SKD</option></select></label><label>Jenis<select name="jenis"><option value="materi_umum">Materi umum</option><option value="uu_regulasi">Regulasi</option></select></label><label>Dokumen PDF (maks. 10 MB)<input name="pdf" type="file" accept="application/pdf" required></label><button>Unggah</button></form></article><article><h2>Dokumen sumber</h2><div id="documents">Memuat…</div></article></div><h2>Antrean review soal</h2><div id="drafts" class="stack">Memuat…</div><h2>Antrean review materi</h2><div id="materials" class="stack">Memuat…</div><h2>Job AI</h2><div id="jobs" class="stack">Memuat…</div>`)
  const [docs, qs, ms, jobs] = await Promise.all([
    db.from('dokumen_sumber').select('id,judul,kode,status_proses').order('created_at',{ascending:false}).limit(30),
    db.from('soal').select('id,pertanyaan,subtes,status_review').eq('status_review','menunggu').limit(50),
    db.from('materi').select('id,judul,konten,status_review').eq('status_review','menunggu').limit(50),
    db.from('ai_generation_job').select('id,tipe,status,error_message,github_run_id').order('created_at',{ascending:false}).limit(20)
  ])
  const docEl = document.querySelector('#documents'); if (!docEl) return
  docEl.innerHTML = docs.error ? esc(docs.error.message) : docs.data.length ? docs.data.map(d => `<div class="mini"><strong>${esc(d.judul)}</strong> · ${esc(d.kode)}<br>${button('Generate soal','generate',`data-id="${d.id}" data-type="generate_soal"`)} ${button('Generate materi','generate',`data-id="${d.id}" data-type="generate_materi"`)}</div>`).join('') : 'Belum ada dokumen.'
  for (const [elName,result,kind] of [['drafts',qs,'soal'],['materials',ms,'materi']]) {
    document.querySelector(`#${elName}`).innerHTML = result.error ? esc(result.error.message) : result.data.length ? result.data.map(item => `<article><h3>${esc(item.pertanyaan || item.judul)}</h3>${item.konten ? `<p class="prose">${esc(item.konten)}</p>` : ''}<div class="actions">${button('Setujui','moderate',`data-kind="${kind}" data-id="${item.id}" data-status="disetujui"`)}${button('Tolak','moderate',`class="secondary" data-kind="${kind}" data-id="${item.id}" data-status="ditolak"`)}</div></article>`).join('') : '<article>Antrean kosong.</article>'
  }
  document.querySelector('#jobs').innerHTML = jobs.error ? esc(jobs.error.message) : jobs.data.length ? jobs.data.map(j => `<article>${esc(j.tipe)} · <strong>${esc(j.status)}</strong> ${j.github_run_id ? `<a href="https://github.com/AhFu28/Pengen-Jadi-Umbi/actions/runs/${encodeURIComponent(j.github_run_id)}" target="_blank" rel="noopener noreferrer">Log ↗</a>` : ''}<p>${esc(j.error_message)}</p></article>`).join('') : '<article>Belum ada job.</article>'
}
async function upload(form) {
  const fd = new FormData(form); const file = fd.get('pdf')
  if (!file || file.type !== 'application/pdf' || file.size > 10*1024*1024 || file.size < 5) return msg('Pilih PDF valid maksimal 10 MB.',true)
  const head = new Uint8Array(await file.slice(0,5).arrayBuffer()); if (String.fromCharCode(...head) !== '%PDF-') return msg('File bukan PDF.',true)
  const id = crypto.randomUUID(), path = `${state.user.id}/${id}.pdf`
  const { error: storageError } = await db.storage.from('dokumen-sumber').upload(path,file,{contentType:'application/pdf',upsert:false})
  if (storageError) return msg(storageError.message,true)
  const { error } = await db.from('dokumen_sumber').insert({id,judul:fd.get('judul'),kode:fd.get('kode'),jenis:fd.get('jenis'),file_path:path,uploaded_by:state.user.id})
  if (error) return msg(`Metadata gagal disimpan: ${error.message}. File perlu dibersihkan oleh admin.`,true)
  await admin(); msg('PDF berhasil diunggah.')
}
async function generate(id, type) {
  const { data } = await db.auth.getSession()
  const res = await fetch('/api/trigger-generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token || ''}`},body:JSON.stringify({dokumen_sumber_id:id,tipe:type})})
  const body = await res.json().catch(() => ({})); msg(res.ok ? 'Job dikirim. Periksa status beberapa saat lagi.' : body.error || 'Gagal memicu job.',!res.ok)
}
async function moderate(kind,id,status) {
  const { error } = await db.rpc('review_konten',{p_kind:kind,p_id:id,p_status:status})
  if (error) return msg(error.message,true)
  await admin(); msg(`Konten ${status}.`)
}
app.addEventListener('submit',async e => {
  e.preventDefault()
  if (e.target.id === 'upload-form') return upload(e.target)
  if (e.target.id !== 'auth-form') return
  const fd = new FormData(e.target), email = fd.get('email'), password = fd.get('password')
  const mode = e.submitter?.value
  const result = mode === 'signup' ? await db.auth.signUp({email,password,options:{data:{nama:String(fd.get('nama')||'Peserta').slice(0,100)}}}) : await db.auth.signInWithPassword({email,password})
  if (result.error) return msg(result.error.message,true)
  if (mode === 'signup' && !result.data.session) return msg('Periksa email untuk konfirmasi akun.')
  location.hash = '#beranda'; render()
})
app.addEventListener('change',e => { if (e.target.name === 'answer') state.answers[state.questions[state.index].id] = e.target.value })
app.addEventListener('click',async e => {
  const b = e.target.closest('[data-action]'); if (!b) return
  const { action,id,type,kind,status } = b.dataset
  if (action === 'logout') { await db.auth.signOut(); location.hash = '#beranda' }
  if (action === 'start-skd') await start('SKD')
  if (action === 'start-skb') await start('SKB')
  if (action === 'prev') { state.index--; simulation() }
  if (action === 'next') { state.index++; simulation() }
  if (action === 'finish') await finish()
  if (action === 'review') await review(id)
  if (action === 'generate') await generate(id,type)
  if (action === 'moderate') await moderate(kind,id,status)
})
window.addEventListener('hashchange',() => { clearInterval(state.timer); render() })
init()
