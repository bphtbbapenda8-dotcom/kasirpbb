// e-Kasir PBB P2 — Modals, Verification, Reports, User Management

const BUKTI_BAYAR_API = 'https://script.google.com/macros/s/AKfycbzCgloCIQAbFa2ozqr70jP0DZ1Ra96CgVUSmSmjWGFlmLYTG77PtpGlH6VLOdzUGP95/exec';

// === DETAIL MODAL (Belum Setor) ===
function showGroupDetail(key) {
    const g = groupedTransactions[key]; if (!g) return;
    $('detail-kelurahan').innerText = g.wilayah;
    $('detail-lingkungan').innerText = g.lingkungan;
    $('detail-total-rekap').innerText = formatIDR(g.totalJumlah);
    
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.username.toLowerCase() === 'admin');
    const thead = $('detail-table-head');
    if (thead) {
        thead.innerHTML = isAdmin 
            ? `<tr><th style="padding:0.5rem 0.75rem">Nama WP / NOP</th><th style="padding:0.5rem 0.75rem;text-align:right">Jumlah</th><th style="padding:0.5rem 0.75rem;text-align:center;width:60px">Aksi</th></tr>`
            : `<tr><th style="padding:0.5rem 0.75rem">Nama WP / NOP</th><th style="padding:0.5rem 0.75rem;text-align:right">Jumlah</th></tr>`;
    }
    const tfootLabel = $('detail-tfoot-label');
    const tfootTotal = $('detail-total-rekap');
    if (tfootTotal) {
        tfootTotal.setAttribute('colspan', isAdmin ? '2' : '1');
    }

    const body = $('detail-table-body'); body.innerHTML = '';
    g.items.forEach(item => {
        let actionHtml = '';
        if (isAdmin) {
            const safeNama = (item.nama || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
            const safeKey = key.replace(/'/g, "\\'");
            actionHtml = `<td style="padding:0.6rem 0.75rem;text-align:center"><button onclick="deleteBelumSetorItem('${item.id}', '${item.nop}', '${safeNama}', ${item.jumlah || 0}, ${!!item.is_manual}, '${safeKey}')" class="btn btn-danger btn-sm" style="padding:0.3rem 0.6rem" title="Hapus Data"><i class="fas fa-trash"></i></button></td>`;
        }
        body.innerHTML += `<tr><td style="padding:0.6rem 0.75rem"><div style="font-weight:700;color:#334155">${item.nama}</div><div style="font-size:0.6rem;color:#94a3b8;font-weight:700">${item.nop}</div></td><td style="padding:0.6rem 0.75rem;text-align:right;font-weight:700;color:#475569">${formatIDR(item.jumlah)}</td>${actionHtml}</tr>`;
    });
    // Reset upload field
    $('bukti-bayar-input').value = '';
    $('bukti-bayar-preview').innerHTML = '<i class="fas fa-image" style="font-size:1.5rem"></i><span style="font-size:0.7rem;font-weight:700">Klik untuk pilih file</span>';
    $('bukti-bayar-preview').style.background = '#e2e8f0';
    $('bukti-bayar-info').style.display = 'none';
    $('btn-proses-setor').onclick = () => executeSetorGroup(key);
    $('detail-modal').classList.add('open');
}

async function deleteBelumSetorItem(id, nop, nama, jumlah, isManual, groupKey) {
    if (!confirm(`Yakin ingin menghapus data NOP ${nop} (${nama})?\n\n${!isManual ? 'Data ini akan dikembalikan ke tabel tagihan awal (sppt2026).' : 'Ini adalah data input manual dan akan dihapus permanen.'}`)) return;
    
    // Disable buttons to prevent double click
    const buttons = document.querySelectorAll('#detail-table-body button');
    buttons.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    
    try {
        const { error: e1 } = await _supabase.from('belumsetor').delete().eq('id', id);
        if (e1) throw e1;
        
        if (!isManual) {
            const { error: e2 } = await _supabase.from('sppt2026').insert({
                NOP: nop,
                NM_WP_SPPT: nama,
                PBB_YG_HARUS_DIBAYAR_: jumlah
            });
            if (e2) {
                console.error("Gagal mengembalikan ke sppt2026", e2);
                showToast("Dihapus dari keranjang, tapi gagal dikembalikan ke SPPT2026.", "error");
            }
        }
        
        showToast("Data berhasil dihapus!");
        logActivity('HAPUS_SETOR', `Menghapus NOP ${nop} dari antrean`, `ID: ${id}`);
        
        await refreshData();
        
        const g = groupedTransactions[groupKey];
        if (g && g.items.length > 0) {
            showGroupDetail(groupKey);
        } else {
            closeDetailModal();
        }
    } catch (err) {
        console.error(err);
        showToast("Terjadi kesalahan: " + (err.message || 'Gagal menghapus'), "error");
        buttons.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    }
}
function closeDetailModal() { $('detail-modal').classList.remove('open'); }

function previewBuktiBayar(input) {
    const file = input.files[0]; if (!file) return;
    const info = $('bukti-bayar-info');
    const preview = $('bukti-bayar-preview');
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    info.style.display = 'block';
    info.innerHTML = `<i class="fas fa-paperclip" style="margin-right:4px;color:var(--primary)"></i>${file.name} <span style="color:#94a3b8">(${sizeMB} MB)</span>`;
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => {
            preview.innerHTML = `<img src="${e.target.result}" style="width:100%;max-height:160px;object-fit:contain;border-radius:0.5rem">`;
            preview.style.background = '#fff';
        };
        reader.readAsDataURL(file);
    } else {
        preview.innerHTML = `<i class="fas fa-file-pdf" style="font-size:2rem;color:#ef4444"></i><span style="font-size:0.7rem;font-weight:700;color:#475569">${file.name}</span>`;
        preview.style.background = '#fff5f5';
    }
}

// === KOMPRESI GAMBAR (target ≤ 200 KB) ===
async function compressImage(file, targetKB = 200) {
    // PDF / non-image tidak dikompres
    if (!file.type.startsWith('image/')) return file;

    const targetBytes = targetKB * 1024;
    // Jika sudah kecil, langsung kembalikan
    if (file.size <= targetBytes) return file;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; };
        reader.onerror = reject;
        reader.readAsDataURL(file);

        img.onload = () => {
            // Batasi resolusi maks 1920px di sisi terpanjang
            const MAX_DIM = 1920;
            let { width, height } = img;
            if (width > MAX_DIM || height > MAX_DIM) {
                if (width >= height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
                else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Turunkan quality secara iteratif hingga ≤ targetBytes
            let quality = 0.85;
            const MIN_QUALITY = 0.1;
            const STEP = 0.08;

            function tryCompress() {
                canvas.toBlob(blob => {
                    if (!blob) { reject(new Error('Kompresi gagal')); return; }
                    console.log(`[Compress] quality=${quality.toFixed(2)} size=${(blob.size/1024).toFixed(1)}KB`);
                    if (blob.size <= targetBytes || quality <= MIN_QUALITY) {
                        // Selesai — bungkus jadi File
                        const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
                        console.log(`[Compress] Final: ${(compressed.size/1024).toFixed(1)}KB (target ${targetKB}KB)`);
                        resolve(compressed);
                    } else {
                        quality = Math.max(MIN_QUALITY, quality - STEP);
                        tryCompress();
                    }
                }, 'image/jpeg', quality);
            }
            tryCompress();
        };
        img.onerror = reject;
    });
}

async function uploadBuktiBayar(file, lingkungan, tanggalSetor) {
    // Kompres gambar terlebih dahulu (target ≤ 200 KB)
    const fileToUpload = await compressImage(file, 200);

    const ext = fileToUpload.name.split('.').pop();
    const safeName = lingkungan.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const filePath = `${safeName}_${Date.now()}.${ext}`;

    // Upload file ke storage
    const { error: uploadError } = await _supabase.storage
        .from('bukti-bayar')
        .upload(filePath, fileToUpload, { contentType: fileToUpload.type, upsert: false });

    if (uploadError) throw new Error('Upload gagal: ' + uploadError.message);

    // Ambil public URL
    const { data: urlData } = _supabase.storage.from('bukti-bayar').getPublicUrl(filePath);
    const fileUrl = urlData?.publicUrl || '';
    console.log('[Upload] File URL:', fileUrl);
    console.log('[Upload] Simpan ke bukti_bayar - lingkungan:', lingkungan);

    // Simpan log ke tabel bukti_bayar
    const { data: insertData, error: insertError } = await _supabase.from('bukti_bayar').insert([{
        lingkungan,
        tanggal_setor: tanggalSetor,
        file_url: fileUrl,
        petugas: currentUser?.username || '-'
    }]).select();

    if (insertError) {
        console.error('[Upload] Gagal insert ke bukti_bayar:', insertError);
        throw new Error('Gagal menyimpan log bukti bayar: ' + insertError.message);
    }
    console.log('[Upload] Insert bukti_bayar berhasil:', insertData);

    return fileUrl;
}

async function executeSetorGroup(key) {
    const g = groupedTransactions[key]; if (!g) return;
    const fileInput = $('bukti-bayar-input');
    if (!fileInput.files || !fileInput.files[0]) {
        showToast('Harap upload bukti bayar terlebih dahulu', 'error'); return;
    }
    const ids = g.items.map(i => i.id);
    const btn = $('btn-proses-setor');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Mengompres...';
    try {
        const now = new Date();
        const tanggalSetor = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Mengupload...';
        const fileUrl = await uploadBuktiBayar(fileInput.files[0], g.lingkungan, tanggalSetor);
        const { error } = await _supabase.from('belumsetor').update({status:'Sedang Diverifikasi'}).in('id', ids);
        if (error) throw error;
        logActivity('SETOR', `${g.items.length} WP — ${formatIDR(g.totalJumlah)} diajukan verifikasi`, `${g.wilayah} / ${g.lingkungan}`);
        showToast('Berhasil diajukan untuk verifikasi Admin!');
        closeDetailModal(); refreshData();
    } catch(err) {
        console.error(err);
        showToast('Gagal: ' + (err.message || 'Cek koneksi'), 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = 'Setor Sekarang';
    }
}

// === HISTORY DETAIL MODAL ===
function showHistoryGroupDetail(key) {
    const g = groupedHistoryTransactions[key]; if (!g) return;
    currentHistoryGroupKey = key;
    $('hist-kelurahan').innerText = g.wilayah;
    $('hist-lingkungan').innerText = g.lingkungan;
    $('hist-timestamp').innerText = g.timestamp;
    $('hist-total-rekap').innerText = formatIDR(g.totalJumlah);
    const body = $('hist-table-body'); body.innerHTML = '';
    g.items.forEach(item => {
        body.innerHTML += `<tr><td style="padding:0.6rem 0.75rem"><div style="font-weight:700;color:#334155">${item.nama}</div><div style="font-size:0.6rem;color:#94a3b8;font-weight:700">${item.nop}</div></td><td style="padding:0.6rem 0.75rem;text-align:right;font-weight:700;color:#475569">${formatIDR(item.jumlah)}</td></tr>`;
    });
    $('history-detail-modal').classList.add('open');
}
function closeHistoryDetailModal() { $('history-detail-modal').classList.remove('open'); currentHistoryGroupKey = null; }

// === FULLSCREEN REPORT ===
function openFullscreenReport() {
    if (!currentHistoryGroupKey) return;
    const g = groupedHistoryTransactions[currentHistoryGroupKey]; if (!g) return;
    const kecCode = getKecamatanByKelurahan(g.wilayah);
    const namaKec = kecCode && wilayahMajene[kecCode] ? wilayahMajene[kecCode].name : "MAJENE";
    const petugas = g.items[0]?.petugas || currentUser.username;
    $('pdf-report-id').innerText = `No. Register: REK-${g.wilayah.substring(0,3).toUpperCase()}-${g.timestamp.replace(/[\/ :]/g,'')}`;
    $('pdf-kecamatan').innerText = namaKec;
    $('pdf-kelurahan').innerText = g.wilayah;
    $('pdf-lingkungan').innerText = g.lingkungan;
    $('pdf-tanggal').innerText = g.timestamp + " WITA";
    const tb = $('pdf-table-body'); tb.innerHTML = ''; let total = 0;
    g.items.forEach((item, idx) => {
        total += parseInt(item.jumlah)||0;
        tb.innerHTML += `<tr style="border-bottom:1px solid #000"><td style="padding:8px;border-right:1px solid #000;text-align:center">${idx+1}</td><td style="padding:8px;border-right:1px solid #000;line-height:1.4"><strong>${item.nama}</strong><br><span style="font-size:10px;color:#555">NOP: ${item.nop}</span></td><td style="padding:8px;text-align:right;font-weight:bold">${formatIDR(item.jumlah)}</td></tr>`;
    });
    $('pdf-total-bayar').innerText = formatIDR(total);
    const today = new Date();
    $('pdf-signer-date').innerText = `Majene, ${today.getDate()} ${today.toLocaleDateString('id-ID',{month:'long'})} ${today.getFullYear()}`;
    $('pdf-signer-name').innerText = petugas;
    closeHistoryDetailModal();
    $('fullscreen-preview').classList.add('open');
}
function closeFullscreenReport() { $('fullscreen-preview').classList.remove('open'); }

// === ADMIN VERIFICATION ===
function renderVerificationList(list) {
    const vB = $('list-verifikasi-body'); if (!vB) return;
    const isAdmin = currentUser.role==='admin'||currentUser.username.toLowerCase()==='admin';
    if (!isAdmin) { vB.innerHTML = '<tr><td colspan="5" style="padding:3rem;text-align:center;color:#ef4444;font-weight:900;font-size:0.65rem;text-transform:uppercase">Akses Ditolak</td></tr>'; return; }
    
    groupedVerifikasiTransactions = {};
    list.forEach(t => {
        const k = `${t.wilayah||'Umum'}_${t.lingkungan||'Umum'}`;
        if (!groupedVerifikasiTransactions[k]) {
            groupedVerifikasiTransactions[k] = {
                wilayah: t.wilayah || 'Umum',
                lingkungan: t.lingkungan || 'Umum',
                petugas: t.petugas || 'Petugas',
                totalJumlah: 0,
                items: []
            };
        }
        groupedVerifikasiTransactions[k].totalJumlah += parseInt(t.jumlah) || 0;
        groupedVerifikasiTransactions[k].items.push(t);
    });

    const keys = Object.keys(groupedVerifikasiTransactions);
    vB.innerHTML = keys.length ? '' : '<tr><td colspan="5" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Tidak ada setoran menunggu verifikasi</td></tr>';
    
    keys.forEach(k => {
        const g = groupedVerifikasiTransactions[k];
        const safeKey = k.replace(/'/g, "\\'");
        vB.innerHTML += `<tr>
            <td style="padding:1rem 1.75rem;font-weight:900;text-transform:uppercase">${g.wilayah}</td>
            <td style="padding:1rem 1.75rem;font-weight:700;color:#64748b;text-transform:uppercase">${g.lingkungan}</td>
            <td style="padding:1rem 1.75rem;text-align:center;font-weight:900;color:#334155"><span class="badge badge-petugas" style="background:#f1f5f9;color:#475569">${g.items.length} WP</span></td>
            <td style="padding:1rem 1.75rem;text-align:right;font-weight:900;color:var(--primary)">${formatIDR(g.totalJumlah)}</td>
            <td style="padding:1rem 1.75rem;text-align:center"><button onclick="showVerifikasiRincian('${safeKey}')" class="btn btn-dark btn-sm"><i class="fas fa-list"></i> Rincian</button></td>
        </tr>`;
    });
}

async function showVerifikasiRincian(key) {
    const g = groupedVerifikasiTransactions[key]; if (!g) return;
    $('verif-detail-kelurahan').innerText = g.wilayah;
    $('verif-detail-lingkungan').innerText = g.lingkungan;
    $('verif-detail-total').innerText = formatIDR(g.totalJumlah);
    const body = $('verif-detail-body'); body.innerHTML = '';
    g.items.forEach(item => {
        body.innerHTML += `<tr><td style="padding:0.6rem 0.75rem"><div style="font-weight:700;color:#334155">${item.nama}</div><div style="font-size:0.6rem;color:#94a3b8;font-weight:700">${item.nop}</div></td><td style="padding:0.6rem 0.75rem;text-align:right;font-weight:700;color:#475569">${formatIDR(item.jumlah)}</td></tr>`;
    });
    $('btn-verif-setuju').onclick = () => approveSetorGroup(key);
    $('btn-verif-tolak').onclick = () => rejectSetorGroup(key);

    // Load bukti bayar
    const buktiEl = $('verif-bukti-preview');
    const loadEl  = $('verif-bukti-loading');
    buktiEl.innerHTML = '<i class="fas fa-image" style="font-size:2rem;display:block;margin-bottom:0.5rem"></i>Belum ada bukti bayar';
    loadEl.style.display = 'block'; buktiEl.style.display = 'none';
    try {
        console.log('[Verifikasi] Mencari bukti bayar untuk lingkungan:', g.lingkungan);
        const { data, error } = await _supabase
            .from('bukti_bayar')
            .select('file_url, tanggal_setor, petugas')
            .ilike('lingkungan', g.lingkungan)
            .order('created_at', { ascending: false })
            .limit(1);
        console.log('[Verifikasi] Hasil bukti bayar:', data, error);
        loadEl.style.display = 'none'; buktiEl.style.display = 'block';
        const record = data && data.length > 0 ? data[0] : null;
        if (record && record.file_url) {
            const url = record.file_url;
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
            const isPdf   = /\.pdf$/i.test(url);
            buktiEl.innerHTML = `
                <div style="font-size:0.65rem;color:#94a3b8;margin-bottom:0.5rem">Diupload oleh <b>${record.petugas||'-'}</b> • ${record.tanggal_setor||'-'}</div>
                ${isImage
                    ? `<img src="${url}" style="max-width:100%;max-height:220px;object-fit:contain;border-radius:0.5rem;border:1px solid #e2e8f0;cursor:pointer" onclick="window.open('${url}','_blank')" title="Klik untuk perbesar">`
                    : isPdf
                        ? `<a href="${url}" target="_blank" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:6px"><i class="fas fa-file-pdf" style="color:#ef4444"></i> Buka PDF Bukti Bayar</a>`
                        : `<a href="${url}" target="_blank" class="btn btn-outline btn-sm"><i class="fas fa-external-link-alt"></i> Lihat Bukti Bayar</a>`
                }
                <div style="margin-top:0.5rem"><a href="${url}" target="_blank" style="font-size:0.65rem;color:var(--primary)"><i class="fas fa-external-link-alt"></i> Buka di tab baru</a></div>`;
        } else {
            buktiEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:#f59e0b;font-size:1.5rem;display:block;margin-bottom:0.5rem"></i><span style="color:#94a3b8">Bukti bayar belum diunggah</span>';
        }
    } catch(err) {
        loadEl.style.display = 'none'; buktiEl.style.display = 'block';
        buktiEl.innerHTML = '<i class="fas fa-times-circle" style="color:#ef4444"></i> Gagal memuat bukti bayar';
        console.error('[Verifikasi] Error bukti bayar:', err);
    }

    $('verifikasi-rincian-modal').classList.add('open');
}
function closeVerifikasiRincianModal() { $('verifikasi-rincian-modal').classList.remove('open'); }

async function approveSetorGroup(key) {
    const g = groupedVerifikasiTransactions[key]; if (!g) return;
    const ids = g.items.map(i => i.id);
    $('modal-icon').innerHTML = '<i class="fas fa-check-circle" style="font-size:3rem;color:#a7f3d0"></i>';
    $('modal-title').innerText = "Konfirmasi Setuju";
    $('modal-desc').innerText = `Setujui setoran ${g.lingkungan} (${g.items.length} WP)? Isi tanggal pelunasan di bawah ini.`;

    // Tampilkan & set default tanggal hari ini
    const dateContainer = $('modal-date-container');
    const dateInput     = $('modal-tanggal-lunas');
    dateContainer.style.display = 'block';
    dateInput.value = new Date().toISOString().split('T')[0]; // default hari ini (YYYY-MM-DD)

    $('modal-confirm').onclick = async () => {
        if (!dateInput.value) {
            showToast('Tanggal pelunasan wajib diisi', 'error');
            dateInput.focus(); return;
        }
        try {
            // Konversi YYYY-MM-DD ke ISO timestamp, tapi PERTAHANKAN jam asli dari waktu setor
            const [y, m, d] = dateInput.value.split('-').map(Number);
            const origDate = g.items[0]?.created_at ? new Date(g.items[0].created_at) : new Date();
            const tanggalISO = new Date(y, m - 1, d, origDate.getHours(), origDate.getMinutes(), origDate.getSeconds()).toISOString();
            
            const {error} = await _supabase.from('belumsetor')
                .update({ status: 'Sudah Setor', created_at: tanggalISO })
                .in('id', ids);
            if (error) throw error;
            logActivity('VERIF_SETUJU', `${g.items.length} WP — ${formatIDR(g.totalJumlah)} disetujui, tgl lunas: ${dateInput.value}`, `${g.wilayah} / ${g.lingkungan}`);
            showToast('Verifikasi disetujui!'); closeModal(); closeVerifikasiRincianModal(); refreshData();
        } catch(err) { showToast('Gagal: ' + (err.message || ''), 'error'); }
    };
    closeVerifikasiRincianModal();
    $('confirm-modal').classList.add('open');
}

async function rejectSetorGroup(key) {
    const g = groupedVerifikasiTransactions[key]; if (!g) return;
    const ids = g.items.map(i => i.id);
    $('modal-icon').innerHTML = '<i class="fas fa-times-circle" style="font-size:3rem;color:#fecaca"></i>';
    $('modal-title').innerText = "Tolak Setoran";
    $('modal-desc').innerText = `Tolak setoran rekap ini (${g.items.length} WP)? Status akan kembali ke 'Belum Setor'.`;
    $('modal-confirm').onclick = async () => {
        try {
            const {error} = await _supabase.from('belumsetor').update({status:'Belum Setor'}).in('id',ids);
            if(error) throw error;
            logActivity('VERIF_TOLAK', `${g.items.length} WP — ${formatIDR(g.totalJumlah)} ditolak`, `${g.wilayah} / ${g.lingkungan}`);
            showToast("Setoran ditolak"); closeModal(); closeVerifikasiRincianModal(); refreshData();
        } catch(err) { showToast("Gagal","error"); }
    };
    closeVerifikasiRincianModal();
    $('confirm-modal').classList.add('open');
}
function closeModal() {
    $('confirm-modal').classList.remove('open');
    // Sembunyikan kembali input tanggal agar tidak tampil di konfirmasi lain
    const dc = $('modal-date-container');
    if (dc) dc.style.display = 'none';
}

// === TAB SWITCHING ===
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    $(id).classList.add('active');
    document.querySelectorAll('.nav-btn[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab===id); });
    document.querySelectorAll('.mob-btn[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab===id); });
    window.scrollTo(0,0);
}

// === USER MANAGEMENT (Admin Only) ===
let editingUserId = null;

async function loadUsers() {
    const isAdmin = currentUser.role==='admin'||currentUser.username.toLowerCase()==='admin';
    const body = $('users-table-body'); if(!body) return;
    if (!isAdmin) { body.innerHTML = '<tr><td colspan="5" style="padding:3rem;text-align:center;color:#ef4444;font-weight:900">Akses Ditolak</td></tr>'; return; }
    body.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:#94a3b8"><i class="fas fa-circle-notch animate-spin"></i> Memuat...</td></tr>';
    try {
        const {data: rawData, error} = await _supabase.from('users').select('*');
        if (error) throw error;
        
        const data = (rawData||[]).map(u => ({
            ...u, 
            role: u.role || (u.username.toLowerCase()==='admin' ? 'admin' : 'petugas')
        }));
        if (!data || !data.length) { body.innerHTML='<tr><td colspan="5" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Belum ada user</td></tr>'; return; }
        
        const keys = Object.keys(data[0]);
        window._userPK = keys.find(k => k.toLowerCase()==='id') || keys.find(k => k.toLowerCase().includes('id')) || keys[0];
        window._usersCache = data;
        
        body.innerHTML = '';
        data.forEach((u, idx) => {
            const role = u.role || 'petugas';
            const badge = role==='admin' ? '<span class="badge badge-admin">Admin</span>' : '<span class="badge badge-petugas">Petugas</span>';
            body.innerHTML += `<tr>
                <td style="padding:1rem 1.75rem;font-weight:900">${u.username}</td>
                <td style="padding:1rem 1.75rem">${badge}</td>
                <td style="padding:1rem 1.75rem;font-weight:700;color:#475569;font-size:0.8rem">${u.wilayah || '-'}</td>
                <td style="padding:1rem 1.75rem;font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#94a3b8">••••••</td>
                <td style="padding:1rem 1.75rem;text-align:center">
                    <div style="display:flex;gap:0.5rem;justify-content:center">
                        <button onclick="editUserByIndex(${idx})" class="btn btn-primary btn-sm"><i class="fas fa-edit"></i></button>
                        <button onclick="deleteUserByIndex(${idx})" class="btn btn-danger btn-sm"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });
    } catch(err) {
        console.error('loadUsers error:', err);
        const errMsg = err.message || err.details || 'Error tidak diketahui';
        body.innerHTML=`<tr><td colspan="5" style="padding:2rem;text-align:center;color:#ef4444;font-size:0.75rem"><div style="font-weight:900;margin-bottom:0.5rem">Gagal memuat data</div><div style="color:#94a3b8;font-weight:600;font-size:0.65rem">${errMsg}</div></td></tr>`;
    }
}

function editUserByIndex(idx) {
    if (!window._usersCache || !window._usersCache[idx]) return;
    const u = window._usersCache[idx];
    editUser(u[window._userPK], u.username, u.password, u.role || 'petugas', u.wilayah || '');
}

function deleteUserByIndex(idx) {
    if (!window._usersCache || !window._usersCache[idx]) return;
    const u = window._usersCache[idx];
    deleteUser(u[window._userPK], u.username);
}

function populateWilayahDropdown(selectedValue) {
    const sel = $('u-wilayah'); if(!sel) return;
    sel.innerHTML = '<option value="">-- Pilih Kelurahan --</option>';
    for (let kc in wilayahMajene) {
        const kels = wilayahMajene[kc].kels;
        for (let c in kels) {
            const name = kels[c].name;
            const selected = (selectedValue && selectedValue.toUpperCase() === name.toUpperCase()) ? ' selected' : '';
            sel.innerHTML += `<option value="${name}"${selected}>${wilayahMajene[kc].name} — ${name}</option>`;
        }
    }
}

function showUserForm(title) {
    $('user-form-title').innerText = title;
    $('user-modal').classList.add('open');
}
function closeUserModal() { $('user-modal').classList.remove('open'); editingUserId=null; $('userForm').reset(); }

function addNewUser() { editingUserId=null; $('userForm').reset(); populateWilayahDropdown(''); toggleWilayahByRole('petugas'); showUserForm('Tambah User Baru'); }

function editUser(id, username, password, role, wilayah) {
    editingUserId = id;
    $('u-username').value = username;
    $('u-password').value = password;
    $('u-role').value = role||'petugas';
    populateWilayahDropdown(wilayah||'');
    toggleWilayahByRole(role||'petugas');
    showUserForm('Edit User');
}

// Jika admin atau petugas_pelunasan, wilayah otomatis 'admin'/kosong dan dropdown disembunyikan
function toggleWilayahByRole(role) {
    const container = $('wilayah-container');
    if (!container) return;
    if (role === 'admin' || role === 'petugas_pelunasan') {
        container.style.display = 'none';
        if ($('u-wilayah')) $('u-wilayah').value = '';
    } else {
        container.style.display = 'block';
    }
}

$('userForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = $('u-username').value.trim();
    const password = $('u-password').value;
    const role = $('u-role').value;
    const wilayah = (role === 'admin' || role === 'petugas_pelunasan') ? '' : ($('u-wilayah') ? $('u-wilayah').value : '');
    if (!username||!password) { showToast("Isi semua field","error"); return; }
    try {
        if (editingUserId) {
            const pk = window._userPK || 'username';
            const {error} = await _supabase.from('users').update({username,password,role,wilayah}).eq(pk,editingUserId);
            if(error) throw error;
            logActivity('EDIT_USER', `User "${username}" (${role}) diperbarui`, wilayah || '-');
            showToast("User berhasil diperbarui");
        } else {
            const {error} = await _supabase.from('users').insert([{username,password,role,wilayah}]);
            if(error) throw error;
            logActivity('TAMBAH_USER', `User "${username}" (${role}) ditambahkan`, wilayah || '-');
            showToast("User berhasil ditambahkan");
        }
        closeUserModal(); loadUsers();
    } catch(err) { showToast("Gagal: "+(err.message||''),"error"); }
};

async function deleteUser(id, username) {
    if (username.toLowerCase()==='admin') { showToast("Tidak bisa hapus admin utama","error"); return; }
    $('modal-icon').innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size:3rem;color:#fde68a"></i>';
    $('modal-title').innerText = "Hapus User";
    $('modal-desc').innerText = `Yakin hapus user "${username}"?`;
    $('modal-confirm').onclick = async () => {
        try {
            const pk = window._userPK || 'username';
            const {error} = await _supabase.from('users').delete().eq(pk,id);
            if(error) throw error;
            logActivity('HAPUS_USER', `User "${username}" dihapus`, username);
            showToast("User dihapus"); closeModal(); loadUsers();
        } catch(err) { showToast("Gagal","error"); }
    };
    $('confirm-modal').classList.add('open');
}

// === REKAP PEMBAYARAN ===
let rekapFilterInitialized = false;
let rekapDataCache = [];

function initRekapFilter() {
    if (rekapFilterInitialized) return;
    const sel = $('filter-rekap-kecamatan');
    if (!sel) return;
    sel.innerHTML = '<option value="">Semua Kecamatan</option>';
    for (let c in wilayahMajene) sel.innerHTML += `<option value="${c}">${c} - ${wilayahMajene[c].name}</option>`;
    
    // Kunci untuk petugas
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.username.toLowerCase() === 'admin');
    if (!isAdmin && currentUser && currentUser.wilayah && currentUser.wilayah.toLowerCase() !== 'admin') {
        const kecCode = getKecamatanByKelurahan(currentUser.wilayah);
        if (kecCode) {
            sel.value = kecCode;
            sel.disabled = true;
        }
    }

    sel.onchange = () => renderRekapTable();
    rekapFilterInitialized = true;
}

async function loadRekapPembayaran() {
    initRekapFilter();
    const body = $('rekap-table-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:#94a3b8"><i class="fas fa-circle-notch animate-spin"></i> Memuat data rekap...</td></tr>';

    try {
        const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.username.toLowerCase() === 'admin');
        let q = _supabase.from('belumsetor').select('*').eq('status', 'Sudah Setor');
        
        // Filter by wilayah for non-admins
        if (!isAdmin && currentUser && currentUser.wilayah && currentUser.wilayah.toLowerCase() !== 'admin') {
            q = q.eq('wilayah', currentUser.wilayah);
        }

        const { data, error } = await q;
        if (error) throw error;
        rekapDataCache = data || [];
        renderRekapTable();
    } catch (err) {
        console.error('loadRekapPembayaran:', err);
        body.innerHTML = `<tr><td colspan="5" style="padding:2rem;text-align:center;color:#ef4444;font-weight:700">Gagal memuat data: ${err.message || ''}</td></tr>`;
    }
}

function renderRekapTable() {
    const body = $('rekap-table-body');
    if (!body) return;
    const filterKec = $('filter-rekap-kecamatan')?.value || '';

    // Group by kecamatan + kelurahan
    const grouped = {};
    rekapDataCache.forEach(t => {
        const kel = (t.wilayah || 'Umum').toUpperCase();
        const kecCode = getKecamatanByKelurahan(t.wilayah);
        const kecName = kecCode && wilayahMajene[kecCode] ? wilayahMajene[kecCode].name.toUpperCase() : 'LAINNYA';

        if (filterKec && kecCode !== filterKec) return;

        const key = `${kecName}__${kel}`;
        if (!grouped[key]) grouped[key] = { kecamatan: kecName, kelurahan: kel, total: 0 };
        grouped[key].total += parseInt(t.jumlah) || 0;
    });

    const sortedKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

    if (!sortedKeys.length) {
        body.innerHTML = '<tr><td colspan="5" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Belum ada data realisasi pembayaran</td></tr>';
        $('rekap-grand-total').innerText = 'Rp 0';
        return;
    }

    let grandTotal = 0;
    body.innerHTML = '';
    sortedKeys.forEach((key, idx) => {
        const g = grouped[key];
        grandTotal += g.total;
        const safeKey = key.replace(/'/g, "\\'");
        body.innerHTML += `<tr>
            <td style="padding:1rem 1.75rem;text-align:center;font-weight:700;color:#64748b">${idx + 1}</td>
            <td style="padding:1rem 1.75rem;font-weight:900;text-transform:uppercase">${g.kecamatan}</td>
            <td style="padding:1rem 1.75rem;font-weight:700;color:#475569;text-transform:uppercase">${g.kelurahan}</td>
            <td style="padding:1rem 1.75rem;text-align:right;font-weight:900;color:var(--success)">${formatIDR(g.total)}</td>
            <td style="padding:1rem 1.75rem;text-align:center"><button onclick="showRekapLingkungan('${safeKey}')" class="btn btn-primary btn-sm"><i class="fas fa-list"></i> Rincian</button></td>
        </tr>`;
    });
    $('rekap-grand-total').innerText = formatIDR(grandTotal);
}

function showRekapLingkungan(key) {
    const [kecName, kelName] = key.split('__');
    $('rekap-detail-kecamatan').innerText = kecName;
    $('rekap-detail-kelurahan').innerText = kelName;

    // Filter data for this kelurahan and group by lingkungan
    const filtered = rekapDataCache.filter(t => {
        const kel = (t.wilayah || 'Umum').toUpperCase();
        return kel === kelName;
    });

    const lingGrouped = {};
    filtered.forEach(t => {
        const lin = (t.lingkungan || 'Umum').toUpperCase();
        if (!lingGrouped[lin]) lingGrouped[lin] = { lingkungan: lin, total: 0 };
        lingGrouped[lin].total += parseInt(t.jumlah) || 0;
    });

    const sortedLings = Object.keys(lingGrouped).sort();
    const body = $('rekap-lingkungan-body');
    body.innerHTML = '';
    let totalKel = 0;

    sortedLings.forEach((lin, idx) => {
        const g = lingGrouped[lin];
        totalKel += g.total;
        body.innerHTML += `<tr>
            <td style="padding:0.6rem 0.75rem;text-align:center;font-weight:700;color:#64748b">${idx + 1}</td>
            <td style="padding:0.6rem 0.75rem;font-weight:700;color:#334155;text-transform:uppercase">${g.lingkungan}</td>
            <td style="padding:0.6rem 0.75rem;text-align:right;font-weight:900;color:var(--success)">${formatIDR(g.total)}</td>
        </tr>`;
    });

    $('rekap-lingkungan-total').innerText = formatIDR(totalKel);
    $('rekap-lingkungan-modal').classList.add('open');
}

// === LAPORAN NOP BARU ===
let nopBaruDataCache = [];
let nopBaruFilterInitialized = false;

function initLaporanNopBaruFilter() {
    if (nopBaruFilterInitialized) return;
    const sel = $('filter-nopbaru-kecamatan');
    if (!sel) return;
    sel.innerHTML = '<option value="">Semua Kecamatan</option>';
    for (let c in wilayahMajene) sel.innerHTML += `<option value="${c}">${c} - ${wilayahMajene[c].name}</option>`;
    
    // Kunci untuk petugas
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.username.toLowerCase() === 'admin');
    if (!isAdmin && currentUser && currentUser.wilayah && currentUser.wilayah.toLowerCase() !== 'admin') {
        const kecCode = getKecamatanByKelurahan(currentUser.wilayah);
        if (kecCode) {
            sel.value = kecCode;
            sel.disabled = true;
        }
    }

    sel.onchange = () => renderLaporanNopBaruTable();
    nopBaruFilterInitialized = true;
}

async function loadLaporanNopBaru() {
    initLaporanNopBaruFilter();
    const body = $('nopbaru-table-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6" style="padding:2rem;text-align:center;color:#94a3b8"><i class="fas fa-circle-notch animate-spin"></i> Memuat Laporan NOP Baru...</td></tr>';

    try {
        const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.username.toLowerCase() === 'admin');
        let q = _supabase.from('belumsetor').select('*').eq('is_manual', true);
        
        // Filter wilayah untuk non-admin
        if (!isAdmin && currentUser && currentUser.wilayah && currentUser.wilayah.toLowerCase() !== 'admin') {
            q = q.eq('wilayah', currentUser.wilayah);
        }

        const { data, error } = await q.order('created_at', { ascending: false });
        if (error) throw error;
        nopBaruDataCache = data || [];
        renderLaporanNopBaruTable();
    } catch (err) {
        console.error('loadLaporanNopBaru:', err);
        body.innerHTML = `<tr><td colspan="6" style="padding:2rem;text-align:center;color:#ef4444;font-weight:700">Gagal memuat data: ${err.message || ''}</td></tr>`;
    }
}

function renderLaporanNopBaruTable() {
    const body = $('nopbaru-table-body');
    if (!body) return;
    
    const filterKec = $('filter-nopbaru-kecamatan')?.value || '';
    const filterStatus = $('filter-nopbaru-status')?.value || '';

    let rows = nopBaruDataCache;

    if (filterKec) {
        rows = rows.filter(t => getKecamatanByKelurahan(t.wilayah) === filterKec);
    }
    if (filterStatus) {
        rows = rows.filter(t => t.status === filterStatus);
    }

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Belum ada NOP Baru yang diinput manual</td></tr>';
        $('nopbaru-grand-total').innerText = 'Rp 0';
        return;
    }

    let grandTotal = 0;
    body.innerHTML = '';
    rows.forEach((t, idx) => {
        grandTotal += parseInt(t.jumlah) || 0;
        
        const kecCode = getKecamatanByKelurahan(t.wilayah);
        const kecName = kecCode && wilayahMajene[kecCode] ? wilayahMajene[kecCode].name.toUpperCase() : 'LAINNYA';
        
        let statusBadge = '';
        if (t.status === 'Belum Setor') statusBadge = `<span style="padding:0.3rem 0.6rem;background:#fef2f2;color:#ef4444;border-radius:9999px;font-size:0.65rem;font-weight:900"><i class="fas fa-hourglass-half"></i> Belum Setor</span>`;
        else if (t.status === 'Sedang Diverifikasi') statusBadge = `<span style="padding:0.3rem 0.6rem;background:#fffbeb;color:#d97706;border-radius:9999px;font-size:0.65rem;font-weight:900"><i class="fas fa-shield-halved"></i> Diverifikasi</span>`;
        else statusBadge = `<span style="padding:0.3rem 0.6rem;background:#f0fdf4;color:#22c55e;border-radius:9999px;font-size:0.65rem;font-weight:900"><i class="fas fa-check-double"></i> Lunas</span>`;

        body.innerHTML += `<tr>
            <td style="padding:1rem 1.75rem;text-align:center;font-weight:700;color:#64748b">${idx + 1}</td>
            <td style="padding:1rem 1.75rem;font-weight:900;text-transform:uppercase">${kecName}</td>
            <td style="padding:1rem 1.75rem;font-weight:700;color:#475569"><div style="text-transform:uppercase">${t.wilayah || '-'}</div><div style="font-size:0.65rem;color:#94a3b8;margin-top:2px">${t.lingkungan || '-'}</div></td>
            <td style="padding:1rem 1.75rem">
                <div style="font-weight:900;color:var(--primary);font-family:'JetBrains Mono',monospace;font-size:0.8rem">${t.nop || '-'}</div>
                <div style="font-size:0.65rem;color:#475569;font-weight:700;margin-top:4px;text-transform:uppercase"><i class="fas fa-user" style="color:#94a3b8;margin-right:4px"></i> ${t.nama || 'TANPA NAMA'}</div>
            </td>
            <td style="padding:1rem 1.75rem;text-align:right;font-weight:900;color:#1e293b">${formatIDR(parseInt(t.jumlah) || 0)}</td>
            <td style="padding:1rem 1.75rem;text-align:center">${statusBadge}</td>
        </tr>`;
    });

    $('nopbaru-grand-total').innerText = formatIDR(grandTotal);
}

function closeRekapLingkunganModal() { $('rekap-lingkungan-modal').classList.remove('open'); }

// === INIT ===
async function validateSession() {
    if (!currentUser) return false;
    try {
        const { data, error } = await _supabase
            .from('users')
            .select('*')
            .eq('username', currentUser.username)
            .eq('password', currentUser.password)
            .single();
        if (error || !data) {
            // User no longer valid — clear session
            localStorage.removeItem('e_kasir_user');
            currentUser = null;
            return false;
        }
        // Update local data in case role/wilayah changed
        currentUser = data;
        localStorage.setItem('e_kasir_user', JSON.stringify(data));
        return true;
    } catch {
        localStorage.removeItem('e_kasir_user');
        currentUser = null;
        return false;
    }
}

function showLoadingOverlay() {
    let overlay = document.getElementById('session-loading');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'session-loading';
        overlay.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:1.25rem">
                <i class="fas fa-circle-notch animate-spin" style="font-size:2.5rem;color:var(--primary)"></i>
                <p style="font-weight:700;color:#cbd5e1;font-size:0.9rem;letter-spacing:0.5px">Memverifikasi sesi...</p>
            </div>`;
        document.body.appendChild(overlay);
    }
    overlay.classList.add('show');
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('session-loading');
    if (overlay) overlay.classList.remove('show');
}

window.onload = async () => {
    updateTime();
    setInterval(updateTime, 60000);

    // Muat data wilayah dari Supabase sebelum memproses hal lain
    showLoadingOverlay();
    const loadingText = document.querySelector('#session-loading p');
    if (loadingText) loadingText.innerText = "Memuat data wilayah...";
    await loadWilayahData();
    if (loadingText) loadingText.innerText = "Memverifikasi sesi...";

    if (currentUser) {
        const isValid = await validateSession();
        hideLoadingOverlay();

        if (isValid) {
            initApp();
        } else {
            showToast('Sesi tidak valid. Silakan login kembali.', 'error');
        }
    } else {
        hideLoadingOverlay();
    }
};

// === SISMIOP ===
let groupedSismiopInput = {};
let groupedSismiopSudah = {};
let currentSismiopKey = null;

function loadSismiop() {
    const fs = transactions.filter(t => t.status === 'Sudah Setor');
    
    const inputList = fs.filter(t => !t.is_sismiop);
    const sudahList = fs.filter(t => t.is_sismiop);
    
    groupedSismiopInput = _groupTransactionsByTime(inputList);
    groupedSismiopSudah = _groupTransactionsByTime(sudahList);
    
    _renderSismiopTable(groupedSismiopInput, 'sismiop-input-body', false);
    _renderSismiopTable(groupedSismiopSudah, 'sismiop-sudah-body', true);
}

function _groupTransactionsByTime(list) {
    const grouped = {};
    list.forEach(t => {
        let ds = "N/A", keyTime = "N/A"; 
        if (t.created_at) { 
            const d = new Date(t.created_at); 
            ds = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; 
            keyTime = `${ds}:${String(d.getSeconds()).padStart(2, '0')}`;
        }
        const k = `${t.wilayah || 'Umum'}_${t.lingkungan || 'Umum'}_${keyTime.replace(/[\/ :]/g, '_')}`; 
        if (!grouped[k]) grouped[k] = { wilayah: t.wilayah || 'Umum', lingkungan: t.lingkungan || 'Umum', timestamp: ds, totalJumlah: 0, items: [] }; 
        grouped[k].totalJumlah += parseInt(t.jumlah) || 0; 
        grouped[k].items.push(t);
    });
    return grouped;
}

function _renderSismiopTable(grouped, tbodyId, isSudah) {
    const tbody = $(tbodyId);
    if (!tbody) return;
    const keys = Object.keys(grouped);
    tbody.innerHTML = keys.length ? '' : '<tr><td colspan="6" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Tidak ada data</td></tr>';
    
    keys.forEach(k => {
        const g = grouped[k];
        const safeK = k.replace(/'/g, "\\'");
        
        const statusBadge = isSudah 
            ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:0.3rem 0.6rem;border-radius:9999px;background:linear-gradient(135deg,#dcfce7,#bbf7d0);color:#15803d;font-size:0.65rem;font-weight:900;border:1px solid #86efac"><i class="fas fa-check-circle"></i> Sudah Diinput</span>`
            : `<span style="display:inline-flex;align-items:center;gap:5px;padding:0.3rem 0.6rem;border-radius:9999px;background:linear-gradient(135deg,#fee2e2,#fecaca);color:#b91c1c;font-size:0.65rem;font-weight:900;border:1px solid #f87171"><i class="fas fa-exclamation-circle"></i> Belum Diinput</span>`;
            
        tbody.innerHTML += `<tr><td style="padding:1rem 1.75rem;font-weight:900;text-transform:uppercase">${g.wilayah}</td><td style="padding:1rem 1.75rem;font-weight:700;color:#64748b;text-transform:uppercase">${g.lingkungan}</td><td style="padding:1rem 1.75rem;text-align:center;font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#94a3b8">${g.timestamp}</td><td style="padding:1rem 1.75rem;text-align:right;font-weight:900;color:var(--primary)">${formatIDR(g.totalJumlah)}</td><td style="padding:1rem 1.75rem;text-align:center">${statusBadge}</td><td style="padding:1rem 1.75rem;text-align:center"><button onclick="showSismiopDetail('${safeK}', ${isSudah})" class="btn btn-dark btn-sm"><i class="fas fa-search-plus"></i> Rincian</button></td></tr>`;
    });
}

function switchSismiopTab(tab) {
    if (tab === 'input') {
        $('btn-tab-sismiop-input').classList.add('active');
        $('btn-tab-sismiop-input').style.borderBottom = '2px solid var(--primary)';
        $('btn-tab-sismiop-input').style.color = 'var(--primary)';
        $('btn-tab-sismiop-input').style.fontWeight = '900';
        
        $('btn-tab-sismiop-sudah').classList.remove('active');
        $('btn-tab-sismiop-sudah').style.borderBottom = 'none';
        $('btn-tab-sismiop-sudah').style.color = '#94a3b8';
        $('btn-tab-sismiop-sudah').style.fontWeight = '700';
        
        $('sismiop-input-container').classList.remove('hidden');
        $('sismiop-sudah-container').classList.add('hidden');
    } else {
        $('btn-tab-sismiop-sudah').classList.add('active');
        $('btn-tab-sismiop-sudah').style.borderBottom = '2px solid var(--primary)';
        $('btn-tab-sismiop-sudah').style.color = 'var(--primary)';
        $('btn-tab-sismiop-sudah').style.fontWeight = '900';
        
        $('btn-tab-sismiop-input').classList.remove('active');
        $('btn-tab-sismiop-input').style.borderBottom = 'none';
        $('btn-tab-sismiop-input').style.color = '#94a3b8';
        $('btn-tab-sismiop-input').style.fontWeight = '700';
        
        $('sismiop-sudah-container').classList.remove('hidden');
        $('sismiop-input-container').classList.add('hidden');
    }
}

function showSismiopDetail(key, isSudah) {
    currentSismiopKey = key;
    const g = isSudah ? groupedSismiopSudah[key] : groupedSismiopInput[key];
    if (!g) return;
    
    const items = g.items.map(item => {
        let blok = "N/A", urut = "N/A";
        const n = (item.nop || '').replace(/[^0-9]/g, '');
        if (n.length === 18) {
            blok = n.substring(10, 13);
            urut = n.substring(13, 17);
        }
        return { ...item, blok, urut, urutNum: parseInt(urut) || 99999, blokNum: parseInt(blok) || 999 };
    });
    
    items.sort((a, b) => {
        if (a.blokNum !== b.blokNum) return a.blokNum - b.blokNum;
        return a.urutNum - b.urutNum;
    });
    
    $('sismiop-detail-info').innerText = `Kelurahan: ${g.wilayah} | Lingkungan: ${g.lingkungan} | Waktu Setor: ${g.timestamp}`;
    
    const tbody = $('sismiop-detail-table-body');
    tbody.innerHTML = '';
    items.forEach((item, idx) => {
        tbody.innerHTML += `<tr>
            <td style="text-align:center;font-weight:900;color:#94a3b8">${idx + 1}</td>
            <td style="text-align:center;font-weight:900;color:#334155">${item.blok}</td>
            <td style="text-align:center;font-weight:900;color:#334155;font-family:'JetBrains Mono',monospace">${item.urut}</td>
            <td style="font-weight:700;color:#475569"><div style="color:#0f172a;font-weight:900">${item.nama}</div><div style="font-size:0.65rem;color:#94a3b8;margin-top:2px;font-family:'JetBrains Mono',monospace">${item.nop}</div></td>
            <td style="text-align:right;font-weight:900;color:#475569">${formatIDR(item.jumlah)}</td>
        </tr>`;
    });
    
    $('sismiop-detail-total').innerText = formatIDR(g.totalJumlah);
    
    const btnSudah = $('btn-sismiop-sudah-input');
    if (isSudah) {
        btnSudah.style.display = 'none';
    } else {
        btnSudah.style.display = 'inline-flex';
        btnSudah.onclick = () => executeSismiopPelunasan(key);
    }
    
    $('app-view').classList.add('hidden');
    $('sismiop-detail-view').classList.remove('hidden');
}

function closeSismiopDetail() {
    $('sismiop-detail-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
}

async function executeSismiopPelunasan(key) {
    const g = groupedSismiopInput[key];
    if (!g) return;
    
    if (!confirm('Apakah Anda telah melakukan pelunasan ke aplikasi SISMIOP untuk seluruh NOP ini?')) return;
    
    showLoadingOverlay();
    const loadingText = document.querySelector('#session-loading p');
    if (loadingText) loadingText.innerText = "Memproses pelunasan SISMIOP...";
    
    try {
        const ids = g.items.map(i => i.id);
        const { error } = await _supabase.from('belumsetor').update({ is_sismiop: true }).in('id', ids);
        if (error) throw error;
        
        logActivity('PELUNASAN_SISMIOP', `Pelunasan ${ids.length} NOP ke SISMIOP`, `${g.wilayah} / ${g.lingkungan}`);
        
        await refreshData();
        loadSismiop();
        
        hideLoadingOverlay();
        showToast("Pelunasan berhasil dikonfirmasi!");
        closeSismiopDetail();
        switchSismiopTab('sudah');
        
    } catch (err) {
        hideLoadingOverlay();
        showToast("Terjadi kesalahan: " + (err.message || 'Gagal update data'), "error");
    }
}

// === LOG AKTIVITAS (Admin View) ===
let logDataCache = [];

async function loadLogAktivitas() {
    const body = $('log-table-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6" style="padding:2rem;text-align:center;color:#94a3b8"><i class="fas fa-circle-notch animate-spin"></i> Memuat log...</td></tr>';
    try {
        const { data, error } = await _supabase
            .from('log_aktivitas')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);
        if (error) throw error;
        logDataCache = data || [];
        renderLogTable();
    } catch(err) {
        body.innerHTML = `<tr><td colspan="6" style="padding:2rem;text-align:center;color:#ef4444;font-weight:700">Gagal memuat log: ${err.message}</td></tr>`;
    }
}

function renderLogTable() {
    const body = $('log-table-body');
    if (!body) return;
    const filterAksi   = $('filter-log-aksi')?.value   || '';
    const filterUser   = ($('filter-log-user')?.value  || '').toLowerCase();
    const filterDari   = $('filter-log-dari')?.value   || '';
    const filterSampai = $('filter-log-sampai')?.value || '';

    const BADGES = {
        'LOGIN':            { bg:'#dbeafe', c:'#1d4ed8', lbl:'Login' },
        'LOGOUT':           { bg:'#f1f5f9', c:'#475569', lbl:'Logout' },
        'SIMPAN_TRANSAKSI': { bg:'#dcfce7', c:'#15803d', lbl:'Simpan Transaksi' },
        'SETOR':            { bg:'#fef3c7', c:'#92400e', lbl:'Setor' },
        'VERIF_SETUJU':     { bg:'#d1fae5', c:'#065f46', lbl:'Verif. Setuju' },
        'VERIF_TOLAK':      { bg:'#fee2e2', c:'#991b1b', lbl:'Verif. Tolak' },
        'TAMBAH_USER':      { bg:'#ede9fe', c:'#5b21b6', lbl:'Tambah User' },
        'EDIT_USER':        { bg:'#e0e7ff', c:'#3730a3', lbl:'Edit User' },
        'HAPUS_USER':       { bg:'#fee2e2', c:'#991b1b', lbl:'Hapus User' },
    };

    let rows = logDataCache;
    if (filterAksi)   rows = rows.filter(l => l.aksi === filterAksi);
    if (filterUser)   rows = rows.filter(l => (l.username||'').toLowerCase().includes(filterUser));
    if (filterDari)   rows = rows.filter(l => l.created_at >= filterDari);
    if (filterSampai) rows = rows.filter(l => l.created_at <= filterSampai + 'T23:59:59');

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Tidak ada log aktivitas</td></tr>';
        return;
    }
    body.innerHTML = '';
    rows.forEach((log, idx) => {
        const b = BADGES[log.aksi] || { bg:'#f1f5f9', c:'#475569', lbl: log.aksi };
        let ds = '-';
        if (log.created_at) {
            const d = new Date(log.created_at);
            ds = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} <span style="color:#94a3b8">${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}</span>`;
        }
        body.innerHTML += `<tr>
            <td style="padding:0.7rem 1rem;text-align:center;font-size:0.72rem;color:#94a3b8;font-weight:700">${idx+1}</td>
            <td style="padding:0.7rem 1rem;font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:#334155;white-space:nowrap">${ds}</td>
            <td style="padding:0.7rem 1rem;font-weight:900;color:#1e293b;font-size:0.8rem">${log.username||'-'}</td>
            <td style="padding:0.7rem 1rem"><span style="display:inline-block;padding:0.2rem 0.65rem;border-radius:9999px;background:${b.bg};color:${b.c};font-size:0.65rem;font-weight:900;white-space:nowrap">${b.lbl}</span></td>
            <td style="padding:0.7rem 1rem;font-size:0.78rem;color:#475569;font-weight:600">${log.keterangan||'-'}</td>
            <td style="padding:0.7rem 1rem;font-size:0.75rem;color:#64748b;font-weight:700">${log.target||'-'}</td>
        </tr>`;
    });
}

