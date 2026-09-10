// IMPORTANTE: Módulos de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Configuración de Firebase del Proyecto
const firebaseConfig = {
    apiKey: "AIzaSy...", // Tu API Key actual
    authDomain: "registro-6bd00.firebaseapp.com",
    projectId: "registro-6bd00",
    storageBucket: "registro-6bd00.firebasestorage.app",
    messagingSenderId: "1067272895690",
    appId: "1:1067272895690:web:78ec332da75fb0f074d008"
};

// Inicialización de Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// Lista exacta de las 21 máquinas
const LISTA_MAQUINAS = [
    "122", "127", "120", "202", "108", "126", "116", 
    "110", "101", "121", "109", "106", "107", "117", 
    "111", "118", "119", "125", "102", "103", "115"
];

// Elementos del DOM
const formRegistro = document.getElementById('formRegistro');
const maquinasContainer = document.getElementById('maquinasContainer');
const filtroMaquina = document.getElementById('filtroMaquina');
const filtroFecha = document.getElementById('filtroFecha');
const btnLimpiarFiltros = document.getElementById('btnLimpiarFiltros');
const btnExportarExcel = document.getElementById('btnExportarExcel');
const cuerpoTabla = document.getElementById('cuerpoTabla');
const btnGuardar = document.getElementById('btnGuardar');

// Elementos del Login y Usuario
const loginOverlay = document.getElementById('loginOverlay');
const formLogin = document.getElementById('formLogin');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const userInfo = document.getElementById('userInfo');
const userEmailSpan = document.getElementById('userEmailSpan');
const btnCerrarSesion = document.getElementById('btnCerrarSesion');

let todosLosRegistros = [];
let unsubscribeSnapshot = null; // Para detener la escucha al cerrar sesión

// --- CONTROL DE ACCESO Y AUTENTICACIÓN BLINDADA ---

// Guardián de Autenticación
onAuthStateChanged(auth, (user) => {
    if (user) {
        // 🟢 USUARIO AUTENTICADO
        loginOverlay.style.display = 'none';
        userInfo.style.display = 'flex';
        userEmailSpan.textContent = user.email;

        // Iniciar la escucha en tiempo real de Firestore solo si hay sesión activa
        escucharRegistros();
    } else {
        // 🔴 USUARIO NO AUTENTICADO / SESIÓN CERRADA
        loginOverlay.style.display = 'flex';
        userInfo.style.display = 'none';

        // Detener escucha activa en tiempo real si existía una
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }

        // Limpiar tabla y variables
        todosLosRegistros = [];
        cuerpoTabla.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px; color: #888;">Debes iniciar sesión para ver los registros.</td></tr>';
    }
});

// Evento Submit Formulario de Login
formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    try {
        await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
        formLogin.reset();
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        loginError.textContent = "Correo o contraseña incorrectos.";
        loginError.style.display = 'block';
    }
});

// Cerrar Sesión
btnCerrarSesion.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
});

// --- INICIALIZACIÓN DE INTERFAZ ---
function cargarOpcionesMaquinas() {
    maquinasContainer.innerHTML = '';
    filtroMaquina.innerHTML = '<option value="TODAS">Todas las Máquinas</option>';

    LISTA_MAQUINAS.forEach(num => {
        // Checkbox para el formulario
        const label = document.createElement('label');
        label.className = 'chk-item';
        label.innerHTML = `<input type="checkbox" name="maquinasCheck" value="${num}"> Maq ${num}`;
        maquinasContainer.appendChild(label);

        // Opción para el selector de filtro
        const option = document.createElement('option');
        option.value = num;
        option.textContent = `Máquina ${num}`;
        filtroMaquina.appendChild(option);
    });
}

function setFechaHoraActuales() {
    const ahora = new Date();
    document.getElementById('fecha').value = meFormatFecha(ahora);
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    document.getElementById('hora').value = `${horas}:${minutos}`;
}

function meFormatFecha(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- CONSULTAS Y REALTIME DATA ---
function escucharRegistros() {
    // Si ya existe una suscripción previa, cancelarla antes de crear una nueva
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
    }

    const q = query(collection(db, "registros"), orderBy("timestamp", "desc"));
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        todosLosRegistros = [];
        snapshot.forEach(docSnap => {
            todosLosRegistros.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
        aplicarFiltros();
    }, (error) => {
        console.error("Error al escuchar registros (Permisos denegados):", error);
    });
}

// Renderizar Tabla
function renderizarTabla(registros) {
    cuerpoTabla.innerHTML = '';

    if (registros.length === 0) {
        cuerpoTabla.innerHTML = `<tr><td colspan="10" style="text-align:center;">No se encontraron registros.</td></tr>`;
        return;
    }

    registros.forEach(item => {
        const tr = document.createElement('tr');

        const maquinasTexto = Array.isArray(item.maquinas) 
            ? item.maquinas.map(m => `Maq ${m}`).join(', ') 
            : `Maq ${item.maquina || 'N/R'}`;

        let mediaHtml = '<span style="color:#999;">Sin evidencia</span>';
        if (item.mediaUrl) {
            if (item.mediaType === 'video') {
                mediaHtml = `<video src="${item.mediaUrl}" class="media-preview" controls playsinline preload="metadata" style="max-width:90px; max-height:90px; object-fit:cover; border-radius:6px;"></video>`;
            } else {
                mediaHtml = `<a href="${item.mediaUrl}" target="_blank" rel="noopener noreferrer">
                                <img src="${item.mediaUrl}" 
                                     class="media-preview" 
                                     alt="Evidencia" 
                                     crossorigin="anonymous"
                                     referrerpolicy="no-referrer"
                                     style="width:80px; height:80px; object-fit:cover; border-radius:6px; background-color:#e0e0e0; display:block; margin:auto;"
                                     onerror="this.onerror=null; this.src='https://via.placeholder.com/80?text=Ver+Foto';">
                             </a>`;
            }
        }

        tr.innerHTML = `
            <td>${item.fecha || ''}</td>
            <td>${item.hora || ''}</td>
            <td><strong>${maquinasTexto}</strong></td>
            <td>${item.ruta || ''}</td>
            <td>${item.conductor || 'N/R'}</td>
            <td style="text-align:center;"><strong>${item.pasajerosSinPagar || 0}</strong></td>
            <td>${item.lugar || ''}</td>
            <td>${item.descripcion || ''}</td>
            <td style="text-align:center;">${mediaHtml}</td>
            <td style="text-align:center;">
                <button class="btn-danger" data-id="${item.id}">Eliminar</button>
            </td>
        `;

        const btnEliminar = tr.querySelector('.btn-danger');
        btnEliminar.addEventListener('click', () => eliminarRegistro(item));

        cuerpoTabla.appendChild(tr);
    });
}

// Aplicar Filtros
function aplicarFiltros() {
    const maqSeleccionada = filtroMaquina.value;
    const fechaSeleccionada = filtroFecha.value;

    let filtrados = todosLosRegistros;

    if (maqSeleccionada !== 'TODAS') {
        filtrados = filtrados.filter(item => {
            if (Array.isArray(item.maquinas)) {
                return item.maquinas.includes(maqSeleccionada);
            }
            return item.maquina === maqSeleccionada;
        });
    }

    if (fechaSeleccionada) {
        filtrados = filtrados.filter(item => item.fecha === fechaSeleccionada);
    }

    renderizarTabla(filtrados);
}

// Guardar Registro
formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Verificación adicional de autenticación
    if (!auth.currentUser) {
        alert("Debes iniciar sesión para realizar un registro.");
        return;
    }

    const checkboxes = document.querySelectorAll('input[name="maquinasCheck"]:checked');
    const maquinasSeleccionadas = Array.from(checkboxes).map(cb => cb.value);

    if (maquinasSeleccionadas.length === 0) {
        alert("Por favor, selecciona al menos una máquina.");
        return;
    }

    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";

    try {
        const mediaInput = document.getElementById('mediaInput');
        const file = mediaInput.files[0];
        let mediaUrl = "";
        let mediaType = "";

        if (file) {
            mediaType = file.type.startsWith('video') ? 'video' : 'image';
            const fileRef = ref(storage, `evidencias/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            mediaUrl = await getDownloadURL(fileRef);
        }

        const nuevoRegistro = {
            fecha: document.getElementById('fecha').value,
            hora: document.getElementById('hora').value,
            maquinas: maquinasSeleccionadas,
            ruta: document.getElementById('ruta').value,
            conductor: document.getElementById('conductor').value,
            pasajerosSinPagar: parseInt(document.getElementById('pasajerosSinPagar').value) || 0,
            lugar: document.getElementById('lugar').value,
            descripcion: document.getElementById('descripcion').value,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            timestamp: new Date().getTime(),
            creadoPor: auth.currentUser.email
        };

        await addDoc(collection(db, "registros"), nuevoRegistro);

        formRegistro.reset();
        setFechaHoraActuales();
        alert("¡Registro guardado exitosamente!");
    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Ocurrió un error al guardar el registro. Verifica tus permisos.");
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = "Guardar Registro";
    }
});

// Eliminar Registro
async function eliminarRegistro(item) {
    if (!auth.currentUser) {
        alert("Debes iniciar sesión para eliminar registros.");
        return;
    }

    if (confirm(`¿Estás seguro de eliminar el registro del ${item.fecha} - ${item.hora}?`)) {
        try {
            await deleteDoc(doc(db, "registros", item.id));
            alert("Registro eliminado.");
        } catch (error) {
            console.error("Error al eliminar:", error);
            alert("No se pudo eliminar el registro.");
        }
    }
}

// Convertir Imagen a Base64
function urlToBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL.split(',')[1]);
        };
        img.onerror = () => reject(new Error('No se pudo cargar la imagen para el Excel'));
        img.src = url;
    });
}

// Exportar Excel (.xlsx)
btnExportarExcel.addEventListener('click', async () => {
    if (!auth.currentUser) {
        alert("Debes iniciar sesión para exportar datos.");
        return;
    }

    if (todosLosRegistros.length === 0) {
        alert("No hay registros para exportar.");
        return;
    }

    btnExportarExcel.disabled = true;
    btnExportarExcel.textContent = "Generando Excel con Fotos...";

    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Control Pasajeros');

        worksheet.columns = [
            { header: 'Fecha', key: 'fecha', width: 12 },
            { header: 'Hora', key: 'hora', width: 10 },
            { header: 'Máquinas', key: 'maquinas', width: 20 },
            { header: 'Ruta', key: 'ruta', width: 25 },
            { header: 'Conductor', key: 'conductor', width: 20 },
            { header: 'Pasajeros Sin Pagar', key: 'sinPagar', width: 20 },
            { header: 'Lugar', key: 'lugar', width: 25 },
            { header: 'Observaciones', key: 'descripcion', width: 30 },
            { header: 'Foto Evidencia', key: 'foto', width: 22 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '343A40' }
        };

        for (let i = 0; i < todosLosRegistros.length; i++) {
            const item = todosLosRegistros[i];
            const rowIndex = i + 2;

            const maquinasTexto = Array.isArray(item.maquinas) 
                ? item.maquinas.map(m => `Maq ${m}`).join(', ') 
                : `Maq ${item.maquina || 'N/R'}`;

            const row = worksheet.addRow({
                fecha: item.fecha || '',
                hora: item.hora || '',
                maquinas: maquinasTexto,
                ruta: item.ruta || '',
                conductor: item.conductor || 'N/R',
                sinPagar: item.pasajerosSinPagar || 0,
                lugar: item.lugar || '',
                descripcion: item.descripcion || '',
                foto: ''
            });

            row.height = 70;

            if (item.mediaUrl && item.mediaType !== 'video') {
                try {
                    const base64Data = await urlToBase64(item.mediaUrl);
                    const imageId = workbook.addImage({
                        base64: base64Data,
                        extension: 'png',
                    });

                    worksheet.addImage(imageId, {
                        tl: { col: 8, row: rowIndex - 1 },
                        ext: { width: 80, height: 80 }
                    });
                } catch (e) {
                    console.warn("No se pudo incrustar la foto en Excel:", e);
                    row.getCell('foto').value = "Error al cargar foto";
                }
            } else if (item.mediaType === 'video') {
                row.getCell('foto').value = "Video (Ver en app)";
            } else {
                row.getCell('foto').value = "Sin Evidencia";
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_Control_Pasajeros_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);

    } catch (err) {
        console.error("Error al exportar:", err);
        alert("Ocurrió un error al generar el archivo Excel.");
    } finally {
        btnExportarExcel.disabled = false;
        btnExportarExcel.textContent = "Exportar a Excel (.xlsx con Fotos)";
    }
});

// Eventos de Filtros
filtroMaquina.addEventListener('change', aplicarFiltros);
filtroFecha.addEventListener('change', aplicarFiltros);
btnLimpiarFiltros.addEventListener('click', () => {
    filtroMaquina.value = 'TODAS';
    filtroFecha.value = '';
    aplicarFiltros();
});

// Inicialización de Interfaz Básica
cargarOpcionesMaquinas();
setFechaHoraActuales();
