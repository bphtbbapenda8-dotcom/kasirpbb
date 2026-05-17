// e-Kasir PBB P2 — Core Application Logic
const SUPABASE_URL = "https://fuhtwnlesuyatxyccjop.supabase.co";
const SUPABASE_KEY = "sb_publishable_oyB8kfW9L_vhdFEFqzbv-w_juy_tWV4";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = JSON.parse(localStorage.getItem('e_kasir_user'));
let cartItems = [];
let transactions = [];
let groupedTransactions = {};
let groupedHistoryTransactions = {};
let currentHistoryGroupKey = null;

// === UTILITIES ===
function formatIDR(n) { return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n); }
function $(id) { return document.getElementById(id); }
function showToast(m, type="success") {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerText = m;
    $('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 4000);
}
function updateTime() {
    $('date-display').innerHTML = `<i class="fas fa-calendar-alt" style="color:var(--primary-light);margin-right:4px"></i>${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}`;
}

// === AUTH ===
$('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const u = $('username').value.trim(), p = $('password').value;
    const btn = $('btnLogin'), err = $('login-error');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i>';
    err.classList.remove('show');
    try {
        const { data, error } = await _supabase.from('users').select('*').eq('username',u).eq('password',p).single();
        if (error || !data) throw new Error();
        currentUser = data;
        localStorage.setItem('e_kasir_user', JSON.stringify(data));
        initApp();
    } catch {
        err.classList.add('show');
        btn.disabled = false; btn.innerText = "Masuk";
    }
};

function confirmLogout() { localStorage.clear(); location.reload(); }

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
    initDropdowns(); initFilterDropdowns(); initHistoryFilterDropdowns();
    refreshData(); switchTab('beranda');
}

// === DROPDOWNS ===
function populateKecDropdown(sel, placeholder) {
    sel.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
    for (let code in wilayahMajene) sel.innerHTML += `<option value="${code}">${code} - ${wilayahMajene[code].name}</option>`;
}
function chainKelDropdown(selKec, selKel, selLin, cb) {
    selKec.onchange = function() {
        selKel.disabled = false;
        selKel.innerHTML = '<option value="" disabled selected>Pilih Kelurahan</option>';
        const kels = wilayahMajene[this.value].kels;
        for (let c in kels) selKel.innerHTML += `<option value="${c}">${c} - ${kels[c].name}</option>`;
        selLin.disabled = true; selLin.innerHTML = '<option value="" disabled selected>Pilih Lingkungan</option>';
        if (cb) cb();
    };
    selKel.onchange = function() {
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
    fK.onchange = function() {
        fL.innerHTML = '<option value="">Semua Kelurahan</option>';
        fLn.innerHTML = '<option value="">Semua Lingkungan</option>'; fLn.disabled = true;
        if (!this.value) { fL.disabled = true; } else {
            fL.disabled = false;
            const kels = wilayahMajene[this.value].kels;
            for (let c in kels) fL.innerHTML += `<option value="${kels[c].name}">${kels[c].name}</option>`;
        }
        applyCb();
    };
    fL.onchange = function() {
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
function initFilterDropdowns() { initFilterSet('filter-kecamatan','filter-kelurahan','filter-lingkungan', applyFilters); }
function initHistoryFilterDropdowns() { initFilterSet('filter-history-kecamatan','filter-history-kelurahan','filter-history-lingkungan', applyFilters); }
function applyFilters() {
    const belum = transactions.filter(t => t.status === 'Belum Setor');
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
    const lin = $('p-lingkungan').value, blok = $('p-blok').value.trim().padStart(3,'0');
    const urutInput = $('p-nourut').value.trim();
    if (!urutInput) return;
    const uruts = urutInput.split(/[, ]+/).filter(x => x.trim());
    const namaKel = wilayahMajene[kec]?.kels[kel]?.name || '';
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> MENCARI...';
    let added = 0;
    for (let urut of uruts) {
        const u = urut.padStart(4,'0');
        const nopClean = `7602${kec}${kel}${blok}${u}0`, nopDot = `76.02.${kec}.${kel}.${blok}-${u}.0`;
        try {
            const { data, error } = await _supabase.from('sppt2026').select('*').in('NOP',[nopClean,nopDot]).maybeSingle();
            if (error) throw error;
            if (data) {
                if (!cartItems.find(c => c.nop === data.NOP)) {
                    let raw = 0;
                    const keys = Object.keys(data), fk = keys.find(k => k.toLowerCase()==='jumlah');
                    if (fk) raw = data[fk]; else raw = data['PBB_YG_HARUS_DIBAYAR_']||data['PBB_YG_HARUS_DIBAYAR']||data['PBB_DIBAYAR']||0;
                    let cs = String(raw).trim().replace(/Rp/gi,'').trim().replace(/[,.]00$/,'').replace(/[^0-9]/g,'');
                    cartItems.push({ nop:data.NOP, nama:data.NM_WP_SPPT||data.NAMA_WP||'TANPA NAMA', jumlah:parseInt(cs)||0, lingkungan:lin, wilayah:namaKel });
                    added++;
                }
            } else showToast(`NOP ${u} tidak ditemukan`,"error");
        } catch(err) { console.error(err); }
    }
    if (cartItems.length > 0) { renderCart(); $('search-result').classList.remove('hidden'); if (added>0) showToast(`${added} data berhasil ditarik`); }
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> Cari Data Tagihan';
};

function renderCart() {
    const body = $('res-table-body'); body.innerHTML = ''; let total = 0;
    cartItems.forEach((item,idx) => {
        total += item.jumlah;
        body.innerHTML += `<tr><td class="px-4 py-3"><div style="font-weight:900;color:#1e293b;font-size:0.85rem">${item.nama}</div><div style="font-size:0.65rem;font-family:'JetBrains Mono',monospace;color:var(--primary);font-weight:700">${item.nop}</div><div style="font-size:0.6rem;color:#94a3b8;font-weight:600"><i class="fas fa-map-marker-alt" style="color:var(--primary-light)"></i> ${item.wilayah||'-'} | ${item.lingkungan||'-'}</div></td><td style="text-align:right;font-weight:900;padding:0.75rem 1rem">${formatIDR(item.jumlah)}</td><td style="text-align:center;padding:0.75rem"><button onclick="removeFromCart(${idx})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem"><i class="fas fa-trash-alt"></i></button></td></tr>`;
    });
    $('res-total-bayar').innerText = formatIDR(total);
}
function removeFromCart(i) { cartItems.splice(i,1); if(!cartItems.length) $('search-result').classList.add('hidden'); renderCart(); }

async function processCart() {
    const btn = $('btnSimpan'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> MENYIMPAN...';
    try {
        const data = cartItems.map(i => ({nop:i.nop,nama:i.nama,jumlah:i.jumlah,lingkungan:i.lingkungan,wilayah:i.wilayah,petugas:currentUser.username,status:'Belum Setor',created_at:new Date().toISOString()}));
        const {error:e1} = await _supabase.from('belumsetor').insert(data); if(e1) throw e1;
        const {error:e2} = await _supabase.from('sppt2026').delete().in('NOP',cartItems.map(i=>i.nop)); if(e2) throw e2;
        showToast("Transaksi Berhasil Disimpan & Data SPPT Dimutasi!");
        cartItems=[]; $('search-result').classList.add('hidden'); $('searchForm').reset(); refreshData(); switchTab('beranda');
    } catch(err) {
        let msg="Gagal menyimpan"; if(err?.code==='PGRST204') msg="Kolom belum dibuat di tabel Supabase"; else if(err?.message) msg+=": "+err.message;
        showToast(msg,"error");
    } finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-check-circle"></i> Simpan Transaksi'; }
}

// === DATA REFRESH ===
async function refreshData() {
    try {
        const isAdmin = currentUser.role==='admin'||currentUser.username.toLowerCase()==='admin';
        let q = _supabase.from('belumsetor').select('*');
        if (!isAdmin) q = q.eq('petugas',currentUser.username);
        const {data,error} = await q; if(error) throw error;
        transactions = data||[];
        const belum=transactions.filter(t=>t.status==='Belum Setor'), verif=transactions.filter(t=>t.status==='Sedang Diverifikasi'), sudah=transactions.filter(t=>t.status==='Sudah Setor');
        const tB=belum.reduce((s,t)=>s+(parseInt(t.jumlah)||0),0), tV=verif.reduce((s,t)=>s+(parseInt(t.jumlah)||0),0), tS=sudah.reduce((s,t)=>s+(parseInt(t.jumlah)||0),0);
        $('stat-total').innerText=formatIDR(tS); $('stat-belum').innerText=formatIDR(tB); $('stat-verifikasi').innerText=formatIDR(tV); $('stat-sudah').innerText=formatIDR(tS);
        renderLists(belum,sudah); renderVerificationList(verif);
    } catch(err) { console.error("Refresh:",err); }
}

// === RENDER LISTS ===
function renderLists(belum,sudah) {
    const bB=$('list-belum-body'), sB=$('list-sudah-body');
    // Filter belum setor
    const fK=$('filter-kecamatan')?.value||'', fL=$('filter-kelurahan')?.value||'', fLn=$('filter-lingkungan')?.value||'';
    let fb=belum;
    if(fK) fb=fb.filter(t=>getKecamatanByKelurahan(t.wilayah)===fK);
    if(fL) fb=fb.filter(t=>(t.wilayah||'').toUpperCase()===fL.toUpperCase());
    if(fLn) fb=fb.filter(t=>(t.lingkungan||'').toUpperCase()===fLn.toUpperCase());
    groupedTransactions={};
    fb.forEach(t=>{const k=`${t.wilayah||'Umum'}_${t.lingkungan||'Umum'}`; if(!groupedTransactions[k])groupedTransactions[k]={wilayah:t.wilayah||'Umum',lingkungan:t.lingkungan||'Umum',totalJumlah:0,items:[]}; groupedTransactions[k].totalJumlah+=parseInt(t.jumlah)||0; groupedTransactions[k].items.push(t);});
    const bKeys=Object.keys(groupedTransactions);
    bB.innerHTML=bKeys.length?'':'<tr><td colspan="4" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Tidak ada data</td></tr>';
    bKeys.forEach(k=>{const g=groupedTransactions[k]; bB.innerHTML+=`<tr><td style="padding:1rem 1.75rem;font-weight:900;text-transform:uppercase">${g.wilayah}</td><td style="padding:1rem 1.75rem;font-weight:700;color:#64748b;text-transform:uppercase">${g.lingkungan}</td><td style="padding:1rem 1.75rem;text-align:right;font-weight:900;color:var(--primary)">${formatIDR(g.totalJumlah)}</td><td style="padding:1rem 1.75rem;text-align:center"><button onclick="showGroupDetail('${k}')" class="btn btn-primary btn-sm"><i class="fas fa-list"></i> Rincian</button></td></tr>`;});
    // Filter riwayat
    const hK=$('filter-history-kecamatan')?.value||'', hL=$('filter-history-kelurahan')?.value||'', hLn=$('filter-history-lingkungan')?.value||'';
    let fs=sudah;
    if(hK) fs=fs.filter(t=>getKecamatanByKelurahan(t.wilayah)===hK);
    if(hL) fs=fs.filter(t=>(t.wilayah||'').toUpperCase()===hL.toUpperCase());
    if(hLn) fs=fs.filter(t=>(t.lingkungan||'').toUpperCase()===hLn.toUpperCase());
    groupedHistoryTransactions={};
    fs.forEach(t=>{let ds="N/A"; if(t.created_at){const d=new Date(t.created_at);ds=`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
    const k=`${t.wilayah||'Umum'}_${t.lingkungan||'Umum'}_${ds.replace(/[\/ :]/g,'_')}`; if(!groupedHistoryTransactions[k])groupedHistoryTransactions[k]={wilayah:t.wilayah||'Umum',lingkungan:t.lingkungan||'Umum',timestamp:ds,totalJumlah:0,items:[]}; groupedHistoryTransactions[k].totalJumlah+=parseInt(t.jumlah)||0; groupedHistoryTransactions[k].items.push(t);});
    const hKeys=Object.keys(groupedHistoryTransactions);
    sB.innerHTML=hKeys.length?'':'<tr><td colspan="5" style="padding:3rem;text-align:center;color:#cbd5e1;font-weight:700;font-size:0.65rem;text-transform:uppercase">Belum ada riwayat</td></tr>';
    hKeys.forEach(k=>{const g=groupedHistoryTransactions[k]; sB.innerHTML+=`<tr><td style="padding:1rem 1.75rem;font-weight:900;text-transform:uppercase">${g.wilayah}</td><td style="padding:1rem 1.75rem;font-weight:700;color:#64748b;text-transform:uppercase">${g.lingkungan}</td><td style="padding:1rem 1.75rem;text-align:center;font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#94a3b8">${g.timestamp}</td><td style="padding:1rem 1.75rem;text-align:right;font-weight:900;color:var(--success)">${formatIDR(g.totalJumlah)}</td><td style="padding:1rem 1.75rem;text-align:center"><button onclick="showHistoryGroupDetail('${k}')" class="btn btn-dark btn-sm"><i class="fas fa-search-plus"></i> Rincian</button></td></tr>`;});
}
