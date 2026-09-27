# Pengen Jadi Umbi · CPNS MVP

Aplikasi latihan CPNS berbasis Vite, Cloudflare Pages, Supabase, GitHub Actions, dan Gemini. Status: **MVP fase 1–2**. Konten AI selalu berupa draf hingga admin menyetujuinya. Belum termasuk sinkron jadwal otomatis, regenerasi mingguan, OCR PDF scan, notifikasi, PWA, atau simulasi CAT resmi.

## Jalankan lokal

1. `npm ci`
2. Salin `.env.example` ke `.env.local`, isi URL dan anon/publishable key Supabase.
3. Jalankan migration `supabase/migrations/001_initial.sql` pada Supabase SQL Editor.
4. `npm run dev`; untuk verifikasi: `npm test && npm run build`.

## Setup layanan (urut)

1. **Supabase:** buat project baru, catat Project URL serta anon/publishable key dari Project Settings → API. Di SQL Editor jalankan `supabase/migrations/001_initial.sql` sekali. Database membuat bucket privat `dokumen-sumber`. Atur Auth → URL Configuration: Site URL domain Pages, redirect URL domain Pages dan localhost untuk development. Aktifkan email confirmation jika diinginkan.
2. **Daftar dan angkat admin:** setelah migration, daftar dari aplikasi lalu konfirmasi email. Di Supabase SQL Editor jalankan `update public.peserta set role='admin' where auth_user_id=(select id from auth.users where email='EMAIL_ANDA');` Ganti email. Jangan buat endpoint publik untuk mengubah role.
3. **GitHub:** Settings → Secrets and variables → Actions → Secrets, tambahkan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`. Di Variables, `GEMINI_MODEL` opsional; bawaan `gemini-2.5-flash`. Aktifkan Actions. Beri budget/kuota pada provider AI.
4. **GitHub token untuk Cloudflare:** buat fine-grained personal access token khusus repo ini, izin **Contents: read and write** (GitHub dispatch API), masa berlaku pendek. Simpan token sebagai `GITHUB_TOKEN` di Cloudflare, jangan di repo. `GITHUB_REPO=AhFu28/Pengen-Jadi-Umbi`.
5. **Cloudflare Pages:** Workers & Pages → Create → Pages → Connect to Git. Pilih repo dan branch `main`. Build command `npm run build`, output directory `dist`, root directory repo root. Atur environment variables di Pages → Settings → Variables and Secrets (Production): `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (bukan secret; terpaket di frontend), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GITHUB_REPO`, dan secret `GITHUB_TOKEN`. Redeploy setelah mengubah variabel build. Pages Functions berada di `functions/api/trigger-generate.js`.
6. **Uji alur:** login sebagai admin; unggah PDF teks SKD <10 MB; klik Generate Soal; pantau GitHub Actions dan panel job; periksa draf lalu setujui; login akun peserta terpisah dan kerjakan latihan. Periksa bahwa peserta tidak bisa membaca tabel `soal`, `dokumen_sumber`, atau role admin.

**Keamanan:** jangan masukkan service role key, token GitHub, atau API key Gemini ke `VITE_` atau commit. Supabase anon key boleh ada di klien karena RLS; kunci jawaban hanya keluar setelah sesi selesai. Dokumen scan perlu OCR dahulu. Jadwal hanya ditampilkan jika `terverifikasi=true` oleh admin. Tanpa konfigurasi, situs menampilkan petunjuk konfigurasi alih-alih data dummy.

**Catatan:** rate limit pemicu maksimum 10 job per admin per jam, tanpa deduplikasi konten semantik. Soal SKB perlu formasi dan distribusi topik lebih rinci sebelum dipakai luas. Perlu pengujian e2e di Supabase/Cloudflare setelah setup akun.
