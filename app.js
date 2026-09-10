import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const app = initializeApp({
    apiKey: "AIzaSyCfhwfmzg6YJ1BRyCrDgksQQ3C5uGuhHhs", 
    authDomain: "registro-6bd00.firebaseapp.com",
    projectId: "registro-6bd00",
    storageBucket: "registro-6bd00.firebasestorage.app",
    messagingSenderId: "1067272895690",
    appId: "1:1067272895690:web:78ec332da75fb0f074d008"
});

const db = getFirestore(app), storage = getStorage(app), auth = getAuth(app);
const LISTA_MAQUINAS = ["122", "127", "120", "202", "108", "126", "116", "110", "101", "121", "109", "106", "107", "117", "111", "118", "119", "125", "102", "103", "115"];
let todosLosRegistros = [], unsubscribe = null;

document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const [reg, maqCont, fMaq, fFec, btnLimpiar, btnExcel, tbody, btnGrd] = 
          ['formRegistro', 'maquinasContainer', 'filtroMaquina', 'filtroFecha', 'btnLimpiarFiltros', 'btnExportarExcel', 'cuerpoTabla', 'btnGuardar'].map($);

    // Renderizar opciones de máquinas
    maqCont.innerHTML = '';
    fMaq.innerHTML = '<option value="TODAS">Todas las Máquinas</option>';
    LISTA_MAQUINAS.forEach(n => {
        maqCont.innerHTML += `<label class="chk-item"><input type="checkbox" name="maquinasCheck" value="${n}"> Maq ${n}</label>`;
        fMaq.innerHTML += `<option value="${n}">Máquina ${n}</option>`;
    });

    // Fecha y hora actual
    const ahora = new Date();
    $('fecha').value = ahora.toISOString().split('T')[0];
    $('hora').value = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

    // Auth Guard
    onAuthStateChanged(auth, user => {
        $('loginOverlay').style.display = user ? 'none' : 'flex';
        $('userInfo').style.display = user ? 'flex' : 'none';
        if (user) {
            $('userEmailSpan').textContent = user.email;
            if (unsubscribe) unsubscribe();
            unsubscribe = onSnapshot(query(collection(db, "registros"), orderBy("timestamp", "desc")), snap => {
                todosLosRegistros = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                aplicarFiltros();
            });
        } else {
            if (unsubscribe) unsubscribe();
            todosLosRegistros = [];
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px; color: #888;">Inicia sesión para ver registros.</td></tr>';
        }
    });

    // Login
    $('formLogin').addEventListener('submit', async e => {
        e.preventDefault();
        $('loginError').style.display = 'none';
        try {
            await signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPassword').value.trim());
            e.target.reset();
        } catch (err) {
            $('loginError').textContent = `Error: ${err.code}`;
            $('loginError').style.display = 'block';
        }
    });

    $('btnCerrarSesion').addEventListener('click', () => signOut(auth));

    // Filtros y render de tabla
    const aplicarFiltros = () => {
        const mSel = fMaq.value, fSel = fFec.value;
        const filtrados = todosLosRegistros.filter(i => {
            const matchM = mSel === 'TODAS' || (Array.isArray(i.maquinas) ? i.maquinas.includes(mSel) : i.maquina === mSel);
            const matchF = !fSel || i.fecha === fSel;
            return matchM && matchF;
        });

        tbody.innerHTML = filtrados.length ? '' : `<tr><td colspan="10" style="text-align:center;">No hay registros.</td></tr>`;
        filtrados.forEach(item => {
            const maquinasTxt = Array.isArray(item.maquinas) ? item.maquinas.map(m => `Maq ${m}`).join(', ') : `Maq ${item.maquina || 'N/R'}`;
            let media = '<span style="color:#999;">Sin evidencia</span>';
            if (item.mediaUrl) {
                media = item.mediaType === 'video' 
                    ? `<video src="${item.mediaUrl}" controls style="max-width:80px; max-height:80px;"></video>`
                    : `<a href="${item.mediaUrl}" target="_blank"><img src="${item.mediaUrl}" crossorigin="anonymous" referrerpolicy="no-referrer" style="width:80px; height:80px; object-fit:cover; border-radius:6px;"></a>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${item.fecha}</td><td>${item.hora}</td><td><strong>${maquinasTxt}</strong></td><td>${item.ruta}</td><td>${item.conductor || 'N/R'}</td><td style="text-align:center;"><strong>${item.pasajerosSinPagar || 0}</strong></td><td>${item.lugar}</td><td>${item.descripcion}</td><td style="text-align:center;">${media}</td><td style="text-align:center;"><button class="btn-danger" data-id="${item.id}">Eliminar</button></td>`;
            tr.querySelector('.btn-danger').addEventListener('click', async () => {
                if (confirm('¿Eliminar registro?')) await deleteDoc(doc(db, "registros", item.id));
            });
            tbody.appendChild(tr);
        });
    };

    fMaq.addEventListener('change', aplicarFiltros);
    fFec.addEventListener('change', aplicarFiltros);
    btnLimpiar.addEventListener('click', () => { fMaq.value = 'TODAS'; fFec.value = ''; aplicarFiltros(); });

    // Guardar Registro
    reg.addEventListener('submit', async e => {
        e.preventDefault();
        if (!auth.currentUser) return alert("Inicia sesión.");
        const checked = Array.from(document.querySelectorAll('input[name="maquinasCheck"]:checked')).map(cb => cb.value);
        if (!checked.length) return alert("Selecciona al menos una máquina.");

        btnGrd.disabled = true; btnGrd.textContent = "Guardando...";
        try {
            const file = $('mediaInput').files[0];
            let mediaUrl = "", mediaType = "";
            if (file) {
                mediaType = file.type.startsWith('video') ? 'video' : 'image';
                const fRef = ref(storage, `evidencias/${Date.now()}_${file.name}`);
                await uploadBytes(fRef, file);
                mediaUrl = await getDownloadURL(fRef);
            }

            await addDoc(collection(db, "registros"), {
                fecha: $('fecha').value, hora: $('hora').value, maquinas: checked,
                ruta: $('ruta').value, conductor: $('conductor').value,
                pasajerosSinPagar: parseInt($('pasajerosSinPagar').value) || 0,
                lugar: $('lugar').value, descripcion: $('descripcion').value,
                mediaUrl, mediaType, timestamp: Date.now(), creadoPor: auth.currentUser.email
            });
            reg.reset();
            alert("¡Guardado con éxito!");
        } catch (err) {
            console.error(err); alert("Error al guardar.");
        } finally {
            btnGrd.disabled = false; btnGrd.textContent = "Guardar Registro";
        }
    });

    // Exportar Excel
    btnExcel.addEventListener('click', async () => {
        if (!todosLosRegistros.length) return alert("No hay datos para exportar.");
        btnExcel.disabled = true; btnExcel.textContent = "Generando Excel...";
        try {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Control');
            ws.columns = ['Fecha', 'Hora', 'Máquinas', 'Ruta', 'Conductor', 'Sin Pagar', 'Lugar', 'Obs', 'Foto'].map(k => ({ header: k, width: 20 }));

            for (let i = 0; i < todosLosRegistros.length; i++) {
                const it = todosLosRegistros[i];
                ws.addRow([it.fecha, it.hora, (it.maquinas || []).join(', '), it.ruta, it.conductor, it.pasajerosSinPagar, it.lugar, it.descripcion, '']);
            }

            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `Reporte_${new Date().toISOString().split('T')[0]}.xlsx`; a.click();
        } catch (err) {
            console.error(err); alert("Error al exportar Excel.");
        } finally {
            btnExcel.disabled = false; btnExcel.textContent = "Exportar a Excel (.xlsx con Fotos)";
        }
    });
});
