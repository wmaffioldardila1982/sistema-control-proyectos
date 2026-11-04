// ==========================================
// MOTOR DE CÁLCULO DE SEGUIMIENTO
// Calcula automáticamente el estado del proyecto
// comparando la Línea Base vs Reportes Diarios
// ==========================================

import { getFirestore, collection, getDocs, query, where } 
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. OBTENER DATOS DE FIREBASE
// ==========================================

/**
 * Obtiene el PDT Línea Base de un frente específico
 * @param {Firestore} db - Instancia de Firestore
 * @param {string} proyectoId - ID del proyecto
 * @param {string} frente - Nombre del frente (ej: "Tanque TK-01")
 * @param {string} version - Versión del PDT (ej: "lb1"). Si es null, toma la más reciente
 * @returns {Object} PDT con sus actividades
 */
export async function obtenerPDT(db, proyectoId, frente, version = null) {
  try {
    let q = query(
      collection(db, "pdts"),
      where("proyectoId", "==", proyectoId),
      where("frente", "==", frente)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error(`No se encontró PDT para el frente "${frente}"`);
    }
    
    // Si no se especifica versión, tomar la más reciente
    let pdtDoc = null;
    if (version) {
      querySnapshot.forEach(doc => {
        if (doc.data().version === version) {
          pdtDoc = { id: doc.id, ...doc.data() };
        }
      });
    } else {
      // Tomar el más reciente por fechaCarga
      let fechaMasReciente = null;
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const fecha = new Date(data.fechaCarga);
        if (!fechaMasReciente || fecha > fechaMasReciente) {
          fechaMasReciente = fecha;
          pdtDoc = { id: doc.id, ...data };
        }
      });
    }
    
    if (!pdtDoc) {
      throw new Error(`No se encontró la versión "${version}" del PDT`);
    }
    
    return pdtDoc;
    
  } catch (error) {
    console.error("Error al obtener PDT:", error);
    throw error;
  }
}

/**
 * Obtiene todos los reportes diarios de un frente
 * @param {Firestore} db - Instancia de Firestore
 * @param {string} frente - Nombre del frente
 * @returns {Array} Lista de reportes diarios
 */
export async function obtenerReportesDiarios(db, frente) {
  try {
    const q = query(
      collection(db, "reportesDiarios"),
      where("frente", "==", frente)
    );
    
    const querySnapshot = await getDocs(q);
    const reportes = [];
    
    querySnapshot.forEach(doc => {
      reportes.push({ id: doc.id, ...doc.data() });
    });
    
    return reportes;
    
  } catch (error) {
    console.error("Error al obtener reportes:", error);
    throw error;
  }
}

// ==========================================
// 2. CONSTRUIR HISTORIAL DE CANTIDADES POR ACTIVIDAD
// ==========================================

/**
 * Construye un mapa de cantidades reportadas por actividad
 * @param {Array} reportes - Lista de reportes diarios
 * @returns {Object} Mapa: {codigoPDT: [{fecha, cantDia, reporteId}]}
 */
export function construirHistorialCantidades(reportes) {
  const historial = {};
  
  for (const reporte of reportes) {
    if (!reporte.avanceObra || !Array.isArray(reporte.avanceObra)) continue;
    
    for (const actividad of reporte.avanceObra) {
      const codigo = actividad.codigoPDT;
      const cantDia = parseFloat(actividad.cantDia) || 0;
      
      if (!codigo || cantDia <= 0) continue;
      
      if (!historial[codigo]) {
        historial[codigo] = [];
      }
      
      historial[codigo].push({
        fecha: reporte.fecha,
        cantDia: cantDia,
        reporteId: reporte.id
      });
    }
  }
  
  // Ordenar cada historial por fecha
  for (const codigo in historial) {
    historial[codigo].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  }
  
  return historial;
}

// ==========================================
// 3. CALCULAR ESTADO DE CADA ACTIVIDAD
// ==========================================

/**
 * Calcula el estado de seguimiento de una actividad
 * @param {Object} actividadLB - Actividad de la línea base
 * @param {Array} historial - Array de reportes de esa actividad
 * @param {Date} fechaCorte - Fecha para calcular el estado (por defecto hoy)
 * @returns {Object} Estado completo de la actividad
 */
export function calcularEstadoActividad(actividadLB, historial = [], fechaCorte = new Date()) {
  const cantidadPlan = parseFloat(actividadLB.budgetedLaborUnits) || 0;
  const fechaInicioPlan = actividadLB.startDate ? new Date(actividadLB.startDate) : null;
  const fechaFinPlan = actividadLB.finishDate ? new Date(actividadLB.finishDate) : null;
  const duracionPlan = actividadLB.originalDuration || 0;
  
  // Calcular cantidad acumulada
  let cantidadAcumulada = 0;
  let fechaInicioReal = null;
  let fechaFinReal = null;
  
  for (const reporte of historial) {
    cantidadAcumulada += reporte.cantDia;
    
    const fechaReporte = new Date(reporte.fecha);
    
    // Primera fecha con reporte > 0 = inicio real
    if (!fechaInicioReal) {
      fechaInicioReal = fechaReporte;
    }
    
    // Actualizar fecha fin real (última con reporte)
    fechaFinReal = fechaReporte;
  }
  
  // Calcular % avance real
  const porcentajeAvanceReal = cantidadPlan > 0 
    ? (cantidadAcumulada / cantidadPlan) * 100 
    : 0;
  
  // Calcular % avance planificado (según fecha de corte)
  let porcentajeAvancePlan = 0;
  if (fechaInicioPlan && fechaFinPlan && fechaCorte >= fechaInicioPlan) {
    if (fechaCorte >= fechaFinPlan) {
      porcentajeAvancePlan = 100;
    } else {
      const totalDias = (fechaFinPlan - fechaInicioPlan) / (1000 * 60 * 60 * 24);
      const diasTranscurridos = (fechaCorte - fechaInicioPlan) / (1000 * 60 * 60 * 24);
      porcentajeAvancePlan = totalDias > 0 ? (diasTranscurridos / totalDias) * 100 : 0;
    }
  }
  
  // Calcular desviación
  const desviacion = porcentajeAvancePlan - porcentajeAvanceReal;
  
  // Calcular duración real
  let duracionReal = 0;
  if (fechaInicioReal && fechaFinReal) {
    duracionReal = Math.ceil((fechaFinReal - fechaInicioReal) / (1000 * 60 * 60 * 24)) + 1;
  }
  
  // Determinar estado
  let estado = 'Pendiente';
  if (porcentajeAvanceReal >= 100) {
    estado = 'Finalizada';
  } else if (cantidadAcumulada > 0) {
    if (desviacion > 5) {
      estado = 'Retrasada';
    } else if (desviacion < -5) {
      estado = 'Adelantada';
    } else {
      estado = 'En Curso';
    }
  } else if (fechaCorte > fechaFinPlan) {
    estado = 'Retrasada (sin iniciar)';
  }
  
  // Calcular días desde inicio (para alertas)
  let diasDesdeInicio = 0;
  if (fechaInicioReal) {
    diasDesdeInicio = Math.ceil((fechaCorte - fechaInicioReal) / (1000 * 60 * 60 * 24));
  }
  
  return {
    activityId: actividadLB.activityId,
    activityName: actividadLB.activityName,
    cantidadPlan,
    cantidadAcumulada: parseFloat(cantidadAcumulada.toFixed(2)),
    porcentajeAvanceReal: parseFloat(porcentajeAvanceReal.toFixed(2)),
    porcentajeAvancePlan: parseFloat(porcentajeAvancePlan.toFixed(2)),
    desviacion: parseFloat(desviacion.toFixed(2)),
    fechaInicioPlan: actividadLB.startDate,
    fechaFinPlan: actividadLB.finishDate,
    fechaInicioReal: fechaInicioReal ? fechaInicioReal.toISOString().split('T')[0] : null,
    fechaFinReal: fechaFinReal ? fechaFinReal.toISOString().split('T')[0] : null,
    duracionPlan,
    duracionReal,
    estado,
    diasDesdeInicio,
    budgetedLaborUnits: cantidadPlan,
    historialReportes: historial.length
  };
}

// ==========================================
// 4. CALCULAR SEGUIMIENTO COMPLETO DEL FRENTE
// ==========================================

/**
 * Calcula el seguimiento completo de un frente
 * @param {Object} pdt - PDT Línea Base
 * @param {Array} reportes - Lista de reportes diarios
 * @param {Date} fechaCorte - Fecha para el cálculo
 * @returns {Object} Seguimiento completo con alertas y KPIs
 */
export function calcularSeguimientoFrente(pdt, reportes, fechaCorte = new Date()) {
  const historial = construirHistorialCantidades(reportes);
  
  // Calcular estado de cada actividad
  const actividades = pdt.actividades.map(act => {
    const histAct = historial[act.activityId] || [];
    return calcularEstadoActividad(act, histAct, fechaCorte);
  });
  
  // Calcular peso de cada actividad (basado en Budgeted Labor Units)
  const totalLaborUnits = actividades.reduce((sum, a) => sum + a.budgetedLaborUnits, 0);
  actividades.forEach(act => {
    act.peso = totalLaborUnits > 0 
      ? (act.budgetedLaborUnits / totalLaborUnits) * 100 
      : 0;
  });
  
  // Calcular avance ponderado del frente
  const avancePonderado = actividades.reduce((sum, act) => {
    return sum + (act.porcentajeAvanceReal * act.peso / 100);
  }, 0);
  
  // Calcular avance plan ponderado
  const avancePlanPonderado = actividades.reduce((sum, act) => {
    return sum + (act.porcentajeAvancePlan * act.peso / 100);
  }, 0);
  
  // Generar alertas
  const alertas = [];
  
  actividades.forEach(act => {
    // Alerta 1: Desviación negativa significativa (>5%)
    if (act.desviacion > 5 && act.estado !== 'Finalizada' && act.estado !== 'Pendiente') {
      alertas.push({
        tipo: 'DESVÍO NEGATIVO',
        prioridad: 'alta',
        codigo: act.activityId,
        actividad: act.activityName,
        detalle: `Avance real ${act.porcentajeAvanceReal}% vs Plan ${act.porcentajeAvancePlan}%`,
        valor: `-${act.desviacion.toFixed(1)}%`
      });
    }
    
    // Alerta 2: Actividad iniciada sin finalizar (mostrar días transcurridos)
    if (act.fechaInicioReal && act.porcentajeAvanceReal < 100) {
      alertas.push({
        tipo: 'INICIADA SIN FINALIZAR',
        prioridad: 'media',
        codigo: act.activityId,
        actividad: act.activityName,
        detalle: `Inició el ${act.fechaInicioReal}, aún en ${act.porcentajeAvanceReal}%`,
        valor: `${act.diasDesdeInicio} días`
      });
    }
    
    // Alerta 3: Actividad que debió iniciar pero no ha registrado nada
    const fechaHoy = new Date(fechaCorte);
    const fechaInicioPlan = act.fechaInicioPlan ? new Date(act.fechaInicioPlan) : null;
    if (fechaInicioPlan && fechaHoy > fechaInicioPlan && act.cantidadAcumulada === 0 && act.estado !== 'Finalizada') {
      const diasRetraso = Math.ceil((fechaHoy - fechaInicioPlan) / (1000 * 60 * 60 * 24));
      alertas.push({
        tipo: 'SIN INICIAR (VENCIDA)',
        prioridad: 'alta',
        codigo: act.activityId,
        actividad: act.activityName,
        detalle: `Debía iniciar el ${act.fechaInicioPlan}`,
        valor: `${diasRetraso} días de retraso`
      });
    }
  });
  
  // Contadores por estado
  const resumenEstados = {
    total: actividades.length,
    finalizadas: actividades.filter(a => a.estado === 'Finalizada').length,
    enCurso: actividades.filter(a => a.estado === 'En Curso').length,
    retrasadas: actividades.filter(a => a.estado === 'Retrasada' || a.estado === 'Retrasada (sin iniciar)').length,
    adelantadas: actividades.filter(a => a.estado === 'Adelantada').length,
    pendientes: actividades.filter(a => a.estado === 'Pendiente').length
  };
  
  return {
    frente: pdt.frente,
    version: pdt.version,
    fechaCorte: fechaCorte.toISOString().split('T')[0],
    actividades,
    avancePonderado: parseFloat(avancePonderado.toFixed(2)),
    avancePlanPonderado: parseFloat(avancePlanPonderado.toFixed(2)),
    desviacionGlobal: parseFloat((avancePlanPonderado - avancePonderado).toFixed(2)),
    alertas,
    resumenEstados,
    totalLaborUnits
  };
}

// ==========================================
// 5. FUNCIÓN PRINCIPAL (TODO EN UNO)
// ==========================================

/**
 * Obtiene y calcula el seguimiento completo de un frente
 * @param {Firestore} db - Instancia de Firestore
 * @param {string} proyectoId - ID del proyecto
 * @param {string} frente - Nombre del frente
 * @param {string} version - Versión del PDT (opcional)
 * @returns {Object} Seguimiento completo
 */
export async function obtenerSeguimientoCompleto(db, proyectoId, frente, version = null) {
  const pdt = await obtenerPDT(db, proyectoId, frente, version);
  const reportes = await obtenerReportesDiarios(db, frente);
  return calcularSeguimientoFrente(pdt, reportes);
}