// app.js - Control de Anomalías Buses Tarapacá
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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

// Lista exacta de Máquinas / Equipos
const LISTA_MAQUINAS = [
    "122", "127", "120", "202", "123", "125", "121", 
    "201", "200", "129", "119", "116", "124", "130", 
    "113", "115", "203", "114", "128", "117", "126"
];

// Variables globales de estado
let maquinasSeleccionadas = [];
let todosLosRegistros = [];
window.registrosFiltrados = [];

// Elementos del DOM
const maquinasContainer = document.getElementById('maquinasContainer');
const anomaliaForm = document.getElementById('anomaliaForm');
const fechaInput = document.getElementById('fechaInput');
const horaInput = document.getElementById('horaInput');
const cuerpoTabla = document.getElementById('cuerpoTabla');
const statusMsg = document.getElementById('statusMsg');
const totalResultados = document.getElementById('totalResultados');

const filterRango = document.getElementById('filterRango');
const filterFechaEspecifica = document.getElementById('filterFechaEspecifica');
const filterBus = document.getElementById('filterBus');
const btnLimpiar = document.getElementById('btnLimpiar');
const btnExportar = document.getElementById('btnExportar');

// Inicialización de la App
document.addEventListener('DOMContentLoaded', () => {
    inicializarFormulario();
    renderizarChipsMaquinas();
    escucharFirestore();
    configurarFiltros();
});

// Ajustar fecha y hora actual por defecto
function inicializarFormulario() {
    const hoy = new Date();
    fechaInput.value = hoy.toISOString().split('T')[0];
    horaInput.value = hoy.toTimeString().slice(0, 5);
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

// Guardar Registro en Firebase Firestore y Storage
anomaliaForm.addEventListener('submit', async (e) => {
    e.preventDefault();

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
        const fileExt = mediaFile.name.split('.').pop();
        const fileName = `evidencias/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const storageRef = ref(storage, fileName);
        
        await uploadBytes(storageRef, mediaFile);
        const mediaUrl = await getDownloadURL(storageRef);
        const isVideo = mediaFile.type.startsWith('video');

        // Guardar documento en Firestore
        const nuevoRegistro = {
            maquinas: [...maquinasSeleccionadas],
            ruta: document.getElementById('rutaInput').value.trim(),
            conductor: document.getElementById('conductorInput').value.trim() || 'N/R',
            fecha: fechaInput.value,
            hora: horaInput.value,
            pasajerosSinPagar: parseInt(document.getElementById('pasajerosInput').value) || 0,
            lugar: document.getElementById('lugarInput').value.trim(),
            descripcion: document.getElementById('descripcionInput').value.trim(),
            mediaUrl: mediaUrl,
            storagePath: fileName,
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

// Escuchar cambios en tiempo real desde Firestore
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
        cuerpoTabla.innerHTML = `<tr><td colspan="10" style="text-align:center; color:red;">Error al cargar datos desde la nube.</td></tr>`;
    });
}

// Configuración de Filtros
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

    btnLimpiar.addEventListener('click', () => {
        filterRango.value = 'todos';
        filterFechaEspecifica.value = '';
        filterBus.value = 'todos';
        aplicarFiltros();
    });
}

// Aplicar filtros
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

    window.registrosFiltrados = resultados;
    totalResultados.innerText = `Registros encontrados: ${resultados.length}`;
    renderizarTabla(resultados);
}

// Renderizar Tabla HTML
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

// Eliminar Registro
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
   MÓDULO DE EXPORTACIÓN A EXCEL (COMPATIBLE CON PC, iOS, ANDROID Y OFFICE 365)
   ========================================================================== */

// Función universal para procesar imágenes como PNG estándar
async function descargarEIncrustarImagen(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;

        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                
                // Limitar tamaño máximo a 600px para que abra rápido en celulares y no consuma RAM excesiva
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

                // Exportar como PNG estándar
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

// Generador de Excel con ExcelJS
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

        // Columnas
        worksheet.columns = [
            { header: 'Fecha', key: 'fecha', width: 14 },
            { header: 'Hora', key: 'hora', width: 10 },
            { header: 'Máquina(s)', key: 'maquinas', width: 22 },
            { header: 'Ruta Principal', key: 'ruta', width: 25 },
            { header: 'Conductor', key: 'conductor', width: 22 },
            { header: 'Pasajeros Sin Pagar', key: 'pasajeros', width: 20 },
            { header: 'Lugar / Parada', key: 'lugar', width: 25 },
            { header: 'Descripción', key: 'descripcion', width: 38 },
            { header: 'Evidencia (Foto)', key: 'evidencia', width: 24 }
        ];

        // Encabezado
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '003366' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;

        // Agregar filas e incrustar imágenes
        for (let i = 0; i < registrosAExportar.length; i++) {
            const item = registrosAExportar[i];
            const rowIndex = i + 2;

            const maquinasTexto = Array.isArray(item.maquinas) 
                ? item.maquinas.map(m => `Maq ${m}`).join(', ') 
                : `Maq ${item.maquina || 'N/R'}`;

            worksheet.addRow({
                fecha: item.fecha || '',
                hora: item.hora || '',
                maquinas: maquinasTexto,
                ruta: item.ruta || '',
                conductor: item.conductor || 'N/R',
                pasajeros: item.pasajerosSinPagar || 0,
                lugar: item.lugar || '',
                descripcion: item.descripcion || '',
                evidencia: (item.mediaType === 'video') ? '[Evidencia en Video]' : ''
            });

            const row = worksheet.getRow(rowIndex);
            row.height = 80;
            row.alignment = { vertical: 'middle', wrapText: true };

            // Si es imagen, se incrusta en el archivo .xlsx
            if (item.mediaUrl && item.mediaType !== 'video') {
                try {
                    const imageBuffer = await descargarEIncrustarImagen(item.mediaUrl);

                    if (imageBuffer) {
                        const imageId = workbook.addImage({
                            buffer: imageBuffer,
                            extension: 'png',
                        });

                        worksheet.addImage(imageId, {
                            tl: { col: 8, row: rowIndex - 1 },
                            ext: { width: 130, height: 95 },
                            editAs: 'oneCell'
                        });
                    }
                } catch (imgErr) {
                    console.error("No se pudo pegar la imagen en la fila " + rowIndex, imgErr);
                }
            }
        }

        // Descargar archivo Excel
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
