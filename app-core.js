// e-Kasir PBB P2 — Core Application Logic
const SUPABASE_URL = "https://fuhtwnlesuyatxyccjop.supabase.co";
const SUPABASE_KEY = "sb_publishable_oyB8kfW9L_vhdFEFqzbv-w_juy_tWV4";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = JSON.parse(localStorage.getItem('e_kasir_user'));
let cartItems = [];
let transactions = [];
let groupedTransactions = {};
let groupedHistoryTransactions = {};
let groupedVerifikasiTransactions = {};
let currentHistoryGroupKey = null;
let wilayahMajene = {}; // Data wilayah dinamis dari Supabase

// === UTILITIES ===
function formatIDR(n) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n); }
function $(id) { return document.getElementById(id); }
function showToast(m, type = "success") {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerText = m;
    $('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 4000);
}
function updateTime() {
    $('date-display').innerHTML = `<i class="fas fa-calendar-alt" style="color:var(--primary-light);margin-right:4px"></i>${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

// === PENGAMBILAN DATA WILAYAH ===
async function loadWilayahData() {
    try {
        const [resKec, resKel, resLing] = await Promise.all([
            _supabase.from('kecamatan').select('*'),
            _supabase.from('kelurahan').select('*'),
            _supabase.from('lingkungan_dusun').select('*')
        ]);
        
        if (resKec.error) throw resKec.error;
        if (resKel.error) throw resKel.error;
        if (resLing.error) throw resLing.error;

        const dataKec = resKec.data || [];
        const dataKel = resKel.data || [];
        const dataLing = resLing.data || [];

        console.log("Raw Fetch Kecamatan:", dataKec);
        console.log("Raw Fetch Kelurahan:", dataKel);
        console.log("Raw Fetch Lingkungan:", dataLing);

        const newWilayah = {};

        // 1. Map kecamatan
        dataKec.forEach(kec => {
            if (!kec.kode) console.warn("Kecamatan tidak punya 'kode':", kec);
            newWilayah[kec.kode] = {
                name: kec.kecamatan,
                kels: {}
            };
        });

        // 2. Map kelurahan
        dataKel.forEach(kel => {
            if (newWilayah[kel.kode_kecamatan]) {
                newWilayah[kel.kode_kecamatan].kels[kel.kode_kelurahan] = {
                    name: kel.kelurahan,
                    lings: []
                };
            }
        });

        // 3. Map lingkungan_dusun
        dataLing.forEach(ling => {
            if (newWilayah[ling.kode_kecamatan] && newWilayah[ling.kode_kecamatan].kels[ling.kode_kelurahan]) {
                newWilayah[ling.kode_kecamatan].kels[ling.kode_kelurahan].lings.push(ling.nama_wilayah);
            }
        });

        wilayahMajene = newWilayah;
        console.log("Data Wilayah berhasil dimuat:", Object.keys(wilayahMajene).length, "Kecamatan");
    } catch (err) {
        console.error("Gagal memuat data wilayah:", err);
        showToast("Gagal memuat data wilayah, harap muat ulang aplikasi.", "error");
    }
}

// === LOG AKTIVITAS ===
async function logActivity(aksi, keterangan, target = '') {
    try {
        await _supabase.from('log_aktivitas').insert([{
            username: currentUser?.username || 'sistem',
            aksi,
            keterangan,
            target,
            created_at: new Date().toISOString()
        }]);
    } catch (err) {
        console.warn('[Log] Gagal catat:', aksi, err.message);
    }
}

// === IDLE TIMEOUT (30 menit) ===
const IDLE_LIMIT = 30 * 60 * 1000; // 30 menit
const WARN_BEFORE = 60 * 1000;       // warning 60 detik sebelum logout
let _idleTimer = null, _warnTimer = null, _cdInterval = null;

const _IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

function resetIdleTimer() {
    clearTimeout(_idleTimer);
    clearTimeout(_warnTimer);
    _warnTimer = setTimeout(_showIdleWarning, IDLE_LIMIT - WARN_BEFORE);
    _idleTimer = setTimeout(forceLogout, IDLE_LIMIT);
}

function startIdleMonitor() {
    _IDLE_EVENTS.forEach(e => document.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();
}

function stopIdleMonitor() {
    _IDLE_EVENTS.forEach(e => document.removeEventListener(e, resetIdleTimer));
    clearTimeout(_idleTimer); clearTimeout(_warnTimer); clearInterval(_cdInterval);
}

function _showIdleWarning() {
    let secs = 60;
    $('idle-countdown').innerText = secs;
    $('idle-warning-modal').classList.add('open');
    _cdInterval = setInterval(() => {
        secs--;
        if ($('idle-countdown')) $('idle-countdown').innerText = secs;
        if (secs <= 0) clearInterval(_cdInterval);
    }, 1000);
}

function keepSession() {
    $('idle-warning-modal').classList.remove('open');
    clearInterval(_cdInterval);
    resetIdleTimer();
}

async function forceLogout() {
    stopIdleMonitor();
    $('idle-warning-modal').classList.remove('open');
    await logActivity('LOGOUT', 'Sesi berakhir otomatis — 30 menit tidak aktif');
    localStorage.clear();
    location.reload();
}

// === AUTH ===
$('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const u = $('username').value.trim(), p = $('password').value;
    const btn = $('btnLogin'), err = $('login-error');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i>';
    err.classList.remove('show');
    try {
        const { data, error } = await _supabase.from('users').select('*').eq('username', u).eq('password', p).single();
        if (error || !data) throw new Error();
        currentUser = data;
        localStorage.setItem('e_kasir_user', JSON.stringify(data));
        logActivity('LOGIN', `Login berhasil sebagai ${data.role || 'petugas'}`, data.wilayah || '-');
        initApp();
    } catch {
        err.classList.add('show');
        btn.disabled = false; btn.innerText = "Masuk";
    }
};

async function confirmLogout() {
    stopIdleMonitor();
    await logActivity('LOGOUT', 'Pengguna keluar dari sistem');
    localStorage.clear();
    location.reload();
}

// === INIT APP ===
function initApp() {
    $('login-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    $('user-display').innerHTML = `<i class="fas fa-user-circle" style="color:var(--primary-light);margin-right:4px"></i>${currentUser.username}`;
    const isAdmin = currentUser.role === 'admin' || currentUser.username.toLowerCase() === 'admin';
    $('nav-verifikasi').classList.toggle('hidden', !isAdmin);
    $('mob-verifikasi').classList.toggle('hidden', !isAdmin);
    $('nav-users').classList.toggle('hidden', !isAdmin);
    $('mob-users').classList.toggle('hidden', !isAdmin);
    $('nav-log-aktivitas').classList.toggle('hidden', !isAdmin);
    $('mob-log-aktivitas').classList.toggle('hidden', !isAdmin);
    initDropdowns(); initFilterDropdowns(); initHistoryFilterDropdowns();
    lockWilayahForPetugas(); // kunci wilayah jika petugas
    refreshData(); switchTab('beranda');
    startIdleMonitor(); // mulai pantau idle setelah login
}

// === DROPDOWNS ===
function populateKecDropdown(sel, placeholder) {
    sel.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
    for (let code in wilayahMajene) sel.innerHTML += `<option value="${code}">${code} - ${wilayahMajene[code].name}</option>`;
}
function chainKelDropdown(selKec, selKel, selLin, cb) {
    selKec.onchange = function () {
        selKel.disabled = false;
        selKel.innerHTML = '<option value="" disabled selected>Pilih Kelurahan</option>';
        const kels = wilayahMajene[this.value].kels;
        for (let c in kels) selKel.innerHTML += `<option value="${c}">${c} - ${kels[c].name}</option>`;
        selLin.disabled = true; selLin.innerHTML = '<option value="" disabled selected>Pilih Lingkungan</option>';
        if (cb) cb();
    };
    selKel.onchange = function () {
        selLin.disabled = false;
        selLin.innerHTML = '<option value="" disabled selected>Pilih Lingkungan</option>';
        wilayahMajene[selKec.value].kels[this.value].lings.forEach(l => selLin.innerHTML += `<option value="${l}">${l}</option>`);
        if (cb) cb();
    };
    if (cb) selLin.onchange = cb;
}
function initDropdowns() {
    populateKecDropdown($('p-kecamatan'), 'Pilih Kecamatan');
    chainKelDropdown($('p-kecamatan'), $('p-kelurahan'), $('p-lingkungan'));
}

function initFilterSet(kecId, kelId, linId, applyCb) {
    const fK = $(kecId), fL = $(kelId), fLn = $(linId);
    fK.innerHTML = '<option value="">Semua Kecamatan</option>';
    for (let c in wilayahMajene) fK.innerHTML += `<option value="${c}">${c} - ${wilayahMajene[c].name}</option>`;
    fL.innerHTML = '<option value="">Semua Kelurahan</option>'; fL.disabled = true;
    fLn.innerHTML = '<option value="">Semua Lingkungan</option>'; fLn.disabled = true;
    fK.onchange = function () {
        fL.innerHTML = '<option value="">Semua Kelurahan</option>';
        fLn.innerHTML = '<option value="">Semua Lingkungan</option>'; fLn.disabled = true;
        if (!this.value) { fL.disabled = true; } else {
            fL.disabled = false;
            const kels = wilayahMajene[this.value].kels;
            for (let c in kels) fL.innerHTML += `<option value="${kels[c].name}">${kels[c].name}</option>`;
        }
        applyCb();
    };
    fL.onchange = function () {
        fLn.innerHTML = '<option value="">Semua Lingkungan</option>';
        if (!this.value) { fLn.disabled = true; } else {
            fLn.disabled = false;
            const kels = wilayahMajene[fK.value].kels;
            for (let c in kels) if (kels[c].name === this.value) kels[c].lings.forEach(l => fLn.innerHTML += `<option value="${l}">${l}</option>`);
        }
        applyCb();
    };
    fLn.onchange = applyCb;
}
function initFilterDropdowns() { initFilterSet('filter-kecamatan', 'filter-kelurahan', 'filter-lingkungan', applyFilters); }
function initHistoryFilterDropdowns() { initFilterSet('filter-history-kecamatan', 'filter-history-kelurahan', 'filter-history-lingkungan', applyFilters); }

// === PEMBATASAN WILAYAH UNTUK PETUGAS ===
function lockWilayahForPetugas() {
    const isAdmin = currentUser.role === 'admin' || currentUser.username.toLowerCase() === 'admin';
    if (isAdmin) return; // admin bebas tanpa batasan

    const wilayah = (currentUser.wilayah || '').trim();
    if (!wilayah || wilayah.toLowerCase() === 'admin') return;

    const kecCode = getKecamatanByKelurahan(wilayah);
    if (!kecCode) return;

    // --- 1. Tampilkan badge wilayah di header ---
    const userDisp = $('user-display');
    if (userDisp) {
        userDisp.innerHTML += ` <span style="display:inline-block;padding:0.15rem 0.6rem;border-radius:9999px;background:rgba(99,102,241,0.15);color:#818cf8;font-size:0.65rem;font-weight:900;letter-spacing:0.3px;margin-left:4px"><i class="fas fa-map-marker-alt" style="margin-right:3px"></i>${wilayah}</span>`;
    }

    // --- 2. Kunci Form Cari NOP ---
    const selKec = $('p-kecamatan'), selKel = $('p-kelurahan'), selLin = $('p-lingkungan');
    // Pilih kecamatan dan trigger populate kelurahan
    selKec.value = kecCode;
    selKec.dispatchEvent(new Event('change'));
    // Cari kode kelurahan dari nama
    const kelsForKec = wilayahMajene[kecCode].kels;
    for (let c in kelsForKec) {
        if (kelsForKec[c].name.toUpperCase() === wilayah.toUpperCase()) {
            selKel.value = c;
            selKel.dispatchEvent(new Event('change')); // populate lingkungan
            break;
        }
    }
    // Kunci kecamatan & kelurahan, biarkan lingkungan bebas
    selKec.disabled = true;
    selKel.disabled = true;
    selLin.disabled = false;
    // Tambah label kunci visual
    const formPanel = selKec.closest('form') || selKec.parentElement?.parentElement;
    if (formPanel) {
        const lockBadge = document.createElement('div');
        lockBadge.style.cssText = 'font-size:0.68rem;font-weight:700;color:#6366f1;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:0.5rem;padding:0.5rem 0.75rem;margin-bottom:0.5rem;display:flex;align-items:center;gap:6px';
        lockBadge.innerHTML = `<i class="fas fa-lock"></i> Wilayah terkunci: <strong>${wilayah}</strong>`;
        formPanel.insertBefore(lockBadge, formPanel.firstChild);
    }

    // --- 3. Kunci filter Belum Setor ---
    _applyWilayahFilter('filter-kecamatan', 'filter-kelurahan', 'filter-lingkungan', kecCode, wilayah);

    // --- 4. Kunci filter Riwayat ---
    _applyWilayahFilter('filter-history-kecamatan', 'filter-history-kelurahan', 'filter-history-lingkungan', kecCode, wilayah);
}

function _applyWilayahFilter(kecId, kelId, linId, kecCode, wilayah) {
    const fK = $(kecId), fL = $(kelId), fLn = $(linId);
    if (!fK || !fL) return;
    // Set & lock kecamatan
    fK.value = kecCode;
    fK.disabled = true;
    // Populate & set kelurahan
    fL.innerHTML = '<option value="">Semua Kelurahan</option>';
    const kels = wilayahMajene[kecCode].kels;
    for (let c in kels) fL.innerHTML += `<option value="${kels[c].name}">${kels[c].name}</option>`;
    fL.value = wilayah;
    fL.disabled = true;
    // Populate lingkungan agar bisa filter per lingkungan
    if (fLn) {
        fLn.innerHTML = '<option value="">Semua Lingkungan</option>';
        for (let c in kels) {
            if (kels[c].name.toUpperCase() === wilayah.toUpperCase()) {
                kels[c].lings.forEach(l => fLn.innerHTML += `<option value="${l}">${l}</option>`);
                break;
            }
        }
        fLn.disabled = false;
    }
    applyFilters();
}

function applyFilters() {
    const belum = transactions.filter(t => t.status === 'Belum Setor' || t.status === 'Sedang Diverifikasi');
    const sudah = transactions.filter(t => t.status === 'Sudah Setor');
    renderLists(belum, sudah);
}

function getKecamatanByKelurahan(kelName) {
    if (!kelName) return null;
    for (let kc in wilayahMajene) { const kels = wilayahMajene[kc].kels; for (let c in kels) if (kels[c].name.toUpperCase() === kelName.toUpperCase()) return kc; }
    return null;
}

// === SEARCH & CART ===
$('searchForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('btnCari'), kec = $('p-kecamatan').value, kel = $('p-kelurahan').value;
    const lin = $('p-lingkungan').value, blok = $('p-blok').value.trim().padStart(3, '0');
    const urutInput = $('p-nourut').value.trim();
    if (!urutInput) return;
    const uruts = urutInput.split(/[, ]+/).filter(x => x.trim());
    const namaKel = wilayahMajene[kec]?.kels[kel]?.name || '';
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> MENCARI...';
    let added = 0;
    for (let urut of uruts) {
        const u = urut.padStart(4, '0');
        const nopClean = `7602${kec}${kel}${blok}${u}0`, nopDot = `76.02.${kec}.${kel}.${blok}-${u}.0`;
        try {
            const { data, error } = await _supabase.from('sppt2026').select('*').in('NOP', [nopClean, nopDot]).maybeSingle();
            if (error) throw error;
            if (data) {
                if (!cartItems.find(c => c.nop === data.NOP)) {
                    let raw = 0;
                    const keys = Object.keys(data), fk = keys.find(k => k.toLowerCase() === 'jumlah');
                    if (fk) raw = data[fk]; else raw = data['PBB_YG_HARUS_DIBAYAR_'] || data['PBB_YG_HARUS_DIBAYAR'] || data['PBB_DIBAYAR'] || 0;
                    let cs = String(raw).trim().replace(/Rp/gi, '').trim().replace(/[,.]00$/, '').replace(/[^0-9]/g, '');
                    cartItems.push({ nop: data.NOP, nama: data.NM_WP_SPPT || data.NAMA_WP || 'TANPA NAMA', jumlah: parseInt(cs) || 0, lingkungan: lin, wilayah: namaKel });
                    added++;
                }
            } else showToast(`NOP ${u} tidak ditemukan`, "error");
        } catch (err) { console.error(err); }
    }
    if (cartItems.length > 0) { renderCart(); $('search-result').classList.remove('hidden'); if (added > 0) showToast(`${added} data berhasil ditarik`); }
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> Cari Data Tagihan';
};

function renderCart() {
    const body = $('res-table-body'); body.innerHTML = ''; let total = 0;
    cartItems.forEach((item, idx) => {
        total += item.jumlah;
        body.innerHTML += `<tr><td class="px-4 py-3"><div style="font-weight:900;color:#1e293b;font-size:0.85rem">${item.nama}</div><div style="font-size:0.65rem;font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:700">${item.nop}</div><div style="font-size:0.6rem;color:#94a3b8;font-weight:600"><i class="fas fa-map-marker-alt" style="color:var(--primary-light)"></i> ${item.wilayah || '-'} | ${item.lingkungan || '-'}</div></td><td style="text-align:right;font-weight:900;padding:0.75rem 1rem">${formatIDR(item.jumlah)}</td><td style="text-align:center;padding:0.75rem"><button onclick="removeFromCart(${idx})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem"><i class="fas fa-trash-alt"></i></button></td></tr>`;
    });
    $('res-total-bayar').innerText = formatIDR(total);
}
function removeFromCart(i) { cartItems.splice(i, 1); if (!cartItems.length) $('search-result').classList.add('hidden'); renderCart(); }

async function processCart() {
    const btn = $('btnSimpan'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> MENYIMPAN...';
    try {
        const data = cartItems.map(i => ({ nop: i.nop, nama: i.nama, jumlah: i.jumlah, lingkungan: i.lingkungan, wilayah: i.wilayah, petugas: currentUser.username, status: 'Belum Setor', created_at: new Date().toISOString() }));
        const { error: e1 } = await _supabase.from('belumsetor').insert(data); if (e1) throw e1;
        const { error: e2 } = await _supabase.from('sppt2026').delete().in('NOP', cartItems.map(i => i.nop)); if (e2) throw e2;
        const _wpCount = cartItems.length, _total = cartItems.reduce((s, i) => s + (parseInt(i.jumlah) || 0), 0), _lin = cartItems[0]?.lingkungan || '-', _wil = cartItems[0]?.wilayah || '-';
        logActivity('SIMPAN_TRANSAKSI', `${_wpCount} WP — ${formatIDR(_total)}`, `${_wil} / ${_lin}`);
        showToast("Transaksi Berhasil Disimpan & Data SPPT Dimutasi!");
        cartItems = []; $('search-result').classList.add('hidden'); $('searchForm').reset(); refreshData(); switchTab('beranda');
    } catch (err) {
        let msg = "Gagal menyimpan"; if (err?.code === 'PGRST204') msg = "Kolom belum dibuat di tabel Supabase"; else if (err?.message) msg += ": " + err.message;
        showToast(msg, "error");
    } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Simpan Transaksi'; }
}

// === DATA REFRESH ===
async function refreshData() {
    try {
        const isAdmin = currentUser.role === 'admin' || currentUser.username.toLowerCase() === 'admin';
        let q = _supabase.from('belumsetor').select('*');
        // Petugas hanya melihat data sesuai wilayah/kelurahan yang terdaftar
        if (!isAdmin && currentUser.wilayah) q = q.eq('wilayah', currentUser.wilayah);
        const { data, error } = await q; if (error) throw error;
        transactions = data || [];
        const belum = transactions.filter(t => t.status === 'Belum Setor' || t.status === 'Sedang Diverifikasi'), verif = transactions.filter(t => t.status === 'Sedang Diverifikasi'), sudah = transactions.filter(t => t.status === 'Sudah Setor');
        const tB = belum.reduce((s, t) => s + (parseInt(t.jumlah) || 0), 0), tV = verif.reduce((s, t) => s + (parseInt(t.jumlah) || 0), 0), tS = sudah.reduce((s, t) => s + (parseInt(t.jumlah) || 0), 0);
        $('stat-total').innerText = formatIDR(tS); $('stat-belum').innerText = formatIDR(tB); $('stat-verifikasi').innerText = formatIDR(tV); $('stat-sudah').innerText = formatIDR(tS);
        renderLists(belum, sudah); renderVerificationList(verif);
    } catch (err) { console.error("Refresh:", err); }
}

// === RENDER LISTS ===
function renderLists(belum, sudah) {
    const bB = $('list-belum-body'), sB = $('list-sudah-body');
    // Filter belum setor
    const fK = $('filter-kecamatan')?.value || '', fL = $('filter-kelurahan')?.value || '', fLn = $('filter-lingkungan')?.value || '';
    let fb = belum;
    if (fK) fb = fb.filter(t => getKecamatanByKelurahan(t.wilayah) === fK);
    if (fL) fb = fb.filter(t => (t.wilayah || '').toUpperCase() === fL.toUpperCase());
    if (fLn) fb = fb.filter(t => (t.lingkungan || '').toUpperCase() === fLn.toUpperCase());
    groupedTransactions = {};
    fb.forEach(t => { const k = `${t.wilayah || 'Umum'}_${t.lingkungan || 'Umum'}`; if (!groupedTransactions[k]) groupedTransactions[k] = { wilayah: t.wilayah || 'Umum', lingkungan: t.lingkungan || 'Umum', totalJumlah: 0, items: [] }; groupedTransactions[k].totalJumlah += parseInt(t.jumlah) || 0; groupedTransactions[k].items.push(t); });
    const bKeys = Object.keys(groupedTransactions);
    bB.innerHTML = bKeys.length ? '' : '<tr><td colspan="5" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Tidak ada data</td></tr>';
    bKeys.forEach(k => {
        const g = groupedTransactions[k];
        const isVerif = g.items.every(i => i.status === 'Sedang Diverifikasi');
        const rowBg = isVerif ? 'background:rgba(251,191,36,0.08);' : '';
        const actionBtn = isVerif
            ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:0.4rem 0.85rem;border-radius:9999px;background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;font-size:0.7rem;font-weight:900;letter-spacing:0.3px;border:1px solid #fcd34d;white-space:nowrap"><i class="fas fa-clock"></i> Sedang Diverifikasi</span>`
            : `<button onclick="showGroupDetail('${k}')" class="btn btn-primary btn-sm"><i class="fas fa-list"></i> Rincian</button>`;
        bB.innerHTML += `<tr style="${rowBg}"><td style="padding:1rem 1.75rem;font-weight:900;text-transform:uppercase">${g.wilayah}</td><td style="padding:1rem 1.75rem;font-weight:700;color:#64748b;text-transform:uppercase">${g.lingkungan}</td><td style="padding:1rem 1.75rem;text-align:center;font-weight:900;color:#334155"><span class="badge badge-petugas" style="background:#f1f5f9;color:#475569">${g.items.length} WP</span></td><td style="padding:1rem 1.75rem;text-align:right;font-weight:900;color:var(--primary)">${formatIDR(g.totalJumlah)}</td><td style="padding:1rem 1.75rem;text-align:center">${actionBtn}</td></tr>`;
    });
    // Filter riwayat
    const hK = $('filter-history-kecamatan')?.value || '', hL = $('filter-history-kelurahan')?.value || '', hLn = $('filter-history-lingkungan')?.value || '';
    let fs = sudah;
    if (hK) fs = fs.filter(t => getKecamatanByKelurahan(t.wilayah) === hK);
    if (hL) fs = fs.filter(t => (t.wilayah || '').toUpperCase() === hL.toUpperCase());
    if (hLn) fs = fs.filter(t => (t.lingkungan || '').toUpperCase() === hLn.toUpperCase());
    groupedHistoryTransactions = {};
    fs.forEach(t => {
        let ds = "N/A", keyTime = "N/A"; 
        if (t.created_at) { 
            const d = new Date(t.created_at); 
            ds = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; 
            keyTime = `${ds}:${String(d.getSeconds()).padStart(2, '0')}`; // gunakan detik untuk unique key
        }
        const k = `${t.wilayah || 'Umum'}_${t.lingkungan || 'Umum'}_${keyTime.replace(/[\/ :]/g, '_')}`; 
        if (!groupedHistoryTransactions[k]) groupedHistoryTransactions[k] = { wilayah: t.wilayah || 'Umum', lingkungan: t.lingkungan || 'Umum', timestamp: ds, totalJumlah: 0, items: [] }; 
        groupedHistoryTransactions[k].totalJumlah += parseInt(t.jumlah) || 0; 
        groupedHistoryTransactions[k].items.push(t);
    });
    const hKeys = Object.keys(groupedHistoryTransactions);
    sB.innerHTML = hKeys.length ? '' : '<tr><td colspan="5" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Belum ada riwayat</td></tr>';
    hKeys.forEach(k => { const g = groupedHistoryTransactions[k]; sB.innerHTML += `<tr><td style="padding:1rem 1.75rem;font-weight:900;text-transform:uppercase">${g.wilayah}</td><td style="padding:1rem 1.75rem;font-weight:700;color:#64748b;text-transform:uppercase">${g.lingkungan}</td><td style="padding:1rem 1.75rem;text-align:center;font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#94a3b8">${g.timestamp}</td><td style="padding:1rem 1.75rem;text-align:right;font-weight:900;color:var(--success)">${formatIDR(g.totalJumlah)}</td><td style="padding:1rem 1.75rem;text-align:center"><button onclick="showHistoryGroupDetail('${k}')" class="btn btn-dark btn-sm"><i class="fas fa-search-plus"></i> Rincian</button></td></tr>`; });
}

