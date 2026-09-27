import test from 'node:test'
import assert from 'node:assert/strict'
import {validateItems} from './validation.mjs'
const sample={subtes:'TWK',sub_topik:'Konstitusi',pertanyaan:'Apa isi asas hukum dalam sumber yang tersedia?',pilihan:{A:'Satu',B:'Dua',C:'Tiga',D:'Empat',E:'Lima'},kunci_jawaban:'A',pembahasan_detail:{alasan_benar:'Penjelasan'}}
test('validates grounded draft shape',()=>assert.equal(validateItems([sample],'generate_soal')[0].kunci_jawaban,'A'))
test('rejects missing correct answer',()=>assert.throws(()=>validateItems([{...sample,kunci_jawaban:'F'}],'generate_soal')))
test('rejects invalid TKP weight',()=>assert.throws(()=>validateItems([{...sample,subtes:'TKP',kunci_jawaban:null,bobot_jawaban:{A:5,B:4,C:3,D:2,E:9}}],'generate_soal')))
