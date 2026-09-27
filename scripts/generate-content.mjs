import { createClient } from '@supabase/supabase-js'
import { validateItems } from './validation.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pdf = require('pdf-parse')
const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,GEMINI_API_KEY,JOB_ID,GITHUB_RUN_ID} = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY || !/^[\da-f-]{36}$/i.test(JOB_ID||'')) throw Error('Secrets atau JOB_ID belum valid')
const db = createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const check = ({data,error}) => { if (error) throw error; return data }
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
try {
  const job = check(await db.from('ai_generation_job').select('*').eq('id',JOB_ID).single())
  if (job.status !== 'menunggu') throw Error('Job sudah pernah diproses')
  check(await db.from('ai_generation_job').update({status:'berjalan',started_at:new Date().toISOString(),github_run_id:GITHUB_RUN_ID,provider:'gemini',model,prompt_version:'v1'}).eq('id',JOB_ID))
  const doc = check(await db.from('dokumen_sumber').select('*').eq('id',job.dokumen_sumber_id).single())
  const {data:blob,error:downloadError} = await db.storage.from('dokumen-sumber').download(doc.file_path)
  if (downloadError) throw downloadError
  const buffer = Buffer.from(await blob.arrayBuffer())
  if (buffer.subarray(0,5).toString() !== '%PDF-' || buffer.length > 10*1024*1024) throw Error('PDF tidak valid atau terlalu besar')
  const extracted = (await pdf(buffer)).text.trim()
  if (extracted.length < 300) throw Error('Teks PDF terlalu pendek. PDF hasil scan membutuhkan OCR.')
  const source = extracted.slice(0,45000)
  check(await db.from('dokumen_sumber').update({status_proses:'diekstrak',teks_ekstraksi:source,karakter_ekstraksi:extracted.length}).eq('id',doc.id))
  const base = 'Hanya gunakan fakta di teks sumber. Jika tidak cukup, jangan buat item. Keluarkan JSON array tanpa markdown. Tiap pembahasan harus menjelaskan alasan jawaban. Jangan mengarang pasal atau tanggal.'
  const schema = job.tipe==='generate_soal'
    ? 'Buat 3 sampai 5 soal. Objek: subtes (TWK/TIU/TKP untuk SKD, SKB untuk SKB), sub_topik, pertanyaan, pilihan object A,B,C,D,E, kunci_jawaban huruf A-E untuk selain TKP, bobot_jawaban object A-E angka 1-5 untuk TKP, pembahasan_detail object berisi alasan_benar dan alasan_opsi_lain, referensi_hukum.'
    : 'Buat 1 sampai 3 materi. Objek: judul, sub_topik, konten (teks terstruktur minimal 80 karakter).'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_API_KEY},body:JSON.stringify({contents:[{parts:[{text:`${base}\n${schema}\nKategori: ${doc.kode}\nSumber:\n${source}`}]}],generationConfig:{responseMimeType:'application/json',temperature:0.2,maxOutputTokens:4096}})})
  if (!response.ok) throw Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0,300)}`)
  const ai = await response.json()
  const output = ai.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')
  if (!output) throw Error('Output AI kosong')
  const items = validateItems(JSON.parse(output),job.tipe)
  const table = job.tipe==='generate_soal'?'soal':'materi'
  const rows = items.map(item=>({...item,kode:doc.kode,instansi_formasi_id:doc.instansi_formasi_id,sumber_job_id:JOB_ID,status_review:'menunggu'}))
  check(await db.from(table).insert(rows))
  check(await db.from('ai_generation_job').update({status:'selesai',jumlah_dihasilkan:rows.length,token_input:ai.usageMetadata?.promptTokenCount||null,token_output:ai.usageMetadata?.candidatesTokenCount||null,finished_at:new Date().toISOString()}).eq('id',JOB_ID))
  console.log(`Created ${rows.length} draft ${table} entries`)
} catch(error) {
  console.error(error)
  await db.from('ai_generation_job').update({status:'gagal',error_message:String(error.message).slice(0,500),finished_at:new Date().toISOString()}).eq('id',JOB_ID)
  process.exitCode=1
}
