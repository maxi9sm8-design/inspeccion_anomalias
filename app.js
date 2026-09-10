import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytesResumable, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";

// 1. Configuración de Firebase (Proyecto: registro-6bd00)
const firebaseConfig = {
    authDomain: "registro-6bd00.firebaseapp.com",
    projectId: "registro-6bd00",
    storageBucket: "registro-6bd00.firebasestorage.app",
    messagingSenderId: "834195156689",
    appId: "1:834195156689:web:3e271a39626e2e2a0fef19"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Estado local
let maquinasSeleccionadas = [];
let historialCompleto = [];

const MAQUINAS_DISPONIBLES = Array.from({ length: 40 }, (_, i) => `Bus ${101 + i}`);

// 2. Inicialización del DOM y Eventos
document.addEventListener("DOMContentLoaded", () => {
    renderizarChipsMaquinas();
    escucharHistorialEnTiempoReal();
    registrarServiceWorker();

    document.getElementById("anomaliaForm").addEventListener("submit", manejarEnvioFormulario);
    document.getElementById("btnExportar").addEventListener("click", exportarAExcelConImagenes);
    document.getElementById("filterRango").addEventListener("change", aplicarFiltros);
    document.getElementById("filterFechaEspecifica").addEventListener("change", aplicarFiltros);
    document.getElementById("filterBus").addEventListener("change", aplicarFiltros);
    document.getElementById("btnLimpiar").addEventListener("click", limpiarFiltros);

    const hoy = new Date();
    document.getElementById("fechaInput").value = hoy.toISOString().split("T")[0];
    document.getElementById("horaInput").value = hoy.toTimeString().slice(0, 5);
});

// Renderizar Selector Múltiple de Máquinas
function renderizarChipsMaquinas() {
    const container = document.getElementById("maquinasContainer");
    const selectFiltro = document.getElementById("filterBus");

    container.innerHTML = "";
    selectFiltro.innerHTML = '<option value="todos">Todas las máquinas</option>';

    MAQUINAS_DISPONIBLES.forEach(bus => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip-btn";
        btn.textContent = bus;
        btn.addEventListener("click", () => {
            btn.classList.toggle("selected");
            if (maquinasSeleccionadas.includes(bus)) {
                maquinasSeleccionadas = maquinasSeleccionadas.filter(m => m !== bus);
            } else {
                maquinasSeleccionadas.push(bus);
            }
        });
        container.appendChild(btn);

        const option = document.createElement("option");
        option.value = bus;
        option.textContent = bus;
        selectFiltro.appendChild(option);
    });
}

// 3. Compresión de Imágenes
function optimizarImagen(file) {
    return new Promise((resolve) => {
        if (!file.type.startsWith("image/")) {
            resolve(file);
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_WIDTH = 1280;
                const MAX_HEIGHT = 720;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: "image/jpeg" }));
                }, "image/jpeg", 0.7);
            };
        };
    });
}

// 4. Subida a Firebase Storage
async function subirArchivoStorage(file, mostrarProgreso) {
    const fileComprimido = await optimizarImagen(file);
    const rutaRef = ref(storage, `evidencias/${Date.now()}_${fileComprimido.name}`);
    const uploadTask = uploadBytesResumable(rutaRef, fileComprimido);

    return new Promise((resolve, reject) => {
        uploadTask.on("state_changed",
            (snapshot) => {
                const progreso = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                mostrarProgreso(`Subiendo archivo: ${Math.round(progreso)}%`);
            },
            (error) => reject(error),
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve({
                    url: downloadURL,
                    tipo: file.type.startsWith("video/") ? "video" : "imagen"
                });
            }
        );
    });
}

// 5. Envío del Formulario
async function manejarEnvioFormulario(e) {
    e.preventDefault();
    const btnGuardar = document.getElementById("btnGuardar");
    const statusMsg = document.getElementById("statusMsg");

    if (maquinasSeleccionadas.length === 0) {
        alert("Por favor seleccione al menos una máquina.");
        return;
    }

    const mediaInput = document.getElementById("mediaInput");
    if (!mediaInput.files[0]) {
        alert("Debe adjuntar una foto o video como evidencia.");
        return;
    }

    const file = mediaInput.files[0];
    if (file.type.startsWith("video/") && file.size > 20 * 1024 * 1024) {
        alert("El archivo de video supera el límite permitido de 20MB.");
        return;
    }

    try {
        btnGuardar.disabled = true;
        statusMsg.style.color = "#003366";
        
        const evidencia = await subirArchivoStorage(file, (msg) => {
            statusMsg.textContent = msg;
        });

        statusMsg.textContent = "Guardando en Firestore...";

        const nuevoRegistro = {
            maquinas: [...maquinasSeleccionadas],
            ruta: document.getElementById("rutaInput").value.trim(),
            conductor: document.getElementById("conductorInput").value.trim() || "N/A",
            fecha: document.getElementById("fechaInput").value,
            hora: document.getElementById("horaInput").value,
            pasajerosSinPagar: parseInt(document.getElementById("pasajerosInput").value, 10) || 0,
            lugar: document.getElementById("lugarInput").value.trim(),
            descripcion: document.getElementById("descripcionInput").value.trim(),
            mediaUrl: evidencia.url,
            mediaTipo: evidencia.tipo,
            creadoEn: new Date().toISOString()
        };

        await addDoc(collection(db, "anomalias"), nuevoRegistro);

        statusMsg.style.color = "green";
        statusMsg.textContent = "✅ ¡Anomalía registrada exitosamente!";
        
        document.getElementById("anomaliaForm").reset();
        maquinasSeleccionadas = [];
        document.querySelectorAll(".chip-btn.selected").forEach(c => c.classList.remove("selected"));

        setTimeout(() => { statusMsg.textContent = ""; }, 4000);

    } catch (err) {
        console.error("Error al guardar:", err);
        statusMsg.style.color = "red";
        statusMsg.textContent = `❌ Error al guardar: ${err.message}`;
    } finally {
        btnGuardar.disabled = false;
    }
}

// 6. Sincronización en Tiempo Real
function escucharHistorialEnTiempoReal() {
    const q = query(collection(db, "anomalias"), orderBy("creadoEn", "desc"));

    onSnapshot(q, (snapshot) => {
        historialCompleto = [];
        snapshot.forEach((docSnap) => {
            historialCompleto.push({ id: docSnap.id, ...docSnap.data() });
        });
        aplicarFiltros();
    }, (err) => {
        console.error("Error al leer Firestore:", err);
        document.getElementById("cuerpoTabla").innerHTML = `<tr><td colspan="10" style="color:red; text-align:center;">Error de conexión con la base de datos.</td></tr>`;
    });
}

// 7. Filtrado Dinámico
function aplicarFiltros() {
    const rango = document.getElementById("filterRango").value;
    const fechaEsp = document.getElementById("filterFechaEspecifica").value;
    const busSel = document.getElementById("filterBus").value;

    const hoy = new Date();
    
    let filtrados = historialCompleto.filter(item => {
        const fechaReg = new Date(item.fecha + "T00:00:00");
        let pasaRango = true;

        if (fechaEsp) {
            pasaRango = item.fecha === fechaEsp;
        } else if (rango === "dia") {
            pasaRango = item.fecha === hoy.toISOString().split("T")[0];
        } else if (rango === "semana") {
            const haceUnaSemana = new Date();
            haceUnaSemana.setDate(hoy.getDate() - 7);
            pasaRango = fechaReg >= haceUnaSemana;
        } else if (rango === "mes") {
            pasaRango = fechaReg.getMonth() === hoy.getMonth() && fechaReg.getFullYear() === hoy.getFullYear();
        } else if (rango === "anio") {
            pasaRango = fechaReg.getFullYear() === hoy.getFullYear();
        }

        let pasaBus = true;
        if (busSel !== "todos") {
            pasaBus = Array.isArray(item.maquinas) && item.maquinas.includes(busSel);
        }

        return pasaRango && pasaBus;
    });

    renderizarTabla(filtrados);
}

function limpiarFiltros() {
    document.getElementById("filterRango").value = "todos";
    document.getElementById("filterFechaEspecifica").value = "";
    document.getElementById("filterBus").value = "todos";
    renderizarTabla(historialCompleto);
}

// 8. Renderizado de Tabla Web
function renderizarTabla(lista) {
    const tbody = document.getElementById("cuerpoTabla");
    const totalBadge = document.getElementById("totalResultados");

    totalBadge.textContent = `Registros encontrados: ${lista.length}`;
    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No hay reportes registrados para este filtro.</td></tr>`;
        return;
    }

    lista.forEach(item => {
        const tr = document.createElement("tr");
        const maquinasTxt = Array.isArray(item.maquinas) ? item.maquinas.join(", ") : item.maquinas;
        const evidenciaHTML = item.mediaTipo === "video" 
            ? `<video src="${item.mediaUrl}" class="media-preview" controls></video>`
            : `<a href="${item.mediaUrl}" target="_blank"><img src="${item.mediaUrl}" class="media-preview" alt="Evidencia"/></a>`;

        tr.innerHTML = `
            <td>${item.fecha}</td>
            <td>${item.hora}</td>
            <td><strong>${maquinasTxt}</strong></td>
            <td>${item.ruta}</td>
            <td>${item.conductor}</td>
            <td>${item.pasajerosSinPagar}</td>
            <td>${item.lugar}</td>
            <td>${item.descripcion}</td>
            <td style="text-align:center;">${evidenciaHTML}</td>
            <td style="text-align:center;">
                <button class="btn-danger" data-id="${item.id}">Borrar</button>
            </td>
        `;

        tr.querySelector(".btn-danger").addEventListener("click", () => eliminarRegistro(item.id));
        tbody.appendChild(tr);
    });
}

// 9. Eliminar Registro
async function eliminarRegistro(id) {
    if (confirm("¿Está seguro de que desea eliminar este reporte de la nube?")) {
        try {
            await deleteDoc(doc(db, "anomalias", id));
        } catch (err) {
            alert("Error al eliminar: " + err.message);
        }
    }
}

// 10. Helper para convertir imagen URL a Data URI (Base64)
function urlABase64(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 120; // Tamaño optimizado para la celda de Excel
            canvas.height = 90;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, 120, 90);
            resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => resolve(null); // Si falla o es video, retorna null
    });
}

// 11. Exportación a Excel con Imágenes Incrustadas
async function exportarAExcelConImagenes() {
    if (historialCompleto.length === 0) {
        alert("No hay información suficiente para exportar.");
        return;
    }

    const btnExportar = document.getElementById("btnExportar");
    btnExportar.disabled = true;
    btnExportar.textContent = "Generando Excel con fotos...";

    try {
        let filasHTML = "";

        for (const item of historialCompleto) {
            const maquinasTxt = Array.isArray(item.maquinas) ? item.maquinas.join(", ") : item.maquinas;
            let celdaEvidencia = "Sin archivo";

            if (item.mediaUrl) {
                if (item.mediaTipo === "video") {
                    celdaEvidencia = `<a href="${item.mediaUrl}" target="_blank">Ver Video</a>`;
                } else {
                    // Convertir imagen de Firebase a Base64
                    const base64Img = await urlABase64(item.mediaUrl);
                    if (base64Img) {
                        celdaEvidencia = `<img src="${base64Img}" width="120" height="90"/>`;
                    } else {
                        celdaEvidencia = `<a href="${item.mediaUrl}" target="_blank">Ver Foto</a>`;
                    }
                }
            }

            filasHTML += `
                <tr>
                    <td style="vertical-align: middle;">${item.fecha}</td>
                    <td style="vertical-align: middle;">${item.hora}</td>
                    <td style="vertical-align: middle;">${maquinasTxt}</td>
                    <td style="vertical-align: middle;">${item.ruta}</td>
                    <td style="vertical-align: middle;">${item.conductor}</td>
                    <td style="vertical-align: middle;">${item.pasajerosSinPagar}</td>
                    <td style="vertical-align: middle;">${item.lugar}</td>
                    <td style="vertical-align: middle;">${item.descripcion}</td>
                    <td style="text-align: center; vertical-align: middle;">${celdaEvidencia}</td>
                </tr>
            `;
        }

        const excelHTML = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <!--[if gte mso 9]>
                <xml>
                    <x:ExcelWorkbook>
                        <x:ExcelWorksheets>
                            <x:ExcelWorksheet>
                                <x:Name>Anomalías Buses Tarapacá</x:Name>
                                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                            </x:ExcelWorksheet>
                        </x:ExcelWorksheets>
                    </x:ExcelWorkbook>
                </xml>
                <![endif]-->
            </head>
            <body>
                <h2>Reporte de Anomalías Operativas - Buses Tarapacá</h2>
                <p><strong>Fecha de Generación:</strong> ${new Date().toLocaleString()}</p>
                <table border="1" style="border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #003366; color: white;">
                            <th>Fecha</th>
                            <th>Hora</th>
                            <th>Máquina(s)</th>
                            <th>Ruta Principal</th>
                            <th>Conductor</th>
                            <th>Pasajeros Sin Pagar</th>
                            <th>Lugar / Parada</th>
                            <th>Descripción</th>
                            <th>Evidencia Fotográfica</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHTML}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const blob = new Blob([excelHTML], { type: "application/vnd.ms-excel;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Reporte_Anomalias_Tarapaca_${new Date().toISOString().split("T")[0]}.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

    } catch (err) {
        console.error("Error al exportar:", err);
        alert("Ocurrió un error al procesar las imágenes para Excel.");
    } finally {
        btnExportar.disabled = false;
        btnExportar.textContent = "Exportar a Excel";
    }
}

// 12. Service Worker
function registrarServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(reg => console.log("Service Worker registrado con éxito:", reg.scope))
            .catch(err => console.warn("Error al registrar Service Worker:", err));
    }
}
