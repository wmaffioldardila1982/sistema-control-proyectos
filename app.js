// ==========================================
// 1. CONFIGURACIÓN DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️ REEMPLAZA ESTO CON TUS DATOS DE LA CONSOLA DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyDkxQ7H2ouGb7KTAS5ercSkCHx8quqA3yo",
    authDomain: "controlproyectos-f080a.firebaseapp.com",
    projectId: "controlproyectos-f080a",
    storageBucket: "controlproyectos-f080a.firebasestorage.app",
    messagingSenderId: "532250557433",
    appId: "1:532250557433:web:03e5eb48da06f282575b28"
  };

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. LÓGICA DEL DASHBOARD (index.html)
// ==========================================
if (document.getElementById('vista-dashboard')) {
  
  // Simular usuario autenticado (En producción, usa onAuthStateChanged)
  document.getElementById('userName').textContent = "Carlos Ramírez";

  // Datos de ejemplo (Esto vendrá de Firestore en la V2)
  const datosSimulados = {
    avance: "42.3%",
    actividadesHoy: 8,
    reportadas: 3,
    alertas: [
      { tipo: "DESVÍO NEGATIVO", codigo: "A1020", actividad: "Inspección de fondo del tanque", detalle: "Avance real 35% vs Plan 52%", dias: "-17%" },
      { tipo: "INICIADA SIN FINALIZAR", codigo: "A1010", actividad: "Limpieza interna con chorro abrasivo", detalle: "Inició el 15/Oct, aún en 78%", dias: "14 días" }
    ]
  };

  // Cargar KPIs
  document.getElementById('kpi-avance').textContent = datosSimulados.avance;
  document.getElementById('kpi-hoy').textContent = datosSimulados.actividadesHoy;
  document.getElementById('kpi-reportadas').textContent = datosSimulados.reportadas;
  document.getElementById('kpi-total-hoy').textContent = datosSimulados.actividadesHoy;
  document.getElementById('kpi-alertas').textContent = datosSimulados.alertas.length;

  // Cargar Tabla de Alertas
  const tbodyAlertas = document.getElementById('tabla-alertas');
  tbodyAlertas.innerHTML = ''; // Limpiar "Cargando..."
  
  datosSimulados.alertas.forEach(alerta => {
    const colorClass = alerta.tipo.includes("DESVÍO") ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700";
    const textoDias = alerta.tipo.includes("DESVÍO") ? `text-red-600 font-bold` : `text-orange-600 font-bold`;
    
    const row = `
      <tr class="hover:bg-gray-50 border-b transition">
        <td class="px-4 py-2"><span class="${colorClass} px-2 py-1 rounded text-xs font-semibold">${alerta.tipo}</span></td>
        <td class="px-4 py-2 font-mono text-xs">${alerta.codigo}</td>
        <td class="px-4 py-2 font-medium">${alerta.actividad}</td>
        <td class="px-4 py-2 text-gray-600">${alerta.detalle}</td>
        <td class="px-4 py-2 text-center ${textoDias}">${alerta.dias}</td>
      </tr>
    `;
    tbodyAlertas.innerHTML += row;
  });
}

// ==========================================
// 3. LÓGICA DE NAVEGACIÓN (TABS)
// ==========================================
window.cambiarTab = function(tabName) {
  // Ocultar todas las vistas
  document.getElementById('vista-dashboard').classList.add('hidden');
  document.getElementById('vista-actividades').classList.add('hidden');
  document.getElementById('vista-informes').classList.add('hidden');
  
  // Quitar clase active de todos los tabs
  document.getElementById('tab-dashboard').classList.remove('tab-active', 'text-blue-600');
  document.getElementById('tab-dashboard').classList.add('text-gray-600');
  document.getElementById('tab-actividades').classList.remove('tab-active', 'text-blue-600');
  document.getElementById('tab-actividades').classList.add('text-gray-600');
  document.getElementById('tab-informes').classList.remove('tab-active', 'text-blue-600');
  document.getElementById('tab-informes').classList.add('text-gray-600');

  // Mostrar vista seleccionada y activar tab
  document.getElementById(`vista-${tabName}`).classList.remove('hidden');
  const tabActivo = document.getElementById(`tab-${tabName}`);
  tabActivo.classList.add('tab-active', 'text-blue-600');
  tabActivo.classList.remove('text-gray-600');
};

// ==========================================
// 4. LÓGICA DEL REPORTE DIARIO (reporte.html)
// ==========================================
// Si estamos en la página de reporte, exponemos las funciones necesarias globalmente
if (document.getElementById('tblAvanceObra')) {
  
  window.agregarFilaAO = function() {
    const tbody = document.querySelector('#tblAvanceObra tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="pdt-codigo"></td>
      <td><select><option value="">-</option><option>A</option><option>B</option><option>C</option></select></td>
      <td><input type="text" class="pdt-desc"></td>
      <td><input type="number" step="0.01" class="pdt-cant-cont"></td>
      <td><input type="text" style="width:60px" class="pdt-und"></td>
      <td><input type="number" step="0.01" class="pdt-cant-ant"></td>
      <td><input type="number" step="0.01" class="pdt-cant-dia" onchange="window.calcularAcumulado(this)"></td>
      <td><input type="number" step="0.01" class="pdt-cant-acum" readonly></td>
      <td><input type="text" placeholder="%" class="pdt-porc-dia" readonly></td>
      <td><input type="text" placeholder="%" class="pdt-porc-acum" readonly></td>
      <td><input type="number" value="0" min="0"></td>
      <td><input type="number" value="0" min="0"></td>
      <td><input type="number" value="0" min="0"></td>
      <td><input type="number" value="0" min="0"></td>
      <td><input type="number" value="0" min="0"></td>
      <td><input type="number" value="0" min="0"></td>
      <td><button class="btn btn-danger" onclick="this.closest('tr').remove()">✕</button></td>
    `;
    tbody.appendChild(tr);
  };

  window.calcularAcumulado = function(input) {
    const fila = input.closest('tr');
    const cantAnt = parseFloat(fila.querySelector('.pdt-cant-ant').value) || 0;
    const cantDia = parseFloat(fila.querySelector('.pdt-cant-dia').value) || 0;
    const cantCont = parseFloat(fila.querySelector('.pdt-cant-cont').value) || 1;
    
    const cantAcum = cantAnt + cantDia;
    const porcAcum = ((cantAcum / cantCont) * 100).toFixed(2);
    const porcDia = ((cantDia / cantCont) * 100).toFixed(2);

    fila.querySelector('.pdt-cant-acum').value = cantAcum.toFixed(2);
    fila.querySelector('.pdt-porc-acum').value = porcAcum + '%';
    fila.querySelector('.pdt-porc-dia').value = porcDia + '%';
  };

  window.guardarReporte = async function() {
    const fecha = document.getElementById('fecha').value;
    const frente = document.getElementById('frente').value;
    
    if (!fecha || !frente) {
      alert('❌ Debe ingresar la fecha y el frente de trabajo');
      return;
    }

    document.getElementById('loader').classList.add('active');

    try {
      // Aquí iría la recolección completa de datos (simplificado para el ejemplo)
      const dataReporte = {
        fecha: fecha,
        frente: frente,
        contrato: document.getElementById('contrato').value,
        elaboro: document.getElementById('elaboro').value,
        fechaCreacion: new Date().toISOString(),
        // ... aquí agregarías los arrays de avanceObra, personal, etc.
      };

      // DESCOMENTAR CUANDO TENGAS FIREBASE CONFIGURADO:
      // const docRef = await addDoc(collection(db, "reportesDiarios"), dataReporte);
      
      // Simulación de éxito
      setTimeout(() => {
        document.getElementById('loader').classList.remove('active');
        alert(`✅ Reporte guardado exitosamente (Simulación)`);
        if(confirm('¿Desea volver al Dashboard?')) {
          window.location.href = 'index.html';
        }
      }, 1000);

    } catch (error) {
      document.getElementById('loader').classList.remove('active');
      alert('❌ Error al guardar: ' + error.message);
    }
  };
}