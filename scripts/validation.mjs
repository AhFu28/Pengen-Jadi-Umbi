export function validateItems(items,type) {
  if (!Array.isArray(items) || !items.length || items.length > 10) throw Error('Output harus array 1–10 item')
  const letters = ['A','B','C','D','E']
  return items.map(item => {
    if (type === 'generate_materi') {
      if (typeof item.judul !== 'string' || item.judul.length < 5 || typeof item.konten !== 'string' || item.konten.length < 80) throw Error('Materi tidak lengkap')
      return {judul:item.judul.slice(0,180),konten:item.konten.slice(0,20000),sub_topik:String(item.sub_topik||'').slice(0,100)}
    }
    if (!['TWK','TIU','TKP','SKB'].includes(item.subtes) || typeof item.pertanyaan !== 'string' || item.pertanyaan.length < 20 || !item.pilihan || Object.keys(item.pilihan).sort().join('') !== letters.join('') || letters.some(k => typeof item.pilihan[k] !== 'string' || !item.pilihan[k].trim()) || !item.pembahasan_detail || typeof item.pembahasan_detail !== 'object') throw Error('Soal tidak lengkap')
    if (item.subtes === 'TKP') {
      if (letters.some(k => !Number.isInteger(item.bobot_jawaban?.[k]) || item.bobot_jawaban[k] < 1 || item.bobot_jawaban[k] > 5)) throw Error('Bobot TKP tidak valid')
    } else if (!letters.includes(item.kunci_jawaban)) throw Error('Kunci jawaban tidak valid')
    return {subtes:item.subtes,sub_topik:String(item.sub_topik||'').slice(0,100),pertanyaan:item.pertanyaan.slice(0,3000),pilihan:item.pilihan,kunci_jawaban:item.subtes==='TKP'?null:item.kunci_jawaban,bobot_jawaban:item.subtes==='TKP'?item.bobot_jawaban:null,pembahasan_detail:item.pembahasan_detail,referensi_hukum:String(item.referensi_hukum||'').slice(0,500)}
  })
}
