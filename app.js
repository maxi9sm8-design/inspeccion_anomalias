// IMPORTANTE: Módulos de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

let todosLosRegistros = [];
let unsubscribeSnapshot = null;

// Esperar a que el DOM cargue por completo para evitar errores de elementos nulos
document.addEventListener('DOMContentLoaded', () => {

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

    // --- CONTROL DE ACCESO Y AUTENTICACIÓN ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginOverlay.style.display = 'none';
            userInfo.style.display = 'flex';
            userEmailSpan.textContent = user.email;
            escucharRegistros();
        } else {
            loginOverlay.style.display = 'flex';
            userInfo.style.display = 'none';

            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
                unsubscribeSnapshot = null;
            }

            todosLosRegistros = [];
            cuerpoTabla.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px; color: #888;">Debes iniciar sesión para ver los registros.</td></tr>';
        }
    });

    // Evento Login con depuración de errores visuales
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';

        const emailVal = loginEmail.value.trim();
        const passVal = loginPassword.value.trim();

        try {
            await signInWithEmailAndPassword(auth, emailVal, passVal);
            formLogin.reset();
        } catch (error) {
            console.error("Error de Firebase Auth:", error.code, error.message);
            // Esto te mostrará el error exacto en pantalla para saber qué pasa (ej: user-not-found, wrong-password)
            loginError.textContent = `Error: ${error.code}`;
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
            const label = document.createElement('label');
            label.className = 'chk-item';
            label.innerHTML = `<input type="checkbox" name="maquinasCheck" value="${num}"> Maq ${num}`;
            maquinasContainer.appendChild(label);

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

    function escucharRegistros() {
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
            console.error("Error al escuchar registros:", error);
        });
    }

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
                                    <img src="${item.mediaUrl}" class="media-preview" alt="Evidencia" crossorigin="anonymous" referrerpolicy="no-referrer" style="width:80px; height:80px; object-fit:cover; border-radius:6px; background-color:#e0e0e0; display:block; margin:auto;" onerror="this.onerror=null; this.src='https://via.placeholder.com/80?text=Ver+Foto';">
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
                <td style="text-align:center;"><button class="btn-danger" data-id="${item.id}">Eliminar</button></td>
            `;

            tr.querySelector('.btn-danger').addEventListener('click', () => eliminarRegistro(item));
            cuerpoTabla.appendChild(tr);
        });
    }

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

    formRegistro.addEventListener('submit', async (e) => {
        e.preventDefault();
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
            alert("Ocurrió un error al guardar el registro.");
        } finally {
            btnGuardar.disabled = false;
            btnGuardar.textContent = "Guardar Registro";
        }
    });

    async function eliminarRegistro(item) {
        if (!auth.currentUser) return;
        if (confirm(`¿Estás seguro de eliminar el registro del ${item.fecha} - ${item.hora}?`)) {
            try {
                await deleteDoc(doc(db, "registros", item.id));
            } catch (error) {
                console.error("Error al eliminar:", error);
            }
        }
    }

    // Ejecuciones iniciales de la UI
    cargarOpcionesMaquinas();
    setFechaHoraActuales();

    filtroMaquina.addEventListener('change', aplicarFiltros);
    filtroFecha.addEventListener('change', aplicarFiltros);
    btnLimpiarFiltros.addEventListener('click', () => {
        filtroMaquina.value = 'TODAS';
        filtroFecha.value = '';
        aplicarFiltros();
    });
});
