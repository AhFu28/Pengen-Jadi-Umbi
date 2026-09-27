export async function onRequestPost({ request, env }) {
  const json = (value,status) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
  try {
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]
    if (!token) return json({error:'Login diperlukan'},401)
    const body = await request.json()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.dokumen_sumber_id || '') || !['generate_soal','generate_materi'].includes(body.tipe)) return json({error:'Input tidak valid'},400)
    const rpc = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/request_generation`,{method:'POST',headers:{'apikey':env.SUPABASE_ANON_KEY,'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({p_document:body.dokumen_sumber_id,p_type:body.tipe})})
    if (!rpc.ok) return json({error:rpc.status===401?'Login diperlukan':'Tidak berwenang, batas pemakaian tercapai, atau dokumen tidak ditemukan'},rpc.status===401?401:403)
    const jobId = await rpc.json()
    const dispatch = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,{
      method:'POST',headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
      body:JSON.stringify({event_type:'generate-content',client_payload:{job_id:jobId}})
    })
    if (!dispatch.ok) return json({error:'Job tercatat, tetapi pengiriman ke GitHub gagal. Hubungi admin dan periksa token Cloudflare.',job_id:jobId},502)
    return json({ok:true,job_id:jobId},202)
  } catch { return json({error:'Permintaan gagal diproses'},500) }
}
