// e-Kasir PBB P2 — Modals, Verification, Reports, User Management

// === DETAIL MODAL (Belum Setor) ===
function showGroupDetail(key) {
    const g = groupedTransactions[key]; if (!g) return;
    $('detail-kelurahan').innerText = g.wilayah;
    $('detail-lingkungan').innerText = g.lingkungan;
    $('detail-total-rekap').innerText = formatIDR(g.totalJumlah);
    const body = $('detail-table-body'); body.innerHTML = '';
    g.items.forEach(item => {
        body.innerHTML += `<tr><td style="padding:0.6rem 0.75rem"><div style="font-weight:700;color:#334155">${item.nama}</div><div style="font-size:0.6rem;color:#94a3b8;font-weight:700">${item.nop}</div></td><td style="padding:0.6rem 0.75rem;text-align:right;font-weight:700;color:#475569">${formatIDR(item.jumlah)}</td></tr>`;
    });
    $('btn-proses-setor').onclick = () => executeSetorGroup(key);
    $('detail-modal').classList.add('open');
}
function closeDetailModal() { $('detail-modal').classList.remove('open'); }

async function executeSetorGroup(key) {
    const g = groupedTransactions[key]; if (!g) return;
    const ids = g.items.map(i => i.id);
    const btn = $('btn-proses-setor');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Memproses...';
    try {
        const { error } = await _supabase.from('belumsetor').update({status:'Sedang Diverifikasi'}).in('id', ids);
        if (error) throw error;
        showToast("Berhasil diajukan untuk verifikasi Admin!");
        closeDetailModal(); refreshData();
    } catch(err) { console.error(err); showToast("Gagal memproses","error"); }
    finally { btn.disabled = false; btn.innerHTML = 'Setor Sekarang'; }
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
    if (!isAdmin) { vB.innerHTML = '<tr><td colspan="4" style="padding:3rem;text-align:center;color:#ef4444;font-weight:900;font-size:0.65rem;text-transform:uppercase">Akses Ditolak</td></tr>'; return; }
    vB.innerHTML = list.length ? '' : '<tr><td colspan="4" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Tidak ada setoran menunggu verifikasi</td></tr>';
    list.forEach(t => {
        vB.innerHTML += `<tr><td style="padding:1rem 1.75rem"><div style="font-weight:900;font-size:0.85rem">${t.petugas}</div><div style="font-size:0.6rem;color:#94a3b8;font-weight:700;text-transform:uppercase">WP: ${t.nama}</div></td><td style="padding:1rem 1.75rem"><div style="font-weight:700;color:#475569">${t.wilayah} | ${t.lingkungan}</div><div style="font-size:0.65rem;font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:700">${t.nop}</div></td><td style="padding:1rem 1.75rem;text-align:right;font-weight:900">${formatIDR(t.jumlah)}</td><td style="padding:1rem 1.75rem;text-align:center"><div style="display:flex;gap:0.5rem;justify-content:center"><button onclick="approveSetor('${t.id}')" class="btn btn-success btn-sm"><i class="fas fa-check"></i> Setuju</button><button onclick="rejectSetor('${t.id}')" class="btn btn-danger btn-sm"><i class="fas fa-times"></i> Tolak</button></div></td></tr>`;
    });
}

async function approveSetor(id) {
    $('modal-icon').innerHTML = '<i class="fas fa-check-circle" style="font-size:3rem;color:#a7f3d0"></i>';
    $('modal-title').innerText = "Konfirmasi Setuju";
    $('modal-desc').innerText = "Setujui setoran ini? Status akan berubah menjadi 'Sudah Setor'.";
    $('modal-confirm').onclick = async () => {
        try {
            const {error} = await _supabase.from('belumsetor').update({status:'Sudah Setor',created_at:new Date().toISOString()}).eq('id',id);
            if(error) throw error;
            showToast("Verifikasi disetujui!"); closeModal(); refreshData();
        } catch(err) { showToast("Gagal","error"); }
    };
    $('confirm-modal').classList.add('open');
}

async function rejectSetor(id) {
    $('modal-icon').innerHTML = '<i class="fas fa-times-circle" style="font-size:3rem;color:#fecaca"></i>';
    $('modal-title').innerText = "Tolak Setoran";
    $('modal-desc').innerText = "Tolak setoran ini? Status akan kembali ke 'Belum Setor'.";
    $('modal-confirm').onclick = async () => {
        try {
            const {error} = await _supabase.from('belumsetor').update({status:'Belum Setor'}).eq('id',id);
            if(error) throw error;
            showToast("Setoran ditolak"); closeModal(); refreshData();
        } catch(err) { showToast("Gagal","error"); }
    };
    $('confirm-modal').classList.add('open');
}
function closeModal() { $('confirm-modal').classList.remove('open'); }

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

// Jika admin, wilayah otomatis 'admin' dan dropdown disembunyikan
function toggleWilayahByRole(role) {
    const container = $('wilayah-container');
    if (!container) return;
    if (role === 'admin') {
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
    const wilayah = ($('u-role').value === 'admin') ? 'admin' : ($('u-wilayah') ? $('u-wilayah').value : '');
    if (!username||!password) { showToast("Isi semua field","error"); return; }
    try {
        if (editingUserId) {
            const pk = window._userPK || 'username';
            const {error} = await _supabase.from('users').update({username,password,role,wilayah}).eq(pk,editingUserId);
            if(error) throw error;
            showToast("User berhasil diperbarui");
        } else {
            const {error} = await _supabase.from('users').insert([{username,password,role,wilayah}]);
            if(error) throw error;
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
            showToast("User dihapus"); closeModal(); loadUsers();
        } catch(err) { showToast("Gagal","error"); }
    };
    $('confirm-modal').classList.add('open');
}

// === REKAP PEMBAYARAN ===
let rekapFilterInitialized = false;

function initRekapFilter() {
    if (rekapFilterInitialized) return;
    const sel = $('filter-rekap-kecamatan');
    if (!sel) return;
    sel.innerHTML = '<option value="">Semua Kecamatan</option>';
    for (let c in wilayahMajene) sel.innerHTML += `<option value="${c}">${c} - ${wilayahMajene[c].name}</option>`;
    sel.onchange = () => loadRekapPembayaran();
    rekapFilterInitialized = true;
}

async function loadRekapPembayaran() {
    initRekapFilter();
    const body = $('rekap-table-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:#94a3b8"><i class="fas fa-circle-notch animate-spin"></i> Memuat data rekap...</td></tr>';

    try {
        const { data, error } = await _supabase.from('belumsetor').select('*').eq('status', 'Sudah Setor');
        if (error) throw error;
        const rows = data || [];

        // Get filter
        const filterKec = $('filter-rekap-kecamatan')?.value || '';

        // Group by kecamatan + kelurahan + lingkungan
        const grouped = {};
        rows.forEach(t => {
            const kel = (t.wilayah || 'Umum').toUpperCase();
            const lin = (t.lingkungan || 'Umum').toUpperCase();
            const kecCode = getKecamatanByKelurahan(t.wilayah);
            const kecName = kecCode && wilayahMajene[kecCode] ? wilayahMajene[kecCode].name.toUpperCase() : 'LAINNYA';

            // Apply filter
            if (filterKec && kecCode !== filterKec) return;

            const key = `${kecName}__${kel}__${lin}`;
            if (!grouped[key]) grouped[key] = { kecamatan: kecName, kelurahan: kel, lingkungan: lin, total: 0 };
            grouped[key].total += parseInt(t.jumlah) || 0;
        });

        // Sort by kecamatan, kelurahan, lingkungan
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
            body.innerHTML += `<tr>
                <td style="padding:1rem 1.75rem;text-align:center;font-weight:700;color:#64748b">${idx + 1}</td>
                <td style="padding:1rem 1.75rem;font-weight:900;text-transform:uppercase">${g.kecamatan}</td>
                <td style="padding:1rem 1.75rem;font-weight:700;color:#475569;text-transform:uppercase">${g.kelurahan}</td>
                <td style="padding:1rem 1.75rem;font-weight:600;color:#64748b;text-transform:uppercase">${g.lingkungan}</td>
                <td style="padding:1rem 1.75rem;text-align:right;font-weight:900;color:var(--success)">${formatIDR(g.total)}</td>
            </tr>`;
        });
        $('rekap-grand-total').innerText = formatIDR(grandTotal);

    } catch (err) {
        console.error('loadRekapPembayaran:', err);
        body.innerHTML = `<tr><td colspan="5" style="padding:2rem;text-align:center;color:#ef4444;font-weight:700">Gagal memuat data: ${err.message || ''}</td></tr>`;
    }
}

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

    if (currentUser) {
        // Show loading while validating session
        showLoadingOverlay();
        const isValid = await validateSession();
        hideLoadingOverlay();

        if (isValid) {
            initApp();
        } else {
            showToast('Sesi tidak valid. Silakan login kembali.', 'error');
        }
    }
};
