// 1. Registro del Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registrado:', reg.scope))
      .catch((err) => console.error('Error al registrar Service Worker:', err));
  });
}

// 2. Importación e Inicialización de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCfhwfmzg6YJ1BRyCrDgksQQ3C5uGuhHhs",
    authDomain: "registro-6bd00.firebaseapp.com",
    projectId: "registro-6bd00",
    storageBucket: "registro-6bd00.firebasestorage.app",
    messagingSenderId: "793627336045",
    appId: "1:793627336045:web:9aab95e54aa481c1248e64",
    measurementId: "G-SGV7LB9B0N"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// 3. Manejo de Estado
const LISTA_MAQUINAS = ["113", "114", "115", "116", "117", "119", "120", "121", "122", "123", "124", "125", "126", "127", "128", "129", "130", "200", "201", "202", "203"];
let maquinasSeleccionadas = new Set();
let historialBase = [];
let historialFiltrado = [];

// 4. Renderizado de Máquinas y Filtros
function renderizarOpcionesMaquinas() {
    const container = document.getElementById('maquinasContainer');
    const filterSelect = document.getElementById('filterBus');
    
    if (!container || !filterSelect) return;

    container.innerHTML = '';
    filterSelect.innerHTML = '<option value="todos">Todas las máquinas</option>';

    LISTA_MAQUINAS.forEach(m => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-btn';
        btn.innerText = `Máquina ${m}`;
        btn.onclick = () => {
            if (maquinasSeleccionadas.has(m)) {
                maquinasSeleccionadas.delete(m);
                btn.classList.remove('selected');
            } else {
                maquinasSeleccionadas.add(m);
                btn.classList.add('selected');
            }
        };
        container.appendChild(btn);

        const opt = document.createElement('option');
        opt.value = m;
        opt.innerText = `Máquina ${m}`;
        filterSelect.appendChild(opt);
    });
}

// 5. Compresión Automática de Imágenes
function optimizarImagen(file) {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
            resolve(file);
            return;
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDim = 1200;
                let width = img.width;
                let height = img.height;

                if (width > height && width > maxDim) {
                    height *= maxDim / width;
                    width = maxDim;
                } else if (height > maxDim) {
                    width *= maxDim / height;
                    height = maxDim;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.7);
            };
        };
    });
}

// 6. Envío del Formulario
const form = document.getElementById("anomaliaForm");
const statusMsg = document.getElementById("statusMsg");

if (form) {
    document.getElementById('fechaInput').valueAsDate = new Date();

    form.addEventListener("submit", async function(event) {
        event.preventDefault();

        if (maquinasSeleccionadas.size === 0) {
            alert("Por favor seleccione al menos una máquina.");
            return;
        }

        const btnGuardar = document.getElementById("btnGuardar");
        btnGuardar.disabled = true;
        statusMsg.style.color = "#003366";

        let file = document.getElementById("mediaInput").files[0];
        if (!file) return;

        if (file.type.startsWith("video/") && file.size > 20 * 1024 * 1024) {
            alert("El video supera el límite de 20MB. Por favor sube un fragmento más corto.");
            btnGuardar.disabled = false;
            return;
        }

        try {
            statusMsg.innerText = "⚡ Optimizando archivo...";
            const archivoAProcesar = await optimizarImagen(file);

            statusMsg.innerText = "⏳ Subiendo evidencia (0%)...";
            const storageRef = ref(storage, `evidencias/${Date.now()}_${archivoAProcesar.name}`);
            const uploadTask = uploadBytesResumable(storageRef, archivoAProcesar);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progreso = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                    statusMsg.innerText = `⏳ Subiendo evidencia (${progreso}%)...`;
                }, 
                (error) => {
                    console.error("Error al subir archivo:", error);
                    statusMsg.style.color = "#d9534f";
                    statusMsg.innerText = "❌ Error en la subida: " + error.message;
                    btnGuardar.disabled = false;
                }, 
                async () => {
                    statusMsg.innerText = "⏳ Guardando registro en Firestore...";
                    const mediaUrl = await getDownloadURL(uploadTask.snapshot.ref);

                    const nuevoRegistro = {
                        fecha: document.getElementById("fechaInput").value,
                        hora: document.getElementById("horaInput").value,
                        maquinas: Array.from(maquinasSeleccionadas).sort(),
                        ruta: document.getElementById("rutaInput").value,
                        conductor: document.getElementById("conductorInput").value || "N/I",
                        pasajerosSinPagar: Number(document.getElementById("pasajerosInput").value) || 0,
                        lugar: document.getElementById("lugarInput").value,
                        descripcion: document.getElementById("descripcionInput").value,
                        tipo: file.type.startsWith("video/") ? 'video' : 'imagen',
                        mediaUrl: mediaUrl,
                        storagePath: uploadTask.snapshot.ref.fullPath,
                        timestamp: Date.now()
                    };

                    await addDoc(collection(db, "anomalias"), nuevoRegistro);

                    alert("✅ Registrado con éxito en la nube.");
                    form.reset();
                    maquinasSeleccionadas.clear();
                    document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('selected'));
                    document.getElementById('fechaInput').valueAsDate = new Date();
                    document.getElementById('pasajerosInput').value = "0";
                    statusMsg.innerText = "";
                    btnGuardar.disabled = false;
                }
            );

        } catch (error) {
            console.error("Error:", error);
            statusMsg.style.color = "#d9534f";
            statusMsg.innerText = "❌ Error: " + error.message;
            btnGuardar.disabled = false;
        }
    });
}

// 7. Consulta en Tiempo Real y Filtrado
function escucharHistorialEnTiempoReal() {
    const q = query(collection(db, "anomalias"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        historialBase = [];
        snapshot.forEach((docSnap) => {
            historialBase.push({ id: docSnap.id, ...docSnap.data() });
        });
        aplicarFiltros();
    }, (error) => {
        console.error("Error cargando historial:", error);
        document.getElementById("cuerpoTabla").innerHTML = `<tr><td colspan="10" style="text-align:center; color:red;">Error al cargar datos desde la nube.</td></tr>`;
    });
}

function aplicarFiltros() {
    const rango = document.getElementById("filterRango").value;
    const fechaEspec = document.getElementById("filterFechaEspecifica").value;
    const busSel = document.getElementById("filterBus").value;
    const hoy = new Date();
    
    historialFiltrado = historialBase.filter(item => {
        let cumpleFecha = true;
        let cumpleBus = true;
        const itemFecha = new Date(item.fecha + "T00:00:00");

        if (fechaEspec) {
            cumpleFecha = item.fecha === fechaEspec;
        } else if (rango === "dia") {
            cumpleFecha = itemFecha.toDateString() === hoy.toDateString();
        } else if (rango === "semana") {
            const haceUnaSemana = new Date();
            haceUnaSemana.setDate(hoy.getDate() - 7);
            cumpleFecha = itemFecha >= haceUnaSemana && itemFecha <= hoy;
        } else if (rango === "mes") {
            cumpleFecha = itemFecha.getMonth() === hoy.getMonth() && itemFecha.getFullYear() === hoy.getFullYear();
        } else if (rango === "anio") {
            cumpleFecha = itemFecha.getFullYear() === hoy.getFullYear();
        }

        if (busSel !== "todos") {
            cumpleBus = item.maquinas && item.maquinas.includes(busSel);
        }

        return cumpleFecha && cumpleBus;
    });

    renderizarTabla(historialFiltrado);
}

function renderizarTabla(datos) {
    const cuerpoTabla = document.getElementById("cuerpoTabla");
    document.getElementById("totalResultados").innerText = `Registros encontrados: ${datos.length}`;
    cuerpoTabla.innerHTML = "";

    if (datos.length === 0) {
        cuerpoTabla.innerHTML = `<tr><td colspan="10" style="text-align:center;">No hay registros grabados.</td></tr>`;
        return;
    }

    datos.forEach(item => {
        const tr = document.createElement("tr");
        let mediaHtml = item.tipo === 'video' 
            ? `<video src="${item.mediaUrl}" class="media-preview" controls></video>`
            : `<a href="${item.mediaUrl}" target="_blank"><img src="${item.mediaUrl}" class="media-preview" alt="Evidencia"></a>`;

        let textoMaquinas = item.maquinas ? item.maquinas.map(m => `Máquina ${m}`).join(", ") : `Máquina ${item.bus || ''}`;

        tr.innerHTML = `
            <td>${item.fecha}</td>
            <td>${item.hora}</td>
            <td><strong>${textoMaquinas}</strong></td>
            <td>${item.ruta || 'N/A'}</td>
            <td>${item.conductor || 'N/I'}</td>
            <td style="text-align:center; font-weight:bold;">${item.pasajerosSinPagar ?? 0}</td>
            <td>${item.lugar}</td>
            <td>${item.descripcion}</td>
            <td>${mediaHtml}</td>
            <td><button class="btn-danger btn-borrar-doc" data-id="${item.id}" data-path="${item.storagePath || ''}">Eliminar</button></td>
        `;
        cuerpoTabla.appendChild(tr);
    });

    document.querySelectorAll('.btn-borrar-doc').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            const path = e.target.getAttribute('data-path');
            if (confirm("¿Está seguro de eliminar este registro?")) {
                try {
                    await deleteDoc(doc(db, "anomalias", id));
                    if (path) await deleteObject(ref(storage, path));
                } catch (err) {
                    console.error("Error al borrar:", err);
                    alert("Error al eliminar el registro.");
                }
            }
        });
    });
}

// 8. Eventos de Filtros y Exportación a Excel
document.getElementById("filterRango")?.addEventListener("change", aplicarFiltros);
document.getElementById("filterFechaEspecifica")?.addEventListener("change", aplicarFiltros);
document.getElementById("filterBus")?.addEventListener("change", aplicarFiltros);

document.getElementById("btnLimpiar")?.addEventListener("click", () => {
    document.getElementById("filterRango").value = "todos";
    document.getElementById("filterFechaEspecifica").value = "";
    document.getElementById("filterBus").value = "todos";
    aplicarFiltros();
});

document.getElementById("btnExportar")?.addEventListener("click", () => {
    if (!historialFiltrado || historialFiltrado.length === 0) {
        alert("No hay registros disponibles para exportar.");
        return;
    }

    let filasHtml = "";
    historialFiltrado.forEach(item => {
        let celdaEvidencia = item.tipo === 'video' 
            ? `<a href="${item.mediaUrl}" target="_blank" style="color:#003366; font-weight:bold;">▶ Ver Video</a>`
            : `<a href="${item.mediaUrl}" target="_blank"><img src="${item.mediaUrl}" width="160" height="120" style="display:block; margin:auto;" /></a>`;

        let textoMaquinas = item.maquinas ? item.maquinas.map(m => `Máquina ${m}`).join(", ") : `Máquina ${item.bus || ''}`;

        filasHtml += `
            <tr style="height: 130px;">
                <td style="border:1px solid #ccc; text-align:center; vertical-align:middle;">${item.fecha}</td>
                <td style="border:1px solid #ccc; text-align:center; vertical-align:middle;">${item.hora}</td>
                <td style="border:1px solid #ccc; text-align:center; vertical-align:middle; font-weight:bold;">${textoMaquinas}</td>
                <td style="border:1px solid #ccc; vertical-align:middle;">${item.ruta || 'N/A'}</td>
                <td style="border:1px solid #ccc; vertical-align:middle;">${item.conductor || 'N/I'}</td>
                <td style="border:1px solid #ccc; text-align:center; vertical-align:middle; font-weight:bold;">${item.pasajerosSinPagar ?? 0}</td>
                <td style="border:1px solid #ccc; vertical-align:middle;">${item.lugar}</td>
                <td style="border:1px solid #ccc; vertical-align:middle;">${item.descripcion}</td>
                <td style="border:1px solid #ccc; text-align:center; vertical-align:middle;">${celdaEvidencia}</td>
            </tr>
        `;
    });

    const plantillaExcel = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head>
        <body>
            <h1 style="color:#003366;">Buses Tarapacá - Historial Filtrado</h1>
            <table border="1" style="border-collapse:collapse; font-family:Arial;">
                <thead>
                    <tr style="background-color:#003366; color:white; height:40px;">
                        <th>Fecha</th><th>Hora</th><th>Máquina(s)</th><th>Ruta Principal</th>
                        <th>Conductor</th><th>Pasajeros Sin Pagar</th><th>Lugar / Parada</th>
                        <th>Descripción</th><th>Evidencia</th>
                    </tr>
                </thead>
                <tbody>${filasHtml}</tbody>
            </table>
        </body>
        </html>
    `;

    const blob = new Blob(["\uFEFF" + plantillaExcel], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Historial_Anomalias_${new Date().toISOString().slice(0,10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Inicialización
renderizarOpcionesMaquinas();
escucharHistorialEnTiempoReal();