// app.js - Control de Anomalías Buses Tarapacá
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc,
    setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import {
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. Configuración de Firebase con tu API Key real
const firebaseConfig = {
    apiKey: "AIzaSyCfhwfmzg6YJ1BRyCrDgksQQ3C5uGuhHhs",
    authDomain: "registro-6bd00.firebaseapp.com",
    projectId: "registro-6bd00",
    storageBucket: "registro-6bd00.firebasestorage.app",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456"
};

// Inicializar servicios Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// Lista exacta de Máquinas / Equipos
const LISTA_MAQUINAS = [
    "122", "127", "120", "202", "123", "125", "121", 
    "201", "200", "129", "119", "116", "124", "130", 
    "113", "115", "203", "114", "128", "117", "126"
];

// Motivos por defecto: se usan SOLO la primera vez, para "sembrar"
// la colección "categorias" en Firestore si está vacía.
const CATEGORIAS_POR_DEFECTO = [
    { id: "conejos", nombre: "Conejos (pasajero fuera de ruta)" },
    { id: "conductor", nombre: "Conductor" },
    { id: "camaras", nombre: "Cámaras" },
    { id: "otro", nombre: "Otro" }
];

// Referencia a la colección de motivos en Firestore
const categoriasRef = collection(db, "categorias");
let categoriasSembradas = false;

// Variables globales de estado
let maquinasSeleccionadas = [];
let todosLosRegistros = [];
let categoriasDinamicas = []; // [{id, nombre}]
let appIniciada = false;
window.registrosFiltrados = [];

// Elementos del DOM - App principal
const maquinasContainer = document.getElementById('maquinasContainer');
const anomaliaForm = document.getElementById('anomaliaForm');
const fechaInput = document.getElementById('fechaInput');
const horaInput = document.getElementById('horaInput');
const categoriaInput = document.getElementById('categoriaInput');
const cuerpoTabla = document.getElementById('cuerpoTabla');
const statusMsg = document.getElementById('statusMsg');
const totalResultados = document.getElementById('totalResultados');

const filterRango = document.getElementById('filterRango');
const filterFechaEspecifica = document.getElementById('filterFechaEspecifica');
const filterBus = document.getElementById('filterBus');
const filterCategoria = document.getElementById('filterCategoria');
const btnLimpiar = document.getElementById('btnLimpiar');
const btnExportar = document.getElementById('btnExportar');

// Elementos del DOM - Login / Autenticación
const loginOverlay = document.getElementById('loginOverlay');
const appContainer = document.getElementById('appContainer');
const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const btnLoginSubmit = document.getElementById('btnLoginSubmit');
const btnLogout = document.getElementById('btnLogout');

// Elementos del DOM - Gestión de Motivos
const btnGestionarMotivos = document.getElementById('btnGestionarMotivos');
const motivosOverlay = document.getElementById('motivosOverlay');
const btnCerrarMotivos = document.getElementById('btnCerrarMotivos');
const listaMotivosContainer = document.getElementById('listaMotivosContainer');
const nuevoMotivoInput = document.getElementById('nuevoMotivoInput');
const btnAgregarMotivo = document.getElementById('btnAgregarMotivo');

/* ==========================================================================
   MÓDULO DE AUTENTICACIÓN
   ========================================================================== */

// Escuchar cambios de sesión: controla qué se muestra (login o app)
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'block';

        // Inicializar la app solo la primera vez que hay sesión activa
        if (!appIniciada) {
            appIniciada = true;
            inicializarFormulario();
            establecerFiltroHoyPorDefecto();
            renderizarChipsMaquinas();
            escucharCategorias();
            escucharFirestore();
            configurarFiltros();
            configurarGestionMotivos();
        }
    } else {
        appContainer.style.display = 'none';
        loginOverlay.style.display = 'flex';
    }
});

// Manejar el envío del formulario de login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.innerText = '';

    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    btnLoginSubmit.disabled = true;
    btnLoginSubmit.innerText = 'Ingresando...';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginPassword.value = '';
    } catch (error) {
        console.error("Error de autenticación:", error);
        loginError.innerText = 'Correo o contraseña incorrectos.';
    } finally {
        btnLoginSubmit.disabled = false;
        btnLoginSubmit.innerText = 'Ingresar';
    }
});

// Cerrar sesión
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    });
}

// Ajustar fecha y hora actual por defecto (para el FORMULARIO de nuevo registro)
function inicializarFormulario() {
    const hoy = new Date();
    fechaInput.value = hoy.toISOString().split('T')[0];
    horaInput.value = hoy.toTimeString().slice(0, 5);
}

// Deja el FILTRO del historial mostrando SOLO el día de hoy por defecto.
function establecerFiltroHoyPorDefecto() {
    const hoyStr = new Date().toISOString().split('T')[0];
    filterFechaEspecifica.value = hoyStr;
}

// Renderizar selector dinámico de máquinas (Chips)
function renderizarChipsMaquinas() {
    maquinasContainer.innerHTML = '';
    filterBus.innerHTML = '<option value="todos">Todas las máquinas</option>';

    LISTA_MAQUINAS.forEach(maq => {
        // Botón para formulario
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-btn';
        btn.innerText = `Máquina ${maq}`;
        btn.addEventListener('click', () => toggleSeleccionMaquina(maq, btn));
        maquinasContainer.appendChild(btn);

        // Opción para filtro
        const opt = document.createElement('option');
        opt.value = maq;
        opt.innerText = `Máquina ${maq}`;
        filterBus.appendChild(opt);
    });
}

function toggleSeleccionMaquina(maq, elemento) {
    if (maquinasSeleccionadas.includes(maq)) {
        maquinasSeleccionadas = maquinasSeleccionadas.filter(m => m !== maq);
        elemento.classList.remove('selected');
    } else {
        maquinasSeleccionadas.push(maq);
        elemento.classList.add('selected');
    }
}

/* ==========================================================================
   MÓDULO DE MOTIVOS / CATEGORÍAS
   ========================================================================== */

function escucharCategorias() {
    onSnapshot(categoriasRef, (snapshot) => {
        if (snapshot.empty && !categoriasSembradas) {
            categoriasSembradas = true;
            sembrarCategoriasPorDefecto();
            return;
        }

        categoriasDinamicas = snapshot.docs
            .map(d => ({ id: d.id, nombre: d.data().nombre || '' }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

        renderizarCategorias();
        renderizarPanelMotivos();
    }, (error) => {
        console.error("Error leyendo motivos desde Firestore:", error);
    });
}

async function sembrarCategoriasPorDefecto() {
    try {
        for (const cat of CATEGORIAS_POR_DEFECTO) {
            await setDoc(doc(db, "categorias", cat.id), { nombre: cat.nombre });
        }
    } catch (error) {
        console.error("Error al crear los motivos por defecto:", error);
    }
}

function renderizarCategorias() {
    const seleccionFiltroActual = filterCategoria.value;
    const seleccionFormularioActual = categoriaInput.value;

    categoriaInput.innerHTML = '<option value="" disabled>Seleccione un motivo</option>';
    filterCategoria.innerHTML = '<option value="todos">Todos los motivos</option>';

    categoriasDinamicas.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.innerText = cat.nombre;
        categoriaInput.appendChild(opt);

        const optFiltro = document.createElement('option');
        optFiltro.value = cat.id;
        optFiltro.innerText = cat.nombre;
        filterCategoria.appendChild(optFiltro);
    });

    if (categoriasDinamicas.some(c => c.id === seleccionFormularioActual)) {
        categoriaInput.value = seleccionFormularioActual;
    } else {
        categoriaInput.value = "";
    }

    if (seleccionFiltroActual === 'todos' || categoriasDinamicas.some(c => c.id === seleccionFiltroActual)) {
        filterCategoria.value = seleccionFiltroActual;
    } else {
        filterCategoria.value = 'todos';
    }
}

function obtenerLabelCategoria(valor) {
    const cat = categoriasDinamicas.find(c => c.id === valor);
    return cat ? cat.nombre : (valor || 'N/R');
}

// --- Panel de gestión: agregar / editar / eliminar motivos ---

function configurarGestionMotivos() {
    btnGestionarMotivos.addEventListener('click', () => {
        renderizarPanelMotivos();
        motivosOverlay.style.display = 'flex';
    });

    btnCerrarMotivos.addEventListener('click', () => {
        motivosOverlay.style.display = 'none';
    });

    motivosOverlay.addEventListener('click', (e) => {
        if (e.target === motivosOverlay) motivosOverlay.style.display = 'none';
    });

    btnAgregarMotivo.addEventListener('click', agregarMotivo);
    nuevoMotivoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            agregarMotivo();
        }
    });
}

function renderizarPanelMotivos() {
    if (!listaMotivosContainer) return;
    listaMotivosContainer.innerHTML = '';

    if (categoriasDinamicas.length === 0) {
        listaMotivosContainer.innerHTML = '<p style="text-align:center; color:#666;">Aún no hay motivos creados.</p>';
        return;
    }

    categoriasDinamicas.forEach(cat => {
        const fila = document.createElement('div');
        fila.className = 'motivo-fila';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = cat.nombre;
        input.className = 'motivo-input';

        const btnGuardar = document.createElement('button');
        btnGuardar.type = 'button';
        btnGuardar.className = 'btn-guardar-motivo';
        btnGuardar.innerText = '💾';
        btnGuardar.title = 'Guardar cambios';
        btnGuardar.addEventListener('click', () => editarMotivo(cat.id, input.value));

        const btnEliminar = document.createElement('button');
        btnEliminar.type = 'button';
        btnEliminar.className = 'btn-eliminar-motivo';
        btnEliminar.innerText = '🗑️';
        btnEliminar.title = 'Eliminar motivo';
        btnEliminar.addEventListener('click', () => eliminarMotivo(cat.id, cat.nombre));

        fila.appendChild(input);
        fila.appendChild(btnGuardar);
        fila.appendChild(btnEliminar);
        listaMotivosContainer.appendChild(fila);
    });
}

async function agregarMotivo() {
    const usuario = auth.currentUser;
    if (!usuario) {
        alert("Sesión no iniciada. Por favor vuelva a ingresar a la aplicación.");
        return;
    }

    const nombre = (nuevoMotivoInput.value || '').trim();
    if (!nombre) {
        alert("Por favor ingrese un nombre para el nuevo motivo.");
        return;
    }

    // Objeto sanitizado: garantiza que ningún campo contenga 'undefined'
    const datosMotivo = {
        nombre: nombre
    };

    console.log("[DIAGNÓSTICO] Guardando motivo con datos válidos:", datosMotivo, "Usuario:", usuario.uid);

    btnAgregarMotivo.disabled = true;
    try {
        await addDoc(categoriasRef, datosMotivo);
        nuevoMotivoInput.value = '';
    } catch (error) {
        console.error("Error al agregar motivo:", error.code, error.message);
        alert("No se pudo agregar el motivo. Código: " + error.code);
    } finally {
        btnAgregarMotivo.disabled = false;
    }
}

async function editarMotivo(id, nuevoNombre) {
    if (!auth.currentUser) {
        alert("Sesión no iniciada. Vuelva a ingresar a la aplicación.");
        return;
    }

    const nombre = (nuevoNombre || '').trim();
    if (!nombre) {
        alert("El nombre del motivo no puede quedar vacío.");
        return;
    }

    try {
        await updateDoc(doc(db, "categorias", id), { nombre: nombre });
    } catch (error) {
        console.error("Error al editar motivo:", error.code, error.message);
        alert("No se pudo editar el motivo. Código: " + error.code);
    }
}

async function eliminarMotivo(id, nombre) {
    if (!auth.currentUser) {
        alert("Sesión no iniciada. Vuelva a ingresar a la aplicación.");
        return;
    }

    if (!confirm(`¿Eliminar el motivo "${nombre}"? Los registros ya guardados con este motivo no se borrarán, pero mostrarán el motivo como no disponible.`)) return;

    try {
        await deleteDoc(doc(db, "categorias", id));
    } catch (error) {
        console.error("Error al eliminar motivo:", error.code, error.message);
        alert("No se pudo eliminar el motivo. Código: " + error.code);
    }
}

/* ==========================================================================
   GUARDAR REGISTRO en Firebase Firestore y Storage
   ========================================================================== */

anomaliaForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!auth.currentUser) {
        alert("Sesión no iniciada. Por favor reingrese a la app.");
        return;
    }

    if (maquinasSeleccionadas.length === 0) {
        alert("Por favor, seleccione al menos una máquina.");
        return;
    }

    const mediaFile = document.getElementById('mediaInput').files[0];
    if (!mediaFile) {
        alert("Debe adjuntar una foto o video como evidencia.");
        return;
    }

    const btnGuardar = document.getElementById('btnGuardar');
    btnGuardar.disabled = true;
    statusMsg.innerText = "⏳ Subiendo evidencia a la nube...";

    try {
        // Subir archivo a Firebase Storage
        const fileExt = mediaFile.name.split('.').pop() || 'file';
        const fileName = `evidencias/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const storageRef = ref(storage, fileName);
         
        await uploadBytes(storageRef, mediaFile);
        const mediaUrl = await getDownloadURL(storageRef);
        const isVideo = mediaFile.type.startsWith('video');

        // Sanitización completa para prevenir valores 'undefined'
        const nuevoRegistro = {
            maquinas: [...maquinasSeleccionadas],
            ruta: (document.getElementById('rutaInput').value || '').trim(),
            conductor: (document.getElementById('conductorInput').value || '').trim() || 'N/R',
            categoria: categoriaInput.value || '',
            fecha: fechaInput.value || new Date().toISOString().split('T')[0],
            hora: horaInput.value || new Date().toTimeString().slice(0, 5),
            pasajerosSinPagar: parseInt(document.getElementById('pasajerosInput').value) || 0,
            lugar: (document.getElementById('lugarInput').value || '').trim(),
            descripcion: (document.getElementById('descripcionInput').value || '').trim(),
            mediaUrl: mediaUrl || '',
            storagePath: fileName || '',
            mediaType: isVideo ? 'video' : 'image',
            creadoEl: new Date().toISOString()
        };

        await addDoc(collection(db, "anomalias"), nuevoRegistro);

        statusMsg.innerText = "✅ Registro guardado con éxito en la nube.";
        anomaliaForm.reset();
        maquinasSeleccionadas = [];
        document.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('selected'));
        inicializarFormulario();

        setTimeout(() => { statusMsg.innerText = ""; }, 4000);

    } catch (error) {
        console.error("Error al guardar registro:", error);
        alert("Error al guardar el registro. Verifique la conexión.");
        statusMsg.innerText = "❌ Ocurrió un error al guardar.";
    } finally {
        btnGuardar.disabled = false;
    }
});

/* ==========================================================================
   HISTORIAL EN TIEMPO REAL
   ========================================================================== */

function escucharFirestore() {
    const q = query(collection(db, "anomalias"), orderBy("creadoEl", "desc"));
     
    onSnapshot(q, (snapshot) => {
        todosLosRegistros = [];
        snapshot.forEach((docSnap) => {
            todosLosRegistros.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
        aplicarFiltros();
    }, (error) => {
        console.error("Error leyendo datos de Firestore:", error);
        cuerpoTabla.innerHTML = `<tr><td colspan="11" style="text-align:center; color:red;">Error al cargar datos desde la nube.</td></tr>`;
    });
}

function configurarFiltros() {
    filterRango.addEventListener('change', () => {
        if (filterRango.value !== 'todos') filterFechaEspecifica.value = '';
        aplicarFiltros();
    });

    filterFechaEspecifica.addEventListener('change', () => {
        if (filterFechaEspecifica.value) filterRango.value = 'todos';
        aplicarFiltros();
    });

    filterBus.addEventListener('change', aplicarFiltros);
    filterCategoria.addEventListener('change', aplicarFiltros);

    btnLimpiar.addEventListener('click', () => {
        filterRango.value = 'todos';
        establecerFiltroHoyPorDefecto();
        filterBus.value = 'todos';
        filterCategoria.value = 'todos';
        aplicarFiltros();
    });
}

function aplicarFiltros() {
    let resultados = [...todosLosRegistros];

    const fechaEsp = filterFechaEspecifica.value;
    if (fechaEsp) {
        resultados = resultados.filter(r => r.fecha === fechaEsp);
    } else {
        const rango = filterRango.value;
        const hoy = new Date();
         
        if (rango === 'dia') {
            const hoyStr = hoy.toISOString().split('T')[0];
            resultados = resultados.filter(r => r.fecha === hoyStr);
        } else if (rango === 'semana') {
            const haceSieteDias = new Date();
            haceSieteDias.setDate(hoy.getDate() - 7);
            resultados = resultados.filter(r => new Date(r.fecha) >= haceSieteDias);
        } else if (rango === 'mes') {
            const mesActual = hoy.toISOString().slice(0, 7);
            resultados = resultados.filter(r => r.fecha && r.fecha.startsWith(mesActual));
        } else if (rango === 'anio') {
            const anioActual = hoy.getFullYear().toString();
            resultados = resultados.filter(r => r.fecha && r.fecha.startsWith(anioActual));
        }
    }

    const maqFiltro = filterBus.value;
    if (maqFiltro !== 'todos') {
        resultados = resultados.filter(r => {
            if (Array.isArray(r.maquinas)) {
                return r.maquinas.includes(maqFiltro);
            }
            return r.maquina === maqFiltro;
        });
    }

    const categoriaFiltro = filterCategoria.value;
    if (categoriaFiltro !== 'todos') {
        resultados = resultados.filter(r => r.categoria === categoriaFiltro);
    }

    window.registrosFiltrados = resultados;
    totalResultados.innerText = `Registros encontrados: ${resultados.length}`;
    renderizarTabla(resultados);
}

function renderizarTabla(registros) {
    cuerpoTabla.innerHTML = '';

    if (registros.length === 0) {
        cuerpoTabla.innerHTML = `<tr><td colspan="11" style="text-align:center;">No se encontraron registros.</td></tr>`;
        return;
    }

    registros.forEach(item => {
        const tr = document.createElement('tr');

        const maquinasTexto = Array.isArray(item.maquinas) 
            ? item.maquinas.map(m => `Máquina ${m}`).join(', ') 
            : `Máquina ${item.maquina || 'N/R'}`;

        let mediaHtml = 'Sin evidencia';
        if (item.mediaUrl) {
            if (item.mediaType === 'video') {
                mediaHtml = `<video src="${item.mediaUrl}" class="media-preview" controls preload="metadata"></video>`;
            } else {
                mediaHtml = `<a href="${item.mediaUrl}" target="_blank" rel="noopener noreferrer">
                                <img src="${item.mediaUrl}" class="media-preview" alt="Evidencia" loading="lazy">
                             </a>`;
            }
        }

        tr.innerHTML = `
            <td>${item.fecha || ''}</td>
            <td>${item.hora || ''}</td>
            <td><strong>${maquinasTexto}</strong></td>
            <td>${item.ruta || ''}</td>
            <td>${item.conductor || 'N/R'}</td>
            <td><span class="badge-categoria">${obtenerLabelCategoria(item.categoria)}</span></td>
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

async function eliminarRegistro(item) {
    if (!confirm("¿Está seguro de que desea eliminar este registro y su archivo de evidencia?")) return;

    try {
        if (item.storagePath) {
            const storageRef = ref(storage, item.storagePath);
            await deleteObject(storageRef).catch(e => console.warn("Archivo no encontrado en storage:", e));
        }
        await deleteDoc(doc(db, "anomalias", item.id));
    } catch (err) {
        console.error("Error al eliminar registro:", err);
        alert("No se pudo eliminar el registro.");
    }
}

/* ==========================================================================
   MÓDULO DE EXPORTACIÓN A EXCEL
   ========================================================================== */

async function descargarEIncrustarImagen(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;

        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                 
                const MAX_WIDTH = 600;
                let width = img.naturalWidth || img.width;
                let height = img.naturalHeight || img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                const dataURL = canvas.toDataURL("image/png");

                const base64Data = dataURL.split(',')[1];
                const binaryString = window.atob(base64Data);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                resolve(bytes.buffer);
            } catch (err) {
                console.error("Error procesando imagen para Excel:", err);
                resolve(null);
            }
        };

        img.onerror = (err) => {
            console.error("Error al cargar la URL de la imagen:", err);
            resolve(null);
        };
    });
}

btnExportar.addEventListener('click', async () => {
    const textoOriginal = btnExportar.innerText;

    try {
        const registrosAExportar = window.registrosFiltrados || [];

        if (registrosAExportar.length === 0) {
            alert("No hay registros disponibles para exportar.");
            return;
        }

        btnExportar.innerText = "⏳ Generando Excel compatible...";
        btnExportar.disabled = true;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte Anomalías');

        worksheet.columns = [
            { header: 'Fecha', key: 'fecha', width: 14 },
            { header: 'Hora', key: 'hora', width: 10 },
            { header: 'Máquina(s)', key: 'maquinas', width: 22 },
            { header: 'Ruta Principal', key: 'ruta', width: 25 },
            { header: 'Conductor', key: 'conductor', width: 22 },
            { header: 'Motivo', key: 'categoria', width: 20 },
            { header: 'Pasajeros Sin Pagar', key: 'pasajeros', width: 20 },
            { header: 'Lugar / Parada', key: 'lugar', width: 25 },
            { header: 'Descripción', key: 'descripcion', width: 38 },
            { header: 'Evidencia', key: 'evidencia', width: 24 }
        ];

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '003366' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;

        for (let i = 0; i < registrosAExportar.length; i++) {
            const item = registrosAExportar[i];
            const rowIndex = i + 2;

            const maquinasTexto = Array.isArray(item.maquinas) 
                ? item.maquinas.map(m => `Máquina ${m}`).join(', ') 
                : `Máquina ${item.maquina || 'N/R'}`;

            let textoEvidencia = '';
            if (item.mediaUrl) {
                textoEvidencia = item.mediaType === 'video' ? '🎥 Reproducir Video' : 'Ver Imagen';
            }

            worksheet.addRow({
                fecha: item.fecha || '',
                hora: item.hora || '',
                maquinas: maquinasTexto,
                ruta: item.ruta || '',
                conductor: item.conductor || 'N/R',
                categoria: obtenerLabelCategoria(item.categoria),
                pasajeros: item.pasajerosSinPagar || 0,
                lugar: item.lugar || '',
                descripcion: item.descripcion || '',
                evidencia: textoEvidencia
            });

            const row = worksheet.getRow(rowIndex);
            row.height = 80;
            row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

            const pasajerosSinPagar = item.pasajerosSinPagar || 0;
            if (pasajerosSinPagar >= 1) {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFF00' }
                    };
                });
            }

            if (item.mediaUrl && item.mediaType === 'video') {
                const cell = row.getCell('evidencia');
                cell.value = {
                    text: '🎥 Reproducir Video',
                    hyperlink: item.mediaUrl,
                    tooltip: 'Haz clic para ver el video en la nube'
                };
                cell.font = { color: { argb: '0000FF' }, underline: true };
            } 
            else if (item.mediaUrl && item.mediaType !== 'video') {
                try {
                    const imageBuffer = await descargarEIncrustarImagen(item.mediaUrl);

                    if (imageBuffer) {
                        const imageId = workbook.addImage({
                            buffer: imageBuffer,
                            extension: 'png',
                        });

                        worksheet.addImage(imageId, {
                            tl: { col: 9, row: rowIndex - 1 },
                            ext: { width: 130, height: 95 },
                            editAs: 'oneCell'
                        });
                    }
                } catch (imgErr) {
                    console.error("No se pudo pegar la imagen en la fila " + rowIndex, imgErr);
                }
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Reporte_Anomalias_${new Date().toISOString().slice(0,10)}.xlsx`;
        link.click();
        URL.revokeObjectURL(link.href);

    } catch (err) {
        console.error("Error al exportar Excel:", err);
        alert("Error al generar el archivo Excel.");
    } finally {
        btnExportar.innerText = textoOriginal;
        btnExportar.disabled = false;
    }
});
