create extension if not exists pgcrypto;
create table public.peserta (
 id uuid primary key default gen_random_uuid(), auth_user_id uuid not null unique references auth.users(id) on delete cascade,
 nama text not null, role text not null default 'peserta' check(role in ('peserta','admin')), created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.peserta where auth_user_id = (select auth.uid()) and role = 'admin')
$$;
revoke all on function public.is_admin() from public; grant execute on function public.is_admin() to authenticated;
create function public.new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
 begin insert into public.peserta(auth_user_id,nama) values(new.id, left(coalesce(nullif(new.raw_user_meta_data->>'nama',''),'Peserta'),100)); return new; end
$$;
create trigger create_profile after insert on auth.users for each row execute function public.new_profile();
create table public.instansi_formasi (id uuid primary key default gen_random_uuid(), nama_instansi text not null, nama_jabatan text not null, aktif boolean not null default true);
create table public.dokumen_sumber (
 id uuid primary key default gen_random_uuid(), judul text not null, kode text not null check(kode in ('SKD','SKB')),
 jenis text not null check(jenis in ('materi_umum','uu_regulasi')), instansi_formasi_id uuid references public.instansi_formasi,
 file_path text not null unique, uploaded_by uuid not null references auth.users(id), status_proses text not null default 'menunggu' check(status_proses in ('menunggu','diekstrak','gagal')),
 teks_ekstraksi text, karakter_ekstraksi integer, created_at timestamptz not null default now(),
 constraint skb_dokumen_formasi check(kode='SKD' or instansi_formasi_id is not null)
);
create table public.ai_generation_job (
 id uuid primary key default gen_random_uuid(), dokumen_sumber_id uuid references public.dokumen_sumber,
 tipe text not null check(tipe in ('generate_soal','generate_materi')), provider text, model text, prompt_version text,
 status text not null default 'menunggu' check(status in ('menunggu','berjalan','selesai','gagal')),
 github_run_id text, error_message text, jumlah_dihasilkan int not null default 0, token_input int, token_output int,
 requested_by uuid references auth.users(id), created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz
);
create table public.materi (
 id uuid primary key default gen_random_uuid(), kode text not null check(kode in ('SKD','SKB')),
 instansi_formasi_id uuid references public.instansi_formasi, judul text not null, sub_topik text,
 konten text not null, sumber_job_id uuid references public.ai_generation_job, status_review text not null default 'menunggu' check(status_review in ('menunggu','disetujui','ditolak')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table public.soal (
 id uuid primary key default gen_random_uuid(), kode text not null check(kode in ('SKD','SKB')),
 instansi_formasi_id uuid references public.instansi_formasi, subtes text not null check(subtes in ('TWK','TIU','TKP','SKB')),
 sub_topik text, pertanyaan text not null, pilihan jsonb not null, kunci_jawaban text,
 bobot_jawaban jsonb, pembahasan_detail jsonb not null default '{}'::jsonb, referensi_hukum text,
 sumber_job_id uuid references public.ai_generation_job, status_review text not null default 'menunggu' check(status_review in ('menunggu','disetujui','ditolak')),
 is_active boolean not null default false, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 constraint soal_options check(jsonb_typeof(pilihan)='object' and pilihan ?& array['A','B','C','D','E'])
);
create table public.percobaan_tes (
 id uuid primary key default gen_random_uuid(), peserta_id uuid not null references auth.users(id), kode text not null check(kode in ('SKD','SKB')),
 status text not null default 'berjalan' check(status in ('berjalan','selesai')), skor_twk integer, skor_tiu integer, skor_tkp integer,
 started_at timestamptz not null default now(), finished_at timestamptz
);
create table public.soal_percobaan (
 percobaan_id uuid not null references public.percobaan_tes on delete cascade, soal_id uuid not null references public.soal,
 urutan integer not null, primary key(percobaan_id,soal_id), unique(percobaan_id,urutan)
);
create table public.jawaban_peserta (
 percobaan_id uuid not null, soal_id uuid not null, jawaban_dipilih text check(jawaban_dipilih in ('A','B','C','D','E')),
 skor int not null, primary key(percobaan_id,soal_id), foreign key(percobaan_id,soal_id) references public.soal_percobaan(percobaan_id,soal_id)
);
create table public.jadwal_cpns (
 id uuid primary key default gen_random_uuid(), judul_tahap text not null unique, tanggal_mulai date not null,
 tanggal_selesai date, sumber_url text not null check(sumber_url ~ '^https://[^ ]+$'), terverifikasi boolean not null default false,
 terakhir_disinkron timestamptz not null default now()
);
create index on public.soal(kode,subtes,status_review,is_active);
create index on public.ai_generation_job(created_at desc);
create index on public.percobaan_tes(peserta_id,started_at desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('dokumen-sumber','dokumen-sumber',false,10485760,array['application/pdf']) on conflict(id) do nothing;

alter table public.peserta enable row level security;
alter table public.instansi_formasi enable row level security;
alter table public.dokumen_sumber enable row level security;
alter table public.ai_generation_job enable row level security;
alter table public.materi enable row level security;
alter table public.soal enable row level security;
alter table public.percobaan_tes enable row level security;
alter table public.soal_percobaan enable row level security;
alter table public.jawaban_peserta enable row level security;
alter table public.jadwal_cpns enable row level security;
create policy "own profile read" on public.peserta for select to authenticated using(auth_user_id=(select auth.uid()) or (select public.is_admin()));
create policy "formasi read" on public.instansi_formasi for select to authenticated using(aktif or (select public.is_admin()));
create policy "admin docs read" on public.dokumen_sumber for select to authenticated using((select public.is_admin()));
create policy "admin docs insert" on public.dokumen_sumber for insert to authenticated with check((select public.is_admin()) and uploaded_by=(select auth.uid()));
create policy "admin jobs read" on public.ai_generation_job for select to authenticated using((select public.is_admin()));
create policy "admin material read" on public.materi for select to authenticated using((select public.is_admin()));
create policy "admin questions read" on public.soal for select to authenticated using((select public.is_admin()));
create policy "own attempts" on public.percobaan_tes for select to authenticated using(peserta_id=(select auth.uid()) or (select public.is_admin()));
create policy "admin schedule" on public.jadwal_cpns for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy "verified schedule read" on public.jadwal_cpns for select to anon,authenticated using(terverifikasi);
create policy "admin upload pdf" on storage.objects for insert to authenticated with check(bucket_id='dokumen-sumber' and (select public.is_admin()) and (storage.foldername(name))[1]=(select auth.uid())::text);

create view public.materi_publik with (security_invoker=true) as
 select judul,konten,sub_topik,kode from public.materi where status_review='disetujui';
create policy "approved materials read" on public.materi for select to anon,authenticated using(status_review='disetujui');

create function public.mulai_latihan(p_kode text,p_jumlah integer default 10) returns jsonb
 language plpgsql security definer set search_path = '' as $$
 declare v_id uuid; v_soal jsonb; v_count int;
 begin
  if (select auth.uid()) is null then raise exception 'Login diperlukan'; end if;
  if p_kode <> 'SKD' or p_jumlah not between 1 and 20 then raise exception 'Parameter tidak valid'; end if;
  select count(*) into v_count from public.percobaan_tes where peserta_id=(select auth.uid()) and status='berjalan' and started_at>now()-interval '30 minutes';
  if v_count>=3 then raise exception 'Terlalu banyak sesi aktif'; end if;
  insert into public.percobaan_tes(peserta_id,kode) values((select auth.uid()),p_kode) returning id into v_id;
  with picked as (
   select id,subtes,pertanyaan,pilihan,row_number() over(order by random())::integer as urutan
   from public.soal where kode=p_kode and status_review='disetujui' and is_active=true
   order by random() limit p_jumlah
  ), inserted as (
   insert into public.soal_percobaan(percobaan_id,soal_id,urutan)
   select v_id,id,urutan from picked returning soal_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'subtes',p.subtes,'pertanyaan',p.pertanyaan,'pilihan',p.pilihan) order by p.urutan),'[]'::jsonb)
  into v_soal from picked p join inserted i on p.id=i.soal_id;
  if jsonb_array_length(v_soal)=0 then delete from public.percobaan_tes where id=v_id; raise exception 'Belum ada soal yang disetujui'; end if;
  return jsonb_build_object('percobaan_id',v_id,'soal',v_soal);
 end
$$;
create function public.selesaikan_latihan(p_percobaan_id uuid,p_jawaban jsonb) returns void
 language plpgsql security definer set search_path = '' as $$
 declare v_record record; v_choice text; v_score integer;
 begin
  if not exists(select 1 from public.percobaan_tes where id=p_percobaan_id and peserta_id=(select auth.uid()) and status='berjalan') then raise exception 'Sesi tidak valid'; end if;
  if jsonb_typeof(p_jawaban) <> 'object' then raise exception 'Jawaban harus object'; end if;
  for v_record in select s.id,s.subtes,s.kunci_jawaban,s.bobot_jawaban from public.soal_percobaan sp join public.soal s on s.id=sp.soal_id where sp.percobaan_id=p_percobaan_id loop
   v_choice:=p_jawaban->>v_record.id::text;
   if v_choice is not null and v_choice not in ('A','B','C','D','E') then raise exception 'Opsi tidak valid'; end if;
   v_score:=case when v_record.subtes='TKP' then coalesce((v_record.bobot_jawaban->>v_choice)::integer,0) when v_choice=v_record.kunci_jawaban then 5 else 0 end;
   insert into public.jawaban_peserta(percobaan_id,soal_id,jawaban_dipilih,skor) values(p_percobaan_id,v_record.id,v_choice,v_score);
  end loop;
  update public.percobaan_tes set status='selesai',finished_at=now(),
   skor_twk=(select coalesce(sum(j.skor),0) from public.jawaban_peserta j join public.soal s on s.id=j.soal_id where j.percobaan_id=p_percobaan_id and s.subtes='TWK'),
   skor_tiu=(select coalesce(sum(j.skor),0) from public.jawaban_peserta j join public.soal s on s.id=j.soal_id where j.percobaan_id=p_percobaan_id and s.subtes='TIU'),
   skor_tkp=(select coalesce(sum(j.skor),0) from public.jawaban_peserta j join public.soal s on s.id=j.soal_id where j.percobaan_id=p_percobaan_id and s.subtes='TKP')
  where id=p_percobaan_id;
 end
$$;
create function public.hasil_latihan(p_percobaan_id uuid) returns jsonb
 language plpgsql security definer set search_path = '' as $$
 declare v_result jsonb;
 begin
  if not exists(select 1 from public.percobaan_tes where id=p_percobaan_id and peserta_id=(select auth.uid()) and status='selesai') then raise exception 'Hasil tidak tersedia'; end if;
  select jsonb_build_object('kode',t.kode,'skor_twk',t.skor_twk,'skor_tiu',t.skor_tiu,'skor_tkp',t.skor_tkp,
   'pembahasan',coalesce((select jsonb_agg(jsonb_build_object('subtes',s.subtes,'pertanyaan',s.pertanyaan,'jawaban_dipilih',j.jawaban_dipilih,'kunci_jawaban',s.kunci_jawaban,'bobot_jawaban',s.bobot_jawaban,'pembahasan_detail',s.pembahasan_detail) order by sp.urutan)
   from public.soal_percobaan sp join public.soal s on s.id=sp.soal_id join public.jawaban_peserta j on j.percobaan_id=sp.percobaan_id and j.soal_id=sp.soal_id where sp.percobaan_id=p_percobaan_id),'[]'::jsonb))
  into v_result from public.percobaan_tes t where t.id=p_percobaan_id;
  return v_result;
 end
$$;
create function public.review_konten(p_kind text,p_id uuid,p_status text) returns void
 language plpgsql security definer set search_path = '' as $$
 begin
  if not public.is_admin() then raise exception 'Admin diperlukan'; end if;
  if p_status not in ('disetujui','ditolak') then raise exception 'Status tidak valid'; end if;
  if p_kind='soal' then
   update public.soal set status_review=p_status,is_active=(p_status='disetujui'),reviewed_by=(select auth.uid()),reviewed_at=now() where id=p_id and status_review='menunggu';
  elsif p_kind='materi' then
   update public.materi set status_review=p_status,reviewed_by=(select auth.uid()),reviewed_at=now() where id=p_id and status_review='menunggu';
  else raise exception 'Jenis tidak valid'; end if;
  if not found then raise exception 'Draft tidak ditemukan'; end if;
 end
$$;
revoke all on function public.mulai_latihan(text,integer),public.selesaikan_latihan(uuid,jsonb),public.hasil_latihan(uuid),public.review_konten(text,uuid,text) from public;
grant execute on function public.mulai_latihan(text,integer),public.selesaikan_latihan(uuid,jsonb),public.hasil_latihan(uuid),public.review_konten(text,uuid,text) to authenticated;
create function public.request_generation(p_document uuid,p_type text) returns uuid
 language plpgsql security definer set search_path = '' as $$
 declare v_id uuid;
 begin
  if not public.is_admin() then raise exception 'Admin diperlukan'; end if;
  if p_type not in ('generate_soal','generate_materi') then raise exception 'Tipe tidak valid'; end if;
  if not exists(select 1 from public.dokumen_sumber where id=p_document) then raise exception 'Dokumen tidak ditemukan'; end if;
  if (select count(*) from public.ai_generation_job where requested_by=(select auth.uid()) and created_at>now()-interval '1 hour')>=10 then raise exception 'Batas 10 job per jam'; end if;
  insert into public.ai_generation_job(dokumen_sumber_id,tipe,requested_by) values(p_document,p_type,(select auth.uid())) returning id into v_id;
  return v_id;
 end
$$;
revoke all on function public.request_generation(uuid,text) from public;
grant execute on function public.request_generation(uuid,text) to authenticated;
-- Restrict SKB practice until attempts are scoped to a selected formasi.
-- SKB content can still be modeled in tables; enable only with a follow-up migration.
