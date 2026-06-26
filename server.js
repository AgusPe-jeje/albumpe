/* ========================================================================
   📦 REQUERIMIENTOS, CONFIGURACIONES INICIALES Y CACHÉ
   ======================================================================== */
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // ✨ Migrado a PostgreSQL para Neon
const path = require('path');
const BITACORAS_SALA_CACHE = {};

const app = express();

// ✨ Clave para leer la IP real del cliente detrás del proxy de Render
app.set('trust proxy', true);
/* ========================================================================
   🎯 1. CONFIGURACIÓN, INSTANCIAS Y VARIABLES DE ESTADO GLOBAL
   ======================================================================== */

const URL_RENDER_SERVICIO = "https://albumpe.onrender.com";
const URL_BASE = `${URL_RENDER_SERVICIO}/api`;

// Estados del Usuario y Configuración de Sesión
let usuarioActual = null;
let albumCompleto = [];
let paisSeleccionado = "";

// Variables de Control de Energía y Timers Globales
let direccionGanadora = "";
let timbaPreparada = false;
let intervaloCronometro = null;       // Reloj para el Cooldown de Penales
let intervaloCronometroTimba = null;  // Reloj para la Energía de la Timba

// Filtros del Álbum Colector (HUD Cruzado)
let filtroEstadoActual = 'todas'; // Opciones: 'todas', 'desbloqueadas', 'pendientes'
let filtroRarezaActual = 'todas'; // Opciones: 'todas', 'comun', 'rara', 'epica', 'legendaria'

// Estado del Engine Multijugador Coincidente con Backend (Neon)
let multiSalaId = null;
let multiCodigoSala = null;
let multiEsCreador = false;
let multiIntervaloLobby = null;
let multiApuestaFijada = 0;
window.multiTipoApuestaActual = 'amistoso'; // Opciones: 'amistoso', 'oro', 'carta'

// Mapeos Estáticos de Diseño y Lógica de Puntos
const MAPA_PUNTOS_RAREZA = { 
    'comun': 60, 
    'especial': 68, 
    'rara': 75, 
    'epica': 85, 
    'legendaria': 96 
};

const LISTA_SELECCIONES_TIMBA = [
     { nombre: "ARGENTINA", bandera: "🇦🇷" }, { nombre: "BRASIL", bandera: "🇧🇷" },
     { nombre: "URUGUAY", bandera: "🇺🇾" },     { nombre: "ALEMANIA", bandera: "🇩🇪" },
     { nombre: "FRANCIA", bandera: "🇫🇷" },     { nombre: "ESPAÑA", bandera: "🇪🇸" },
     { nombre: "ITALIA", bandera: "🇮🇹" },       { nombre: "INGLATERRA", bandera: "🏴" },
     { nombre: "PORTUGAL", bandera: "🇵🇹" },     { nombre: "HOLANDA", bandera: "🇳🇱" },
     { nombre: "COLOMBIA", bandera: "🇨🇴" },     { nombre: "CHILE", bandera: "🇨🇱" },
     { nombre: "MÉXICO", bandera: "🇲🇽" },       { nombre: "JAPÓN", bandera: "🇯🇵" },
     { nombre: "MARRUECOS", bandera: "🇲🇦" },    { nombre: "CROACIA", bandera: "🇭🇷" },
     { nombre: "BÉLGICA", bandera: "🇧🇪" },      { nombre: "SENEGAL", bandera: "🇸🇳" },
     { nombre: "ESTADOS UNIDOS", bandera: "🇺🇸" }, { nombre: "ARABIA SAUDITA", bandera: "🇸🇦" }
];

var historialPartidosSimulados = [];

/* ========================================================================
   🎛️ 2. CONTROLADORES INTERNOS DE LA UI, PANTALLAS DE CARGA Y MODALES
   ======================================================================== */

function cambiarModulo(idModulo, botonPresionado) {
     // 🔥 CORREGIDO: Agregamos '#modulo-mercado-pases' para que se oculte correctamente al navegar
     document.querySelectorAll('.modulo-contenido, #modulo-mundial-multi, #modulo-mercado-pases').forEach(mod => mod.style.display = 'none');
     document.querySelectorAll('.tile-modulo-fifa, .btn-modulo-match').forEach(btn => btn.classList.remove('activo'));
     
     // Muestra el módulo clickeado
     const modActivo = document.getElementById(idModulo);
     if (modActivo) modActivo.style.display = 'block';
     if (botonPresionado) botonPresionado.classList.add('activo');

     // Lógica de carga interna bajo demanda de cada sección
     if (idModulo === 'modulo-album' && usuarioActual) cargarAlbumLocal();
     if (idModulo === 'modulo-penales' && usuarioActual) iniciarDueloLocal();
     
     // 🔥 NUEVA LÓGICA: Al entrar al Mercado, cargamos tus repetidas y las ofertas globales
     if (idModulo === 'modulo-mercado-pases' && usuarioActual) {
          cargarMisRepetidasParaVenta();
          obtenerOfertasMercado();
     }
     
     if (idModulo === 'modulo-timba' && usuarioActual) {
          rotarPartidoTimba();
          document.getElementById("select-tipo-apuesta").value = "monedas"; 
          conmutarControlesTimbaUI();
          actualizarTimbasRestantesUI();
     }
     if (idModulo === 'modulo-minimundial' && usuarioActual) {
          actualizarEstadoMundialUI();
          cargarRankingMundialesLocal(); 
          document.getElementById("fase-inscripcion-mundial").style.display = "block";
          document.getElementById("fase-draft-mundial").style.display = "none";
          document.getElementById("fase-fixture-mundial").style.display = "none";
     }
     if (idModulo === 'modulo-timba') {
        // Ejecuta la carga automática de la cartelera rotativa
        if (typeof cargarPartidosQuinielaUI === "function") {
            cargarPartidosQuinielaUI();
            }
     }   

}

function mostrarCarga(mensaje = "Conectando con la Arena...") {
     document.getElementById("texto-carga-dinamico").innerText = mensaje;
     document.getElementById("pantalla-carga").classList.add("activo");
}

function ocultarCarga() {
     document.getElementById("pantalla-carga").classList.remove("activo");
}

function abrirModalAyuda() {
     const modal = document.getElementById("modal-ayuda-juego");
     if (modal) modal.style.display = "flex";
}

function cerrarModalAyuda() {
     const modal = document.getElementById("modal-ayuda-juego");
     if (modal) modal.style.display = "none";
}

/* ========================================================================
   👤 3. AUTENTICACIÓN, REGISTRO Y GESTIÓN DEL HUD DEL USUARIO
   ======================================================================== */

async function autenticarUsuario(accion) {
     const username = document.getElementById("input-usuario").value.trim();
     const password = document.getElementById("input-pass").value;
     
     if (!username || !password) return alert("❌ Completá los datos.");

     const textoSpinner = accion === 'login' ? "Iniciando sesión..." : "Creando tu cuenta en la Arena...";
     const endpointFinal = accion === 'login' ? 'login' : 'registro';

     mostrarCarga(textoSpinner);

     try {
          const res = await fetch(`${URL_BASE}/${endpointFinal}`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ username, password })
          });
          
          const data = await res.json();
          ocultarCarga();

          if (data.error) {
               alert(data.error);
          } else {
               usuarioActual = data.usuario;
               document.getElementById("seccion-login").style.display = "none";
               
               const interfazJuego = document.getElementById("interfaz-juego");
               interfazJuego.style.removeProperty("display");
               interfazJuego.classList.add("mostrar");
               
               // Reseteamos filtros a nivel lógico al iniciar sesión
               filtroEstadoActual = 'todas';
               filtroRarezaActual = 'todas';
               
               actualizarInterfazUI();
               cargarAlbumLocal();
               actualizarTimbasRestantesUI();
               iniciarControladorAnunciosSeguro(); 
               
               if (accion === 'login') {
                    alert(`⚔️ ¡Bienvenido de vuelta, ${usuarioActual.username}!`);
               } else {
                    alert(`🎉 ¡Cuenta creada con éxito! Bienvenido a la Arena, ${usuarioActual.username}. Empezás con 200 monedas.`);
               }
          }
     } catch (err) {
          console.error(err);
          ocultarCarga();
     }
}

// 🔥 CAPTURA DE ENTER PARA INICIAR SESIÓN EN LA ARENA
document.addEventListener("DOMContentLoaded", () => {
    const inputUser = document.getElementById("input-usuario");
    const inputPass = document.getElementById("input-pass");

    const manejarEnterLogin = (event) => {
        if (event.key === "Enter") {
            event.preventDefault(); // Evita cualquier recarga de página molesta
            autenticarUsuario('login');
        }
    };

    // Asignamos el evento a ambos campos para máxima comodidad
    if (inputUser) inputUser.addEventListener("keydown", manejarEnterLogin);
    if (inputPass) inputPass.addEventListener("keydown", manejarEnterLogin);
});

function actualizarInterfazUI() {
     if (!usuarioActual) return;
     document.getElementById("lbl-usuario").innerText = usuarioActual.username.toUpperCase();
     document.getElementById("lbl-monedas").innerText = usuarioActual.monedas;
     document.getElementById("lbl-ranking").innerText = usuarioActual.puntos_ranking;
     
     const lblMundiales = document.getElementById("lbl-copas-mundiales");
     if (lblMundiales) {
          lblMundiales.innerText = usuarioActual.copas_mundiales || 0;
     }
}

async function cerrarSesionLocal() {
     if (!usuarioActual) return;

     const confirmar = confirm(`¿Estás seguro de que querés salir, ${usuarioActual.username}?`);
     if (!confirmar) return;

     try {
          await fetch(`${URL_BASE}/logout`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ username: usuarioActual.username })
          });
     } catch (err) { console.error("Error al avisar logout al servidor:", err); }

     clearInterval(intervaloCronometro);
     usuarioActual = null;
     direccionGanadora = "";
     albumCompleto = [];
     window.albumCompleto = [];
     paisSeleccionado = "";

     document.getElementById("input-usuario").value = "";
     document.getElementById("input-pass").value = "";

     const interfazJuego = document.getElementById("interfaz-juego");
     interfazJuego.classList.remove("mostrar");
     interfazJuego.style.display = "none";
     document.getElementById("seccion-login").style.display = "block";

     alert("🚪 Sesión cerrada correctamente. Volviste al menú local.");
}

/* ========================================================================
   📖 4. ÁLBUM COLECTOR (SISTEMA PANINI & FILTRADO INTERACTIVO CRUZADO)
   ======================================================================== */

async function cargarAlbumLocal() {
     if (!usuarioActual) return;
     const contenedorPaises = document.getElementById("selector-paises");
     
     try {
          const res = await fetch(`${URL_BASE}/album/${usuarioActual.id}`);
          const data = await res.json();
          
          albumCompleto = data.album;
          window.albumCompleto = data.album;

          const totalJugadores = albumCompleto.length;
          const obtenidosTotales = albumCompleto.filter(figu => figu.obtenido > 0).length;
          const porcentajeGlobal = totalJugadores > 0 ? Math.round((obtenidosTotales / totalJugadores) * 100) : 0;

          document.getElementById("lbl-progreso-numerico").innerText = `${obtenidosTotales} / ${totalJugadores} (${porcentajeGlobal}%)`;
          document.getElementById("barra-progreso-llenado").style.width = `${porcentajeGlobal}%`;

          const countriesMap = new Map();
          albumCompleto.forEach(figu => {
               if (!countriesMap.has(figu.pais)) {
                    countriesMap.set(figu.pais, { bandera: figu.bandera, complete: true });
               }
          });

          countriesMap.forEach((info, pais) => {
               const figusDeEstePais = albumCompleto.filter(f => f.pais === pais);
               const tieneTodas = figusDeEstePais.every(f => f.obtenido > 0);
               info.complete = tieneTodas;
          });

          contenedorPaises.innerHTML = "";
          if (!paisSeleccionado && countriesMap.size > 0) {
               paisSeleccionado = countriesMap.keys().next().value;
          }

          countriesMap.forEach((info, pais) => {
               const btn = document.createElement("button");
               btn.className = `btn-pais ${pais === paisSeleccionado ? 'activo' : ''} ${info.complete ? 'pais-completo' : ''}`;
               const textoCorona = info.complete ? " 👑" : "";
               btn.innerHTML = `<span>${info.bandera}</span> ${pais.toUpperCase()}${textoCorona}`;
               
               btn.onclick = () => {
                    paisSeleccionado = pais;
                    document.querySelectorAll('.btn-pais').forEach(b => b.classList.remove('activo'));
                    btn.classList.add('activo');
                    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    mostrarJugadoresPorPais();
               };
               contenedorPaises.appendChild(btn);
          });

          mostrarJugadoresPorPais();

          if (document.getElementById("select-tipo-apuesta") && document.getElementById("select-tipo-apuesta").value === "cromo") {
               cargarRepetidasEnDesplegableUI();
          }
     } catch (err) { console.error("Error al calcular progreso de álbum:", err); }
}

function mostrarJugadoresPorPais() {
     const contenedorGrid = document.getElementById("contenedor-grid-album");
     if (!contenedorGrid) return;
     contenedorGrid.innerHTML = "";
     const jugadoresFiltrados = albumCompleto.filter(figu => figu.pais === paisSeleccionado);

     jugadoresFiltrados.forEach((figu, index) => {
          const esObtenida = figu.obtenido > 0;
          const card = document.createElement("div");
          card.className = `carta-clash ${figu.rareza.toLowerCase()} ${esObtenida ? '' : 'bloqueada'}`;
          card.style.animationDelay = `${(index % 12) * 30}ms`;
          
          card.innerHTML = `
              ${figu.obtenido > 1 ? `<div class="badge-repetidas">x${figu.obtenido}</div>` : ''}
              <img src="${figu.foto}" class="carta-foto" alt="${figu.nombre}">
              <div class="rareza-vertical">${figu.rareza.toUpperCase()}</div>
          `;
          contenedorGrid.appendChild(card);
     });

     aplicarFiltrosCruzadosUI();
}

function filtrarAlbumPorEstado(estado, boton) {
     filtroEstadoActual = estado;
     actualizarVisualBotonesFiltro(boton, 'estado');
     aplicarFiltrosCruzadosUI();
}

function filtrarAlbumPorRareza(rareza, boton) {
     filtroRarezaActual = rareza;
     actualizarVisualBotonesFiltro(boton, 'rareza');
     aplicarFiltrosCruzadosUI();
}

function aplicarFiltrosCruzadosUI() {
     const contenedor = document.getElementById("contenedor-grid-album");
     if (!contenedor) return;
     
     const cartas = contenedor.getElementsByClassName("carta-clash");
     let contadorVisibles = 0;

     for (let divCarta of cartas) {
          const estaBloqueada = divCarta.classList.contains("bloqueada");
          
          let rarezaCarta = 'comun';
          if (divCarta.classList.contains("rara")) rarezaCarta = 'rara';
          else if (divCarta.classList.contains("epica")) rarezaCarta = 'epica';
          else if (divCarta.classList.contains("legendaria")) rarezaCarta = 'legendaria';

          let cumpleEstado = false;
          if (filtroEstadoActual === 'todas') cumpleEstado = true;
          else if (filtroEstadoActual === 'desbloqueadas' && !estaBloqueada) cumpleEstado = true;
          else if (filtroEstadoActual === 'pendientes' && estaBloqueada) cumpleEstado = true;

          let cumpleRareza = false;
          if (filtroRarezaActual === 'todas') cumpleRareza = true;
          else if (filtroRarezaActual === rarezaCarta) cumpleRareza = true;

          if (cumpleEstado && cumpleRareza) {
               divCarta.style.display = "block";
               contadorVisibles++;
          } else {
               divCarta.style.display = "none";
          }
     }
}

function actualizarVisualBotonesFiltro(botonClasificado, tipoGrupo) {
     const botonesHermanos = botonClasificado.parentElement.getElementsByClassName("btn-filtro-tv");
     for (let btn of botonesHermanos) {
          btn.classList.remove("activo");
     }
     botonClasificado.classList.add("activo");
}

/* ========================================================================
   🍿 5. LOGICA CINEMÁTICA ASÍNCRONA DE PACK OPENING (SOBRES)
   ======================================================================== */

let colaCartasPack = [];
let indiceCartaActualPack = 0;
let sobreAbiertoCompletoCache = []; 
let animacionCartaEnCurso = false; 

async function comprarSobreEspecifico(tipoCofre) {
     if (!usuarioActual) return alert("❌ Error.");
     mostrarCarga(`Adquiriendo derechos de pack ${tipoCofre.toUpperCase()}...`);

     try {
          const res = await fetch(`${URL_BASE}/comprar-sobre`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ usuario_id: usuarioActual.id, tipoCofre: tipoCofre })
          });
          
          const data = await res.json();
          ocultarCarga();

          if (data.error_oro) return alert(data.mensaje);
          if (data.error) return alert("❌ Error: " + data.error);

          usuarioActual.monedas = data.monedas;
          actualizarInterfazUI();

          colaCartasPack = data.sobre;
          sobreAbiertoCompletoCache = data.sobre;
          indiceCartaActualPack = 0;

          document.getElementById("grid-sobre-abierto").innerHTML = "";
          
          const contenedorOpening = document.getElementById("contenedor-pack-opening");
          contenedorOpening.style.display = "flex";
          contenedorOpening.scrollIntoView({ behavior: 'smooth', block: 'center' });

          ejecutarSecuenciaReveladoCarta();
     } catch (err) {
          console.error("Error en la apertura del pack:", err);
          ocultarCarga();
     }
}

async function ejecutarSecuenciaReveladoCarta() {
    if (indiceCartaActualPack >= colaCartasPack.length) {
        document.getElementById("contenedor-pack-opening").style.display = "none";
        renderizarGrillaFinalSobres();
        animacionCartaEnCurso = false; 
        return;
    }

    animacionCartaEnCurso = true;
    const btnSiguiente = document.getElementById("btn-siguiente-carta-pack");
    if (btnSiguiente) btnSiguiente.disabled = true; 

    const carta = colaCartasPack[indiceCartaActualPack];
    const wrapper = document.getElementById("pantalla-carta-presentada");
    
    const pBandera = document.getElementById("pista-bandera");
    const pPosicion = document.getElementById("pista-posicion");
    const pRareza = document.getElementById("pista-rareza");
    
    pBandera.className = "pista-bloque"; pBandera.innerText = "⏳ ?";
    pPosicion.className = "pista-bloque"; pPosicion.innerText = "⚽ ?";
    pRareza.className = "pista-bloque"; pRareza.innerText = "🃏 ?";
    wrapper.innerHTML = ""; 

    await new Promise(r => setTimeout(r, 200));
    pBandera.innerText = carta.bandera || "🃏";
    pBandera.classList.add("revelada");

    await new Promise(r => setTimeout(r, 600));
    let posText = "DEL";
    const posFiltro = carta.posicion ? carta.posicion.toUpperCase() : "";
    if (posFiltro.includes("DEF") || posFiltro.includes("ARQ") || posFiltro.includes("POR")) posText = "DEF";
    else if (posFiltro.includes("MED") || posFiltro.includes("VOL") || posFiltro.includes("CC")) posText = "MED";
    pPosicion.innerText = posText;
    pPosicion.classList.add("revelada");

    await new Promise(r => setTimeout(r, 600));
    
    let rarezaTexto = carta.rareza.toUpperCase();
    if (rarezaTexto === "ESPECIAL") rarezaTexto = "RARA";
    pRareza.innerText = rarezaTexto;
    pRareza.classList.add("revelada");

    await new Promise(r => setTimeout(r, 500));
    
    let rarezaClase = carta.rareza.toLowerCase();
    if (rarezaClase === "especial") rarezaClase = "rara";
    
    const divCarta = document.createElement("div");
    divCarta.className = `carta-clash ${rarezaClase} caminante-entrada`;
    
    let rarezaColor = "#8e9bb0";
    if (rarezaClase === "rara") rarezaColor = "#0074e8";
    else if (rarezaClase === "epica") rarezaColor = "#a335ee";
    else if (rarezaClase === "legendaria") rarezaColor = "#ffb100";

    divCarta.innerHTML = `
        ${carta.obtenido > 1 ? `<div class="badge-repetidas">x${carta.obtenido}</div>` : ''}
        <img src="${carta.foto}" class="carta-foto" alt="${carta.nombre}">
        <div style="position: absolute; top: 0; left: 0; width: 18px; height: 100%; background: linear-gradient(90deg, ${rarezaColor} 0%, rgba(0,0,0,0) 100%); opacity: 0.4; z-index: 3;"></div>
        <div class="rareza-vertical">${rarezaTexto}</div>
    `;
    
    wrapper.appendChild(divCarta);
    await new Promise(r => setTimeout(r, 400));

    animacionCartaEnCurso = false;
    if (btnSiguiente) btnSiguiente.disabled = false; 
}

function mostrarSiguienteCartaSecuencia() {
     if (animacionCartaEnCurso) return; 
     indiceCartaActualPack++;
     ejecutarSecuenciaReveladoCarta();
}

async function renderizarGrillaFinalSobres() {
     const contenedorSobre = document.getElementById("grid-sobre-abierto");
     contenedorSobre.innerHTML = "";

     sobreAbiertoCompletoCache.forEach((figu, indice) => {
          const itemContenedor = document.createElement("div");
          itemContenedor.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 8px;";

          let rarezaClaseFinal = figu.rareza.toLowerCase();
          if (rarezaClaseFinal === "especial") rarezaClaseFinal = "rara";

          let rarezaTextoFinal = figu.rareza.toUpperCase();
          if (rarezaTextoFinal === "ESPECIAL") rarezaTextoFinal = "RARA";

          const divCarta = document.createElement("div");
          divCarta.className = `carta-clash ${rarezaClaseFinal}`;
          divCarta.style.animationDelay = `${indice * 0.1}s`;
          
          divCarta.innerHTML = `
              ${figu.obtenido > 1 ? `<div class="badge-repetidas">x${figu.obtenido}</div>` : ''}
              <img src="${figu.foto}" class="carta-foto" alt="${figu.nombre}">
              <div class="rareza-vertical">${rarezaTextoFinal}</div>
          `;

          itemContenedor.appendChild(divCarta);
          contenedorSobre.appendChild(itemContenedor);
     });

     if (usuarioActual) await cargarAlbumLocal();
}


/* ========================================================================
   ⚽ 6. DUELO DE PENALES (COOLDOWN Y CONTROL DE DISPARO RESPONSIVE)
   ======================================================================== */

function arrancarCronometroVisual(milisegundosFaltantes) {
     clearInterval(intervaloCronometro);
     const lblCronometro = document.getElementById("cronometro-tiros");
     if (!lblCronometro) return;
     
     if (milisegundosFaltantes <= 0) {
          lblCronometro.innerText = "🔋 ¡Energía al Máximo!";
          document.querySelectorAll('.zona-disparo-target').forEach(z => z.style.pointerEvents = "auto");
          return;
     }

     let tiempoRestante = milisegundosFaltantes;
     intervaloCronometro = setInterval(() => {
          tiempoRestante -= 1000;
          if (tiempoRestante <= 0) {
               clearInterval(intervaloCronometro);
               lblCronometro.innerText = "⚡ ¡Tiro recargado! Actualizando...";
               document.querySelectorAll('.zona-disparo-target').forEach(z => z.style.pointerEvents = "auto");
               if (usuarioActual) iniciarDueloLocal();
               return;
          }

          const totalSegundos = Math.floor(tiempoRestante / 1000);
          const horas = Math.floor(totalSegundos / 3600);
          const minutos = Math.floor((totalSegundos % 3600) / 60);
          const segundos = totalSegundos % 60;

          let textoReloj = "";
          if (horas > 0) textoReloj += `${horas}h `;
          textoReloj += `${minutos.toString().padStart(2, '0')}m ${segundos.toString().padStart(2, '0')}s`;

          lblCronometro.innerText = `⏱️ Próximo tiro en: ${textoReloj}`;
     }, 1000);
}

async function iniciarDueloLocal() {
     if (!usuarioActual) return alert("❌ Iniciá sesión.");
     const resTexto = document.getElementById("resultado-penal");
     const btnProximo = document.querySelector("button[onclick='iniciarDueloLocal()']");
     const escenario = document.getElementById("escenario-penal");

     cargarRankingLocal();

     try {
          const res = await fetch(`${URL_BASE}/tiros-restantes/${usuarioActual.id}`);
          const data = await res.json();
          
          if (data.tiros <= 0) {
               resTexto.style.color = "var(--rojo)";
               resTexto.innerText = "❌ ¡NO TE QUEDAN TIROS! Esperá que recargue energía.";
               if (btnProximo) btnProximo.disabled = true;
               if (escenario) escenario.classList.add("bloqueado-energia");
               direccionGanadora = "";
          } else {
               resTexto.style.color = "white";
               resTexto.innerText = `⚽ ¡PREPARÁ EL DISPARO! — Te quedan ${data.tiros} tiros.`;
               if (btnProximo) btnProximo.disabled = false;
               if (escenario) escenario.classList.remove("bloqueado-energia");
               document.querySelectorAll('.zona-disparo-target').forEach(z => z.style.pointerEvents = "auto");

               const opciones = ['IZQUIERDA', 'CENTRO', 'DERECHA'];
               direccionGanadora = opciones[Math.floor(Math.random() * opciones.length)];
          }
          arrancarCronometroVisual(data.siguienteIn);
     } catch (err) { console.error("Error al verificar tiros iniciales:", err); }
     
     const balon = document.getElementById('balon-animado');
     const arquero = document.getElementById('arquero-animado');
     if (balon && arquero) {
          balon.style.transform = 'translate(0, 0) scale(1)';
          arquero.style.transform = 'translateX(0px)';
     }
}

async function ejecutarPenalLocal(direccionElegida) {
     if (!usuarioActual || !direccionGanadora) return;

     const esMovil = window.innerWidth <= 768;
     const fX = esMovil ? 0.55 : 1.0; 
     const fY = esMovil ? 0.65 : 1.0; 

     const mapaAnimaciones = {
          'SUP_IZQUIERDA': {
               balon: `translate(${ -185 * fX }px, ${ -185 * fY }px)`,
               arquero: `translate(${ -185 * fX }px, ${ -65 * fY }px) rotate(-25deg)`
          },
          'SUP_CENTRO': {
               balon: `translate(0px, ${ -205 * fY }px)`,
               arquero: `translate(0px, ${ -75 * fY }px) rotate(0deg)`
          },
          'SUP_DERECHA': {
               balon: `translate(${ 185 * fX }px, ${ -185 * fY }px)`,
               arquero: `translate(${ 185 * fX }px, ${ -65 * fY }px) rotate(25deg)`
          },
          'INF_IZQUIERDA': {
               balon: `translate(${ -185 * fX }px, ${ -20 * fY }px)`,
               arquero: `translate(${ -185 * fX }px, ${ 95 * fY }px) rotate(-15deg)`
          },
          'INF_CENTRO': {
               balon: `translate(0px, ${ -35 * fY }px)`,
               arquero: `translate(0px, ${ 85 * fY }px) rotate(0deg)`
          },
          'INF_DERECHA': {
               balon: `translate(${ 185 * fX }px, ${ -20 * fY }px)`,
               arquero: `translate(${ 185 * fX }px, ${ 95 * fY }px) rotate(15deg)`
          }
     };

     const direccionesPosibles = Object.keys(mapaAnimaciones);
     const direccionArquero = direccionesPosibles[Math.floor(Math.random() * direccionesPosibles.length)];

     const arquero = document.getElementById('arquero-animado');
     if (arquero) {
          arquero.style.zIndex = "5"; 
          arquero.style.transform = mapaAnimaciones[direccionArquero].arquero;
     }

     const balon = document.getElementById('balon-animado');
     if (balon) {
          balon.style.zIndex = "10"; 
          balon.style.transform = mapaAnimaciones[direccionElegida].balon;
     }

     document.querySelectorAll('.zona-disparo-target').forEach(z => z.style.pointerEvents = "none");
     await new Promise(r => setTimeout(r, 600));

     const fueAtajado = direccionElegida === direccionArquero;
     const esGol = !fueAtajado;
     const resTexto = document.getElementById("resultado-penal");

     if (fueAtajado) {
          resTexto.style.color = "var(--rojo)";
          resTexto.innerText = "¡ATAJADO POR EL ARQUERO! 🧤";
     } else {
          resTexto.style.color = "var(--celeste)";
          resTexto.innerText = "¡GOOOL! 🪙 +100 Oro";
     }
     direccionGanadora = "";

     try {
          const res = await fetch(`${URL_BASE}/jugar-penal`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ usuario_id: usuarioActual.id, gano: esGol })
          });
          const data = await res.json();
          
          if (data.error_limite) {
               alert(data.mensaje);
               resTexto.style.color = "var(--rojo)";
               resTexto.innerText = "¡SIN ENERGÍA! ⏱️";
               return;
          }

          usuarioActual.monedas = data.datos.monedas;
          usuarioActual.puntos_ranking = data.datos.puntos_ranking;
          actualizarInterfazUI();
          cargarRankingLocal();
          
          resTexto.innerText += ` — Te quedan ${data.tiros_restantes} tiros.`;
          const btnProximo = document.querySelector("button[onclick='iniciarDueloLocal()']");
          
          if (data.tiros_restantes <= 0) {
               if (btnProximo) btnProximo.disabled = true;
          } else {
               document.querySelectorAll('.zona-disparo-target').forEach(z => z.style.pointerEvents = "auto");
          }
          arrancarCronometroVisual(data.siguienteIn);
     } catch (err) {
          console.error(err);
          document.querySelectorAll('.zona-disparo-target').forEach(z => z.style.pointerEvents = "auto");
     }
}

/* ========================================================================
   🎰 7. SISTEMA DE TIMBA MULTI-APUESTA Y REGENERACIÓN DE ENERGÍA
   ======================================================================== */

function arrancarCronometroTimbaVisual(milisegundos) {
     clearInterval(intervaloCronometroTimba);
     const lblCronometro = document.getElementById('cronometro-timba');
     
     if (!lblCronometro) return;
     if (milisegundos <= 0) {
          lblCronometro.innerText = '🔋 ¡Apuestas al Máximo (10/10)!';
          return;
     }

     let tiempoRestante = milisegundos;
     intervaloCronometroTimba = setInterval(() => {
          tiempoRestante -= 1000;
          
          if (tiempoRestante <= 0) {
               clearInterval(intervaloCronometroTimba);
               lblCronometro.innerText = '⚡ ¡Apuesta recargada! Actualizando...';
               if (usuarioActual) actualizarTimbasRestantesUI();
               return;
          }

          const totalSegundos = Math.floor(tiempoRestante / 1000);
          const minutos = Math.floor(totalSegundos / 60);
          const segundos = totalSegundos % 60;

          let textoReloj = minutos.toString().padStart(2, '0') + 'm ' + segundos.toString().padStart(2, '0') + 's';
          lblCronometro.innerText = '⏱️ Próxima apuesta en: ' + textoReloj;
     }, 1000);
}

async function actualizarTimbasRestantesUI() {
     if (!usuarioActual) return;
     const lblCronometro = document.getElementById('cronometro-timba');
     if (!lblCronometro) return;

     try {
          const res = await fetch(URL_BASE + '/timbas-restantes/' + usuarioActual.id);
          const datos = await res.json();
          
          // 🔥 1. FRENAR EL RELOJ VIEJO INMEDIATAMENTE
          // Buscá cómo se llama la variable global de tu setInterval del reloj (suele ser 'timerTimba', 'intervaloCronometro', etc.)
          // Reemplazá 'intervaloCronometroVisual' por el nombre real de tu variable global:
          if (typeof intervaloCronometroVisual !== "undefined") {
               clearInterval(intervaloCronometroVisual);
          }
          
          // 2. Pintamos el estado actual de tus apuestas
          if (datos.timbas <= 0) {
               lblCronometro.style.borderColor = 'var(--rojo)';
               lblCronometro.style.color = 'var(--rojo)';
               lblCronometro.innerText = '❌ SIN ENERGÍA PARA TIMBEAR ⏱️';
          } else {
               lblCronometro.style.borderColor = 'var(--dorado)';
               lblCronometro.style.color = 'var(--dorado)';
               lblCronometro.innerText = '🎰 Apuestas disponibles: ' + datos.timbas + '/10';
          }

          // 🔥 3. AGUANTAR EL MUNDO POR 5 SEGUNDOS
          if (datos.siguienteIn > 0 && datos.timbas < 10) {
               const TIEMPO_CONGELADO_MS = 5000; // ⏱️ Se queda fijo 5 segundos enteros

               setTimeout(() => {
                    // Pasados los 5 segundos, recalculamos el tiempo restante y reactivamos tu loop dinámico
                    const tiempoTranscurrido = TIEMPO_CONGELADO_MS;
                    const tiempoAjustado = datos.siguienteIn - tiempoTranscurrido;
                    
                    arrancarCronometroTimbaVisual(tiempoAjustado > 0 ? tiempoAjustado : datos.siguienteIn);
               }, TIEMPO_CONGELADO_MS);
          }
     } catch (err) { 
          console.error('Error al actualizar créditos de timba:', err); 
     }
}

function rotarPartidoTimba() {
     let local = LISTA_SELECCIONES_TIMBA[Math.floor(Math.random() * LISTA_SELECCIONES_TIMBA.length)];
     let visitante = LISTA_SELECCIONES_TIMBA[Math.floor(Math.random() * LISTA_SELECCIONES_TIMBA.length)];
     
     while (local.nombre === visitante.nombre) {
          visitante = LISTA_SELECCIONES_TIMBA[Math.floor(Math.random() * LISTA_SELECCIONES_TIMBA.length)];
     }
     
     document.getElementById("timba-bandera-local").innerText = local.bandera;
     document.getElementById("timba-local").innerText = local.nombre;
     document.getElementById("timba-bandera-visitante").innerText = visitante.bandera;
     document.getElementById("timba-visitante").innerText = visitante.nombre;
}

function conmutarControlesTimbaUI() {
     const tipo = document.getElementById("select-tipo-apuesta").value;
     if (tipo === "monedas") {
          document.getElementById("wrapper-apuesta-monedas").style.display = "flex";
          document.getElementById("wrapper-apuesta-cromo").style.display = "none";
     } else {
          document.getElementById("wrapper-apuesta-monedas").style.display = "none";
          document.getElementById("wrapper-apuesta-cromo").style.display = "flex";
          cargarRepetidasEnDesplegableUI();
     }
}

function cargarRepetidasEnDesplegableUI() {
     const select = document.getElementById("select-cromo-repetido");
     if (!select) return;
     select.innerHTML = "";

     const miAlbumReal = window.albumCompleto || albumCompleto;
     if (!miAlbumReal || !Array.isArray(miAlbumReal)) {
          const opt = document.createElement("option");
          opt.value = ""; opt.innerText = "⏳ Cargando inventario...";
          select.appendChild(opt); return;
     }

     const repetidas = miAlbumReal.filter(f => f && f.obtenido > 1);
     if (repetidas.length === 0) {
          const opt = document.createElement("option");
          opt.value = ""; opt.innerText = "❌ No tenés cromos repetidos";
          select.appendChild(opt); return;
     }

     repetidas.forEach(figu => {
          if (!figu) return;
          const opt = document.createElement("option");
          opt.value = figu.id;
          opt.innerText = `${figu.bandera || "🃏"} ${figu.nombre.toUpperCase()} (x${figu.obtenido}) [${figu.rareza.toUpperCase()}]`;
          select.appendChild(opt);
     });
}

function actualizarHistorialUI(infoPartido) {
     historialPartidosSimulados.unshift(infoPartido);
     if (historialPartidosSimulados.length > 3) historialPartidosSimulados.pop();

     const contenedorLista = document.getElementById("lista-historial-timba");
     if (!contenedorLista) return;
     contenedorLista.innerHTML = "";

     historialPartidosSimulados.forEach(p => {
          const li = document.createElement("li");
          li.className = "item-historial-partido";
          li.innerHTML = `<span>⚔️ ${p.local} vs ${p.visitante}</span> <b style="color: var(--celeste);">${p.res}</b>`;
          contenedorLista.appendChild(li);
     });
}

async function prepararOpcionesApuesta() {
     if (!usuarioActual) return alert("❌ Iniciá sesión para timbear.");
     const tipoApuesta = document.getElementById("select-tipo-apuesta").value;
     let montoApuesta = 0; let jugadorIdApostado = null;

     if (tipoApuesta === "monedas") {
          montoApuesta = parseInt(document.getElementById("input-monto-apuesta").value);
          if (isNaN(montoApuesta) || montoApuesta <= 0) return alert("❌ Ingresá un monto de oro válido.");
          if (usuarioActual.monedas < montoApuesta) return alert("🪙 No tenés suficiente Oro.");
     } else {
          jugadorIdApostado = document.getElementById("select-cromo-repetido").value;
          if (!jugadorIdApostado) return alert("❌ Debés seleccionar un cromo repetido válido.");
     }

     mostrarCarga("Estudiando probabilidades...");
     try {
          const res = await fetch(`${URL_BASE}/timba/preparar`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                    usuario_id: usuarioActual.id, tipoApuesta, montoApuesta,
                    jugadorIdApostado: jugadorIdApostado ? parseInt(jugadorIdApostado) : null
               })
          });
          const data = await res.json();
          ocultarCarga();

          if (data.error_limite) {
               alert(data.mensaje); actualizarTimbasRestantesUI(); return;
          }
          if (!data.ok) return alert(data.mensaje);

          const contenedor = document.getElementById("contenedor-opciones-goles");
          if (!contenedor) return;
          contenedor.innerHTML = ""; contenedor.style.display = "grid";

          data.opciones.forEach(opc => {
               const btn = document.createElement("button");
               btn.type = "button"; btn.className = "btn-estadio btn-opcion-resultado"; btn.style.margin = "5px";
               btn.innerText = opc.label;
               btn.onclick = () => procesarEleccionTimbaSegura(opc.idOpcion);
               contenedor.appendChild(btn);
          });
          timbaPreparada = true;
          actualizarTimbasRestantesUI();
     } catch (err) { console.error(err); ocultarCarga(); }
}

async function procesarEleccionTimbaSegura(idOpcionElegida) {
    if (!timbaPreparada) return;
    const bandLoc = document.getElementById("timba-bandera-local").innerText;
    const nomLoc = document.getElementById("timba-local").innerText;
    const bandVis = document.getElementById("timba-bandera-visitante").innerText;
    const nomVis = document.getElementById("timba-visitante").innerText;

    mostrarCarga("Procesando tu jugada...");
    try {
        const res = await fetch(`${URL_BASE}/timba/procesar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: usuarioActual.id, idOpcionElegida })
        });
        const data = await res.json();
        ocultarCarga();

        if (!data.ok) return alert(data.mensaje);
        usuarioActual.monedas = data.datos.monedas;
        usuarioActual.puntos_ranking = data.datos.puntos_ranking;
        actualizarInterfazUI();

        alert(`⚽ RESULTADO DE LA TIMBA ⚽\n\n${data.mensajeResultado}`);
        document.getElementById("contenedor-opciones-goles").style.display = "none";
        await cargarAlbumLocal();
        
        if (document.getElementById("select-tipo-apuesta").value === "cromo") cargarRepetidasEnDesplegableUI();

        actualizarHistorialUI({
            local: `${bandLoc} ${nomLoc}`, visitor: `${bandVis} ${nomVis}`, res: `${data.golesLReal} - ${data.golesVReal}`
        });
        timbaPreparada = false; rotarPartidoTimba();
    } catch (err) { console.error(err); ocultarCarga(); }
}

setTimeout(rotarPartidoTimba, 1000);

/* ========================================================================
   🏆 8. ENGINE INTERACTIVO DEL MINIMUNDIAL (COOLDOWN + DRAFT + GRUPOS EN VIVO)
   ======================================================================== */

let mundialTernaPaises = [];
let mundialRivalClasif = "";
let jugadoresSeleccionadosDraft = [];
let intervaloCronometroMundial = null;

async function actualizarEstadoMundialUI() {
     if (!usuarioActual) return;
     try {
          const res = await fetch(`${URL_BASE}/mundial/estado/${usuarioActual.id}`);
          const data = await res.json();
          
          const lblCopas = document.getElementById("lbl-copas-mundiales");
          if (lblCopas) lblCopas.innerText = data.copas || 0;

          arrancarCronometroMundialVisual(data.siguienteIn);
     } catch (err) { console.error("Error al pedir estado del Mundial:", err); }
}

function arrancarCronometroMundialVisual(ms) {
     clearInterval(intervaloCronometroMundial);
     const lblReloj = document.getElementById("cronometro-mundial");
     const btnIniciar = document.getElementById("btn-preparar-mundial");
     const contenedorOpcionesPaises = document.getElementById("zona-eleccion-pais-mundial");
     if (!lblReloj) return;

     if (ms <= 0) {
          lblReloj.innerText = "🔋 ¡Inscripción abierta para el MiniMundial!";
          lblReloj.style.color = "var(--verde-match)";
          if (btnIniciar) btnIniciar.style.display = "inline-block";
          return;
     }

     if (btnIniciar) btnIniciar.style.display = "none";
     if (contenedorOpcionesPaises) contenedorOpcionesPaises.innerHTML = "";
     
     let tiempoRestante = ms;
     intervaloCronometroMundial = setInterval(() => {
          tiempoRestante -= 1000;
          if (tiempoRestante <= 0) {
               clearInterval(intervaloCronometroMundial);
               lblReloj.innerText = "⚡ ¡Vestuarios listos! Actualizando...";
               if (btnIniciar) btnIniciar.style.display = "inline-block";
               return;
          }
          const totalSegundos = Math.floor(tiempoRestante / 1000);
          const horas = Math.floor(totalSegundos / 3600);
          const minutos = Math.floor((totalSegundos % 3600) / 60);
          const segundos = totalSegundos % 60;
          lblReloj.innerText = `⏱️ Próximo torneo en: ${horas}h ${minutos.toString().padStart(2,'0')}m ${segundos.toString().padStart(2,'0')}s`;
          lblReloj.style.color = "var(--rojo)";
     }, 1000);
}

async function prepararInscripcionMundial() {
     if (!usuarioActual) return;
     mostrarCarga("Inscribiendo equipo y debitando arancel de la FIFA...");

     try {
          const res = await fetch(`${URL_BASE}/mundial/preparar`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ usuario_id: usuarioActual.id })
          });
          const data = await res.json();
          ocultarCarga();

          if (!data.ok) return alert(data.mensaje);

          // 🪙 Sincronizamos las monedas exactas que mandó el servidor
          if (data.monedasActualizadas !== undefined) {
               usuarioActual.monedas = data.monedasActualizadas;
          } else {
               usuarioActual.monedas -= 1500;
          }
          actualizarInterfazUI();

          // ⏱️ TRUCO DE SINCRONIZACIÓN INMEDIATA:
          // Como ya pagaste la entrada, le clavamos las 3 horas de Cooldown al reloj principal 
          // para que si salís o volvés atrás, ya esté contando de forma fluida.
          const COOLDOWN_MUNDIAL_MS = 3 * 60 * 60 * 1000; 
          arrancarCronometroMundialVisual(COOLDOWN_MUNDIAL_MS);

          // Bloqueos estéticos de navegación en pleno torneo
          const barraNavegacion = document.querySelector(".nav-modulos-estadio");
          if (barraNavegacion) barraNavegacion.style.display = "none"; 
          const btnSalir = document.querySelector(".btn-logout-kick");
          if (btnSalir) btnSalir.style.display = "none";

          mundialTernaPaises = data.terna;
          mundialRivalClasif = data.rivalClasificacion;
          jugadoresSeleccionadosDraft = [];

          const contenedorTerna = document.getElementById("zona-eleccion-pais-mundial");
          if (contenedorTerna) contenedorTerna.innerHTML = "";
          
          document.getElementById("fase-inscripcion-mundial").style.display = "block";
          document.getElementById("fase-draft-mundial").style.display = "none";
          document.getElementById("fase-fixture-mundial").style.display = "none";

          data.terna.forEach(pais => {
               const btn = document.createElement("button");
               btn.className = "btn-estadio btn-modulo-match"; btn.style.margin = "8px";
               btn.innerText = `⚽ ${pais.toUpperCase()}`;
               btn.onclick = () => iniciarDraftJugadoresMundial(pais);
               if (contenedorTerna) contenedorTerna.appendChild(btn);
          });
     } catch (err) { console.error(err); ocultarCarga(); }
}

function iniciarDraftJugadoresMundial(paisElegido) {
     window.mundialSeleccionUsuario = paisElegido;
     document.getElementById("fase-inscripcion-mundial").style.display = "none";
     document.getElementById("fase-draft-mundial").style.display = "block";
     document.getElementById("lbl-tu-seleccion-mundial").innerText = paisElegido.toUpperCase();
     document.getElementById("lbl-rival-clasificacion-mundial").innerText = mundialRivalClasif.toUpperCase();

     actualizarEstrellasVisualesDraft();
     renderizarGridCartasDisponiblesDraft(paisElegido);
}

function renderizarGridCartasDisponiblesDraft(paisElegido) {
     const grid = document.getElementById("grid-cartas-draft-mundial");
     if (!grid) return; grid.innerHTML = "";

     const cartasFiltradas = albumCompleto.filter(f => f.obtenido > 0 && f.pais.toLowerCase() === paisElegido.toLowerCase());
     cartasFiltradas.forEach(carta => {
          const card = document.createElement("div");
          const estaElegida = jugadoresSeleccionadosDraft.includes(carta.id);
          card.className = `carta-clash ${carta.rareza.toLowerCase()} ${estaElegida ? 'activo-draft' : ''}`;
          card.innerHTML = `<img src="${carta.foto}" class="carta-foto" alt="${carta.nombre}"><div class="rareza-vertical">${carta.rareza.toUpperCase()}</div>`;

          card.onclick = () => {
               if (jugadoresSeleccionadosDraft.includes(carta.id)) {
                    jugadoresSeleccionadosDraft = jugadoresSeleccionadosDraft.filter(id => id !== carta.id);
               } else {
                    if (jugadoresSeleccionadosDraft.length >= 3) return alert("❌ Alineación completa (Máximo 3).");
                    jugadoresSeleccionadosDraft.push(carta.id);
               }
               renderizarGridCartasDisponiblesDraft(paisElegido);
               actualizarEstrellasVisualesDraft();
          };
          grid.appendChild(card);
     });
}

function actualizarEstrellasVisualesDraft() {
     const lblEstrellas = document.getElementById("lbl-estrellas-equipo-mundial");
     if (!lblEstrellas) return;
     if (jugadoresSeleccionadosDraft.length !== 3) {
          lblEstrellas.innerText = "⚠️ Alineá 3 jugadores para calcular poder"; return;
     }

     const cartasElegidas = albumCompleto.filter(f => jugadoresSeleccionadosDraft.includes(f.id));
     const promedio = cartasElegidas.reduce((acc, c) => acc + MAPA_PUNTOS_RAREZA[c.rareza.toLowerCase()], 0) / 3;

     let numEstrellas = 1;
     if (promedio >= 90) numEstrellas = 5;
     else if (promedio >= 79) numEstrellas = 4;
     else if (promedio >= 70) numEstrellas = 3;
     else if (promedio >= 62) numEstrellas = 2;

     lblEstrellas.innerText = "⭐".repeat(numEstrellas) + ` (${numEstrellas}/5 Estrellas)`;
}

async function ejecutarTorneoMundial() {
    const faseDraftOnline = document.getElementById("multi-fase-draft");
    if (faseDraftOnline && faseDraftOnline.style.display === "block") {
        if (jugadoresSeleccionadosDraft.length !== 3) return alert("❌ Completá la alineación de 3 jugadores.");
        confirmarInscripcionMultiServidor(window.mundialSeleccionUsuario, jugadoresSeleccionadosDraft);
        return;
    }
    if (jugadoresSeleccionadosDraft.length !== 3) return alert("❌ Completá la alineación de 3 jugadores.");

     mostrarCarga("Pidiendo autorización de planilla a la FIFA...");
     try {
          const res = await fetch(`${URL_BASE}/mundial/jugar`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                    usuario_id: usuarioActual.id, seleccionElegida: window.mundialSeleccionUsuario,
                    rivalClasificacion: mundialRivalClasif, jugadorIds: jugadoresSeleccionadosDraft
               })
          });
          const data = await res.json(); ocultarCarga();

          if (!data.ok) return alert(data.mensaje);
          document.getElementById("fase-draft-mundial").style.display = "none";
          document.getElementById("fase-fixture-mundial").style.display = "block";

          const contenedorLista = document.getElementById("lista-cruces-mundial-simulacion");
          contenedorLista.innerHTML = "";

          if (!data.progreso.ganoClasificacion) {
               contenedorLista.innerHTML = `<div class="item-historial-partido" style="color:var(--rojo); border-color:var(--rojo); text-align:center;"><span>❌ Quedaste afuera por falta de puntos en eliminatorias.</span></div>`;
               usuarioActual.monedas = data.datosActualizados?.monedas || usuarioActual.monedas;
               actualizarInterfazUI(); actualizarEstadoMundialUI(); liberarNavegacionArenaUI(); return;
          }

          const wrapperTabla = document.createElement("div");
          wrapperTabla.style.cssText = "background:rgba(0,0,0,0.4); padding:15px; border-radius:12px; margin-bottom:20px; border:1px solid #1a2436;";
          wrapperTabla.innerHTML = `<h4 style="color:var(--dorado); margin:0 0 10px 0; font-family:'Oswald'; text-align:center;">📊 TABLA EN VIVO</h4><table style="width:100%; border-collapse:collapse; text-align:center; font-weight:bold;"><thead><tr style="color:#64748b; font-size:0.85rem;"><th>POS</th><th style="text-align:left;">SELECCIÓN</th><th>GF</th><th>GC</th><th>PTS</th></tr></thead><tbody id="tbody-tabla-grupo-live"></tbody></table>`;
          contenedorLista.appendChild(wrapperTabla);

          const renderizarTablaGrupoLive = (tablaEstado) => {
               const tbody = document.getElementById("tbody-tabla-grupo-live"); if (!tbody) return;
               let listaOrdenada = Object.values(tablaEstado).sort((a,b) => b.pts !== a.pts ? b.pts - a.pts : (b.gf - b.gc) - (a.gf - a.gc));
               tbody.innerHTML = "";
               listaOrdenada.forEach((fila, idx) => {
                    const esTuPais = fila.pais === window.mundialSeleccionUsuario;
                    const tr = document.createElement("tr"); tr.style.color = esTuPais ? "var(--verde-match)" : "#fff";
                    tr.innerHTML = `<td style="padding:6px 0; color:${idx < 2 ? 'var(--verde-match)':'var(--rojo)'};">${idx + 1}</td><td style="text-align:left;">⚽ ${fila.pais.toUpperCase()}</td><td>${fila.gf}</td><td>${fila.gc}</td><td style="color:var(--dorado);">${fila.pts}</td>`;
                    tbody.appendChild(tr);
               });
          };

          let estadoTablaMundial = {};
          data.progreso.integrantesGrupo.forEach(p => { estadoTablaMundial[p] = { pais: p, pts: 0, gf: 0, gc: 0 }; });
          renderizarTablaGrupoLive(estadoTablaMundial);

          for (let f = 0; f < data.progreso.bitacoraGrupo.length; f++) {
               const fechaData = data.progreso.bitacoraGrupo[f];
               const divFecha = document.createElement("div");
               divFecha.style.cssText = "background:#0b111e; padding:12px; border-radius:8px; border-left:4px solid var(--celeste); margin-bottom:15px;";
               divFecha.innerHTML = `<div style="color:var(--celeste); font-size:0.9rem; font-weight:bold;">📅 FECHA ${fechaData.fecha}</div><div style="display:flex; justify-content:space-between;"><span>🇦🇷 ${fechaData.local} vs ${fechaData.visitante}</span><span id="goles-m1-f${f}" style="color:var(--verde-match);">0 - 0</span></div><div style="display:flex; justify-content:space-between;"><span>🤖 ${fechaData.botL} vs ${fechaData.botV}</span><span id="goles-m2-f${f}" style="color:#aaa;">0 - 0</span></div><div id="reloj-f${f}" style="text-align:center; font-size:0.8rem; color:#64748b;">⏱️ 00:00</div>`;
               contenedorLista.appendChild(divFecha); divFecha.scrollIntoView({ behavior: 'smooth' });

               await new Promise((resolveFecha) => {
                    let segV = 0; let g1_L = 0; let g1_V = 0; let g2_L = 0; let g2_V = 0;
                    const tGroup = setInterval(() => {
                         segV += 9; if (segV > 90) segV = 90;
                         if (g1_L < fechaData.gL && Math.random() < 0.2) g1_L++;
                         if (g1_V < fechaData.gV && Math.random() < 0.2) g1_V++;
                         if (g2_L < fechaData.gBL && Math.random() < 0.2) g2_L++;
                         if (g2_V < fechaData.gBV && Math.random() < 0.2) g2_V++;

                         if (segV === 90) { g1_L = fechaData.gL; g1_V = fechaData.gV; g2_L = fechaData.gBL; g2_V = fechaData.gBV; }
                         document.getElementById(`goles-m1-f${f}`).innerText = `${g1_L} - ${g1_V}`;
                         document.getElementById(`goles-m2-f${f}`).innerText = `${g2_L} - ${g2_V}`;
                         document.getElementById(`reloj-f${f}`).innerText = `⏱️ MINUTO ${segV}:00`;

                         if (segV >= 90) {
                              clearInterval(tGroup);
                              const acumLive = (loc, vis, gl, gv) => {
                                  estadoTablaMundial[loc].gf += gl; estadoTablaMundial[loc].gc += gv;
                                  estadoTablaMundial[vis].gf += gv; estadoTablaMundial[vis].gc += gl;
                                  if (gl > gv) estadoTablaMundial[loc].pts += 3;
                                  else if (gl < gv) estadoTablaMundial[vis].pts += 3;
                                  else { estadoTablaMundial[loc].pts += 1; estadoTablaMundial[vis].pts += 1; }
                              };
                              acumLive(fechaData.local, fechaData.visitante, fechaData.gL, fechaData.gV);
                              acumLive(fechaData.botL, fechaData.botV, fechaData.gBL, fechaData.gBV);
                              renderizarTablaGrupoLive(estadoTablaMundial); resolveFecha();
                         }
                    }, 1000);
               });
          }

          if (!data.progreso.clasifico) {
               const cartelEliminado = document.createElement("div");
               cartelEliminado.style.cssText = "text-align:center; padding:15px; border:2px solid var(--rojo); color:var(--rojo); font-weight:bold; border-radius:8px;";
               cartelEliminado.innerText = `❌ Quedaste fuera en Grupos (Puesto #${data.progreso.posicionFinalGrupo}).`;
               contenedorLista.appendChild(cartelEliminado);
               usuarioActual.monedas = data.datosActualizados?.monedas || usuarioActual.monedas;
               actualizarInterfazUI(); actualizarEstadoMundialUI(); liberarNavegacionArenaUI(); return;
          }

          for (let i = 0; i < data.progreso.bitacoraPlayoffs.length; i++) {
               const partido = data.progreso.bitacoraPlayoffs[i];
               const ganoEsteCruce = partido.resultado.includes("Ganaste");
               await simularMarcadorPantalla(contenedorLista, partido.ronda, window.mundialSeleccionUsuario, partido.rival, ganoEsteCruce);
               if (!ganoEsteCruce) break;
          }

          if (data.progreso.campeon) {
               const corona = document.createElement("div");
               corona.style.cssText = "text-align:center; margin-top:20px; color:var(--dorado); font-size:1.4rem; font-weight:bold;";
               corona.innerText = "🏆 ¡CAMPEÓN DEL MUNDO! 🏆\n🎁 ¡Premio de 5.000 de Oro depositado!";
               contenedorLista.appendChild(corona); corona.scrollIntoView({ behavior: 'smooth' });
          }

          if (data.datosActualizados) {
               usuarioActual.monedas = data.datosActualizados.monedas;
               usuarioActual.puntos_ranking = data.datosActualizados.puntos_ranking;
               usuarioActual.copas_mundiales = data.datosActualizados.copas_mundiales;
               actualizarInterfazUI(); cargarRankingMundialesLocal();
          }
          actualizarEstadoMundialUI(); liberarNavegacionArenaUI();
     } catch (err) { console.error(err); ocultarCarga(); liberarNavegacionArenaUI(); }
}

function simularMarcadorPantalla(contenedor, ronda, tuPais, rival, ganoUsuario) {
    return new Promise(async (resolve) => {
         const filaPartido = document.createElement("div");
         filaPartido.className = "item-historial-partido"; 
         filaPartido.style.cssText = "flex-direction: column; background: #0b111e; padding: 15px; margin-bottom: 20px; border-left: 4px solid var(--celeste); transition: all 0.3s ease;";
         
         const idUnico = ronda.replace(/ /g,'') + Math.floor(Math.random() * 1000);
         
         filaPartido.innerHTML = `
              <div style="display:flex; justify-content:space-between; color:var(--dorado); border-bottom:1px solid #1a2436; padding-bottom:5px;">
                   <span style="text-transform: uppercase; font-family:'Oswald';">📋 ${ronda}</span>
                   <span id="reloj-vivo-${idUnico}" style="font-weight:bold; color:var(--celeste);">⏱️ MINUTO 00:00</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
                   <span style="width:40%; text-align:left; font-weight:bold; font-size:1.1rem;">🇦🇷 ${tuPais} <span id="boost-badge-${idUnico}" style="display:none; color:var(--verde-match); font-size:0.75rem;">⚡ BOOSTED</span></span>
                   <span id="score-vivo-${idUnico}" style="font-family:'Oswald'; font-size:1.8rem; background:#000; padding:4px 16px; border-radius:6px; color:var(--verde-match); min-width:70px; text-align:center; box-shadow: inset 0 0 10px rgba(0,255,136,0.2);">0 - 0</span>
                   <span style="width:40%; text-align:right; font-weight:bold; font-size:1.1rem;">${rival} 🤖</span>
              </div>
              <!-- Consola de Incidencias en Vivo -->
              <div id="consola-incidencias-${idUnico}" style="margin-top:12px; padding:8px; background:rgba(0,0,0,0.3); border-radius:6px; font-size:0.85rem; color:#94a3b8; min-height:35px; text-align:center; font-style:italic; border: 1px dashed #1e293b;">
                   ⚽ El árbitro da la orden... ¡Comienza el partido!
              </div>
              <!-- Zona Interactiva de Entretiempo -->
              <div id="zona-entretiempo-${idUnico}" style="display:none; margin-top:10px; text-align:center; padding:10px; background:rgba(234,179,8,0.1); border: 1px solid var(--dorado); border-radius:6px;">
                   <p style="margin:0 0 8px 0; font-size:0.85rem; color:var(--dorado); font-weight:bold;">👔 ¡ENTRETIEMPO! Tenés 5 segundos para dar la Charla Técnica</p>
                   <button type="button" id="btn-charla-${idUnico}" class="btn-estadio" style="background:var(--dorado); color:#000; font-size:0.8rem; padding:4px 12px;">📣 Arengar Equipo (+15% Ataque)</button>
              </div>
         `;
         contenedor.appendChild(filaPartido); 
         filaPartido.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

         // Generación de goles esperados
         let golesTu = Math.floor(Math.random() * 3); 
         let golesRival = Math.floor(Math.random() * 3);
         if (ganoUsuario && golesTu <= golesRival) golesTu = golesRival + Math.floor(Math.random() * 2) + 1;
         else if (!ganoUsuario && golesRival <= golesTu) golesRival = golesTu + Math.floor(Math.random() * 2) + 1;

         // Simulación local de incidencias si el backend no las manda
         let incidenciasSimuladas = {
              15: `⚠️ Presiona ${rival}, bombazo que pasa cerca del ángulo izquierdo.`,
              45: "⏳ ENTRETIEMPO: Los jugadores se retiran al descanso a recomponer ideas.",
              72: `🟥 ¡Falta durísima! Tarjeta amarilla para el capitán de ${rival}.`,
              85: `🔥 ¡Zafarrancho en el área! La hinchada empuja con el alma.`
         };

         let golesTuActuales = 0; 
         let golesRivalActuales = 0; 
         let segundoVirtual = 0;
         let tieneBoost = false;

         // BOTÓN CHARLA TÉCNICA
         document.getElementById(`btn-charla-${idUnico}`).onclick = () => {
              tieneBoost = true;
              document.getElementById(`boost-badge-${idUnico}`).style.display = "inline-block";
              document.getElementById(`btn-charla-${idUnico}`).disabled = true;
              document.getElementById(`btn-charla-${idUnico}`).innerText = "✅ ¡EQUIPO MOTIVADO!";
              // Si el usuario tiene boost, aumentamos la chance de que meta un gol extra si iba perdiendo
              if (!ganoUsuario && Math.random() < 0.4) {
                   golesTu++; // Ventaja táctica de cambiar el destino
              }
         };

         // Reloj más lento y emocionante: Avanza de a 3 minutos cada 400ms (Unos 12 segundos reales por partido)
         const timer = setInterval(async () => {
             if (segundoVirtual === 45 && !document.getElementById(`zona-entretiempo-${idUnico}`).classList.contains("pausado")) {
                 // Pausa de Entretiempo Interactiva
                 document.getElementById(`zona-entretiempo-${idUnico}`).classList.add("pausado");
                 document.getElementById(`zona-entretiempo-${idUnico}`).style.display = "block";
                 document.getElementById(`consola-incidencias-${idUnico}`).innerText = "📣 Charla técnica en curso en los vestuarios...";
                 
                 clearInterval(timer); // Frenamos el reloj del partido
                 
                 setTimeout(() => {
                     // Reanudamos a los 5 segundos
                     document.getElementById(`zona-entretiempo-${idUnico}`).style.display = "none";
                     segundoVirtual += 3;
                     rearrancarReloj();
                 }, 5000);
                 return;
             }

             segundoVirtual += 3; 
             if (segundoVirtual > 90) segundoVirtual = 90;

             // Distribución orgánica de goles a lo largo del tiempo
             if (segundoVirtual >= 20 && segundoVirtual < 45 || segundoVirtual >= 55) {
                 if (golesTuActuales < golesTu && Math.random() < (tieneBoost ? 0.18 : 0.10)) {
                      golesTuActuales++;
                      inyectarAlertaIncidencia(idUnico, `⚽ ¡GOOOL DE ${tuPais.toUpperCase()}! 🔥`);
                 }
                 if (golesRivalActuales < golesRival && Math.random() < 0.09) {
                      golesRivalActuales++;
                      inyectarAlertaIncidencia(idUnico, `💥 Gol de ${rival.toUpperCase()}. Se grita fuerte en el banco rival.`);
                 }
             }

             if (segundoVirtual === 90) { 
                 golesTuActuales = golesTu; 
                 golesRivalActuales = golesRival; 
             }

             // Actualizar UI
             document.getElementById(`reloj-vivo-${idUnico}`).innerText = `⏱️ MINUTO ${segundoVirtual.toString().padStart(2,'0')}:00`;
             document.getElementById(`score-vivo-${idUnico}`).innerText = `${golesTuActuales} - ${golesRivalActuales}`;

             // Mostrar incidencias narrativas por minuto
             if (incidenciasSimuladas[segundoVirtual]) {
                  document.getElementById(`consola-incidencias-${idUnico}`).innerText = incidenciasSimuladas[segundoVirtual];
             }

             if (segundoVirtual >= 90) {
                 clearInterval(timer); 
                 filaPartido.style.borderColor = ganoUsuario ? "var(--verde-match)" : "var(--rojo)";
                 
                 const finLabel = document.createElement("div");
                 finLabel.style.cssText = `text-align:right; font-size:0.85rem; font-weight:bold; margin-top:5px; color:${ganoUsuario ? 'var(--verde-match)' : 'var(--rojo)'};`;
                 finLabel.innerText = ganoUsuario ? "🏁 FINALIZADO - AVANZAS ✅" : "🏁 FINALIZADO - ELIMINADO ❌";
                 filaPartido.appendChild(finLabel);
                 
                 document.getElementById(`consola-incidencias-${idUnico}`).innerText = ganoUsuario ? "🎉 ¡Silbatazo final! Triunfo histórico para meterse en el bolsillo a la hinchada." : "😢 Final del partido. Rendimiento amargo, toca pensar en el próximo torneo.";
                 resolve();
             }
         }, 400);

         function rearrancarReloj() {
              // Función auxiliar para reanudar el bucle después del entretiempo
              // (Misma lógica exacta de arriba para continuar del 48 al 90)
              const resumeTimer = setInterval(() => {
                   segundoVirtual += 3;
                   if (segundoVirtual > 90) segundoVirtual = 90;

                   if (golesTuActuales < golesTu && Math.random() < (tieneBoost ? 0.22 : 0.12)) {
                        golesTuActuales++;
                        inyectarAlertaIncidencia(idUnico, `⚽ ¡GOOOL DE ${tuPais.toUpperCase()}! 🚀`);
                   }
                   if (golesRivalActuales < golesRival && Math.random() < 0.09) {
                        golesRivalActuales++;
                        inyectarAlertaIncidencia(idUnico, `💥 Gol de ${rival.toUpperCase()}. Silencio sepulcral.`);
                   }

                   if (segundoVirtual === 90) { golesTuActuales = golesTu; golesRivalActuales = golesRival; }
                   
                   document.getElementById(`reloj-vivo-${idUnico}`).innerText = `⏱️ MINUTO ${segundoVirtual.toString().padStart(2,'0')}:00`;
                   document.getElementById(`score-vivo-${idUnico}`).innerText = `${golesTuActuales} - ${golesRivalActuales}`;

                   if (incidenciasSimuladas[segundoVirtual]) {
                        document.getElementById(`consola-incidencias-${idUnico}`).innerText = incidenciasSimuladas[segundoVirtual];
                   }

                   if (segundoVirtual >= 90) {
                        clearInterval(resumeTimer);
                        filaPartido.style.borderColor = ganoUsuario ? "var(--verde-match)" : "var(--rojo)";
                        const finLabel = document.createElement("div");
                        finLabel.style.cssText = `text-align:right; font-size:0.85rem; font-weight:bold; margin-top:5px; color:${ganoUsuario ? 'var(--verde-match)' : 'var(--rojo)'};`;
                        finLabel.innerText = ganoUsuario ? "🏁 FINALIZADO - AVANZAS ✅" : "🏁 FINALIZADO - ELIMINADO ❌";
                        filaPartido.appendChild(finLabel);
                        document.getElementById(`consola-incidencias-${idUnico}`).innerText = ganoUsuario ? "🎉 ¡Victoria épica! Los jugadores festejan de cara a la tribuna." : "❌ Derrota dolorosa. El vestuario quedó golpeado.";
                        resolve();
                   }
              }, 400);
         }
    });
}

function inyectarAlertaIncidencia(idUnico, texto) {
     const caja = document.getElementById(`consola-incidencias-${idUnico}`);
     if (!caja) return;
     caja.innerText = texto;
     caja.style.color = "var(--dorado)";
     caja.style.fontWeight = "bold";
     setTimeout(() => { if (caja) { caja.style.color = "#94a3b8"; caja.style.fontWeight = "normal"; } }, 1500);
}

function liberarNavegacionArenaUI() {
     const barraNavegacion = document.querySelector(".nav-modulos-estadio");
     if (barraNavegacion) barraNavegacion.style.removeProperty("display");
     const btnSalir = document.querySelector(".btn-logout-kick");
     if (btnSalir) btnSalir.style.removeProperty("display");
}

/* ========================================================================
   🌎 9. ENGINE MULTIJUGADOR ONLINE (LLAMADOS DE RED & POLLING DINÁMICO)
   ======================================================================== */

async function abrirDraftMulti(esCreador) {
    multiEsCreador = esCreador;
    
    if (!esCreador) {
        const cod = document.getElementById("multi-input-codigo").value.trim().toUpperCase();
        if (cod.length !== 6) return alert("❌ Código inválido. Debe tener 6 caracteres.");
        multiCodigoSala = cod;

        mostrarCarga("Validando credenciales de la sala...");
        try {
            // 1. Buscamos los datos reales de la sala en el servidor
            const res = await fetch(`${URL_BASE}/multijugador/sala/${cod}`);
            const data = await res.json();
            ocultarCarga();

            if (!data.ok) return alert(data.mensaje);

            // 2. 🔥 PARCHE PREVENCIÓN: Armamos el cartel según el tipo de apuesta de la sala
            window.multiTipoApuestaActual = data.tipo_apuesta ? data.tipo_apuesta.toLowerCase() : 'amistoso';
            multiSalaId = data.sala_id;

            let cartelAdvertencia = "";

            if (window.multiTipoApuestaActual === 'amistoso') {
                cartelAdvertencia = `🏟️ ¿Querés unirte a la Sala ${cod}?\n\n🔹 Modalidad: AMISTOSO\n🔸 No se arriesgan recursos. ¡Puro juego para foguear el plantel!`;
            } else if (window.multiTipoApuestaActual === 'oro') {
                cartelAdvertencia = `🪙 ¡ATENCIÓN JUGADOR!\n\nLa Sala ${cod} exige una entrada de: 🪙${data.apuesta_oro || 0} monedas de Oro.\n⚠️ El monto se debitará de tu cuenta al confirmar tu planilla. ¿Querés continuar?`;
            } else if (window.multiTipoApuestaActual === 'carta') {
                cartelAdvertencia = `🚨 ¡CUIDADO CRACK!\n\nLa Sala ${cod} es una contienda: POR CARTAS REPETIDAS.\n⚠️ Deberás seleccionar un cromo de tu inventario para poner en juego. Si perdés el torneo, no vuelve. ¿Te la bancás?`;
            }

            // Si el invitado se arrepiente y le da a "Cancelar", lo pateamos al menú inicial
            if (!confirm(cartelAdvertencia)) {
                return;
            }

        } catch (e) { 
            ocultarCarga(); 
            return alert("Error de conexión con la sala."); 
        }
    } else {
        const inputApuesta = document.getElementById("multi-input-apuesta");
        multiApuestaFijada = inputApuesta ? (parseInt(inputApuesta.value) || 0) : 0;
        const selectTipo = document.getElementById("multi-select-tipo-apuesta");
        window.multiTipoApuestaActual = selectTipo ? selectTipo.value.toLowerCase() : 'amistoso';
    }

    // Si pasó la confirmación o es el creador, avanza al armado de la terna
    document.getElementById("multi-menu-inicial").style.display = "none";
    document.getElementById("multi-fase-inscripcion").style.display = "block";
    prepararInscripcionMundialMulti();
}

async function prepararInscripcionMundialMulti() {
     if (!usuarioActual) return;
     mostrarCarga("Conectando con la central de la Arena Online...");

     try {
          const res = await fetch(`${URL_BASE}/multijugador/preparar-draft`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ usuario_id: usuarioActual.id })
          });
          const data = await res.json(); ocultarCarga();

          if (!data.ok) {
               document.getElementById("multi-menu-inicial").style.display = "block";
               document.getElementById("multi-fase-inscripcion").style.display = "none";
               return alert(data.mensaje);
          }

          const barraNavegacion = document.querySelector(".nav-modulos-estadio");
          if (barraNavegacion) barraNavegacion.style.display = "none"; 
          const btnSalir = document.querySelector(".btn-logout-kick");
          if (btnSalir) btnSalir.style.display = "none";

          mundialTernaPaises = data.terna; jugadoresSeleccionadosDraft = [];
          const contenedorTerna = document.getElementById("multi-zona-eleccion-pais");
          if (!contenedorTerna) return; contenedorTerna.innerHTML = "";
          
          data.terna.forEach(pais => {
               const btn = document.createElement("button");
               btn.className = "btn-estadio btn-modulo-match"; btn.style.margin = "8px";
               btn.innerText = `⚽ ${pais.toUpperCase()}`;
               btn.onclick = () => iniciarDraftJugadoresMundialMulti(pais);
               contenedorTerna.appendChild(btn);
          });
     } catch (err) { console.error(err); ocultarCarga(); }
}

function iniciarDraftJugadoresMundialMulti(paisElegido) {
     window.mundialSeleccionUsuario = paisElegido;
     document.getElementById("multi-fase-inscripcion").style.display = "none";
     document.getElementById("multi-fase-draft").style.display = "block";
     document.getElementById("multi-lbl-tu-seleccion").innerText = paisElegido.toUpperCase();

     const wrapperApuestaInvitado = document.getElementById("multi-wrapper-apuesta-invitado");

     if (window.multiTipoApuestaActual === 'carta' && !multiEsCreador) {
          if (wrapperApuestaInvitado) wrapperApuestaInvitado.style.display = "block";
          const selectCromo = document.getElementById("multi-select-carta-apuesta-invitado");
          if (selectCromo) {
              selectCromo.innerHTML = "";
              const repetidas = albumCompleto.filter(f => f.obtenido > 1);
              if (repetidas.length === 0) {
                  const opt = document.createElement("option");
                  opt.value = ""; opt.innerText = "❌ No tenés cartas repetidas para arriesgar";
                  selectCromo.appendChild(opt);
              } else {
                  repetidas.forEach(figu => {
                      const opt = document.createElement("option"); opt.value = figu.id;
                      opt.innerText = `🃏 ${figu.nombre.toUpperCase()} (Tenes ${figu.obtenido})`;
                      selectCromo.appendChild(opt);
                  });
              }
          }
     } else {
          if (wrapperApuestaInvitado) wrapperApuestaInvitado.style.display = "none";
     }
     
     actualizarEstrellasVisualesDraftMulti();
     renderizarGridCartasDisponiblesDraftMulti(paisElegido);
}

function renderizarGridCartasDisponiblesDraftMulti(paisElegido) {
     const grid = document.getElementById("multi-grid-cartas-draft");
     if (!grid) return; grid.innerHTML = "";

     const cartasFiltradas = albumCompleto.filter(f => f.obtenido > 0 && f.pais.toLowerCase() === paisElegido.toLowerCase());
     if (cartasFiltradas.length === 0) {
          grid.innerHTML = `<div style="color:var(--rojo); padding:15px; text-align:center; font-weight:bold;">❌ No tenés jugadores de este país.</div>`; return;
     }

     cartasFiltradas.forEach(carta => {
          const card = document.createElement("div");
          const estaElegida = jugadoresSeleccionadosDraft.includes(carta.id);
          card.className = `carta-clash ${carta.rareza.toLowerCase()} ${estaElegida ? 'activo-draft' : ''}`;
          card.innerHTML = `<img src="${carta.foto}" class="carta-foto" alt="${carta.nombre}"><div class="rareza-vertical">${carta.rareza.toUpperCase()}</div>`;

          card.onclick = () => {
               if (jugadoresSeleccionadosDraft.includes(carta.id)) {
                    jugadoresSeleccionadosDraft = jugadoresSeleccionadosDraft.filter(id => id !== carta.id);
               } else {
                    if (jugadoresSeleccionadosDraft.length >= 3) return alert("❌ Máximo 3 jugadores.");
                    jugadoresSeleccionadosDraft.push(carta.id);
               }
               renderizarGridCartasDisponiblesDraftMulti(paisElegido);
               actualizarEstrellasVisualesDraftMulti();
          };
          grid.appendChild(card);
     });
}

function actualizarEstrellasVisualesDraftMulti() {
     const lblEstrellas = document.getElementById("multi-lbl-estrellas-equipo"); if (!lblEstrellas) return;
     if (jugadoresSeleccionadosDraft.length !== 3) {
          lblEstrellas.innerText = "⚠️ Alineá 3 jugadores para calcular poder"; return;
     }
     const cartasElegidas = albumCompleto.filter(f => jugadoresSeleccionadosDraft.includes(f.id));
     const promedio = cartasElegidas.reduce((acc, c) => acc + MAPA_PUNTOS_RAREZA[c.rareza.toLowerCase()], 0) / 3;

     let numEstrellas = 1;
     if (promedio >= 90) numEstrellas = 5;
     else if (promedio >= 79) numEstrellas = 4;
     else if (promedio >= 70) numEstrellas = 3;
     else if (promedio >= 62) numEstrellas = 2;
     lblEstrellas.innerText = "⭐".repeat(numEstrellas) + ` (${numEstrellas}/5 Estrellas)`;
}

async function confirmarInscripcionMultiServidor(paisElegido, arrayIdsJugadores) {
    if (arrayIdsJugadores.length !== 3) return alert("❌ Debés alinear exactamente 3 jugadores.");
     let cartaIdSeleccionada = null;

     if (window.multiTipoApuestaActual === 'carta') {
         const idSelect = multiEsCreador ? "multi-select-carta-apuesta" : "multi-select-carta-apuesta-invitado";
         const selectElement = document.getElementById(idSelect);
         cartaIdSeleccionada = selectElement ? selectElement.value : null;
         if (!cartaIdSeleccionada) return alert("❌ Debés elegir tu cromo a arriesgar.");
         window.multiMiCartaApostadaTexto = selectElement.options[selectElement.selectedIndex].text;
     } else { window.multiMiCartaApostadaTexto = null; }

    mostrarCarga("Enviando planilla de vestuarios a la Arena Online...");
    let url = `${URL_BASE}/multijugador/crear`;
    let cuerpo = {
        usuario_id: usuarioActual.id, seleccion: paisElegido, jugador_ids: arrayIdsJugadores,
        tipo_apuesta: window.multiTipoApuestaActual, apuesta_oro: multiApuestaFijada,
        carta_apuesta_id: cartaIdSeleccionada ? parseInt(cartaIdSeleccionada) : null
    };

    if (!multiEsCreador) {
        url = `${URL_BASE}/multijugador/unirse`;
        cuerpo = {
            usuario_id: usuarioActual.id, seleccion: paisElegido, jugador_ids: arrayIdsJugadores,
            codigo_sala: multiCodigoSala, carta_apuesta_id: cartaIdSeleccionada ? parseInt(cartaIdSeleccionada) : null
        };
    }

    try {
        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
        });
        const data = await res.json();

        if (!data.ok) { ocultarCarga(); return alert(data.mensaje); }
        if (data.monedasActualizadas !== undefined) {
            usuarioActual.monedas = data.monedasActualizadas;
            actualizarInterfazUI();
        }

        multiSalaId = data.sala_id;
        if (data.codigo_sala) multiCodigoSala = data.codigo_sala;

        document.getElementById("multi-fase-draft").style.display = "none";
        document.getElementById("multi-lobby-espera").style.display = "block";
        document.getElementById("lobby-txt-codigo").innerText = multiCodigoSala;
        ocultarCarga();

        multiIntervaloLobby = setInterval(actualizarLobbyEnVivo, 3000);
        actualizarLobbyEnVivo(); 
    } catch (err) { console.error(err); ocultarCarga(); }
}

async function actualizarLobbyEnVivo() {
    if (!multiCodigoSala) return;

    try {
        const res = await fetch(`${URL_BASE}/multijugador/sala/${multiCodigoSala}`);
        const data = await res.json();

        if (!data.ok) { clearInterval(multiIntervaloLobby); return; }
        if (data.tipo_apuesta) window.multiTipoApuestaActual = data.tipo_apuesta.toLowerCase();

        if (data.estado === 'finalizado' || data.estado === 'jugando') {
            clearInterval(multiIntervaloLobby);
            if (!multiEsCreador) { multiSalaId = data.sala_id; consultarResultadoInvitado(); }
            return;
        }

        const contenedorListado = document.getElementById("lobby-lista-participantes");
        let infoSalaBox = document.getElementById("multi-info-sala-dinamica");
        if (!infoSalaBox && contenedorListado) {
            infoSalaBox = document.createElement("div"); infoSalaBox.id = "multi-info-sala-dinamica";
            contenedorListado.parentNode.insertBefore(infoSalaBox, contenedorListado);
        }

        if (infoSalaBox) {
            let detalle = `🪙 MODALIDAD: TIMBA POR ORO`;
            if (window.multiTipoApuestaActual === 'carta') {
                 let miCartaInfo = window.multiMiCartaApostadaTexto || "Seleccionada en Vestuario";
                 detalle = `🃏 DUELO DE CARTAS REPETIDAS\n⚠️ ¡Muerte Súbita! El perdedor descarta.\n\n🔒 TU APUESTA: ${miCartaInfo.toUpperCase()}`;
            } else if (window.multiTipoApuestaActual === 'amistoso') { detalle = `🤝 MODALIDAD: AMISTOSO ONLINE`; }
            
            infoSalaBox.innerHTML = `<div style="background:rgba(11,17,30,0.8); padding:12px; border-radius:8px; border:1px solid var(--dorado); text-align:center; font-weight:bold; color:var(--dorado); margin-bottom:15px; font-family:'Oswald'; white-space:pre-line;">${detalle}</div>`;
        }

        const txtPozo = document.getElementById("lobby-txt-pozo");
        if (txtPozo) {
            if (window.multiTipoApuestaActual === 'carta') txtPozo.innerText = `🎰 Pozo: 1 Cromo Épico/Leg Mínimo`;
            else if (window.multiTipoApuestaActual === 'amistoso') txtPozo.innerText = `⚽ Modo de Práctica`;
            else txtPozo.innerText = `💰 Pozo Actual: ${data.pozo_total} Oro`;
        }
        
        document.getElementById("lobby-cnt-jugadores").innerText = data.participantes.length;
        contenedorListado.innerHTML = "";

        data.participantes.forEach(p => {
            const div = document.createElement("div");
            div.style.cssText = "background:rgba(255,255,255,0.05); padding:10px 15px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; border-left:4px solid var(--verde-match); margin-bottom:6px;";
            const esHost = p.usuario_id === data.creador_id;
            div.innerHTML = `<span style="font-weight:bold; color:#fff;">${esHost ? '👑 ' : ''}${p.username}</span><span style="color:var(--dorado); font-family:'Oswald';">⚽ ${p.seleccion.toUpperCase()}</span>`;
            contenedorListado.appendChild(div);
        });

        document.getElementById("multi-btn-iniciar-fixture").style.display = multiEsCreador ? "block" : "none";
        document.getElementById("multi-txt-espera-host").style.display = multiEsCreador ? "none" : "block";
    } catch (err) { console.error(err); }
}

async function lanzarSimulacionMulti() {
    mostrarCarga("Sorteando las llaves y cerrando las planillas online...");
    clearInterval(multiIntervaloLobby);
    try {
        const res = await fetch(`${URL_BASE}/multijugador/jugar`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sala_id: multiSalaId, usuario_id: usuarioActual.id })
        });
        const data = await res.json(); ocultarCarga();
        if (!data.ok) { alert(data.mensaje); multiIntervaloLobby = setInterval(actualizarLobbyEnVivo, 3000); return; }

        window.renderizarFixturePasoAPaso(data.bitacora, data.premio);
    } catch (err) { console.error(err); ocultarCarga(); }
}

async function consultarResultadoInvitado(intento = 1) {
     if (intento === 1) mostrarCarga("¡El Torneo comenzó! Recibiendo transmisión oficial...");
     try {
          const res = await fetch(`${URL_BASE}/multijugador/resultado-invitado/${multiSalaId}`);
          const data = await res.json();
          
          if (data.ok && (!data.bitacora || data.bitacora.length <= 1)) {
               if (intento <= 3) {
                    setTimeout(() => consultarResultadoInvitado(intento + 1), 800); return;
               }
          }
          ocultarCarga();
          if (!data.ok) { alert(data.mensaje || "Error al sincronizar."); cancelarMundialMultiLobby(); return; }
          
          window.renderizarFixturePasoAPaso(data.bitacora, data.premio);
     } catch(e) { console.error(e); ocultarCarga(); }
}

window.renderizarFixturePasoAPaso = function(bitacora, premio, apuestasTexto) {
    document.getElementById("multi-lobby-espera").style.display = "none";
    document.getElementById("multi-pantalla-fixture").style.display = "block";
    const tablero = document.getElementById("multi-cronologia-goles");
    if (!tablero) return; tablero.innerHTML = ""; 

    if (apuestasTexto && Array.isArray(apuestasTexto) && apuestasTexto.length > 0) {
        const bloqueTextoApuestas = document.createElement("div");
        bloqueTextoApuestas.style.cssText = "background: rgba(255, 0, 0, 0.05); border: 1px solid var(--rojo); padding: 12px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; text-align: center;";
        bloqueTextoApuestas.innerHTML = `⚠️ <span style="color: var(--rojo); font-family: 'Oswald';">CROMOS ARRIESGADOS:</span><br>${apuestasTexto.join('<br>')}`;
        tablero.appendChild(bloqueTextoApuestas);
    }

    if (!bitacora || !Array.isArray(bitacora) || bitacora.length === 0) return;
    let secuenciaPromesas = Promise.resolve();

    bitacora.forEach((partido, index) => {
        const loc = partido.local || "Local"; 
        const vis = partido.visitante || "Rival";
        const rondaNombre = partido.ronda || `PARTIDO #${index + 1}`;
        const golesLocalDefinitivos = partido.golesLocal || 0; 
        const golesVisitanteDefinitivos = partido.golesVisitante || 0;
        
        // Traemos las incidencias que viajan desde tu base de datos / backend
        const incidenciasDelPartido = partido.incidencias || {};

        secuenciaPromesas = secuenciaPromesas.then(() => {
            return new Promise((resolveCruce) => {
                 const bloquePartido = document.createElement("div"); 
                 bloquePartido.className = "item-historial-partido";
                 bloquePartido.style.cssText = "flex-direction: column; align-items: stretch; background: #0b111e; margin-bottom:20px; border-left:4px solid var(--dorado); padding:15px;";
                 
                 bloquePartido.innerHTML = `
                     <div style="display:flex; justify-content:space-between; color:var(--dorado); border-bottom:1px solid #1a2436; padding-bottom:5px;">
                          <span style="font-family:'Oswald'; font-weight:bold; text-transform: uppercase;">📋 ${rondaNombre}</span>
                          <span id="multi-reloj-${index}" style="color:var(--celeste); font-weight:bold;">⏱️ MINUTO 00:00</span>
                     </div>
                     <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
                          <span style="width:40%; text-align:left; font-weight:bold;">⚽ ${loc.toUpperCase()}</span>
                          <span id="multi-score-${index}" style="font-family:'Oswald'; font-size:1.6rem; background:#000; padding:4px 14px; border-radius:6px; color:var(--verde-match); min-width:60px; text-align:center;">0 - 0</span>
                          <span style="width:40%; text-align:right; font-weight:bold;">${vis.toUpperCase()} ⚽</span>
                     </div>
                     <div id="multi-log-vivo-${index}" style="margin-top:12px; font-size:0.85rem; color:#64748b; text-align:center; font-style:italic; min-height:25px;">
                          🏁 Los capitanes sortean los lados... ¡Mucha tensión en la Arena!
                     </div>
                     <div id="multi-penales-box-${index}" style="display:none; text-align:center; color:var(--rojo); font-weight:bold; margin-top:8px; font-size:0.9rem; background:rgba(239,68,68,0.1); padding:6px; border-radius:4px;"></div>
                 `;
                 tablero.appendChild(bloquePartido); 
                 bloquePartido.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                 let minVirtual = 0; 
                 let gL_act = 0; 
                 let gV_act = 0;

                 // MODIFICACIÓN: Avanza de a 5 minutos cada 400ms para estirar el drama y hacerlo épico
                 const timerMulti = setInterval(() => {
                     minVirtual += 5; 
                     if (minVirtual > 90) minVirtual = 90;

                     // Los goles van cayendo de forma escalonada e inteligente a lo largo del tiempo
                     if (minVirtual >= 15) {
                          if (gL_act < golesLocalDefinitivos && Math.random() < 0.2) {
                               gL_act++;
                               inyectarGritoGolMulti(index, `⚽ ¡GOOOL DE ${loc.toUpperCase()}! Se cae el estadio... 🔥`);
                          }
                          if (gV_act < golesVisitanteDefinitivos && Math.random() < 0.2) {
                               gV_act++;
                               inyectarGritoGolMulti(index, `💥 ¡GOL DE ${vis.toUpperCase()}! Silencio sepulcral en la Arena...`);
                          }
                     }

                     if (minVirtual === 90) { 
                          gL_act = golesLocalDefinitivos; 
                          gV_act = golesVisitanteDefinitivos; 
                     }

                     // Pintamos tiempos y marcadores actualizados
                     if (document.getElementById(`multi-reloj-${index}`)) {
                          document.getElementById(`multi-reloj-${index}`).innerText = `⏱️ MINUTO ${minVirtual.toString().padStart(2,'0')}:00`;
                     }
                     if (document.getElementById(`multi-score-${index}`)) {
                          document.getElementById(`multi-score-${index}`).innerText = `${gL_act} - ${gV_act}`;
                     }

                     // Evaluamos e inyectamos los textos del servidor (PostgreSQL) en vivo
                     if (incidenciasDelPartido[minVirtual]) {
                          document.getElementById(`multi-log-vivo-${index}`).innerText = incidenciasDelPartido[minVirtual];
                     }

                     if (minVirtual >= 90) {
                         clearInterval(timerMulti);
                         
                         if (partido.definicionPenales && document.getElementById(`multi-penales-box-${index}`)) {
                              document.getElementById(`multi-penales-box-${index}`).style.display = "block";
                              document.getElementById(`multi-penales-box-${index}`).innerText = `💥 TANDA DE PENALES POR LA INMORTALIDAD: (${partido.penalesLocal} - ${partido.penalesVisitante})`;
                         }
                         
                         bloquePartido.style.borderColor = "var(--verde-match)";
                         const finTexto = document.createElement("div"); 
                         finTexto.style.cssText = "text-align:right; font-size:0.85rem; font-weight:bold; color:var(--verde-match); margin-top:5px;";
                         finTexto.innerText = `🏆 GANADOR: ${partido.ganadorUsername.toUpperCase()} ✅`;
                         bloquePartido.appendChild(finTexto);
                         
                         document.getElementById(`multi-log-vivo-${index}`).innerText = "🏁 El árbitro pita el final del encuentro. Planillas guardadas con éxito.";
                         resolveCruce(); 
                     }
                 }, 400);
            });
        });
    });

    // Cierre limpio de los premios y reset del lobby
    secuenciaPromesas.then(() => {
          const bloquePremio = document.createElement("div");
          bloquePremio.style.cssText = "text-align:center; margin-top:25px; padding:15px; background:rgba(0,255,136,0.05); border:2px dashed var(--dorado); border-radius:10px;";
          let textoPremio = `👑 ¡Fin de la transmisión!\n🎁 El torneo ha concluido exitosamente.`;
          
          if (premio && !premio.ganoBot) {
               if (premio.tipo_apuesta === 'oro') {
                    textoPremio = `🏆 ¡FIN DEL TORNEO! 🏆\n👑 Campeón: ${premio.ganador_username.toUpperCase()}\n🎁 ¡Se lleva 🪙 ${premio.pozo} de Oro!`;
               } else if (premio.tipo_apuesta === 'carta') {
                    textoPremio = `🏆 ¡FIN DEL TORNEO! 🏆\n👑 Campeón: ${premio.ganador_username.toUpperCase()}\n\n🎉 ¡Conservás tu cromo y ganaste a:\n🌟 [ ${premio.nombreCartaPremio || 'Jugador Épico'} ]!\n\n💀 Los perdedores perdieron su cromo permanentemente.`;
               }
          } else if (premio && premio.ganoBot) {
               textoPremio = premio.tipo_apuesta === 'carta' ? `🤖 ¡El torneo fue conquistado por un Bot (${premio.ganador_username.toUpperCase()})!\n\n💀 Ambos jugadores perdieron sus cartas permanentemente.` : `🤖 ¡Torneo conquistado por un Bot (${premio.ganador_username.toUpperCase()})!\n💸 El pozo se disolvió.`;
          }
          
          bloquePremio.innerHTML = `<h3 style="color:var(--dorado); font-family:'Oswald';">🏁 CRÓNICA DEFINITIVA</h3><p style="color:#fff; font-weight:bold; white-space:pre-line;">${textoPremio}</p><button type="button" id="btn-regresar-limpio-multi" class="btn-estadio" style="width:80%; margin-top:15px; background:var(--celeste);">🔄 REGRESAR A LA HOME</button>`;
          tablero.appendChild(bloquePremio); bloquePremio.scrollIntoView({ behavior: 'smooth' });

          document.getElementById("btn-regresar-limpio-multi").onclick = () => {
              document.getElementById("multi-pantalla-fixture").style.display = "none";
              document.getElementById("multi-menu-inicial").style.display = "block";
              if (document.getElementById("modulo-mundial-multi")) document.getElementById("modulo-mundial-multi").style.display = "block";
              liberarNavegacionArenaUI(); multiSalaId = null; multiCodigoSala = null; multiEsCreador = false;
              const btnTienda = document.querySelector("button[onclick*='modulo-sobres']"); cambiarModulo('modulo-sobres', btnTienda);
          };
    });
};

// Función auxiliar interna exclusiva para dar flash visual en los gritos de gol del multi
function inyectarGritoGolMulti(index, mensajeTexto) {
     const logView = document.getElementById(`multi-log-vivo-${index}`);
     if (!logView) return;
     logView.innerText = mensajeTexto;
     logView.style.color = "var(--dorado)";
     logView.style.fontWeight = "bold";
     setTimeout(() => { if (logView) { logView.style.color = "#64748b"; logView.style.fontWeight = "normal"; } }, 1600);
}

function conmutarInputsMultiUI() {
    const selector = document.getElementById("multi-select-tipo-apuesta"); if (!selector) return;
    const tipo = selector.value;
    const divOro = document.getElementById("multi-wrapper-oro"); const divCarta = document.getElementById("multi-wrapper-carta");

    if (tipo === 'oro') {
        if (divOro) divOro.style.display = "block"; if (divCarta) divCarta.style.display = "none";
    } else if (tipo === 'carta') {
        if (divOro) divOro.style.display = "none"; if (divCarta) divCarta.style.display = "block";
        const selectCromoMulti = document.getElementById("multi-select-carta-apuesta");
        if (selectCromoMulti) {
            selectCromoMulti.innerHTML = "";
            const miAlbumReal = window.albumCompleto || albumCompleto || [];
            const repetidas = miAlbumReal.filter(f => f && f.obtenido > 1);

            if (repetidas.length === 0) {
                const opt = document.createElement("option"); opt.value = ""; opt.innerText = "❌ Sin cromos repetidos";
                selectCromoMulti.appendChild(opt);
            } else {
                repetidas.forEach(figu => {
                    const opt = document.createElement("option"); opt.value = figu.id;
                    opt.innerText = `${figu.bandera || '🃏'} ${figu.nombre.toUpperCase()} (x${figu.obtenido})`;
                    selectCromoMulti.appendChild(opt);
                });
            }
        }
    } else {
        if (divOro) divOro.style.display = "none"; if (divCarta) divCarta.style.display = "none";
    }
}

function cancelarMundialMultiLobby() {
     if (multiIntervaloLobby) clearInterval(multiIntervaloLobby);
     document.getElementById("multi-fase-inscripcion").style.display = "none";
     document.getElementById("multi-fase-draft").style.display = "none";
     document.getElementById("multi-lobby-espera").style.display = "none";
     document.getElementById("multi-pantalla-fixture").style.display = "none";
     document.getElementById("multi-menu-inicial").style.display = "block";
     liberarNavegacionArenaUI(); multiSalaId = null; multiCodigoSala = null; multiEsCreador = false; jugadoresSeleccionadosDraft = [];
}

/* ========================================================================
   📢 10. LEADERBOARDS (RANKINGS GENERAL Y MUNDIAL) Y BANNER INFORMATIVO
   ======================================================================== */

async function cargarRankingLocal() {
     cargarRankingMundialesLocal();
     const tbody = document.getElementById("tabla-ranking-body");
     if (!tbody) return;

     try {
          const res = await fetch(`${URL_BASE}/ranking`);
          const data = await res.json();
          tbody.innerHTML = "";

          if (!data.ranking || data.ranking.length === 0) {
               tbody.innerHTML = `<tr><td colspan="3" style="color:#777;">No hay jugadores en la arena</td></tr>`; return;
          }

          data.ranking.forEach((user, index) => {
               const tr = document.createElement("tr");
               if (usuarioActual && user.username === usuarioActual.username) tr.className = "fila-usuario-actual";

               let posicionText = index + 1;
               if (index === 0) posicionText = "🥇";
               if (index === 1) posicionText = "🥈";
               if (index === 2) posicionText = "🥉";

               tr.innerHTML = `<td><b>${posicionText}</b></td><td style="text-align: left; padding-left: 15px;">${user.username} ${usuarioActual && user.username === usuarioActual.username ? '<span style="color:var(--celeste); font-size:0.8rem;">(Vos)</span>' : ''}</td><td style="color: #ff4a4a; font-weight: bold;">${user.puntos_ranking}</td>`;
               tbody.appendChild(tr);
          });
     } catch (err) { console.error(err); }
}

async function cargarRankingMundialesLocal() {
     const tbody = document.getElementById("tabla-ranking-mundiales-body");
     if (!tbody) return;

     try {
          const res = await fetch(`${URL_BASE}/ranking-mundiales`);
          const data = await res.json();
          tbody.innerHTML = "";

          if (!data.ranking || data.ranking.length === 0) {
               tbody.innerHTML = `<tr><td colspan="3" style="color:#777; padding: 15px;">🌟 Todavía no hay campeones en la Arena. ¡Sé el primero! 👑</td></tr>`; return;
          }

          data.ranking.forEach((user, index) => {
               const tr = document.createElement("tr");
               if (usuarioActual && user.username === usuarioActual.username) tr.className = "fila-usuario-actual";

               let posicionText = index + 1;
               if (index === 0) posicionText = "🥇";
               if (index === 1) posicionText = "🥈";
               if (index === 2) posicionText = "🥉";

               tr.innerHTML = `<td><b>${posicionText}</b></td><td style="text-align: left; padding-left: 15px;">${user.username.toUpperCase()} ${usuarioActual && user.username === usuarioActual.username ? '<span style="color:var(--celeste); font-size:0.8rem;">(Vos)</span>' : ''}</td><td style="color: var(--dorado); font-weight: bold; font-size: 1.2rem;">🏆 ${user.copas_mundiales}</td>`;
               tbody.appendChild(tr);
          });
     } catch (err) { console.error("Error al cargar ranking de mundiales:", err); }
}

async function iniciarControladorAnunciosSeguro() {
    try {
        const res = await fetch(`${URL_BASE}/anuncio-actual`);
        const anuncio = await res.json();
        if (!anuncio || !anuncio.activo) return;

        const modal = document.getElementById('modalAnuncioGlobal');
        const tituloHtml = document.getElementById('anuncioTitulo');
        const cuerpoHtml = document.getElementById('anuncioCuerpo');
        if (!modal || !tituloHtml || !cuerpoHtml) return;

        tituloHtml.textContent = anuncio.titulo.toUpperCase();
        cuerpoHtml.innerHTML = ""; 

        if (anuncio.texto) {
            const p = document.createElement('p'); p.textContent = anuncio.texto; cuerpoHtml.appendChild(p);
        }
        if (anuncio.tipo === "imagen" && anuncio.urlImagen) {
            const img = document.createElement('img'); img.src = anuncio.urlImagen; img.className = "anuncio-media"; img.alt = "Novedades";
            cuerpoHtml.appendChild(img);
        } else if (anuncio.tipo === "video" && anuncio.urlVideo) {
            const containerVideo = document.createElement('div'); containerVideo.className = "anuncio-video-container";
            const iframe = document.createElement('iframe'); iframe.src = anuncio.urlVideo; iframe.setAttribute('allowfullscreen', 'true'); iframe.style.border = "none";
            containerVideo.appendChild(iframe); cuerpoHtml.appendChild(containerVideo);
        }
        modal.style.display = "flex";
    } catch (err) { console.error("Error en banner de novedades:", err); }
}

function cerrarAnuncioGlobal() {
    const modal = document.getElementById('modalAnuncioGlobal');
    if (modal) { modal.style.display = "none"; document.getElementById('anuncioCuerpo').innerHTML = ""; }
}

// Función para abrir la interfaz del Bot en el Front
function abrirMercadoBot(listaTusRepetidas) {
    const contenedorBot = document.getElementById("modulo-comerciante-bot");
    contenedorBot.style.display = "block";

    contenedorBot.innerHTML = `
        <div style="background: #0f172a; border: 2px solid var(--dorado); padding: 20px; border-radius: 12px; text-align: center; max-width: 500px; margin: 20px auto;">
            <h3 style="color: var(--dorado); font-family: 'Oswald'; font-size: 1.5rem; margin-top: 0;">🤖 BOT COMERCIANTE</h3>
            <p style="color: #94a3b8; font-size: 0.9rem; font-style: italic;">
                "Traeme 3 cartas repetidas de la misma rareza y te daré una carta de un escalón superior. ¡Si sacrificás cartas de Élite podrías activar recompensas especiales ocultas!"
            </p>
            
            <div id="zona-seleccion-bot" style="margin: 15px 0; text-align: left;">
                 <label style="color: #fff; font-size: 0.85rem; font-weight: bold;">Elegí tus 3 cartas a sacrificar (Deben ser de igual rareza):</label>
                 <div id="lista-checks-repetidas" style="max-height: 200px; min-height: 60px; overflow-y: auto; background: #020617; padding: 10px; border-radius: 6px; margin-top: 5px;">
                 </div>
            </div>

            <button type="button" id="btn-ejecutar-trato" class="btn-estadio" style="background: var(--verde-match); color: #000; width: 100%; font-weight: bold; transition: all 0.3s ease;">
                 🤝 FIRMAR CONTRATO DE TRADEO
            </button>
            <div id="resultado-trato-bot" style="margin-top: 12px; font-weight: bold; font-size: 0.95rem;"></div>
        </div>
    `;

    const listaCheckboxes = document.getElementById("lista-checks-repetidas");
    listaCheckboxes.innerHTML = ""; 

    let contadorRepetidas = 0;
    
    listaTusRepetidas.forEach(jugador => {
         const copias = jugador.obtenido !== undefined ? jugador.obtenido : (jugador.cantidad || 0);

         if (copias > 1) {
              contadorRepetidas++;
              listaCheckboxes.innerHTML += `
                   <label style="display: flex; align-items: center; gap: 10px; color: #cbd5e1; font-size: 0.85rem; margin-bottom: 8px; cursor: pointer; text-align: left; width: 100%;">
                        <input type="checkbox" class="check-cromo-bot" value="${jugador.id}" style="width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;">
                        <span style="flex-grow: 1;">${jugador.nombre || 'Jugador'} (${(jugador.rareza || 'comun').toUpperCase()}) - Repetidas: [${copias - 1}]</span>
                   </label>
              `;
         }
    });

    if (contadorRepetidas === 0) {
         listaCheckboxes.style.display = "flex";
         listaCheckboxes.style.flexDirection = "column";
         listaCheckboxes.style.justifyContent = "center";
         
         listaCheckboxes.innerHTML = `
              <div style="color: var(--rojo); font-weight: bold; font-size: 0.9rem; text-align: center; width: 100%;">
                   ❌ No tenés cromos repetidos en tu álbum para negociar.
              </div>
         `;
         const btnTrato = document.getElementById("btn-ejecutar-trato");
         btnTrato.disabled = true;
         btnTrato.style.background = "#334155";
         btnTrato.style.color = "#94a3b8";
         btnTrato.style.cursor = "not-allowed";
         btnTrato.innerText = "⛔ SIN ELEMENTOS PARA INTERCAMBIAR";
    } else {
         listaCheckboxes.style.display = "block";
    }

    document.getElementById("btn-ejecutar-trato").onclick = async () => {
         const seleccionados = Array.from(document.querySelectorAll('.check-cromo-bot:checked')).map(cb => parseInt(cb.value));

         if (seleccionados.length !== 3) {
              alert("⚠️ Tenés que seleccionar exactamente 3 cromos repetidos para hacer el trato.");
              return;
         }

         document.getElementById("btn-ejecutar-trato").disabled = true;
         document.getElementById("resultado-trato-bot").style.color = "#fff";
         document.getElementById("resultado-trato-bot").innerText = "⏳ El bot está tasando tus cartas...";

         try {
              const res = await fetch('/api/album/comerciar-bot', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ usuario_id: usuarioActual.id, jugadorIdsASacar: seleccionados })
              });
              const data = await res.json();

              if (data.ok) {
                   document.getElementById("resultado-trato-bot").style.color = "var(--verde-match)";
                   
                   let plantillaMensaje = `
                        🎉 ¡Trato hecho!<br>
                        🌟 CROMO RECIBIDO: <span style="color: var(--dorado);">${data.cartaGanada.nombre} [${data.cartaGanada.rareza}]</span>
                   `;

                   // 🔥 Muestra el cartel con animación si ligaste el evento raro (8% de probabilidad)
                   if (data.eventoEspecial) {
                        plantillaMensaje += `<br><br><span style="color: #38bdf8; font-weight: bold; font-size: 0.95rem; display: block; padding: 8px; background: #0c4a6e; border-radius: 6px; border: 1px dashed #0284c7;">${data.eventoEspecial}</span>`;
                        alert(`🎁 ¡EVENTO ULTRA RARO ACTIVADO!\n\n${data.eventoEspecial}`);
                   }

                   document.getElementById("resultado-trato-bot").innerHTML = plantillaMensaje;
                   
                   // Damos 3.5 segundos para que pueda leer la recompensa en pantalla antes de recargar
                   setTimeout(() => { 
                       cargarAlbumLocal(); 
                       cambiarModulo('modulo-album', null);
                   }, 3500);
              } else {
                   document.getElementById("resultado-trato-bot").style.color = "var(--rojo)";
                   document.getElementById("resultado-trato-bot").innerText = data.mensaje || data.error || "❌ La Arena rechazó el intercambio.";
                   document.getElementById("btn-ejecutar-trato").disabled = false;
              }
         } catch (err) {
              console.error(err);
              document.getElementById("resultado-trato-bot").style.color = "var(--rojo)";
              document.getElementById("resultado-trato-bot").innerText = "❌ Error de conexión con la Arena.";
              document.getElementById("btn-ejecutar-trato").disabled = false;
         }
    };
}

// Llena el select usando las copias del álbum global de forma adaptada
function cargarMisRepetidasParaVenta() {
    const select = document.getElementById("select-mercado-vender");
    if (!select) return;
    select.innerHTML = '<option value="">-- Elegí tu cromo --</option>';
    
    const cartas = window.albumCompleto || [];
    cartas.forEach(jugador => {
        const copias = jugador.obtenido !== undefined ? jugador.obtenido : (jugador.cantidad || 0);
        if (copias > 1) {
            select.innerHTML += `<option value="${jugador.id}">${jugador.nombre} (${(jugador.rareza || 'comun').toUpperCase()}) [x${copias - 1}]</option>`;
        }
    });
}

// Envía el cromo a la vitrina
async function publicarCartaMercado() {
    const jugadorId = document.getElementById("select-mercado-vender").value;
    const precio = parseInt(document.getElementById("input-mercado-precio").value);

    if (!jugadorId || !precio || precio < 50) {
        alert("⚠️ Seleccioná un cromo válido y un precio mínimo de 🪙50 de Oro.");
        return;
    }

    try {
        const res = await fetch('/api/mercado/publicar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: parseInt(usuarioActual.id), jugador_id: parseInt(jugadorId), precio })
        });
        const data = await res.json();
        
        if (data.ok) {
            alert("✨ Cromo publicado en la vitrina internacional.");
            document.getElementById("input-mercado-precio").value = "";
            cargarAlbumLocal(); // Sincroniza stock nativo
            setTimeout(() => { cambiarModulo('modulo-mercado-pases', document.getElementById('btn-nav-mercado')); }, 500);
        } else {
            alert(data.mensaje);
        }
    } catch (err) {
        console.error(err);
    }
}

// Renderiza todas las ofertas y aplica estilos condicionales si el cromo es tuyo
async function obtenerOfertasMercado() {
    const grid = document.getElementById("grid-mercado-pases");
    if (!grid) return;
    grid.innerHTML = "<p style='color:#64748b; grid-column:1/-1; text-align:center;'>⏳ Cargando vitrina de pases...</p>";

    // Blindaje del ID para evitar bardo de "1:1"
    const idLimpio = usuarioActual && usuarioActual.id ? parseInt(usuarioActual.id) : null;

    if (!idLimpio || isNaN(idLimpio)) {
        grid.innerHTML = "<p style='color:var(--rojo); grid-column:1/-1; text-align:center;'>❌ Sesión de usuario inválida.</p>";
        return;
    }

    try {
        const res = await fetch(`/api/mercado/ofertas?usuario_id=${idLimpio}`);
        const data = await res.json();

        if (!data.ok) {
            grid.innerHTML = `<p style='color:var(--rojo); grid-column:1/-1; text-align:center;'>❌ Error del servidor: ${data.error || 'Consola backend'}</p>`;
            return;
        }

        if (data.ofertas.length === 0) {
            grid.innerHTML = "<p style='color:#64748b; grid-column:1/-1; text-align:center;'>🏪 La vitrina está vacía en este momento.</p>";
            return;
        }

        grid.innerHTML = "";
        data.ofertas.forEach(oferta => {
            const esMia = (parseInt(oferta.vendedor_id) === idLimpio);
            
            // Si el cromo es tuyo, el botón cambia de color y se bloquea
            const btnAccion = esMia 
                ? `<button type="button" class="btn-estadio" style="background: #475569; color:#fff; width:100%; font-size:0.8rem; padding: 5px 0; cursor: not-allowed;" disabled>TU PUBLICACIÓN</button>`
                : `<button type="button" class="btn-estadio" style="background: var(--dorado); color:#000; width:100%; font-size:0.8rem; padding: 5px 0;" onclick="comprarCartaMercado(${oferta.id})">COMPRAR</button>`;

            grid.innerHTML += `
                <div style="background: #1e293b; border: 1px solid ${esMia ? '#475569' : 'var(--dorado)'}; border-radius: 8px; padding: 12px; text-align: center; display: flex; flex-direction: column; justify-content: space-between; opacity: ${esMia ? '0.8' : '1'};">
                    <div>
                        <span style="font-size: 1.5rem; display:block; margin-bottom:5px;">${oferta.bandera || '🛡️'}</span>
                        <strong style="color: #fff; font-size: 0.95rem; display:block;">${oferta.nombre}</strong>
                        <span style="font-size:0.75rem; color:var(--celeste); font-weight:bold; display:block; margin-top:2px;">${(oferta.rareza || 'comun').toUpperCase()}</span>
                        <span style="font-size:0.75rem; color:#94a3b8; display:block; margin-top:4px;">${esMia ? '✨ Tuya' : 'Vendedor: ' + (oferta.nombre_vendedor || 'Usuario')}</span>
                    </div>
                    <div style="margin-top: 10px;">
                        <div style="color: var(--dorado); font-weight: bold; font-size: 1rem; margin-bottom: 8px;">🪙 ${oferta.precio_oro}</div>
                        ${btnAccion}
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
        grid.innerHTML = "<p style='color:var(--rojo); grid-column:1/-1; text-align:center;'>❌ Error de red en la Arena.</p>";
    }
}

// Procesa la compra usando la respuesta directa del Backend y actualiza el HUD real
async function comprarCartaMercado(ofertaId) {
    try {
        const res = await fetch('/api/mercado/comprar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_id: parseInt(usuarioActual.id), oferta_id: ofertaId })
        });
        const data = await res.json();

        if (data.ok) {
            alert(`🎉 ¡Fichaje cerrado! Recibiste a ${data.jugador}. El Oro fue transferido.`);
            
            // 1. Sincronizamos la variable global de sesión con el número exacto de Neon
            if (usuarioActual && data.nuevoOro !== undefined) {
                usuarioActual.monedas = data.nuevoOro;
            }

            // 2. 🔥 REPARADO: Clava el nuevo valor directamente en tu Scoreboard del HUD real
            const elMonedas = document.getElementById("lbl-monedas");
            if (elMonedas && data.nuevoOro !== undefined) {
                elMonedas.innerText = data.nuevoOro;
            }

            // 3. Ejecutamos tus funciones globales de refresco de UI si existen por seguridad
            if (typeof cargarDatosUsuario === "function") cargarDatosUsuario();
            if (typeof actualizarPerfilUI === "function") actualizarPerfilUI();

            // 4. Sincroniza el inventario local de pases
            cargarAlbumLocal(); 
            
            // 5. Refresca la vitrina del mercado al instante
            obtenerOfertasMercado();

        } else {
            alert(data.mensaje);
        }
    } catch (err) {
        console.error(err);
        alert("❌ Ocurrió un problema de red al procesar el fichaje.");
    }
}

// Memoria local temporal para guardar lo que va marcando el jugador
let eleccionesQuiniela = { p1: null, p2: null, p3: null };

// 🔄 NUEVA: Pide los partidos activos al backend y arma el HTML con tus estilos nativos
async function cargarPartidosQuinielaUI() {
    const contenedor = document.getElementById("contenedor-lista-quiniela");
    if (!contenedor) return;

    try {
        const res = await fetch('/api/timba/quiniela/partidos');
        const data = await res.json();

        if (data.ok && data.partidos.length === 3) {
            contenedor.innerHTML = ""; // Limpiamos el loader sutil

            data.partidos.forEach((partido, index) => {
                const numP = index + 1;
                contenedor.innerHTML += `
                    <div style="background: rgba(2, 6, 23, 0.6); padding: 10px; border-radius: 6px; border: 1px solid #334155;">
                        <div style="color: #cbd5e1; font-size: 0.8rem; font-weight: bold; text-align: center; margin-bottom: 6px; letter-spacing: 0.5px;">
                            ${partido.emoji} PARTIDO ${numP}: ${partido.local} vs ${partido.visitante}
                        </div>
                        <div style="display: flex; justify-content: space-around; gap: 6px;">
                            <button type="button" class="btn-quiniela-p${numP}" style="background: #1e293b; color: #fff; padding: 6px 10px; cursor: pointer; font-size: 0.75rem; border-radius: 4px; border: 1px solid #475569; width: 32%; font-weight: bold;" onclick="seleccionarQuiniela(${numP}, 'L', this)">LOCAL</button>
                            <button type="button" class="btn-quiniela-p${numP}" style="background: #1e293b; color: #fff; padding: 6px 10px; cursor: pointer; font-size: 0.75rem; border-radius: 4px; border: 1px solid #475569; width: 32%; font-weight: bold;" onclick="seleccionarQuiniela(${numP}, 'E', this)">EMPATE</button>
                            <button type="button" class="btn-quiniela-p${numP}" style="background: #1e293b; color: #fff; padding: 6px 10px; cursor: pointer; font-size: 0.75rem; border-radius: 4px; border: 1px solid #475569; width: 32%; font-weight: bold;" onclick="seleccionarQuiniela(${numP}, 'V', this)">VISITA</button>
                        </div>
                    </div>
                `;
            });
        }
    } catch (err) {
        console.error("Error cargando quiniela rotativa:", err);
        contenedor.innerHTML = "<p style='color:var(--rojo); text-align:center;'>❌ Error al sincronizar la cartelera.</p>";
    }
}

// Maneja los clicks y pinta el botón seleccionado con color dorado
function seleccionarQuiniela(partido, prediccion, boton) {
    // Apaga el estilo de los otros botones de ese mismo partido
    document.querySelectorAll(`.btn-quiniela-p${partido}`).forEach(btn => {
        btn.style.background = "#1e293b";
        btn.style.color = "#fff";
        btn.style.borderColor = "#475569";
    });

    // Enciende el botón actual con tu mística clásica
    boton.style.background = "var(--dorado, #fbbf24)";
    boton.style.color = "#000";
    boton.style.borderColor = "var(--dorado, #fbbf24)";

    // Guarda la selección en la boleta temporal
    eleccionesQuiniela[`p${partido}`] = prediccion;
}

// Envía la boleta combinada compartiendo los límites de la timba individual
async function enviarBoletaQuiniela() {
    const monto = parseInt(document.getElementById("input-monto-quiniela").value);
    const divRes = document.getElementById("resultado-quiniela");

    // 🛡️ REGLA DE ORO: Validar la energía mirando únicamente el botón nativo
    const btnTimbaComun = document.getElementById("btn-preparar-apuesta"); 

    if (btnTimbaComun && btnTimbaComun.disabled) {
        alert("⚠️ ¡Sin energía! Debés esperar a que se recargue el cronómetro de la Timba para poder jugar otra boleta.");
        return;
    }

    if (!eleccionesQuiniela.p1 || !eleccionesQuiniela.p2 || !eleccionesQuiniela.p3) {
        alert("⚠️ Seleccioná un pronóstico para los 3 partidos vigentes.");
        return;
    }
    if (!monto || monto < 50) {
        alert("⚠️ El monto mínimo es de 🪙50.");
        return;
    }

    divRes.style.color = "#fff";
    divRes.innerText = "⏳ Procesando boleta combinada...";

    try {
        const res = await fetch('/api/timba/quiniela', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id: usuarioActual.id,
                monto: monto,
                elecciones: eleccionesQuiniela
            })
        });
        const data = await res.json();

        if (data.ok) {
            // 1. Sincroniza Oro en el objeto y en el HUD de inmediato
            if (usuarioActual && data.nuevoOro !== undefined) usuarioActual.monedas = data.nuevoOro;
            const elMonedas = document.getElementById("lbl-monedas");
            if (elMonedas && data.nuevoOro !== undefined) elMonedas.innerText = data.nuevoOro;

            // 2. 🔥 IMPACTO VISUAL INMEDIATO DE ENERGÍA NATIVA
            // Forzamos a tu sistema core a re-calcular y dibujar los intentos restantes en pantalla
            if (typeof actualizarTimbasRestantesUI === "function") {
                actualizarTimbasRestantesUI();
            }

            // 3. Render del Desglose de Resultados
            const trad = (sigla) => sigla === 'L' ? 'Local' : (sigla === 'E' ? 'Empate' : 'Visita');
            
            const p1 = data.partidosSimulados[0];
            const p2 = data.partidosSimulados[1];
            const p3 = data.partidosSimulados[2];

            const desglose = `<br><span style="color:#94a3b8; font-size:0.8rem;">
                [${p1.local} vs ${p1.visitante}: ${trad(data.resultadosReales.p1)}]<br>
                [${p2.local} vs ${p2.visitante}: ${trad(data.resultadosReales.p2)}]<br>
                [${p3.local} vs ${p3.visitante}: ${trad(data.resultadosReales.p3)}]
            </span>`;

            if (data.ganó) {
                divRes.style.color = "var(--verde-match, #10b981)";
                divRes.innerHTML = `🎉 ${data.mensaje}${desglose}`;
            } else {
                divRes.style.color = "var(--rojo, #ef4444)";
                divRes.innerHTML = `❌ ${data.mensaje}${desglose}`;
            }

            // 4. Limpieza ordenada del formulario
            document.getElementById("input-monto-quiniela").value = "100";
            eleccionesQuiniela = { p1: null, p2: null, p3: null };
            
            document.querySelectorAll('[class^="btn-quiniela-p"]').forEach(btn => {
                btn.style.background = "#1e293b";
                btn.style.color = "#fff";
                btn.style.borderColor = "#475569";
            });

            // Rotamos cartelera de partidos
            cargarPartidosQuinielaUI();

        } else {
            divRes.style.color = "var(--rojo)";
            divRes.innerText = data.mensaje;
        }
    } catch (err) {
        console.error(err);
        divRes.style.color = "var(--rojo)";
        divRes.innerText = "❌ Error de conexión.";
    }
}
// ✨ Render asigna el puerto dinámicamente; si no encuentra, usa el 3000
const PORT = process.env.PORT || 3000;

// IMPORTANTE: Habilitamos CORS y JSON arriba de todo para que el filtro pueda leer los datos
app.use(cors());
app.use(express.json());

// Genera un código de 6 caracteres únicos para las salas
function generarCodigoSala() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let resultado = '';
    for (let i = 0; i < 6; i++) {
        resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
}

/* ========================================================================
   🛠️ MIDDLEWARE: MODO MANTENIMIENTO / ACCESO SELECTIVO TESTERS
   ======================================================================== */
const MODO_MANTENIMIENTO = true; 
// 👥 Agregá o sacá acá los usuarios permitidos en minúscula para las pruebas
const TESTERS_PERMITIDOS = ["aguspe", "evevea"]; 

app.use((req, res, next) => {
    if (!MODO_MANTENIMIENTO) {
        return next();
    }

    // A. Permitimos descargar los archivos estáticos para que cargue la interfaz visual
    if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html') || req.path.endsWith('.css') || req.path.endsWith('.js') || req.path.endsWith('.png') || req.path.endsWith('.jpg'))) {
        return next();
    }

    // B. Filtro estricto para las rutas de autenticación (Login)
    if (req.path.startsWith('/api/login')) {
        const { username } = req.body;
        
        // Si el usuario está logueado e ingresa un nombre authorized, pasa de largo
        if (username && TESTERS_PERMITIDOS.includes(username.trim().toLowerCase())) {
            return next();
        }
        
        // Si es cualquier otra cuenta, rebota acá antes de tocar Neon
        return res.status(503).json({ 
            error: "🚧 La Arena está en mantenimiento por reformas de infraestructura. ¡Volvé más tarde, pa! 🏗️" 
        });
    }

    // Bloqueamos el registro por completo para que nadie intente crearse cuentas mientras probás
    if (req.path.startsWith('/api/registro')) {
        return res.status(503).json({ 
            error: "🚧 La Arena está en mantenimiento. El registro de nuevas cuentas está cerrado por el momento." 
        });
    }

    // C. Si la petición viene de adentro (APIs internas), dejamos pasar
    next();
});

// RECIÉN ACÁ ABAJO SE CONFIGURA LA CARPETA ESTÁTICA
app.use(express.static(path.join(__dirname)));

/* ========================================================================
   📦 CONFIGURACIÓN, INICIALIZACIÓN Y CARGA DE BASE DE DATOS (NEON)
   ======================================================================== */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Requerido obligatoriamente por Neon
});

// Verificamos la conexión al arrancar el proceso
pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('❌ Error de conexión a Neon:', err.message);
    else console.log('📦 Conectado con éxito a PostgreSQL en Neon.');
});

async function inicializarTablas() {
    try {
        // 1. Tabla de Usuarios (Sincronizada con el MiniMundial)
        await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password TEXT NOT NULL,
            monedas INTEGER DEFAULT 200,
            puntos_ranking INTEGER DEFAULT 0,
            ultimo_tiro_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            tiros_hoy INTEGER DEFAULT 10,
            ip_registro VARCHAR(45) DEFAULT '',
            ultimo_giro_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            timbas_hoy INTEGER DEFAULT 10,
            copas_mundiales INTEGER DEFAULT 0, -- 🔥 Agregado para el MiniMundial
            ultima_timba_mundial TIMESTAMP WITH TIME ZONE DEFAULT NULL -- 🔥 Cooldown de 3hs
        )`);

        // 2. Tabla de Jugadores
        await pool.query(`CREATE TABLE IF NOT EXISTS jugadores (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) UNIQUE NOT NULL,
            pais VARCHAR(50) NOT NULL,
            bandera VARCHAR(10) NOT NULL,
            posicion VARCHAR(50) NOT NULL,
            foto TEXT NOT NULL,
            rareza VARCHAR(20) NOT NULL
        )`);

        // 3. Tabla de Progreso
        await pool.query(`CREATE TABLE IF NOT EXISTS usuario_progreso (
            usuario_id INTEGER REFERENCES usuarios(id),
            jugador_id INTEGER REFERENCES jugadores(id),
            cantidad INTEGER DEFAULT 1,
            PRIMARY KEY (usuario_id, jugador_id)
        )`);

        const checkJugadores = await pool.query("SELECT COUNT(*) as count FROM jugadores");
        if (parseInt(checkJugadores.rows[0].count) === 0) {
            const granListaJugadores = [
                    // --- AUSTRALIA ---
                    ['Aiden O\'Neill', 'Australia', '🇦🇺', 'Mediocampista', 'fotos/aus_oneill.jpg', 'comun'],
                    ['Alessandro Circati', 'Australia', '🇦🇺', 'Defensor', 'fotos/aus_circa.jpg', 'comun'],
                    ['Aziz Behich', 'Australia', '🇦🇺', 'Defensor', 'fotos/aus_behich.jpg', 'rara'],
                    ['Cameron Burgess', 'Australia', '🇦🇺', 'Defensor', 'fotos/aus_burges.jpg', 'comun'],
                    ['Craig Goodwin', 'Australia', '🇦🇺', 'Delantero', 'fotos/aus_goodwin.jpg', 'rara'],
                    ['Harry Souttar', 'Australia', '🇦🇺', 'Defensor', 'fotos/aus_souttar.jpg', 'rara'],
                    ['Jackson Irvine', 'Australia', '🇦🇺', 'Mediocampista', 'fotos/aus_irvine.jpg', 'rara'],
                    ['Jordan Bos', 'Australia', '🇦🇺', 'Defensor', 'fotos/aus_bos.jpg', 'comun'],
                    ['Kusini Yengi', 'Australia', '🇦🇺', 'Delantero', 'fotos/aus_yengi.jpg', 'comun'],
                    ['Lewis Miller', 'Australia', '🇦🇺', 'Defensor', 'fotos/aus_miller.jpg', 'comun'],
                    ['Mathew Ryan', 'Australia', '🇦🇺', 'Arquero', 'fotos/aus_ryan.jpg', 'epica'],
                    ['Milos Degenek', 'Australia', '🇦🇺', 'Defensor', 'fotos/aus_degenek.jpg', 'comun'],
                    ['Nestory Irankunda', 'Australia', '🇦🇺', 'Delantero', 'fotos/aus_irankun.jpg', 'legendaria'],

                    // --- ARGENTINA ---
                    ['Lionel Messi', 'Argentina', '🇦🇷', 'Delantero', 'fotos/arg_messi.jpg', 'legendaria'],
                    ['Emiliano Martínez', 'Argentina', '🇦🇷', 'Arquero', 'fotos/arg_martinez.jpg', 'epica'],
                    ['Rodrigo De Paul', 'Argentina', '🇦🇷', 'Mediocampista', 'fotos/arg_paul.jpg', 'epica'],
                    ['Julián Álvarez', 'Argentina', '🇦🇷', 'Delantero', 'fotos/arg_alvarez.jpg', 'epica'],
                    ['Lautaro Martínez', 'Argentina', '🇦🇷', 'Delantero', 'fotos/arg_martinez-.jpg', 'epica'],
                    ['Alexis Mac Allister', 'Argentina', '🇦🇷', 'Mediocampista', 'fotos/arg_allister.jpg', 'rara'],
                    ['Enzo Fernández', 'Argentina', '🇦🇷', 'Mediocampista', 'fotos/arg_fernandez.jpg', 'rara'],
                    ['Cristian Romero', 'Argentina', '🇦🇷', 'Defensor', 'fotos/arg_romero.jpg', 'epica'],
                    ['Nicolas Gonzalez', 'Argentina', '🇦🇷', 'Delantero', 'fotos/arg_gonzalez.jpg', 'comun'],
                    ['Franco Mastantuono', 'Argentina', '🇦🇷', 'Delantero', 'fotos/arg_mastantuono.jpg', 'rara'],
                    ['Exequiel Palacios', 'Argentina', '🇦🇷', 'Mediocampista', 'fotos/arg_palacios.jpg', 'comun'],
                    ['Leandro Paredes', 'Argentina', '🇦🇷', 'Mediocampista', 'fotos/arg_paredes.jpg', 'rara'],
                    ['Nico Paz', 'Argentina', '🇦🇷', 'Mediocampista', 'fotos/arg_paz.jpg', 'rara'],
                    ['Giuliano Simeone', 'Argentina', '🇦🇷', 'Delantero', 'fotos/arg_simeone.jpg', 'comun'],
                    
                    // --- BOSNIA Y HERZEGOVINA ---
                    ['Samed Baždar', 'Bosnia y Herzegovina', '🇧🇦', 'Delantero', 'fotos/bos_bazdar.jpg', 'comun'],
                    ['Benjamin Tahirović', 'Bosnia y Herzegovina', '🇧🇦', 'Mediocampista', 'fotos/bos_tahirovic.jpg', 'rara'],
                    ['Edin Džeko', 'Bosnia y Herzegovina', '🇧🇦', 'Delantero', 'fotos/bos_dzeko.jpg', 'epica'],
                    ['Amir Hadžiahmetović', 'Bosnia y Herzegovina', '🇧🇦', 'Mediocampista', 'fotos/bos_hadziahmetovic.jpg', 'comun'],
                    ['Ivan Bašić', 'Bosnia y Herzegovina', '🇧🇦', 'Mediocampista', 'fotos/bos_basic.jpg', 'comun'],
                    ['Sead Kolašinac', 'Bosnia y Herzegovina', '🇧🇦', 'Defensor', 'fotos/bos_kolasinac.jpg', 'rara'],
                    ['Amar Memić', 'Bosnia y Herzegovina', '🇧🇦', 'Mediocampista', 'fotos/bos_memic.jpg', 'comun'],
                    ['Tarik Muharemovic', 'Bosnia y Herzegovina', '🇧🇦', 'Defensor', 'fotos/bos_muharemovic.jpg', 'comun'],
                    ['Nihad Mujakić', 'Bosnia y Herzegovina', '🇧🇦', 'Defensor', 'fotos/bos_mujakic.jpg', 'comun'],
                    ['Ivan Šunjić', 'Bosnia y Herzegovina', '🇧🇦', 'Mediocampista', 'fotos/bos_sunjic.jpg', 'comun'],
                    ['Haris Tabaković', 'Bosnia y Herzegovina', '🇧🇦', 'Delantero', 'fotos/bos_tabakovic.jpg', 'comun'],
                    ['Nikola Vasilj', 'Bosnia y Herzegovina', '🇧🇦', 'Arquero', 'fotos/bos_vasilj.jpg', 'comun'],
                    
                    // --- BÉLGICA ---
                    ['Kevin de Bruyne', 'Bélgica', 'bel', 'Mediocampista', 'fotos/bel_bruyne.jpg', 'legendaria'],
                    ['Timothy Castagne', 'Bélgica', 'bel', 'Defensor', 'fotos/bel_castagne.jpg', 'rara'],
                    ['Maxim de Cuyper', 'Bélgica', 'bel', 'Mediocampista', 'fotos/bel_cuyper.jpg', 'comun'],
                    ['Zeno Debast', 'Bélgica', 'bel', 'Defensor', 'fotos/bel_debast.jpg', 'rara'],
                    ['Jeremy Doku', 'Bélgica', 'bel', 'Delantero', 'fotos/bel_doku.jpg', 'epica'],
                    ['Romelu Lukaku', 'Bélgica', 'bel', 'Delantero', 'fotos/bel_lukaku.jpg', 'legendaria'],
                    ['Brandon Mechele', 'Bélgica', 'bel', 'Defensor', 'fotos/bel_mechele.jpg', 'comun'],
                    ['Thomas Meunier', 'Bélgica', 'bel', 'Defensor', 'fotos/bel_meunier.jpg', 'rara'],
                    ['Amadou Onana', 'Bélgica', 'bel', 'Arquero', 'fotos/bel_onana.jpg', 'epica'],
                    ['Lois Openda', 'Bélgica', 'bel', 'Delantero', 'fotos/bel_openda.jpg', 'epica'],
                    ['Nicolas Raskin', 'Bélgica', 'bel', 'Mediocampista', 'fotos/bel_raskin.jpg', 'comun'],
                    ['Alexis Saelemaekers', 'Bélgica', 'bel', 'Delantero', 'fotos/bel_saelemaekers.jpg', 'rara'],
                    ['Arthur Theate', 'Bélgica', 'bel', 'Defensor', 'fotos/bel_theate.jpg', 'rara'],
                    ['Youri Tielemans', 'Bélgica', 'bel', 'Mediocampista', 'fotos/bel_tielemans.jpg', 'epica'],
                    ['Hans Vanaken', 'Bélgica', 'bel', 'Mediocampista', 'fotos/bel_vanaken.jpg', 'comun'],

                    // --- CHEQUIA ---
                    ['Vaclav Cerny', 'Chequia', 'che', 'Delantero', 'fotos/che_cerny.jpg', 'rara'],
                    ['Lukas Cerv', 'Chequia', 'che', 'Mediocampista', 'fotos/che_cerv.jpg', 'comun'],
                    ['Tomas Chory', 'Chequia', 'che', 'Delantero', 'fotos/che_chory.jpg', 'comun'],
                    ['Adam Hlozek', 'Chequia', 'che', 'Delantero', 'fotos/che_hlozek.jpg', 'epica'],
                    ['Tomas Holes', 'Chequia', 'che', 'Mediocampista', 'fotos/che_holes.jpg', 'rara'],
                    ['Matej Kovar', 'Chequia', 'che', 'Arquero', 'fotos/che_kovar.jpg', 'rara'],
                    ['Ladislav Krejci', 'Chequia', 'che', 'Defensor', 'fotos/che_krejci.jpg', 'epica'],
                    ['Lukas Provod', 'Chequia', 'che', 'Mediocampista', 'fotos/che_provod.jpg', 'rara'],
                    ['Michal Sadilek', 'Chequia', 'che', 'Mediocampista', 'fotos/che_sadilek.jpg', 'rara'],
                    ['Patrik Schick', 'Chequia', 'che', 'Delantero', 'fotos/che_schick.jpg', 'legendaria'],
                    ['Jindrich Stanek', 'Chequia', 'che', 'Arquero', 'fotos/che_stanek.jpg', 'comun'],
                    ['Pavel Sulc', 'Chequia', 'che', 'Mediocampista', 'fotos/che_sulc.jpg', 'comun'],
                    ['Matej Vydra', 'Chequia', 'che', 'Delantero', 'fotos/che_vydra.jpg', 'comun'],
                    ['Jaroslav Zeleny', 'Chequia', 'che', 'Defensor', 'fotos/che_zeleny.jpg', 'comun'],
                    ['David Zima', 'Chequia', 'che', 'Defensor', 'fotos/che_zima.jpg', 'rara'],

                    // --- COSTA DE MARFIL ---
                    ['Simon Adingra', 'Costa de Marfil', 'cm', 'Delantero', 'fotos/cm_adingra.jpg', 'rara'],
                    ['Emmanuel Agbadou', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_agbadou.jpg', 'comun'],
                    ['Willy Boly', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_boly.jpg', 'rara'],
                    ['Amad Diallo', 'Costa de Marfil', 'cm', 'Delantero', 'fotos/cm_diallo.jpg', 'epica'],
                    ['Yan Diomande', 'Costa de Marfil', 'cm', 'Delantero', 'fotos/cm_diomande.jpg', 'epica'],
                    ['Ousmane Diomande', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_diomande--.jpg', 'epica'],
                    ['Yahia Fofana', 'Costa de Marfil', 'cm', 'Arquero', 'fotos/cm_fofana.jpg', 'epica'],
                    ['Seko Fofana', 'Costa de Marfil', 'cm', 'Mediocampista', 'fotos/cm_fofana-.jpg', ''],
                    ['Sébastien Haller', 'Costa de Marfil', 'cm', 'Delantero', 'fotos/cm_haller.jpg', 'legendaria'],
                    ['Ghislain Konan', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_konan.jpg', 'comun'],
                    ['Odilon Kossounou', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_kossounou.jpg', 'rara'],
                    ['Evan Ndicka', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_ndicka.jpg', 'epica'],
                    ['Wilfried Singo', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_singo.jpg', 'rara'],

                    // --- COLOMBIA ---
                    ['Jhon Arias', 'Colombia', 'col', 'Defensor', 'fotos/col_arias.jpg', 'epica'],
                    ['Santiago Arias', 'Colombia', 'col', 'Defensor', 'fotos/col_arias-.jpg', ''],
                    ['Jorge Carrascal', 'Colombia', 'col', 'Mediocampista', 'fotos/col_carrascal.jpg', 'rara'],
                    ['Kevin Castaño', 'Colombia', 'col', 'Mediocampista', 'fotos/col_castaño.jpg', 'comun'],
                    ['Jhon Córdoba', 'Colombia', 'col', 'Delantero', 'fotos/col_cordoba.jpg', 'rara'],
                    ['Luis Díaz', 'Colombia', 'col', 'Delantero', 'fotos/col_diaz.jpg', 'legendaria'],
                    ['Jefferson Lerma', 'Colombia', 'col', 'Mediocampista', 'fotos/col_lerma.jpg', 'epica'],
                    ['Daniel Muñoz', 'Colombia', 'col', 'Defensor', 'fotos/col_muñoz.jpg', 'epica'],
                    ['David Ospina', 'Colombia', 'col', 'Arquero', 'fotos/col_ospina.jpg', 'rara'],
                    ['Juan Fernando Quintero', 'Colombia', 'col', 'Mediocampista', 'fotos/col_quintero.jpg', 'epica'],
                    ['Richard Ríos', 'Colombia', 'col', 'Mediocampista', 'fotos/col_rios.jpg', 'epica'],
                    ['James Rodríguez', 'Colombia', 'col', 'Mediocampista', 'fotos/col_rodriguez.jpg', 'legendaria'],
                    ['Jhon Durán', 'Colombia', 'col', 'Delantero', 'fotos/col_suarez.jpg', 'epica'],
                    ['Camilo Vargas', 'Colombia', 'col', 'Arquero', 'fotos/col_vargas.jpg', 'epica'],

                    // --- ECUADOR ---
                    ['Nilson Angulo', 'Ecuador', 'ecu', 'Delantero', 'fotos/ecu_angulo.jpg', 'comun'],
                    ['Moises Caicedo', 'Ecuador', 'ecu', 'Mediocampista', 'fotos/ecu_caicedo.jpg', 'legendaria'],
                    ['Leonardo Campana', 'Ecuador', 'ecu', 'Delantero', 'fotos/ecu_campana.jpg', 'rara'],
                    ['Alan Franco', 'Ecuador', 'ecu', 'Mediocampista', 'fotos/ecu_franco.jpg', 'rara'],
                    ['Hernán Galíndez', 'Ecuador', 'ecu', 'Arquero', 'fotos/ecu_galindez.jpg', 'epica'],
                    ['Alan Minda', 'Ecuador', 'ecu', 'Delantero', 'fotos/ecu_minda.jpg', 'rara'],
                    ['Joel Ordóñez', 'Ecuador', 'ecu', 'Defensor', 'fotos/ecu_ordoñez.jpg', 'rara'],
                    ['Kendry Páez', 'Ecuador', 'ecu', 'Mediocampista', 'fotos/ecu_paez.jpg', 'epica'],
                    ['Gonzalo Plata', 'Ecuador', 'ecu', 'Delantero', 'fotos/ecu_plata.jpg', 'epica'],
                    ['Kevin Rodríguez', 'Ecuador', 'ecu', 'Delantero', 'fotos/ecu_rodriguez.jpg', 'comun'],
                    ['Enner Valencia', 'Ecuador', 'ecu', 'Delantero', 'fotos/ecu_valencia.jpg', 'legendaria'],
                    ['Gonzalo Valle', 'Ecuador', 'ecu', 'Arquero', 'fotos/ecu_valle.jpg', 'comun'],
                    ['Pedro Vite', 'Ecuador', 'ecu', 'Mediocampista', 'fotos/ecu_vite.jpg', 'rara'],
                    ['John Yeboah', 'Ecuador', 'ecu', 'Delantero', 'fotos/ecu_yeboah.jpg', 'rara'],

                    // --- ESPAÑA ---
                    ['Dani Carvajal', 'España', 'esp', 'Defensor', 'fotos/esp_carvajal.jpg', 'legendaria'],
                    ['Marc Cucurella', 'España', 'esp', 'Defensor', 'fotos/esp_cucurella.jpg', 'epica'],
                    ['Mikel Merino', 'España', 'esp', 'Mediocampista', 'fotos/esp_merino.jpg', 'rara'],
                    ['Álvaro Morata', 'España', 'esp', 'Delantero', 'fotos/esp_morata.jpg', 'rara'],
                    ['Dani Olmo', 'España', 'esp', 'Mediocampista', 'fotos/esp_olmo.jpg', 'epica'],
                    ['Mikel Oyarzabal', 'España', 'esp', 'Delantero', 'fotos/esp_oyarzabal.jpg', 'rara'],
                    ['Pedri', 'España', 'esp', 'Mediocampista', 'fotos/esp_pedri.jpg', 'epica'],
                    ['Rodri', 'España', 'esp', 'Mediocampista', 'fotos/esp_rodri.jpg', 'legendaria'],
                    ['Fabian Ruiz', 'España', 'esp', 'Mediocampista', 'fotos/esp_ruiz.jpg', 'epica'],
                    ['Unai Simón', 'España', 'esp', 'Arquero', 'fotos/esp_simon.jpg', 'epica'],
                    ['Ferran Torres', 'España', 'esp', 'Delantero', 'fotos/esp_torres.jpg', 'rara'],
                    ['Nico Williams', 'España', 'esp', 'Delantero', 'fotos/esp_williams.jpg', 'legendaria'],
                    ['Lamine Yamal', 'España', 'esp', 'Delantero', 'fotos/esp_yamal.jpg', 'legendaria'],
                    ['Martin Zubimendi', 'España', 'esp', 'Mediocampista', 'fotos/esp_zubimendi.jpg', 'rara'],
                    
                    // --- FRANCIA ---
                    ['Bradley Barcola', 'Francia', 'fra', 'Delantero', 'fotos/fra_barcola.jpg', 'epica'],
                    ['Eduardo Camavinga', 'Francia', 'fra', 'Mediocampista', 'fotos/fra_camavinga.jpg', 'epica'],
                    ['Kingsley Coman', 'Francia', 'fra', 'Delantero', 'fotos/fra_coman.jpg', 'rara'],
                    ['Ousmane Dembélé', 'Francia', 'fra', 'Delantero', 'fotos/fra_dembele.jpg', 'legendaria'],
                    ['Lucas Digne', 'Francia', 'fra', 'Defensor', 'fotos/fra_digne.jpg', 'rara'],
                    ['Desiré Doué', 'Francia', 'fra', 'Mediocampista', 'fotos/fra_doue.jpg', 'rara'],
                    ['Hugo Ekitike', 'Francia', 'fra', 'Delantero', 'fotos/fra_ekitike.jpg', 'rara'],
                    ['Manu Koné', 'Francia', 'fra', 'Mediocampista', 'fotos/fra_kone.jpg', 'comun'],
                    ['Mike Maignan', 'Francia', 'fra', 'Arquero', 'fotos/fra_maignan.jpg', 'epica'],
                    ['Kylian Mbappé', 'Francia', 'fra', 'Delantero', 'fotos/fra_mbappe.jpg', 'legendaria'],
                    ['Michael Olise', 'Francia', 'fra', 'Delantero', 'fotos/fra_olise.jpg', 'epica'],
                    ['Adrien Rabiot', 'Francia', 'fra', 'Mediocampista', 'fotos/fra_rabiot.jpg', 'rara'],
                    ['Aurélien Tchouaméni', 'Francia', 'fra', 'Mediocampista', 'fotos/fra_tchuamani.jpg', 'epica'],
                    ['Dayot Upamecano', 'Francia', 'fra', 'Defensor', 'fotos/fra_upamecano.jpg', 'rara'],

                    // --- INGLATERRA ---
                    ['Jude Bellingham', 'Inglaterra', 'ing', 'Mediocampista', 'fotos/ing_bellingham.jpg', 'legendaria'],
                    ['Dan Burn', 'Inglaterra', 'ing', 'Defensor', 'fotos/ing_burn.jpg', 'rara'],
                    ['Phil Foden', 'Inglaterra', 'ing', 'Delantero', 'fotos/ing_foden.jpg', 'legendaria'],
                    ['Anthony Gordon', 'Inglaterra', 'ing', 'Delantero', 'fotos/ing_gordon.jpg', 'rara'],
                    ['Marc Guéhi', 'Inglaterra', 'ing', 'Defensor', 'fotos/ing_guehi.jpg', 'epica'],
                    ['Dean Henderson', 'Inglaterra', 'ing', 'Arquero', 'fotos/ing_henderson.jpg', 'rara'],
                    ['Harry Kane', 'Inglaterra', 'ing', 'Delantero', 'fotos/ing_kane.jpg', 'legendaria'],
                    ['Cole Palmer', 'Inglaterra', 'ing', 'Mediocampista', 'fotos/ing_palmer.jpg', 'legendaria'],
                    ['Jordan Pickford', 'Inglaterra', 'ing', 'Arquero', 'fotos/ing_pickford.jpg', 'epica'],
                    ['Marcus Rashford', 'Inglaterra', 'ing', 'Delantero', 'fotos/ing_rashford.jpg', 'epica'],
                    ['Declan Rice', 'Inglaterra', 'ing', 'Mediocampista', 'fotos/ing_rice.jpg', 'epica'],
                    ['Morgan Rogers', 'Inglaterra', 'ing', 'Mediocampista', 'fotos/ing_rogers.jpg', 'comun'],
                    ['Bukayo Saka', 'Inglaterra', 'ing', 'Delantero', 'fotos/ing_saka.jpg', 'legendaria'],
                    ['John Stones', 'Inglaterra', 'ing', 'Defensor', 'fotos/ing_stones.jpg', 'epica'],
                    ['Ollie Watkins', 'Inglaterra', 'ing', 'Delantero', 'fotos/ing_watkins.jpg', 'epica'],

                    // --- MEXICO ---
                    ['Luis Malagon', 'México', '🇲🇽', 'Arquero', 'fotos/mex_malagon.jpg', 'rara'],
                    ['Edson Álvarez', 'México', '🇲🇽', 'Mediocampista', 'fotos/mex_alvarez.jpg', 'epica'],
                    ['Chucky Lozano', 'México', '🇲🇽', 'Delantero', 'fotos/mex_lozano.jpg', 'rara'],
                    ['César Montes', 'México', '🇲🇽', 'Defensor', 'fotos/mex_montes.jpg', 'comun'],
                    ['Carlos Rodriguez', 'México', '🇲🇽', 'Mediocampista', 'fotos/mex_rodriguez.jpg', 'comun'],
                    ['Diego Lainez', 'México', '🇲🇽', 'Mediocampista', 'fotos/mex_lainez.jpg', 'comun'],
                    ['Erick Sanchez', 'México', '🇲🇽', 'Mediocampista', 'fotos/mex_sanchez.jpg', 'comun'],
                    ['Israel Reyes', 'México', '🇲🇽', 'Mediocampista', 'fotos/mex_reyes.jpg', 'comun'],
                    ['Jesus Gallardo', 'México', '🇲🇽', 'Delantero', 'fotos/mex_gallardo.jpg', 'comun'],
                    ['Marcelo Ruiz', 'México', '🇲🇽', 'Mediocampista', 'fotos/mex_ruiz.jpg', 'comun'],
                    ['Santiago Gimenez', 'México', '🇲🇽', 'Delantero', 'fotos/mex_gimenez.jpg', 'epica'],
                    ['Raul Jimenez', 'México', '🇲🇽', 'Delantero', 'fotos/mex_jimenez.jpg', 'rara'],
                    ['Johan Vasquez', 'México', '🇲🇽', 'Delantero', 'fotos/mex_vasquez.jpg', 'comun'],
                    ['Jorge Sanchez', 'México', '🇲🇽', 'Delantero', 'fotos/mex_sanchez1.jpg', 'comun'],
                    ['Orbelin Pineda', 'México', '🇲🇽', 'Delantero', 'fotos/mex_pineda.jpg', 'comun'],

                    // --- JAPÓN ---
                    ['Junya Ito', 'Japón', 'jap', 'Delantero', 'fotos/jap_ito.jpg', 'epica'],
                    ['Daichi Kamada', 'Japón', 'jap', 'Mediocampista', 'fotos/jap_kamada.jpg', 'epica'],
                    ['Takefusa Kubo', 'Japón', 'jap', 'Delantero', 'fotos/jap_kubo.jpg', 'legendaria'],
                    ['Shuto Machino', 'Japón', 'jap', 'Delantero', 'fotos/jap_machino.jpg', 'comun'],
                    ['Takumi Minamino', 'Japón', 'jap', 'Mediocampista', 'fotos/jap_minamino.jpg', 'epica'],
                    ['Keito Nakamura', 'Japón', 'jap', 'Delantero', 'fotos/jap_nakamura.jpg', 'rara'],
                    ['Kaishu Sano', 'Japón', 'jap', 'Mediocampista', 'fotos/jap_sano.jpg', 'comun'],
                    ['Yuki Soma', 'Japón', 'jap', 'Delantero', 'fotos/jap_soma.jpg', 'comun'],
                    ['Zion Suzuki', 'Japón', 'jap', 'Arquero', 'fotos/jap_suzuki.jpg', 'rara'],
                    ['Ao Tanaka', 'Japón', 'jap', 'Mediocampista', 'fotos/jap_tanaka.jpg', 'rara'],
                    ['Shogo Taniguchi', 'Japón', 'jap', 'Defensor', 'fotos/jap_taniguchi.jpg', 'rara'],
                    ['Ayase Ueda', 'Japón', 'jap', 'Delantero', 'fotos/jap_ueda.jpg', 'epica'],
                    ['Kota Watanabe', 'Japón', 'jap', 'Mediocampista', 'fotos/jap_watanabe.jpg', 'comun'],

                    // --- NORUEGA ---
                    ['Kristoffer Ajer', 'Noruega', 'nor', 'Defensor', 'fotos/nor_ajer.jpg', 'rara'],
                    ['', 'Noruega', 'nor', '', 'fotos/nor_ajer-.jpg', ''],
                    ['Patrick Berg', 'Noruega', 'nor', 'Mediocampista', 'fotos/nor_berg.jpg', 'comun'],
                    ['Sander Berge', 'Noruega', 'nor', 'Mediocampista', 'fotos/nor_berge.jpg', 'rara'],
                    ['Oscar Bobb', 'Noruega', 'nor', 'Delantero', 'fotos/nor_bobb.jpg', 'epica'],
                    ['Aron Dønnum', 'Noruega', 'nor', 'Delantero', 'fotos/nor_donnum.jpg', 'comun'],
                    ['Erling Haaland', 'Noruega', 'nor', 'Delantero', 'fotos/nor_haaland.jpg', 'legendaria'],
                    ['Torbiørn Heggem', 'Noruega', 'nor', 'Defensor', 'fotos/nor_heggem.jpg', 'comun'],
                    ['Jørgen Strand Larsen', 'Noruega', 'nor', 'Delantero', 'fotos/nor_larsen.jpg', 'rara'],
                    ['Antonio Nusa', 'Noruega', 'nor', 'Delantero', 'fotos/nor_nusa.jpg', 'epica'],
                    ['Martin Ødegaard', 'Noruega', 'nor', 'Mediocampista', 'fotos/nor_odegaard.jpg', 'legendaria'],
                    ['Leo Østigård', 'Noruega', 'nor', 'Defensor', 'fotos/nor_ostigard.jpg', 'rara'],
                    ['Andreas Schjelderup', 'Noruega', 'nor', 'Delantero', 'fotos/nor_schjelderup.jpg', 'rara'],
                    ['Morten Thorsby', 'Noruega', 'nor', 'Mediocampista', 'fotos/nor_thorsby.jpg', 'rara'],
                    ['David Møller Wolfe', 'Noruega', 'nor', 'Defensor', 'fotos/nor_wolfe.jpg', 'comun'],

                    // --- PAÍSES BAJOS ---
                    ['Memphis Depay', 'Países Bajos', 'pai', 'Delantero', 'fotos/pai_depay.jpg', 'epica'],
                    ['Virgil van Dijk', 'Países Bajos', 'pai', 'Defensor', 'fotos/pai_dijk.jpg', 'legendaria'],
                    ['Denzel Dumfries', 'Países Bajos', 'pai', 'Defensor', 'fotos/pai_dumfries.jpg', 'epica'],
                    ['Ryan Gravenberch', 'Países Bajos', 'pai', 'Mediocampista', 'fotos/pai_gravenberch.jpg', 'rara'],
                    ['Jan Paul van Hecke', 'Países Bajos', 'pai', 'Defensor', 'fotos/pai_hecke.jpg', 'comun'],
                    ['Frenkie de Jong', 'Países Bajos', 'pai', 'Mediocampista', 'fotos/pai_jong.jpg', 'legendaria'],
                    ['Justin Kluivert', 'Países Bajos', 'pai', 'Delantero', 'fotos/pai_kluivert.jpg', 'rara'],
                    ['Teun Koopmeiners', 'Países Bajos', 'pai', 'Mediocampista', 'fotos/pai_koopmeiners.jpg', 'epica'],
                    ['Donyell Malen', 'Países Bajos', 'pai', 'Delantero', 'fotos/pai_malen.jpg', 'rara'],
                    ['Tijjani Reijnders', 'Países Bajos', 'pai', 'Mediocampista', 'fotos/pai_reijnders.jpg', 'epica'],
                    ['Xavi Simons', 'Países Bajos', 'pai', 'Mediocampista', 'fotos/pai_simons.jpg', 'legendaria'],
                    ['Micky van de Ven', 'Países Bajos', 'pai', 'Defensor', 'fotos/pai_ven.jpg', 'epica'],
                    ['Bart Verbruggen', 'Países Bajos', 'pai', 'Arquero', 'fotos/pai_verbruggen.jpg', 'epica'],
                    ['Wout Weghorst', 'Países Bajos', 'pai', 'Delantero', 'fotos/pai_weghorst.jpg', 'rara'],

                    // --- PORTUGAL ---
                    ['João Cancelo', 'Portugal', 'por', 'Defensor', 'fotos/por_cancelo.jpg', 'epica'],
                    ['Diogo Costa', 'Portugal', 'por', 'Arquero', 'fotos/por_costa.jpg', 'epica'],
                    ['Diogo Dalot', 'Portugal', 'por', 'Defensor', 'fotos/por_dalot.jpg', 'rara'],
                    ['Rúben Dias', 'Portugal', 'por', 'Defensor', 'fotos/por_dias.jpg', 'legendaria'],
                    ['João Félix', 'Portugal', 'por', 'Delantero', 'fotos/por_felix.jpg', 'rara'],
                    ['Bruno Fernandes', 'Portugal', 'por', 'Mediocampista', 'fotos/por_fernandes.jpg', 'legendaria'],
                    ['Gonçalo Inácio', 'Portugal', 'por', 'Defensor', 'fotos/por_inacio.jpg', 'rara'],
                    ['Nuno Mendes', 'Portugal', 'por', 'Defensor', 'fotos/por_mendes.jpg', 'epica'],
                    ['Rúben Neves', 'Portugal', 'por', 'Mediocampista', 'fotos/por_neves-.jpg', 'rara'],
                    ['Joao Neves', 'Portugal', 'por', 'Mediocampista', 'fotos/por_neves.jpg', 'epica'],
                    ['Cristiano Ronaldo', 'Portugal', 'por', 'Delantero', 'fotos/por_ronaldo.jpg', 'legendaria'],
                    ['Bernardo Silva', 'Portugal', 'por', 'Mediocampista', 'fotos/por_silva.jpg', 'legendaria'],
                    ['Trincão', 'Portugal', 'por', 'Delantero', 'fotos/por_trincao.jpg', 'comun'],
                    ['Vitinha', 'Portugal', 'por', 'Mediocampista', 'fotos/por_vitinha.jpg', 'epica'],

                    // --- ESTADOS UNIDOS ---
                    ['Brenden Aaronson', 'Estados Unidos', '🇺🇸', 'Mediocampista', 'fotos/usa_aaronson.jpg', 'comun'],
                    ['Tyler Adams', 'Estados Unidos', '🇺🇸', 'Mediocampista', 'fotos/usa_adams.jpg', 'rara'],
                    ['Cristian Roldan', 'Estados Unidos', '🇺🇸', 'Mediocampista', 'fotos/usa_roldan.jpg', 'comun'],
                    ['Diego Luna', 'Estados Unidos', '🇺🇸', 'Mediocampista', 'fotos/usa_luna.jpg', 'rara'],
                    ['Folarin Balogun', 'Estados Unidos', '🇺🇸', 'Delantero', 'fotos/usa_balogun.jpg', 'rara'],
                    ['Alejandro Zendejas', 'Estados Unidos', '🇺🇸', 'Delantero', 'fotos/usa_freeman.jpg', 'comun'],
                    ['Matt Freese', 'Estados Unidos', '🇺🇸', 'Arquero', 'fotos/usa_freese.jpg', 'comun'],  
                    ['Weston McKennie', 'Estados Unidos', '🇺🇸', 'Mediocampista', 'fotos/usa_mckennie.jpg', 'rara'],
                    ['Mark McKenzie', 'Estados Unidos', '🇺🇸', 'Defensor', 'fotos/usa_mckenzie.jpg', 'comun'],
                    ['Ricardo Pepi', 'Estados Unidos', '🇺🇸', 'Delantero', 'fotos/usa_pepi.jpg', 'comun'],
                    ['Christian Pulisic', 'Estados Unidos', '🇺🇸', 'Delantero', 'fotos/usa_pulisic.jpg', 'epica'],
                    ['Chris Richards', 'Estados Unidos', '🇺🇸', 'Defensor', 'fotos/usa_richards.jpg', 'comun'],
                    ['Antonee Robinson', 'Estados Unidos', '🇺🇸', 'Defensor', 'fotos/usa_robinson.jpg', 'comun'],
                    ['Tanner Tessmann', 'Estados Unidos', '🇺🇸', 'Mediocampista', 'fotos/usa_tessmann.jpg', 'comun'],
                    ['Tim Weah', 'Estados Unidos', '🇺🇸', 'Delantero', 'fotos/usa_weah.jpg', 'comun'],

                    // --- CATAR ---
                    ['Ahmed Alaaeldin', 'Catar', 'qat', 'Delantero', 'fotos/qat_ahmed.jpg', 'comun'],
                    ['Sultan Al-Brake', 'Catar', 'qat', 'Defensor', 'fotos/qat_albrake.jpg', 'comun'],
                    ['Almoez Ali', 'Catar', 'qat', 'Delantero', 'fotos/qat_ali.jpg', 'legendaria'],
                    ['Karim Boudiaf', 'Catar', 'qat', 'Mediocampista', 'fotos/qat_boudiaf.jpg', 'rara'],
                    ['Homam Ahmed', 'Catar', 'qat', 'Defensor', 'fotos/qat_ganehi.jpg', 'comun'],
                    ['Abdulaziz Hatem', 'Catar', 'qat', 'Mediocampista', 'fotos/qat_hatem.jpg', 'rara'],
                    ['Hassan Al-Haydos', 'Catar', 'qat', 'Delantero', 'fotos/qat_haydos.jpg', 'epica'],
                    ['Boualem Khoukhi', 'Catar', 'qat', 'Defensor', 'fotos/qat_khoukhi.jpg', 'epica'],
                    ['Assim Madibo', 'Catar', 'qat', 'Mediocampista', 'fotos/qat_madibo.jpg', 'comun'],
                    ['Lucas Mendes', 'Catar', 'qat', 'Defensor', 'fotos/qat_mendes.jpg', 'rara'],
                    ['Pedro Miguel', 'Catar', 'qat', 'Defensor', 'fotos/qat_miguel.jpg', 'rara'],
                    ['Tarek Salman', 'Catar', 'qat', 'Defensor', 'fotos/qat_salman.jpg', 'comun'],
                    ['Mohammed Waad', 'Catar', 'qat', 'Mediocampista', 'fotos/qat_waad.jpg', 'rara'],
                    
                    // --- CANADÁ ---
                    ['Alphonso Davies', 'Canadá', '🇨🇦', 'Defensor', 'fotos/can_davies.jpg', 'epica'],
                    ['Samuel Adekugbe', 'Canadá', '🇨🇦', 'Defensor', 'fotos/can_adekugbe.jpg', 'comun'],
                    ['Moise Bombito', 'Canadá', '🇨🇦', 'Defensor', 'fotos/can_bombito.jpg', 'rara'],
                    ['Tajon Buchanan', 'Canadá', '🇨🇦', 'Mediocampista', 'fotos/can_buchanan.jpg', 'rara'],
                    ['Mathieu Choiniere', 'Canadá', '🇨🇦', 'Mediocampista', 'fotos/can_choiniere.jpg', 'comun'],
                    ['Derek Cornelius', 'Canadá', '🇨🇦', 'Defensor', 'fotos/can_cornelius.jpg', 'comun'],
                    ['Cyle Larin', 'Canadá', '🇨🇦', 'Delantero', 'fotos/can_larin.jpg', 'comun'],
                    ['Jonathan David', 'Canadá', '🇨🇦', 'Delantero', 'fotos/can_david.jpg', 'rara'],
                    ['Dayne St. Clair', 'Canadá', '🇨🇦', 'Arquero', 'fotos/can_clair.jpg', 'comun'],
                    ['Stephen Eustaquio', 'Canadá', '🇨🇦', 'Mediocampista', 'fotos/can_eustaquio.jpg', 'rara'],
                    ['Ismael Kone', 'Canadá', '🇨🇦', 'Mediocampista', 'fotos/can_kone.jpg', 'comun'],
                    ['Liam Millar', 'Canadá', '🇨🇦', 'Delantero', 'fotos/can_millar.jpg', 'comun'],
                    ['Kamal Miller', 'Canadá', '🇨🇦', 'Defensor', 'fotos/can_miller.jpg', 'comun'],
                    ['Jonathan Osorio', 'Canadá', '🇨🇦', 'Mediocampista', 'fotos/can_osorio.jpg', 'comun'],

                    // --- BRASIL ---
                    ['Alisson Becker', 'Brasil', '🇧🇷', 'Arquero', 'fotos/bra_becker.jpg', 'epica'],
                    ['Gleison Bremer', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_bremer.jpg', 'rara'],
                    ['Casemiro', 'Brasil', '🇧🇷', 'Mediocampista', 'fotos/bra_casemiro.jpg', 'epica'],
                    ['Matheus Cunha', 'Brasil', '🇧🇷', 'Delantero', 'fotos/bra_cunha.jpg', 'comun'],
                    ['Danilo', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_danilo.jpg', 'comun'],
                    ['Danilo', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_danilo-.jpg', 'comun'],
                    ['Endrick', 'Brasil', '🇧🇷', 'Delantero', 'fotos/bra_endrick.jpg', 'rara'],
                    ['Fabinho', 'Brasil', '🇧🇷', 'Mediocampista', 'fotos/bra_fabinho.jpg', 'comun'],
                    ['Bruno Guimarães', 'Brasil', '🇧🇷', 'Mediocampista', 'fotos/bra_guimaraes.jpg', 'rara'],
                    ['Henrique', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_henriqe.jpg', 'comun'],
                    ['Roger Ibáñez', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_ibañez.jpg', 'comun'],
                    ['Gabriel Magalhães', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_magalhaes.jpg', 'rara'],
                    ['Marquinhos', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_marquinhos.jpg', 'epica'],
                    ['Gabriel Martinelli', 'Brasil', '🇧🇷', 'Delantero', 'fotos/bra_martinelli.jpg', 'rara'],
                    ['Ederson Moraes', 'Brasil', '🇧🇷', 'Arquero', 'fotos/bra_moraes.jpg', 'rara'],
                    ['Neymar Jr', 'Brasil', '🇧🇷', 'Delantero', 'fotos/bra_neymar.jpg', 'legendaria'],
                    ['Lucas Paquetá', 'Brasil', '🇧🇷', 'Mediocampista', 'fotos/bra_paqueta.jpg', 'rara'],
                    ['Andreas Pereira', 'Brasil', '🇧🇷', 'Mediocampista', 'fotos/bra_pereira.jpg', 'comun'],
                    ['Raphinha', 'Brasil', '🇧🇷', 'Delantero', 'fotos/bra_raphinha.jpg', 'epica'],
                    ['Rayan', 'Brasil', '🇧🇷', 'Delantero', 'fotos/bra_rayan.jpg', 'comun'],
                    ['Alex Sandro', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_sandro.jpg', 'comun'],
                    ['Santos', 'Brasil', '🇧🇷', 'Arquero', 'fotos/bra_santos.jpg', 'comun'],
                    ['Igor Thiago', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_thiago.jpg', 'comun'],
                    ['Vinícius Jr', 'Brasil', '🇧🇷', 'Delantero', 'fotos/bra_vinicius.jpg', 'legendaria'],
                    ['Weverton', 'Brasil', '🇧🇷', 'Arquero', 'fotos/bra_weverton.jpg', 'comun'],
                    ['Wesley', 'Brasil', '🇧🇷', 'Defensor', 'fotos/bra_wesley.jpg', 'comun'],

                    // --- ESCOCIA ---
                    ['Ryan Christie', 'Escocia', 'esc', 'Mediocampista', 'fotos/esc_christie.jpg', 'rara'],
                    ['Lyndon Dykes', 'Escocia', 'esc', 'Delantero', 'fotos/esc_dykes.jpg', 'rara'],
                    ['Lewis Ferguson', 'Escocia', 'esc', 'Mediocampista', 'fotos/esc_ferguson.jpg', 'rara'],
                    ['Angus Gunn', 'Escocia', 'esc', 'Arquero', 'fotos/esc_gunn.jpg', 'epica'],
                    ['Grant Hanley', 'Escocia', 'esc', 'Defensor', 'fotos/esc_hanley.jpg', 'comun'],
                    ['Jack Hendry', 'Escocia', 'esc', 'Defensor', 'fotos/esc_hendry.jpg', 'rara'],
                    ['John McGinn', 'Escocia', 'esc', 'Mediocampista', 'fotos/esc_mcginn.jpg', 'epica'],
                    ['Scott McKenna', 'Escocia', 'esc', 'Defensor', 'fotos/esc_mckenna.jpg', 'comun'],
                    ['Kenny McLean', 'Escocia', 'esc', 'Mediocampista', 'fotos/esc_mclean.jpg', 'comun'],
                    ['Scott McTominay', 'Escocia', 'esc', 'Mediocampista', 'fotos/esc_mctominay.jpg', 'legendaria'],
                    ['Anthony Ralston', 'Escocia', 'esc', 'Defensor', 'fotos/esc_ralston.jpg', 'comun'],
                    ['John Souttar', 'Escocia', 'esc', 'Defensor', 'fotos/esc_souttar.jpg', 'rara'],
                    
                    // --- HAITÍ ---
                    ['Ricardo Adé', 'Haití', 'hai', 'Delantero', 'fotos/hai_ade.jpg', 'comun'],
                    ['Carlens Arcus', 'Haití', 'hai', 'Defensor', 'fotos/hai_arcus.jpg', 'comun'],
                    ['Christopher Attvs', 'Haití', 'hai', 'Defensor', 'fotos/hai_attvs.jpg', 'comun'], 
                    ['Jean-Ricner Bellegarde', 'Haití', 'hai', 'Mediocampista', 'fotos/hai_bellegarde.jpg', 'epica'],
                    ['Josué Casimir', 'Haití', 'hai', 'Defensor', 'fotos/hai_casimir.jpg', 'comun'],
                    ['Don Deedson Louicius', 'Haití', 'hai', 'Delantero', 'fotos/hai_deedson.jpg', 'comun'],
                    ['Hannes Delcroix', 'Haití', 'hai', 'Defensor', 'fotos/hai_delcroix.jpg', 'comun'],
                    ['Jean-Kévin Duverne', 'Haití', 'hai', 'Defensor', 'fotos/hai_duverne.jpg', 'rara'],
                    ['Derrick Etienne Jr.', 'Haití', 'hai', 'Mediocampista', 'fotos/hai_etienne_Jr.jpg', 'comun'],
                    ['Martin Experience', 'Haití', 'hai', 'Defensor', 'fotos/hai_experience.jpg', 'comun'],
                    ['Danley Jean Jacques', 'Haití', 'hai', 'Mediocampista', 'fotos/hai_jacques.jpg', 'comun'],
                    ['Duke Lacroix', 'Haití', 'hai', 'Defensor', 'fotos/hai_lacroix.jpg', 'comun'],
                    ['Duckens Nazon', 'Haití', 'hai', 'Delantero', 'fotos/hai_nazon.jpg', 'rara'],
                    ['Leverton Pierre', 'Haití', 'hai', 'Delantero', 'fotos/hai_pierre.jpg', 'comun'],
                    ['Johny Placide', 'Haití', 'hai', 'Arquero', 'fotos/hai_placide.jpg', 'rara'],

                    // --- COREA DEL SUR ---
                    ['Jens Castrop', 'Corea del Sur', 'kor', 'Mediocampista', 'fotos/kor_castrop.jpg', 'comun'],
                    ['Yumin Cho', 'Corea del Sur', 'kor', 'Defensor', 'fotos/kor_cho.jpg', 'comun'],
                    ['Heechan Hwang', 'Corea del Sur', 'kor', 'Delantero', 'fotos/kor_hwang.jpg', 'epica'],
                    ['Jaesung Lee', 'Corea del Sur', 'kor', 'Mediocampista', 'fotos/kor_jLee.jpg', 'rara'],
                    ['Hyeonwoo Jo', 'Corea del Sur', 'kor', 'Arquero', 'fotos/kor_jo.jpg', 'rara'],
                    ['Seunggyu Kim', 'Corea del Sur', 'kor', 'Arquero', 'fotos/kor_kim.jpg', 'rara'],
                    ['Kangin Lee', 'Corea del Sur', 'kor', 'Mediocampista', 'fotos/kor_kLee.jpg', 'epica'],
                    ['Hanbeom Lee', 'Corea del Sur', 'kor', 'Defensor', 'fotos/kor_lee.jpg', 'comun'],
                    ['Myungjae Lee', 'Corea del Sur', 'kor', 'Defensor', 'fotos/kor_mLee.jpg', 'comun'],
                    ['Hyeongyu Oh', 'Corea del Sur', 'kor', 'Delantero', 'fotos/kor_oh.jpg', 'comun'],
                    ['Seungho Paik', 'Corea del Sur', 'kor', 'Mediocampista', 'fotos/kor_paik.jpg', 'comun'],
                    ['Youngwoo Seol', 'Corea del Sur', 'kor', 'Defensor', 'fotos/kor_seol.jpg', 'comun'],
                    ['Heungmin Son', 'Corea del Sur', 'kor', 'Delantero', 'fotos/kor_son.jpg', 'legendaria'],

                    // --- PARAGUAY ---
                    ['Omar Alderete', 'Paraguay', 'par', 'Defensor', 'fotos/par_alderete.jpg', 'rara'],
                    ['Miguel Almirón', 'Paraguay', 'par', 'Delantero', 'fotos/par_almiron.jpg', 'epica'],
                    ['Junior Alonso', 'Paraguay', 'par', 'Defensor', 'fotos/par_alonso.jpg', 'comun'],
                    ['Fabián Balbuena', 'Paraguay', 'par', 'Defensor', 'fotos/par_balbuena.jpg', 'comun'],
                    ['Juan José Cáceres', 'Paraguay', 'par', 'Defensor', 'fotos/par_caceres.jpg', 'comun'],
                    ['Andrés Cubas', 'Paraguay', 'par', 'Mediocampista', 'fotos/par_cubas.jpg', 'comun'],
                    ['Julio Enciso', 'Paraguay', 'par', 'Delantero', 'fotos/par_enciso.jpg', 'epica'],
                    ['Roberto Fernández', 'Paraguay', 'par', 'Arquero', 'fotos/par_fernandez.jpg', 'comun'],
                    ['Gustavo Gómez', 'Paraguay', 'par', 'Defensor', 'fotos/par_gGomez.jpg', 'rara'],
                    ['Orlando Gill', 'Paraguay', 'par', 'Arquero', 'fotos/par_gill.jpg', 'comun'],
                    ['Diego Gómez', 'Paraguay', 'par', 'Mediocampista', 'fotos/par_gomez.jpg', 'rara'],
                    ['Ángel Romero', 'Paraguay', 'par', 'Delantero', 'fotos/par_romero.jpg', 'comun'],
                    ['Ramón Sosa', 'Paraguay', 'par', 'Delantero', 'fotos/par_sosa.jpg', 'rara'],
                    ['Mathías Villasanti', 'Paraguay', 'par', 'Mediocampista', 'fotos/par_villasanti.jpg', 'comun'],

                    // --- SUIZA ---
                    ['Michel Aebischer', 'Suiza', 'sui', 'Mediocampista', 'fotos/sui_aebischer.jpg', 'rara'],
                    ['Manuel Akanji', 'Suiza', 'sui', 'Defensor', 'fotos/sui_akanji.jpg', 'legendaria'],
                    ['Zeki Amdouni', 'Suiza', 'sui', 'Delantero', 'fotos/sui_amdouni.jpg', 'rara'],
                    ['Aurèle Amenda', 'Suiza', 'sui', 'Defensor', 'fotos/sui_amenda.jpg', 'comun'],
                    ['Nico Elvedi', 'Suiza', 'sui', 'Defensor', 'fotos/sui_elvedi.jpg', 'rara'],
                    ['Remo Freuler', 'Suiza', 'sui', 'Mediocampista', 'fotos/sui_freuler.jpg', 'epica'],
                    ['Gregor Kobel', 'Suiza', 'sui', 'Arquero', 'fotos/sui_kobel.jpg', 'legendaria'],
                    ['Joel Monteiro', 'Suiza', 'sui', 'Delantero', 'fotos/sui_manzambi.jpg', 'comun'],
                    ['Dan Ndoye', 'Suiza', 'sui', 'Delantero', 'fotos/sui_ndoye.jpg', 'epica'],
                    ['Fabian Rieder', 'Suiza', 'sui', 'Mediocampista', 'fotos/sui_rieder.jpg', 'rara'],
                    ['Ricardo Rodríguez', 'Suiza', 'sui', 'Defensor', 'fotos/sui_rodriguez.jpg', 'epica'],
                    ['Ruben Vargas', 'Suiza', 'sui', 'Delantero', 'fotos/sui_vargas.jpg', 'epica'],
                    ['Silvan Widmer', 'Suiza', 'sui', 'Defensor', 'fotos/sui_widmer.jpg', 'rara'],
                    ['Granit Xhaka', 'Suiza', 'sui', 'Mediocampista', 'fotos/sui_xhaka.jpg', 'legendaria'],
                    ['Denis Zakaria', 'Suiza', 'sui', 'Mediocampista', 'fotos/sui_zakaria.jpg', 'epica'],

                    // --- TÚNEZ ---
                    ['Ali Abdi', 'Túnez', 'tun', 'Defensor', 'fotos/tun_abdi.jpg', 'rara'],
                    ['Elias Achouri', 'Túnez', 'tun', 'Delantero', 'fotos/tun_achouri.jpg', 'rara'],
                    ['Aymen Dahmen', 'Túnez', 'tun', 'Arquero', 'fotos/tun_dahmen.jpg', 'comun'],
                    ['Ismaël Gharbi', 'Túnez', 'tun', 'Mediocampista', 'fotos/tun_gharbi.jpg', 'rara'],
                    ['Aïssa Laïdouni', 'Túnez', 'tun', 'Mediocampista', 'fotos/tun_laidouni.jpg', 'epica'],
                    ['Sayfallah Ltaief', 'Túnez', 'tun', 'Delantero', 'fotos/tun_ltaief.jpg', 'comun'],
                    ['Rani Mastouri', 'Túnez', 'tun', 'Delantero', 'fotos/tun_mastouri.jpg', 'comun'],
                    ['Hannibal Mejbri', 'Túnez', 'tun', 'Mediocampista', 'fotos/tun_mejbri.jpg', 'epica'],
                    ['Yassine Meriah', 'Túnez', 'tun', 'Defensor', 'fotos/tun_meriah.jpg', 'rara'],
                    ['Haythem Jouini', 'Túnez', 'tun', 'Delantero', 'fotos/tun_saad.jpg', 'comun'],
                    ['Ferjani Sassi', 'Túnez', 'tun', 'Mediocampista', 'fotos/tun_sassi.jpg', 'rara'],
                    ['Ellyes Skhiri', 'Túnez', 'tun', 'Mediocampista', 'fotos/tun_skhiri.jpg', 'legendaria'],
                    ['Naïm Sliti', 'Túnez', 'tun', 'Delantero', 'fotos/tun_sliti.jpg', 'rara'],
                    ['Montassar Talbi', 'Túnez', 'tun', 'Defensor', 'fotos/tun_talbi.jpg', 'epica'],
                    ['Yan Valery', 'Túnez', 'tun', 'Defensor', 'fotos/tun_valery.jpg', 'rara'],

                    // --- ALEMANIA ---
                    ['Jamal Musiala', 'Alemania', 'ger', 'Mediocampista', 'fotos/ale_musiala.jpg', 'legendaria'],
                    ['Florian Wirtz', 'Alemania', 'ger', 'Mediocampista', 'fotos/ale_wirtz.jpg', 'legendaria'],
                    ['Kai Havertz', 'Alemania', 'ger', 'Delantero', 'fotos/ale_havertz.jpg', 'rara'],
                    ['Leon Goretzka', 'Alemania', 'ger', 'Mediocampista', 'fotos/ale_goretzka.jpg', 'rara'],
                    ['Joshua Kimmich', 'Alemania', 'ger', 'Mediocampista', 'fotos/ale_kimmich.jpg', 'epica'],
                    ['Antonio Rüdiger', 'Alemania', 'ger', 'Defensor', 'fotos/ale_rudiger.jpg', 'epica'],
                    ['Marc-André ter Stegen', 'Alemania', 'ger', 'Arquero', 'fotos/ale_stegen.jpg', 'epica'],
                    ['Serge Gnabry', 'Alemania', 'ger', 'Delantero', 'fotos/ale_gnabry.jpg', 'rara'],
                    ['Maximilian Mittelstädt', 'Alemania', 'ger', 'Defensor', 'fotos/ale_mittle.jpg', 'comun'],
                    ['Felix Nmecha', 'Alemania', 'ger', 'Mediocampista', 'fotos/ale_nmecha.jpg', 'comun'],
                    ['Ridle Baku', 'Alemania', 'ger', 'Defensor', 'fotos/ale_baku.jpg', 'comun'],
                    ['Nico Schlotterbeck', 'Alemania', 'ger', 'Defensor', 'fotos/ale_schlotterbeck.jpg', 'comun'],
                    ['Nick Woltemade', 'Alemania', 'ger', 'Delantero', 'fotos/ale_woltemade.jpg', 'comun'],
                    ['Jonathan Tah', 'Alemania', 'ger', 'Defensor', 'fotos/ale_tah.jpg', 'comun'],

                    // --- URUGUAY ---
                    ['Ronald Araújo', 'Uruguay', 'uru', 'Defensor', 'fotos/uru_araujo.jpg', 'legendaria'],
                    ['Maxi Araujo', 'Uruguay', 'uru', 'Delantero', 'fotos/uru_araujo-.jpg', 'comun'],
                    ['Rodrigo Bentancur', 'Uruguay', 'uru', 'Mediocampista', 'fotos/uru_bentancur.jpg', 'epica'],
                    ['Sebastián Cáceres', 'Uruguay', 'uru', 'Defensor', 'fotos/uru_caceres.jpg', 'rara'],
                    ['José María Giménez', 'Uruguay', 'uru', 'Defensor', 'fotos/uru_gimenez.jpg', 'epica'],
                    ['Alan Matturro', 'Uruguay', 'uru', 'Defensor', 'fotos/uru_miele.jpg', 'comun'],
                    ['Nahitan Nández', 'Uruguay', 'uru', 'Mediocampista', 'fotos/uru_nandez.jpg', 'epica'],
                    ['Darwin Núñez', 'Uruguay', 'uru', 'Delantero', 'fotos/uru_nuñez.jpg', 'legendaria'],
                    ['Mathías Olivera', 'Uruguay', 'uru', 'Defensor', 'fotos/uru_olivera.jpg', 'rara'],
                    ['Facundo Pellistri', 'Uruguay', 'uru', 'Delantero', 'fotos/uru_pellistri.jpg', 'epica'],
                    ['Sergio Rochet', 'Uruguay', 'uru', 'Arquero', 'fotos/uru_rochet.jpg', 'epica'],
                    ['Manuel Ugarte', 'Uruguay', 'uru', 'Mediocampista', 'fotos/uru_ugarte.jpg', 'epica'],
                    ['Federico Valverde', 'Uruguay', 'uru', 'Mediocampista', 'fotos/uru_valverde.jpg', 'legendaria'],
                    ['Guillermo Varela', 'Uruguay', 'uru', 'Defensor', 'fotos/uru_varela.jpg', 'rara'],
                    ['Federico Viñas', 'Uruguay', 'uru', 'Delantero', 'fotos/uru_viñas.jpg', 'rara'],

                    // --- TURQUÍA ---
                    ['Yunus Akgun', 'Turquía', 'tur', 'Delantero', 'fotos/tur_akgun.jpg', 'comun'],
                    ['Kerem Akturkoglu', 'Turquía', 'tur', 'Delantero', 'fotos/tur_akturkoglu.jpg', 'epica'],
                    ['Kaan Ayhan', 'Turquía', 'tur', 'Defensor', 'fotos/tur_ayhan.jpg', 'comun'],
                    ['Abdulkerim Bardakci', 'Turquía', 'tur', 'Defensor', 'fotos/tur_bardakci.jpg', 'comun'],
                    ['Ugurcan Cakir', 'Turquía', 'tur', 'Arquero', 'fotos/tur_cakir.jpg', 'comun'],
                    ['Zeki Celik', 'Turquía', 'tur', 'Defensor', 'fotos/tur_celik.jpg', 'comun'],
                    ['Merih Demiral', 'Turquía', 'tur', 'Defensor', 'fotos/tur_demiral.jpg', 'rara'],
                    ['Irfan Can Kahveci', 'Turquía', 'tur', 'Mediocampista', 'fotos/tur_kahveci.jpg', 'comun'],
                    ['Arda Guler', 'Turquía', 'tur', 'Mediocampista', 'fotos/tur_guler.jpg', 'epica'],
                    ['Orkun Kokcu', 'Turquía', 'tur', 'Mediocampista', 'fotos/tur_kokcu.jpg', 'rara'],
                    ['Mert Muldur', 'Turquía', 'tur', 'Defensor', 'fotos/tur_muldur.jpg', 'comun'],
                    ['Caglar Soyuncu', 'Turquía', 'tur', 'Defensor', 'fotos/tur_soyuncu.jpg', 'rara'],
                    ['Can Uzun', 'Turquía', 'tur', 'Delantero', 'fotos/tur_uzun.jpg', 'comun'],
                    ['Kenan Yildiz', 'Turquía', 'tur', 'Delantero', 'fotos/tur_yildiz.jpg', 'rara'],
                    ['Baris Alper Yilmaz', 'Turquía', 'tur', 'Mediocampista', 'fotos/tur_yilmaz.jpg', 'comun'],

                    // --- UZBEKISTÁN ---
                    ['Khojiakbar Alijonov', 'Uzbekistán', 'uzb', 'Defensor', 'fotos/uzb_alijonov.jpg', 'comun'],
                    ['Khusniddin Aliqulov', 'Uzbekistán', 'uzb', 'Defensor', 'fotos/uzb_aliqulov.jpg', 'rara'],
                    ['Rustam Ashurmatov', 'Uzbekistán', 'uzb', 'Defensor', 'fotos/uzb_ashurmatov.jpg', 'comun'],
                    ['Khojimat Erkinov', 'Uzbekistán', 'uzb', 'Delantero', 'fotos/uzb_erkinov.jpg', 'rara'],
                    ['Umar Eshmurodov', 'Uzbekistán', 'uzb', 'Defensor', 'fotos/uzb_eshmurodov.jpg', 'comun'],
                    ['Abbosbek Fayzullaev', 'Uzbekistán', 'uzb', 'Mediocampista', 'fotos/uzb_fayzullaev.jpg', 'epica'],
                    ['Jamshid Iskanderov', 'Uzbekistán', 'uzb', 'Mediocampista', 'fotos/uzb_iskanderov.jpg', 'comun'],
                    ['Jaloliddin Masharipov', 'Uzbekistán', 'uzb', 'Mediocampista', 'fotos/uzb_masharipov.jpg', 'rara'],
                    ['Sherzod Nasrullaev', 'Uzbekistán', 'uzb', 'Defensor', 'fotos/uzb_nasrullaev.jpg', 'comun'],
                    ['Farrukh Sayfiev', 'Uzbekistán', 'uzb', 'Defensor', 'fotos/uzb_sayfiev.jpg', 'rara'],
                    ['Igor Sergeev', 'Uzbekistán', 'uzb', 'Delantero', 'fotos/uzb_sergeev.jpg', 'rara'],
                    ['Eldor Shomurodov', 'Uzbekistán', 'uzb', 'Delantero', 'fotos/uzb_shomurodov.jpg', 'legendaria'],
                    ['Otabek Shukurov', 'Uzbekistán', 'uzb', 'Mediocampista', 'fotos/uzb_shukurov.jpg', 'epica'],
                    ['Azizbek Turgunboev', 'Uzbekistán', 'uzb', 'Mediocampista', 'fotos/uzb_turgunboev.jpg', 'rara'],
                    ['Oston Urunov', 'Uzbekistán', 'uzb', 'Delantero', 'fotos/uzb_urunov.jpg', 'rara'],
                    
                    // --- MARRUECOS ---
                    ['Nayef Aguerd', 'Marruecos', 'mar', 'Defensor', 'fotos/mar_aguerd.jpg', 'rara'],
                    ['Sofyan Amrabat', 'Marruecos', 'mar', 'Mediocampista', 'fotos/mar_amrabat.jpg', 'rara'],
                    ['Yassine Bounou', 'Marruecos', 'mar', 'Arquero', 'fotos/mar_bounou.jpg', 'epica'],
                    ['Brahim Díaz', 'Marruecos', 'mar', 'Mediocampista', 'fotos/mar_diaz.jpg', 'epica'],
                    ['Abde Ezzalzouli', 'Marruecos', 'mar', 'Delantero', 'fotos/mar_ezzalzouli.jpg', 'comun'],
                    ['Ayoub El Kaabi', 'Marruecos', 'mar', 'Delantero', 'fotos/mar_kaabi.jpg', 'rara'],
                    ['Bilal El Khannouss', 'Marruecos', 'mar', 'Mediocampista', 'fotos/mar_khannouss.jpg', 'comun'],
                    ['Adam Masina', 'Marruecos', 'mar', 'Defensor', 'fotos/mar_masina.jpg', 'comun'],
                    ['Youssef En-Nesyri', 'Marruecos', 'mar', 'Delantero', 'fotos/mar_nesyri.jpg', 'comun'],
                    ['Ismael Saibari', 'Marruecos', 'mar', 'Mediocampista', 'fotos/mar_saibari.jpg', 'comun'],
                    ['Romain Saiss', 'Marruecos', 'mar', 'Defensor', 'fotos/mar_saiss.jpg', 'comun'],
                    ['Eliesse Ben Seghir', 'Marruecos', 'mar', 'Mediocampista', 'fotos/mar_seghir.jpg', 'comun'],
                    ['Jawad El Yamiq', 'Marruecos', 'mar', 'Defensor', 'fotos/mar_yamiq.jpg', 'comun'],

                    // --- ARGELIA ---
                    ['Houssem Aouar', 'Argelia', '🇩🇿', 'Mediocampista', 'fotos/arg_aquar.jpg', 'rara'],
                    ['Youcef Atal', 'Argelia', '🇩🇿', 'Defensor', 'fotos/arg_atal.jpg', 'comun'],
                    ['Ismaël Bennacer', 'Argelia', '🇩🇿', 'Mediocampista', 'fotos/arg_bennacer.jpg', 'epica'],
                    ['Saïd Benrahma', 'Argelia', '🇩🇿', 'Delantero', 'fotos/arg_benrahma.jpg', 'rara'],
                    ['Ramy Bensebaini', 'Argelia', '🇩🇿', 'Defensor', 'fotos/arg_bensebaini.jpg', 'rara'],
                    ['Hicham Boudaoui', 'Argelia', '🇩🇿', 'Mediocampista', 'fotos/arg_boudaqui.jpg', 'comun'],
                    ['Baghdad Bounedjah', 'Argelia', '🇩🇿', 'Delantero', 'fotos/arg_bounedjah.jpg', 'comun'],
                    ['Farès Chaïbi', 'Argelia', '🇩🇿', 'Mediocampista', 'fotos/arg_chaibi.jpg', 'comun'],
                    ['Amine Gouiri', 'Argelia', '🇩🇿', 'Delantero', 'fotos/arg_gouiri.jpg', 'rara'],
                    ['Mustapha Zeghba', 'Argelia', '🇩🇿', 'Arquero', 'fotos/arg_guendouz.jpg', 'comun'],
                    ['Riyad Mahrez', 'Argelia', '🇩🇿', 'Delantero', 'fotos/arg_mahrez.jpg', 'legendaria'],
                    ['Aïssa Mandi', 'Argelia', '🇩🇿', 'Defensor', 'fotos/arg_mandi.jpg', 'rara'],
                    ['Nadjib Amine Tougai', 'Argelia', '🇩🇿', 'Defensor', 'fotos/arg_tougai.jpg', 'comun'],
                    ['Ramiz Zerrouki', 'Argelia', '🇩🇿', 'Mediocampista', 'fotos/arg_zerrouki.jpg', 'comun'],

                    // --- AUSTRIA ---
                    ['David Alaba', 'Austria', '🇦🇹', 'Defensor', 'fotos/aus_alaba.jpg', 'legendaria'],
                    ['Christoph Baumgartner', 'Austria', '🇦🇹', 'Mediocampista', 'fotos/aus_baumgartner.jpg', 'rara'],
                    ['Kevin Danso', 'Austria', '🇦🇹', 'Defensor', 'fotos/aus_danso.jpg', 'rara'],
                    ['Michael Gregoritsch', 'Austria', '🇦🇹', 'Delantero', 'fotos/aus_gregoritsch.jpg', 'comun'],
                    ['Konrad Laimer', 'Austria', '🇦🇹', 'Mediocampista', 'fotos/aus_laimer.jpg', 'epica'],
                    ['Philipp Lienhart', 'Austria', '🇦🇹', 'Defensor', 'fotos/aus_lienhart.jpg', 'comun'],
                    ['Patrick Pentz', 'Austria', '🇦🇹', 'Arquero', 'fotos/aus_pentz.jpg', 'comun'],
                    ['Stefan Posch', 'Austria', '🇦🇹', 'Defensor', 'fotos/aus_posch.jpg', 'rara'],
                    ['Alexander Prass', 'Austria', '🇦🇹', 'Mediocampista', 'fotos/aus_prass.jpg', 'comun'],
                    ['Marcel Sabitzer', 'Austria', '🇦🇹', 'Mediocampista', 'fotos/aus_sabitzer.jpg', 'epica'],
                    ['Xaver Schlager', 'Austria', '🇦🇹', 'Mediocampista', 'fotos/aus_schlager-.jpg', 'rara'],
                    ['Alexander Schlager', 'Austria', '🇦🇹', 'Arquero', 'fotos/aus_schlager.jpg', 'comun'], // REPETIDA - COMPLETAR
                    ['Romano Schmid', 'Austria', '🇦🇹', 'Mediocampista', 'fotos/aus_schmid.jpg', 'comun'],
                    ['Nicolas Seiwald', 'Austria', '🇦🇹', 'Mediocampista', 'fotos/aus_seiwald.jpg', 'comun'],
                    ['Patrick Wimmer', 'Austria', '🇦🇹', 'Mediocampista', 'fotos/aus_wimmer.jpg', 'comun'],

                    // --- ARABIA SAUDITA ---
                    ['Saud Abdulhamid', 'Arabia Saudita', '🇸🇦', 'Defensor', 'fotos/ara_abdulhamid.jpg', 'rara'],
                    ['Salem Al-Dawsari', 'Arabia Saudita', '🇸🇦', 'Mediocampista', 'fotos/ara_aldawsari.jpg', 'legendaria'],
                    ['Nasser Aldawsari', 'Arabia Saudita', '🇸🇦', 'Mediocampista', 'fotos/ara_aldawsari-.jpg', 'comun'], // REPETIDA - COMPLETAR
                    ['Moteb Al-Harbi', 'Arabia Saudita', '🇸🇦', 'Defensor', 'fotos/ara_alharbi.jpg', 'comun'],
                    ['Fahad Al-Johani', 'Arabia Saudita', '🇸🇦', 'Delantero', 'fotos/ara_aljohani.jpg', 'comun'],
                    ['Musab Al-Juwayr', 'Arabia Saudita', '🇸🇦', 'Mediocampista', 'fotos/ara_aljuwayr.jpg', 'comun'],
                    ['Abdullah Al-Khaibari', 'Arabia Saudita', '🇸🇦', 'Mediocampista', 'fotos/ara_alkhaibari.jpg', 'rara'],
                    ['Abdulelah Al-Amri', 'Arabia Saudita', '🇸🇦', 'Defensor', 'fotos/ara_alobud.jpg', 'rara'],
                    ['Marwan Al-Sahafi', 'Arabia Saudita', '🇸🇦', 'Delantero', 'fotos/ara_alsahafi.jpg', 'comun'],
                    ['Ahmed Al-Ghamdi', 'Arabia Saudita', '🇸🇦', 'Mediocampista', 'fotos/ara_alsanbi.jpg', 'comun'],
                    ['Mohammed Al-Shamat', 'Arabia Saudita', '🇸🇦', 'Defensor', 'fotos/ara_alshamat.jpg', 'comun'],
                    ['Saleh Al-Shehri', 'Arabia Saudita', '🇸🇦', 'Delantero', 'fotos/ara_alsheri.jpg', 'epica'],
                    ['Hassan Al-Tambakti', 'Arabia Saudita', '🇸🇦', 'Defensor', 'fotos/ara_altambakti.jpg', 'rara'],
                    ['Ayman Yahya', 'Arabia Saudita', '🇸🇦', 'Delantero', 'fotos/ara_thikri.jpg', 'comun'],

                    // --- REPÚBLICA DEMOCRÁTICA DEL CONGO ---
                    ['Cédric Bakambu', 'Congo', '🇨🇩', 'Delantero', 'fotos/con_bakambu.jpg', 'epica'],
                    ['Aaron Wan-Bissaka', 'Congo', '🇨🇩', 'Defensor', 'fotos/con_bissaka.jpg', 'epica'],
                    ['Brian Cipenga', 'Congo', '🇨🇩', 'Delantero', 'fotos/con_cipenga.jpg', 'comun'], // Nota: El archivo dice cipenga pero la figu es Sadiki
                    ['Meschack Elia', 'Congo', '🇨🇩', 'Delantero', 'fotos/con_elia.jpg', 'rara'],
                    ['Joris Kayembe', 'Congo', '🇨🇩', 'Delantero', 'fotos/con_kayembe.jpg', 'rara'],
                    ['Edo Kayembe', 'Congo', '🇨🇩', 'Mediocampista', 'fotos/con_kayembe-.jpg', 'comun'], // REPETIDA - COMPLETAR
                    ['Arthur Masuaku', 'Congo', '🇨🇩', 'Defensor', 'fotos/con_masuaku.jpg', 'rara'],
                    ['Fiston Mayele', 'Congo', '🇨🇩', 'Delantero', 'fotos/con_mayele.jpg', 'comun'],
                    ['Chancel Mbemba', 'Congo', '🇨🇩', 'Defensor', 'fotos/con_mbemba.jpg', 'legendaria'],
                    ['Nathanaël Mbuku', 'Congo', '🇨🇩', 'Delantero', 'fotos/con_mbuku.jpg', 'comun'],
                    ['Lionel Mpasi', 'Congo', '🇨🇩', 'Arquero', 'fotos/con_mpasi.jpg', 'comun'],
                    ['Ngal\'ayel Mukau', 'Congo', '🇨🇩', 'Mediocampista', 'fotos/con_mukau.jpg', 'comun'],
                    ['Charles Pickel', 'Congo', '🇨🇩', 'Mediocampista', 'fotos/con_pickel.jpg', 'comun'],
                    ['Axel Tuanzebe', 'Congo', '🇨🇩', 'Defensor', 'fotos/con_tuanzebe.jpg', 'rara'],
                    ['Yoane Wissa', 'Congo', '🇨🇩', 'Delantero', 'fotos/con_wissa.jpg', 'epica'],

                    // --- EGIPTO ---
                    ['Mohamed El-Shenawy', 'Egipto', '🇪🇬', 'Arquero', 'fotos/egi_elshenawy.jpg', 'epica'],
                    ['Ahmed Fatouh', 'Egipto', '🇪🇬', 'Defensor', 'fotos/egi_fatouh.jpg', 'rara'],
                    ['Mohamed Hany', 'Egipto', '🇪🇬', 'Defensor', 'fotos/egi_handy.jpg', 'rara'], // Nota: El archivo dice handy pero es Hany
                    ['Mohanad Lasheen', 'Egipto', '🇪🇬', 'Mediocampista', 'fotos/egi_laheen.jpg', 'comun'], // Note: El archivo dice laheen pero es Ahmed Hassan (Kouka)
                    ['Omar Marmoush', 'Egipto', '🇪🇬', 'Delantero', 'fotos/egi_marniysh.jpg', 'epica'],
                    ['Ramy Rabia', 'Egipto', '🇪🇬', 'Defensor', 'fotos/egi_rabia.jpg', 'comun'],
                    ['Mohamed Salah', 'Egipto', '🇪🇬', 'Delantero', 'fotos/egi_salah.jpg', 'legendaria'],
                    ['Ramadan Sobhi', 'Egipto', '🇪🇬', 'Delantero', 'fotos/egi_sobhi.jpg', 'rara'],
                    ['Trézéguet', 'Egipto', '🇪🇬', 'Delantero', 'fotos/egi_trezeguet.jpg', 'epica'],

                    // --- JORDANIA ---
                    ['Abualnadi', 'Jordania', '🇯🇴', 'Defensor', 'fotos/jor_abualnadi.jpg', 'comun'],
                    ['Yazeed Abulaila', 'Jordania', '🇯🇴', 'Arquero', 'fotos/jor_abulaila.jpg', 'rara'],
                    ['Ihsan Haddad', 'Jordania', '🇯🇴', 'Defensor', 'fotos/jor_haddad.jpg', 'rara'],
                    ['Mohammad Abu Jamous', 'Jordania', '🇯🇴', 'Defensor', 'fotos/jor_jamous.jpg', 'comun'],
                    ['Mahmoud Al-Mardi', 'Jordania', '🇯🇴', 'Mediocampista', 'fotos/jor_mardi.jpg', 'rara'],
                    ['Yazan Al-Naimat', 'Jordania', '🇯🇴', 'Delantero', 'fotos/jor_naimat.jpg', 'rara'],
                    ['Obaid', 'Jordania', '🇯🇴', 'Defensor', 'fotos/jor_obaid.jpg', 'comun'],
                    ['Ali Olwan', 'Jordania', '🇯🇴', 'Delantero', 'fotos/jor_olwan.jpg', 'comun'],
                    ['Abdallah Rashdan', 'Jordania', '🇯🇴', 'Defensor', 'fotos/jor_rashdan.jpg', 'comun'],
                    ['Noor Al-Rawabdeh', 'Jordania', '🇯🇴', 'Mediocampista', 'fotos/jor_rawabdeh.jpg', 'comun'],
                    ['Ibrahim Sadeh', 'Jordania', '🇯🇴', 'Mediocampista', 'fotos/jor_saadeh.jpg', 'comun'], // Nota: Basado en saadeh
                    ['Koubaib Al-Sabra', 'Jordania', '🇯🇴', 'Defensor', 'fotos/jor_sabra.jpg', 'comun'],
                    ['Mousa Al-Tamari', 'Jordania', '🇯🇴', 'Delantero', 'fotos/jor_taamari.jpg', 'epica'],
                    ['Moouath Taha', 'Jordania', '🇯🇴', 'Defensor', 'fotos/jor_taha.jpg', 'comun'],
                    ['Mohammad Abu Zrayq', 'Jordania', '🇯🇴', 'Delantero', 'fotos/jor_zrayq.jpg', 'comun'],

                    // --- SUDÁFRICA ---
                    ['Oswin Appollis', 'Sudáfrica', '🇿🇦', 'Delantero', 'fotos/sud_appollis.jpg', 'rara'],
                    ['Sipho Chaine', 'Sudáfrica', '🇿🇦', 'Arquero', 'fotos/sud_cahine.jpg', 'comun'], // Nota: Basado en el archivo de Chaine
                    ['Samukele Kabini', 'Sudáfrica', '🇿🇦', 'Defensor', 'fotos/sud_kabini.jpg', 'comun'], // Nota: Basado en el archivo de Kabini
                    ['Thalente Mbatha', 'Sudáfrica', '🇿🇦', 'Mediocampista', 'fotos/sud_mbatha.jpg', 'comun'], // Nota: Basado en el archivo de Maseko/Mbatha
                    ['Sipho Mbule', 'Sudáfrica', '🇿🇦', 'Mediocampista', 'fotos/sud_mbule.jpg', 'comun'],
                    ['Khuliso Mudau', 'Sudáfrica', '🇿🇦', 'Defensor', 'fotos/sud_mudau.jpg', 'rara'],
                    ['Khulumani Ndamane', 'Sudáfrica', '🇿🇦', 'Defensor', 'fotos/sud_ndamane.jpg', 'rara'], // Nota: Basado en el archivo de Modiba/Ndamane
                    ['Siyabonga Ngezana', 'Sudáfrica', '🇿🇦', 'Defensor', 'fotos/sud_negezana.jpg', 'rara'],
                    ['Mohau Nkota', 'Sudáfrica', '🇿🇦', 'Defensor', 'fotos/sud_nkota.jpg', 'comun'], // Nota: Basado en el archivo de Nkota/Sibisi
                    ['Iqraam Rayners', 'Sudáfrica', '🇿🇦', 'Delantero', 'fotos/sud_rayners.jpg', 'comun'],
                    ['Ronwen Williams', 'Sudáfrica', '🇿🇦', 'Arquero', 'fotos/sud_williams.jpg', 'epica'],

                    // --- TURQUÍA ---
                    ['Bariş Alper Yilmaz', 'Turquía', '🇹🇷', 'Delantero', 'fotos/tur_akgun.jpg', 'rara'], // Nota: Basado en el archivo akgun/Yılmaz
                    ['Kerem Aktürkoğlu', 'Turquía', '🇹🇷', 'Delantero', 'fotos/tur_akturkoglu.jpg', 'epica'],
                    ['Kaan Ayhan', 'Turquía', '🇹🇷', 'Defensor', 'fotos/tur_ayhan.jpg', 'rara'],
                    ['Abdülkerim Bardakci', 'Turquía', '🇹🇷', 'Defensor', 'fotos/tur_bardakci.jpg', 'rara'],
                    ['Uğurcan Çakir', 'Turquía', '🇹🇷', 'Arquero', 'fotos/tur_cakir.jpg', 'rara'],
                    ['Zeki Çelik', 'Turquía', '🇹🇷', 'Defensor', 'fotos/tur_celik.jpg', 'rara'],
                    ['Merih Demiral', 'Turquía', '🇹🇷', 'Defensor', 'fotos/tur_demiral.jpg', 'epica'],
                    ['Arda Güler', 'Turquía', '🇹🇷', 'Mediocampista', 'fotos/tur_guler.jpg', 'legendaria'],
                    ['İrfan Can Kahveci', 'Turquía', '🇹🇷', 'Mediocampista', 'fotos/tur_kahveci.jpg', 'rara'],
                    ['Orkun Kökçü', 'Turquía', '🇹🇷', 'Mediocampista', 'fotos/tur_kokcu.jpg', 'epica'],
                    ['Mert Müldür', 'Turquía', '🇹🇷', 'Defensor', 'fotos/tur_muldur.jpg', 'comun'],
                    ['Çağlar Söyüncü', 'Turquía', '🇹🇷', 'Defensor', 'fotos/tur_soyuncu.jpg', 'epica'],
                    ['Semih Kiliçsoy', 'Turquía', '🇹🇷', 'Delantero', 'fotos/tur_uzun.jpg', 'comun'], // Nota: Basado en el archivo uzun/Kılıçsoy
                    ['Kenan Yildiz', 'Turquía', '🇹🇷', 'Delantero', 'fotos/tur_yildiz.jpg', 'legendaria'],
                    ['Hakan Çalhanoğlu', 'Turquía', '🇹🇷', 'Mediocampista', 'fotos/tur_yilmaz.jpg', 'legendaria'], // Nota: Basado en el archivo yilmaz/Çalhanoğlu

                    // --- CABO VERDE ---
                    ['Patrick Andrade', 'Cabo Verde', '🇨🇻', 'Mediocampista', 'fotos/ver_andrade.jpg', 'comun'],
                    ['Bebé', 'Cabo Verde', '🇨🇻', 'Delantero', 'fotos/ver_bebe.jpg', 'epica'],
                    ['Jovane Cabral', 'Cabo Verde', '🇨🇻', 'Delantero', 'fotos/ver_cabral.jpg', 'epica'],
                    ['Logan Costa', 'Cabo Verde', '🇨🇻', 'Defensor', 'fotos/ver_costa.jpg', 'rara'],
                    ['Diney', 'Cabo Verde', '🇨🇻', 'Defensor', 'fotos/ver_dinev.jpg', 'comun'], // Nota: Basado en el archivo dinev
                    ['Deroy Duarte', 'Cabo Verde', '🇨🇻', 'Mediocampista', 'fotos/ver_duarte.jpg', 'rara'],
                    ['Dailon Livramento', 'Cabo Verde', '🇨🇻', 'Delantero', 'fotos/ver_livramento.jpg', 'comun'], // Nota: Basado en el archivo livramento
                    ['Ryan Mendes', 'Cabo Verde', '🇨🇻', 'Delantero', 'fotos/ver_mendes.jpg', 'legendaria'],
                    ['Steven Moreira', 'Cabo Verde', '🇨🇻', 'Defensor', 'fotos/ver_moreira.jpg', 'rara'],
                    ['João Paulo', 'Cabo Verde', '🇨🇻', 'Mediocampista', 'fotos/ver_paulo.jpg', 'comun'],
                    ['Pico', 'Cabo Verde', '🇨🇻', 'Defensor', 'fotos/ver_pico.jpg', 'rara'],
                    ['Jamiro Monteiro', 'Cabo Verde', '🇨🇻', 'Mediocampista', 'fotos/ver_pina.jpg', 'rara'], // Nota: Basado en el archivo pina
                    ['Semedo', 'Cabo Verde', '🇨🇻', 'Mediocampista', 'fotos/ver_semedo.jpg', 'comun'],
                    ['Wagner Pina', 'Cabo Verde', '🇨🇻', 'Defensor', 'fotos/ver_semedo-.jpg', 'comun'], // REPETIDA - COMPLETAR
                    ['Vozinha', 'Cabo Verde', '🇨🇻', 'Arquero', 'fotos/ver_vozinha.jpg', 'rara'],

                    // --- NUEVA ZELANDA ---
                    ['Kosta Barbarouses', 'Nueva Zelanda', '🇳🇿', 'Delantero', 'fotos/zel_barbarouses.jpg', 'rara'], //
                    ['Joe Bell', 'Nueva Zelanda', '🇳🇿', 'Mediocampista', 'fotos/zel_bell.jpg', 'rara'], //
                    ['Michael Boxall', 'Nueva Zelanda', '🇳🇿', 'Defensor', 'fotos/zel_boxall.jpg', 'comun'], //
                    ['Liberato Cacace', 'Nueva Zelanda', '🇳🇿', 'Defensor', 'fotos/zel_cacace.jpg', 'epica'], //
                    ['Max Crocombe', 'Nueva Zelanda', '🇳🇿', 'Arquero', 'fotos/zel_crocombe.jpg', 'comun'], //
                    ['Matthew Garbett', 'Nueva Zelanda', '🇳🇿', 'Mediocampista', 'fotos/zel_garbett.jpg', 'rara'], //
                    ['Callum McCowatt', 'Nueva Zelanda', '🇳🇿', 'Delantero', 'fotos/zel_mccowatt.jpg', 'comun'], //
                    ['Alex Paulsen', 'Nueva Zelanda', '🇳🇿', 'Arquero', 'fotos/zel_paulsen.jpg', 'rara'], //
                    ['Tim Payne', 'Nueva Zelanda', '🇳🇿', 'Defensor', 'fotos/zel_payne.jpg', 'comun'], //
                    ['Marko Stamenic', 'Nueva Zelanda', '🇳🇿', 'Mediocampista', 'fotos/zel_stamenic.jpg', 'epica'], //
                    ['Finn Surman', 'Nueva Zelanda', '🇳🇿', 'Defensor', 'fotos/zel_surman.jpg', 'comun'], // Nota: Basado en su archivo surman
                    ['Ryan Thomas', 'Nueva Zelanda', '🇳🇿', 'Mediocampista', 'fotos/zel_thomas.jpg', 'comun'], //
                    ['Francis de Vries', 'Nueva Zelanda', '🇳🇿', 'Defensor', 'fotos/zel_vries.jpg', 'comun'], //
                    ['Chris Wood', 'Nueva Zelanda', '🇳🇿', 'Delantero', 'fotos/zel_wood.jpg', 'legendaria'], //
            ];

            for (const j of granListaJugadores) {
                await pool.query(
                    `INSERT INTO jugadores (nombre, pais, bandera, posicion, foto, rareza) 
                     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (nombre) DO NOTHING`,
                    [j[0], j[1], j[2], j[3], j[4], j[5]]
                );
            }
            console.log(`✅ Base de datos inicializada: ${granListaJugadores.length} jugadores cargados.`);
        }
    } catch (err) {
        console.error("❌ Error al inicializar estructuras en Neon:", err.message);
    }
}

inicializarTablas();

/* ========================================================================
   👤 ENDPOINTS DE AUTENTICACIÓN Y SISTEMA DE USUARIOS
   ======================================================================== */
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const userCheck = await pool.query("SELECT * FROM usuarios WHERE username = $1", [username]);
        
        if (userCheck.rows.length === 0) {
            return res.status(400).json({ error: "❌ El usuario no existe. ¡Registrate primero!" });
        }

        const user = userCheck.rows[0];
        if (user.password === password) {
            console.log(`🔑 [LOGIN] El usuario "${username.toUpperCase()}" ingresó a la Arena.`);
            return res.json({ mensaje: "Login exitoso", usuario: user });
        } else {
            return res.status(400).json({ error: "❌ Contraseña incorrecta." });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/registro', async (req, res) => {
    const { username, password } = req.body;
    const ipCliente = req.ip;

    if (!username || username.trim().length > 14) {
        return res.status(400).json({ error: "❌ El nombre de usuario no puede tener más de 14 caracteres." });
    }
    try {
        const userCheck = await pool.query("SELECT * FROM usuarios WHERE username = $1", [username]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "❌ Ese nombre de usuario ya está ocupado." });
        }

        if (ipCliente && ipCliente !== '::1' && ipCliente !== '127.0.0.1') {
            const ipCheck = await pool.query("SELECT * FROM usuarios WHERE ip_registro = $1", [ipCliente]);
            if (ipCheck.rows.length > 0) {
                return res.status(400).json({ error: "❌ Límite excedido: Ya se creó una cuenta desde esta conexión a Internet." });
            }
        }

        const nuevoUsuario = await pool.query(
            "INSERT INTO usuarios (username, password, ip_registro) VALUES ($1, $2, $3) RETURNING *", 
            [username, password, ipCliente]
        );
        console.log(`✨ [REGISTRO] Nuevo usuario creado: "${username.toUpperCase()}" desde la IP: ${ipCliente}`);
        return res.json({ mensaje: "Registrado con éxito", usuario: nuevoUsuario.rows[0] });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/logout', (req, res) => {
    const { username } = req.body;
    if (username) {
        console.log(`🚪 [LOGOUT] El usuario "${username.toUpperCase()}" salió de la Arena.`);
    }
    res.json({ success: true, mensaje: "Sesión cerrada en servidor" });
});

app.post('/api/actualizar-progreso', async (req, res) => {
    const { usuario_id, monedas, puntos } = req.body;
    
    if (!usuario_id) {
        console.error("⚠️ Intento de actualización de progreso sin usuario_id válido.");
        return res.status(400).json({ error: "Falta el usuario_id en la petición." });
    }

    try {
        await pool.query(
            `UPDATE usuarios SET monedas = monedas + $1, puntos_ranking = puntos_ranking + $2 WHERE id = $3`, 
            [monedas, puntos, usuario_id]
        );
        const result = await pool.query("SELECT monedas, puntos_ranking FROM usuarios WHERE id = $1", [usuario_id]);
        return res.json({ datos: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/* ========================================================================
   📖 ENDPOINTS DEL ÁLBUM PANINI Y TIENDA DE COFRES
   ======================================================================== */
app.get('/api/album/:usuarioId', async (req, res) => {
    const usuarioId = req.params.usuarioId;
    const query = `
        SELECT j.*, COALESCE(up.cantidad, 0) as obtenido 
        FROM jugadores j
        LEFT JOIN usuario_progreso up ON j.id = up.jugador_id AND up.usuario_id = $1
        ORDER BY j.pais ASC, j.id ASC
    `;
    try {
        const result = await pool.query(query, [usuarioId]);
        return res.json({ album: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/comprar-sobre', async (req, res) => {
    const { usuario_id, tipoCofre } = req.body;

    // 💰 BALANCEO POR DEFECTO: COFRE DE ORO (Ahora mucho más desafiante)
    let costo = 250;
    let probLegendaria = 0.015; // 📉 Bajó de 5% a 1.5% (¡Un verdadero logro sacarla!)
    let probEpica = 0.10;       // 📉 Bajó de 15% a 10%
    let probRara = 0.25;        // 🛠️ Cambiado de 'especial' a 'rara' (Alineado con tus inserts)

    // 🥈 BALANCEO COFRE DE PLATA
    if (tipoCofre === 'plata') {
        costo = 100;
        probLegendaria = 0.001; // 📉 Bajó de 0.5% a 0.1% (Casi imposible, pura timba)
        probEpica = 0.03;       // 📉 Bajó de 5% a 3%
        probRara = 0.15;    
    } 
    // 👑 BALANCEO COFRE LEGENDARIO (Garantiza buen loot, pero la Legendaria se respeta)
    else if (tipoCofre === 'legendario') {
        costo = 500;
        probLegendaria = 0.08;  // 📉 Bajó de 25% a 8% (Sigue siendo la mejor opción, pero exclusiva)
        probEpica = 0.30;       // 📉 Bajó de 40% a 30%
        probRara = 0.40;    
    }

    try {
        const userCheck = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
        
        const usuario = userCheck.rows[0];
        if (usuario.monedas < costo) return res.json({ error_oro: true, mensaje: "🪙 No tenés suficiente Oro." });

        const jugadoresCheck = await pool.query("SELECT * FROM jugadores");
        const todosLosJugadores = jugadoresCheck.rows;
        if (todosLosJugadores.length === 0) return res.status(400).json({ error: "No hay jugadores en la DB" });

        let sobreAbierto = [];
        for (let i = 0; i < 5; i++) {
            let rand = Math.random();
            let rarezaElegida = 'comun';

            // Algoritmo de descarte acumulativo matemático
            if (rand < probLegendaria) {
                rarezaElegida = 'legendaria';
            } else if (rand < probLegendaria + probEpica) {
                rarezaElegida = 'epica';
            } else if (rand < probLegendaria + probEpica + probRara) {
                rarezaElegida = 'rara'; // 🛠️ Sincronizado con la base de datos
            }

            let poolFiltrado = todosLosJugadores.filter(j => j.rareza === rarezaElegida);
            
            // Si por algún motivo el pool de esa rareza está vacío, cae en común para no romper el bucle
            if (poolFiltrado.length === 0) {
                poolFiltrado = todosLosJugadores.filter(j => j.rareza === 'comun');
            }
            
            let elegido = poolFiltrado[Math.floor(Math.random() * poolFiltrado.length)];
            sobreAbierto.push({ ...elegido });
        }

        // 💳 Deducción de Oro y guardado en Neon
        const nuevoOro = usuario.monedas - costo;
        await pool.query("UPDATE usuarios SET monedas = $1 WHERE id = $2", [nuevoOro, usuario_id]);

        // 🃏 Inserción/Actualización del inventario de los usuarios
        for (let jugador of sobreAbierto) {
            const progCheck = await pool.query(
                "SELECT cantidad FROM usuario_progreso WHERE usuario_id = $1 AND jugador_id = $2", 
                [usuario_id, jugador.id]
            );
            if (progCheck.rows.length > 0) {
                await pool.query(
                    "UPDATE usuario_progreso SET cantidad = cantidad + 1 WHERE usuario_id = $1 AND jugador_id = $2", 
                    [usuario_id, jugador.id]
                );
                jugador.obtenido = progCheck.rows[0].cantidad + 1;
            } else {
                await pool.query(
                    "INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1)", 
                    [usuario_id, jugador.id]
                );
                jugador.obtenido = 1;
            }
        }

        return res.json({ success: true, sobre: sobreAbierto, monedas: nuevoOro });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/* ========================================================================
   ⚽ MODULE DE PENALES (SISTEMA DE ENERGÍA POR HORA)
   ======================================================================== */
const MAX_TIROS = 10;
const MILISEGUNDOS_POR_TIRO = 6 * 60 * 1000; 

function calcularTirosActuales(usuario) {
    const ahora = new Date();
    
    if (!usuario.ultimo_tiro_timestamp) {
        return { tirosActuales: MAX_TIROS, tiempoParaSiguiente: 0 };
    }

    const ultimoTiro = new Date(usuario.ultimo_tiro_timestamp);
    const tiempoTranscurrido = ahora - ultimoTiro;

    const tirosRegenerados = Math.floor(tiempoTranscurrido / MILISEGUNDOS_POR_TIRO);
    let tirosActuales = usuario.tiros_hoy + tirosRegenerados;

    if (tirosActuales >= MAX_TIROS) {
        return { tirosActuales: MAX_TIROS, tiempoParaSiguiente: 0 };
    }

    const tiempoConsumidoEnEsteTiro = tiempoTranscurrido % MILISEGUNDOS_POR_TIRO;
    const tiempoParaSiguiente = MILISEGUNDOS_POR_TIRO - tiempoConsumidoEnEsteTiro;

    return { tirosActuales, tiempoParaSiguiente };
}

app.get('/api/tiros-restantes/:usuarioId', async (req, res) => {
    const usuarioId = req.params.usuarioId;
    try {
        const result = await pool.query("SELECT ultimo_tiro_timestamp, tiros_hoy FROM usuarios WHERE id = $1", [usuarioId]);
        if (result.rows.length === 0) return res.json({ tiros: MAX_TIROS, siguienteIn: 0 });

        const { tirosActuales, tiempoParaSiguiente } = calcularTirosActuales(result.rows[0]);
        return res.json({ tiros: tirosActuales, siguienteIn: tiempoParaSiguiente });
    } catch (err) {
        return res.json({ tiros: MAX_TIROS, siguienteIn: 0 });
    }
});

app.post('/api/jugar-penal', async (req, res) => {
    const { usuario_id, gano } = req.body;
    const ahora = new Date();

    try {
        const result = await pool.query("SELECT monedas, puntos_ranking, ultimo_tiro_timestamp, tiros_hoy FROM usuarios WHERE id = $1", [usuario_id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

        const usuario = result.rows[0];
        let { tirosActuales, tiempoParaSiguiente } = calcularTirosActuales(usuario);

        if (tirosActuales <= 0) {
            return res.json({ 
                error_limite: true, 
                mensaje: "❌ ¡Te quedaste sin energía! Esperá a que se recupere un tiro. ⏱️" 
            });
        }

        const nuevosTirosGuardados = tirosActuales - 1;
        
        let monedasGanadas = gano ? 100 : 0;
        let puntosGanados = gano ? 15 : 0;
        const nuevasMonedas = usuario.monedas + monedasGanadas;
        const nuevosPuntos = usuario.puntos_ranking + puntosGanados;

        await pool.query(
            `UPDATE usuarios SET monedas = $1, puntos_ranking = $2, ultimo_tiro_timestamp = $3, tiros_hoy = $4 WHERE id = $5`,
            [nuevasMonedas, nuevosPuntos, ahora, nuevosTirosGuardados, usuario_id]
        );
        
        const tiempoActualizado = nuevosTirosGuardados >= MAX_TIROS ? 0 : MILISEGUNDOS_POR_TIRO;

        return res.json({
            success: true,
            tiros_restantes: nuevosTirosGuardados,
            siguienteIn: tiempoActualizado,
            datos: { monedas: nuevasMonedas, puntos_ranking: nuevosPuntos }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/ranking', async (req, res) => {
    const query = `
        SELECT username, puntos_ranking 
        FROM usuarios 
        ORDER BY puntos_ranking DESC 
        LIMIT 10
    `;
    try {
        const result = await pool.query(query);
        return res.json({ ranking: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/ranking-mundiales', async (req, res) => {
    // Filtramos para que solo aparezcan usuarios con copas_mundiales > 0
    const query = `
        SELECT username, copas_mundiales 
        FROM usuarios 
        WHERE copas_mundiales > 0
        ORDER BY copas_mundiales DESC, puntos_ranking DESC 
        LIMIT 10
    `;
    try {
        const result = await pool.query(query);
        return res.json({ ranking: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/* ========================================================================
   🎰 CONFIGURACIÓN Y LÓGICA CORE DE LA TIMBA
   ======================================================================== */
const MAX_TIMBAS = 10; 
const MILISEGUNDOS_POR_TIMBA = 6 * 60 * 1000; 

function calcularTimbasActuales(usuario) {
    const ahora = new Date();
    
    if (!usuario.ultimo_giro_timestamp) {
        return { timbasActuales: MAX_TIMBAS, tiempoParaSiguienteTimba: 0 };
    }

    const ultimoGiro = new Date(usuario.ultimo_giro_timestamp);
    const tiempoTranscurrido = ahora - ultimoGiro;

    const timbasRegeneradas = Math.floor(tiempoTranscurrido / MILISEGUNDOS_POR_TIMBA);
    let timbasActuales = usuario.timbas_hoy + timbasRegeneradas;

    if (timbasActuales >= MAX_TIMBAS) {
        return { timbasActuales: MAX_TIMBAS, tiempoParaSiguienteTimba: 0 };
    }

    const tiempoConsumidoEnEsteGiro = tiempoTranscurrido % MILISEGUNDOS_POR_TIMBA;
    const tiempoParaSiguienteTimba = MILISEGUNDOS_POR_TIMBA - tiempoConsumidoEnEsteGiro;

    return { timbasActuales, tiempoParaSiguienteTimba };
}

const apuestasActivasServidor = {};

function generarGolesServidor() {
    const r = Math.random();
    if (r < 0.25) return 0;
    if (r < 0.55) return 1;
    if (r < 0.80) return 2;
    if (r < 0.93) return 3;
    return Math.floor(Math.random() * 3) + 4;
}

app.get('/api/timbas-restantes/:usuarioId', async (req, res) => {
    const usuarioId = req.params.usuarioId;
    try {
        const result = await pool.query("SELECT ultimo_giro_timestamp, timbas_hoy FROM usuarios WHERE id = $1", [usuarioId]);
        if (result.rows.length === 0) return res.json({ timbas: MAX_TIMBAS, siguienteIn: 0 });

        const { timbasActuales, tiempoParaSiguienteTimba } = calcularTimbasActuales(result.rows[0]);
        return res.json({ timbas: timbasActuales, siguienteIn: tiempoParaSiguienteTimba });
    } catch (err) {
        return res.json({ timbas: MAX_TIMBAS, siguienteIn: 0 });
    }
});

app.post('/api/timba/preparar', async (req, res) => { 
    const { usuario_id, tipoApuesta, montoApuesta, jugadorIdApostado } = req.body;
    
    if (!usuario_id || !tipoApuesta) {
        return res.status(400).json({ ok: false, mensaje: "Datos inválidos." });
    }

    try {
        const userCheck = await pool.query("SELECT monedas, ultimo_giro_timestamp, timbas_hoy FROM usuarios WHERE id = $1", [usuario_id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Usuario no encontrado" });

        const usuario = userCheck.rows[0];

        if (tipoApuesta === "monedas") {
            if (usuario.monedas < montoApuesta || montoApuesta <= 0) {
                return res.json({ ok: false, error_oro: true, mensaje: "🪙 No tenés suficiente Oro para bancar esa apuesta." });
            }
        } else {
            const progCheck = await pool.query(
                "SELECT cantidad FROM usuario_progreso WHERE usuario_id = $1 AND jugador_id = $2",
                [usuario_id, jugadorIdApostado]
            );
            if (progCheck.rows.length === 0 || progCheck.rows[0].cantidad <= 1) {
                return res.json({ ok: false, mensaje: "❌ No tenés stock de repetidas de ese cromo para apostar." });
            }
        }

        let { timbasActuales, tiempoParaSiguienteTimba } = calcularTimbasActuales(usuario);

        if (timbasActuales <= 0) {
            return res.json({ 
                ok: false,
                error_limite: true, 
                mensaje: "❌ ¡Te quedaste sin energía para apostar! Esperá a que recargue el cronómetro de la banca. ⏱️" 
            });
        }

        const nuevasTimbasGuardadas = timbasActuales - 1;
        const ahora = new Date();

        await pool.query(
            `UPDATE usuarios SET ultimo_giro_timestamp = $1, timbas_hoy = $2 WHERE id = $3`,
            [ahora, nuevasTimbasGuardadas, usuario_id]
        );

        const golesLReal = generarGolesServidor();
        const golesVReal = generarGolesServidor();
        const signoReal = golesLReal > golesVReal ? 'L' : (golesLReal < golesVReal ? 'V' : 'E');

        const combinacionesUsadas = new Set();
        combinacionesUsadas.add(`${golesLReal}-${golesVReal}`);

        const poolOpciones = [
            { label: `${golesLReal} - ${golesVReal}`, tipo: 'exacto' }
        ];

        for (let i = 0; i < 2; i++) {
            let glSigno = generarGolesServidor(); let gvSigno = generarGolesServidor();
            let combo = `${glSigno}-${gvSigno}`;
            let signoOpc = glSigno > gvSigno ? 'L' : (glSigno < gvSigno ? 'V' : 'E');
            let intentos = 0;
            while ((combinacionesUsadas.has(combo) || signoOpc !== signoReal) && intentos < 30) {
                glSigno = generarGolesServidor(); gvSigno = generarGolesServidor();
                if (intentos > 15) {
                    if (signoReal === 'L') { glSigno = golesLReal + 1; gvSigno = golesVReal; }
                    else if (signoReal === 'V') { glSigno = golesLReal; gvSigno = golesVReal + 1; }
                    else { glSigno = golesLReal + 1; gvSigno = golesVReal + 1; }
                }
                combo = `${glSigno}-${gvSigno}`; signoOpc = glSigno > gvSigno ? 'L' : (glSigno < gvSigno ? 'V' : 'E'); intentos++;
            }
            combinacionesUsadas.add(combo); poolOpciones.push({ label: `${glSigno} - ${gvSigno}`, tipo: 'signo' });
        }

        for (let i = 0; i < 3; i++) {
            let glErr = generarGolesServidor(); let gvErr = generarGolesServidor();
            let combo = `${glErr}-${gvErr}`;
            let signoOpc = glErr > gvErr ? 'L' : (glErr < gvErr ? 'V' : 'E');
            let intentos = 0;
            while ((combinacionesUsadas.has(combo) || signoOpc === signoReal) && intentos < 30) {
                glErr = generarGolesServidor(); gvErr = generarGolesServidor();
                if (intentos > 15) {
                    if (signoReal === 'L' || signoReal === 'E') { glErr = 0; gvErr = i + 1; } 
                    else { glErr = i + 1; gvErr = 0; }
                }
                combo = `${glErr}-${gvErr}`; signoOpc = glErr > gvErr ? 'L' : (glErr < gvErr ? 'V' : 'E'); intentos++;
            }
            combinacionesUsadas.add(combo); poolOpciones.push({ label: `${glErr} - ${gvErr}`, tipo: 'error' });
        }

        const poolParaCliente = poolOpciones.map((opc, index) => ({
            idOpcion: index,
            label: opc.label
        })).sort(() => Math.random() - 0.5);

        apuestasActivasServidor[usuario_id] = {
            golesLReal,
            golesVReal,
            tipoApuesta,
            montoApuesta,
            jugadorIdApostado,
            mapeoOpciones: poolOpciones
        };

        const tiempoActualizado = nuevasTimbasGuardadas >= MAX_TIMBAS ? 0 : MILISEGUNDOS_POR_TIMBA;
        res.json({ 
            ok: true, 
            opciones: poolParaCliente,
            timbas_restantes: nuevasTimbasGuardadas,
            siguienteIn: tiempoActualizado
        });

    } catch (err) {
        return res.status(500).json({ ok: false, mensaje: "Error en el servidor al preparar." });
    }
});

app.post('/api/timba/procesar', async (req, res) => {
    const { usuario_id, idOpcionElegida } = req.body;
    const apuesta = apuestasActivasServidor[usuario_id];

    if (!apuesta) {
        return res.status(400).json({ ok: false, mensaje: "No hay una apuesta activa preparada." });
    }

    const { golesLReal, golesVReal, tipoApuesta, montoApuesta, jugadorIdApostado, mapeoOpciones } = apuesta;
    const opcionReal = mapeoOpciones[idOpcionElegida];

    let balanceMonedas = 0;
    let puntosAsignados = 0;
    let mensajeResultado = "";

    try {
        if (tipoApuesta === "monedas") {
            // LÓGICA DE MONEDAS TRADICIONAL
            if (opcionReal.tipo === 'exacto') {
                balanceMonedas = montoApuesta * 3; puntosAsignados = 20;
                mensajeResultado = `¡QUÉ ANIMAL! Acertaste el resultado exacto (${golesLReal}-${golesVReal}).\nGanaste: ${montoApuesta * 3} monedas.`;
            } else if (opcionReal.tipo === 'signo') {
                balanceMonedas = Math.round(montoApuesta * 0.5);
                mensajeResultado = `¡BIEN AHÍ! Acertaste el ganador (${opcionReal.label}). El resultado fue ${golesLReal}-${golesVReal}.\nGanaste: ${balanceMonedas} monedas.`;
            } else {
                balanceMonedas = -montoApuesta;
                mensajeResultado = `¡ERRASTE! El partido terminó ${golesLReal}-${golesVReal} y elegiste ${opcionReal.label}.\nPerdiste: ${montoApuesta} monedas.`;
            }

            await pool.query(
                `UPDATE usuarios SET monedas = monedas + $1, puntos_ranking = puntos_ranking + $2 WHERE id = $3`, 
                [balanceMonedas, puntosAsignados, usuario_id]
            );

        } else {
            // 🃏 LÓGICA DE LA TIMBA DE CROMOS REFORMADA
            const cardQuery = await pool.query("SELECT nombre, rareza FROM jugadores WHERE id = $1", [jugadorIdApostado]);
            const cromoApostado = cardQuery.rows[0];
            const rarezaOriginal = cromoApostado.rareza.toLowerCase();

            // Evaluamos el tipo de acierto según la opción elegida
            if (opcionReal.tipo === 'exacto' || opcionReal.tipo === 'signo') {
                
                // CASO A: Si apostó una LEGENDARIA, el premio es ORO PURO
                if (rarezaOriginal === "legendaria") {
                    let oroPremio = opcionReal.tipo === 'exacto' ? 2500 : 1000;
                    puntosAsignados = opcionReal.tipo === 'exacto' ? 40 : 20;

                    await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugadorIdApostado]);
                    await pool.query("UPDATE usuarios SET monedas = monedas + $1, puntos_ranking = puntos_ranking + $2 WHERE id = $3", [oroPremio, puntosAsignados, usuario_id]);

                    if (opcionReal.tipo === 'exacto') {
                        mensajeResultado = `👑 ¡DIOS SANTO PE! Apostaste a ${cromoApostado.nombre.toUpperCase()} Legendario y la clavaste al ángulo (${golesLReal}-${golesVReal}).\n\n💰 ¡LA CASA TE PAGA 🪙2.500 MONEDAS!`;
                    } else {
                        mensajeResultado = `💰 ¡BIEN AHÍ! Acertaste el ganador con tu Legendario (${golesLReal}-${golesVReal}).\n\n🎁 ¡Te llevás 🪙1.000 monedas!`;
                    }

                } else {
                    // CASO B: CROMOS COMUNES/RAROS/EPICOS -> Premio es otro Cromo
                    await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugadorIdApostado]);
                    
                    let rarezaPremio = rarezaOriginal; // Signo -> Misma rareza

                    if (opcionReal.tipo === 'exacto') {
                        // Exacto -> Escala rareza
                        if (rarezaOriginal === "comun") rarezaPremio = "rara";
                        else if (rarezaOriginal === "rara" || rarezaOriginal === "epica") rarezaPremio = "epica";
                        else if (rarezaOriginal === "epica") rarezaPremio = "legendaria";
                    }

                    const poolPremio = await pool.query("SELECT id, nombre, rareza FROM jugadores WHERE rareza = $1 ORDER BY RANDOM() LIMIT 1", [rarezaPremio]);
                    const cromoGanado = poolPremio.rows[0];

                    const checkProg = await pool.query("SELECT cantidad FROM usuario_progreso WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, cromoGanado.id]);
                    if (checkProg.rows.length > 0) {
                        await pool.query("UPDATE usuario_progreso SET cantidad = cantidad + 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, cromoGanado.id]);
                    } else {
                        await pool.query("INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1)", [usuario_id, cromoGanado.id]);
                    }

                    puntosAsignados = opcionReal.tipo === 'exacto' ? 30 : 15;
                    await pool.query("UPDATE usuarios SET puntos_ranking = puntos_ranking + $1 WHERE id = $2", [puntosAsignados, usuario_id]);

                    if (opcionReal.tipo === 'exacto') {
                        mensajeResultado = `🔥 ¡PRO DISPARO! Acertaste el exacto (${golesLReal}-${golesVReal}).\n🎁 ¡EVOLUCIÓN! Te ganaste un cromo SUPERIOR: ${cromoGanado.nombre.toUpperCase()} [${cromoGanado.rareza.toUpperCase()}]`;
                    } else {
                        mensajeResultado = `⚽ ¡GOOOL! Acertaste el ganador. El partido terminó ${golesLReal}-${golesVReal}.\n🃏 La banca te devuelve otro cromo: ${cromoGanado.nombre.toUpperCase()} [${cromoGanado.rareza.toUpperCase()}]`;
                    }
                }

            } else {
                // ERRASTE TODO EL PRONÓSTICO
                await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugadorIdApostado]);
                mensajeResultado = `❌ ¡CROMO PERDIDO! El partido terminó ${golesLReal}-${golesVReal} y tu opción fue ${opcionReal.label}.\nPerdiste 1 copia de ${cromoApostado.nombre.toUpperCase()}.`;
            }
        }

        const userCheck = await pool.query("SELECT monedas, puntos_ranking FROM usuarios WHERE id = $1", [usuario_id]);
        delete apuestasActivasServidor[usuario_id];

        return res.json({
            ok: true,
            mensajeResultado,
            golesLReal: golesLReal,
            golesVReal: golesVReal,
            datos: userCheck.rows[0]
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, mensaje: "Error en DB al procesar." });
    }
});

/* ========================================================================
   ⚽ GENERADOR DE INCIDENCIAS PARA EL FIXTURE
   ======================================================================== */
const generarIncidenciasPartido = (golesL, golesV, tuPais, rival) => {
    let eventos = {};
    
    eventos[45] = "⏳ ENTRETIEMPO: Los equipos van a los vestuarios. ¡Momento de la charla técnica!";

    const minsPeligro = [15, 28, 62, 78, 87];
    const textosPeligro = [
        `🧤 ¡Mano a mano agónico! El arquero de ${tuPais} salva en la línea.`,
        `🟥 ¡Tarjeta Roja! El mediocampo de ${rival} se queda con uno menos por juego brusco.`,
        `⚠️ ¡Tiro libre peligroso en la puerta del área! Pasa rozando el palo.`,
        `⚡ ¡Contraataque letal comandado por las cartas épicas! El estadio es un hervidero.`,
        `🥅 ¡Al palo! El remate rebota en el travesaño y se salva el arco.`
    ];

    minsPeligro.forEach((min, idx) => {
        if (Math.random() < 0.6) { 
            eventos[min] = textosPeligro[idx];
        }
    });

    return eventos;
};

/* ========================================================================
   🏆 MÓDULO MINIMUNDIAL (SINGLE PLAYER / BOTS / COOLDOWNS)
   ======================================================================== */
const COOLDOWN_MUNDIAL_MS = 3 * 60 * 60 * 1000; // 3 Horas reglamentarias

// Mapa de poder según la rareza de las figuritas apostadas
const VALOR_STATS_RAREZA = {
    'comun': 60,
    'especial': 68,
    'rara': 75,
    'epica': 85,
    'legendaria': 96
};

// Mezclador de arrays auxiliar para las ternas aleatorias
function mezclarArray(arr) {
    return arr.sort(() => Math.random() - 0.5);
}

// Lista de selecciones globales (¡40 países!)
const SELECCIONES_BOTS = [
    "Francia", "Brasil", "Alemania", "España", "Italia", "Inglaterra", 
    "Países Bajos", "Portugal", "Uruguay", "Croacia", "Bélgica", "Marruecos", 
    "Japón", "Senegal", "Estados Unidos", "Colombia", "México", "Argentina",
    "Ecuador", "Perú", "Chile", "Paraguay", "Venezuela", "Canadá", "Costa Rica",
    "Nigeria", "Egipto", "Argelia", "Túnez", "Ghana", "Corea del Sur", "Australia",
    "Arabia Saudita", "Irán", "Suiza", "Dinamarca", "Suecia", "Polonia", "Ucrania", "Austria"
];

// A. ENDPOINT: Verificar si el usuario puede jugar y cuántas copas lleva
app.get('/api/mundial/estado/:usuarioId', async (req, res) => {
    const usuarioId = req.params.usuarioId;
    try {
        const userCheck = await pool.query("SELECT copas_mundiales, ultima_timba_mundial FROM usuarios WHERE id = $1", [usuarioId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

        const user = userCheck.rows[0];
        const ahora = new Date();
        let tiempoRestante = 0;

        if (user.ultima_timba_mundial) {
            const ultimaVez = new Date(user.ultima_timba_mundial);
            const transcurrido = ahora - ultimaVez;
            if (transcurrido < COOLDOWN_MUNDIAL_MS) {
                tiempoRestante = COOLDOWN_MUNDIAL_MS - transcurrido;
            }
        }

        return res.json({
            copas: user.copas_mundiales,
            siguienteIn: tiempoRestante
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// B. ENDPOINT: Preparar Torneo actualizando el costo a 1500 de Oro
app.post('/api/mundial/preparar', async (req, res) => {
    const { usuario_id } = req.body;
    try {
        const userCheck = await pool.query("SELECT monedas, ultima_timba_mundial FROM usuarios WHERE id = $1", [usuario_id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Usuario inválido." });

        if (userCheck.rows[0].ultima_timba_mundial) {
            const transcurrido = new Date() - new Date(userCheck.rows[0].ultima_timba_mundial);
            if (transcurrido < COOLDOWN_MUNDIAL_MS) {
                return res.json({ ok: false, elVestuarioEstaCerrado: true, mensaje: `⏳ Vestuario cerrado. Debés esperar a que se cumpla el tiempo.` });
            }
        }

        // 🪙 VALIDACIÓN DE ORO CAMBIADA A 1500
        if (userCheck.rows[0].monedas < 1500) {
            return res.json({ ok: false, mensaje: "🪙 No tenés suficiente Oro. La inscripción al MiniMundial cuesta 1.500 monedas." });
        }

        const paisesValidosQuery = await pool.query(`
            SELECT j.pais 
            FROM usuario_progreso up 
            JOIN jugadores j ON up.jugador_id = j.id 
            WHERE up.usuario_id = $1 AND up.cantidad > 0 
            GROUP BY j.pais 
            HAVING COUNT(j.id) >= 3
        `, [usuario_id]);

        const paisesCandidatos = paisesValidosQuery.rows.map(r => r.pais);

        if (paisesCandidatos.length === 0) {
            return res.json({ ok: false, mensaje: "❌ Requisito insuficiente: Necesitás tener al menos 3 jugadores de un mismo país desbloqueados para poder inscribirte." });
        }

        // 🔥 DEBITAMOS LOS 1500 DE UNA ACÁ
        const nuevoOro = userCheck.rows[0].monedas - 1500;
        await pool.query(
            "UPDATE usuarios SET monedas = $1, ultima_timba_mundial = NOW() WHERE id = $2", 
            [nuevoOro, usuario_id]
        );

        const ternaFiltrada = mezclarArray([...paisesCandidatos]).slice(0, 3);
        
        let rivalClasificacion = SELECCIONES_BOTS[Math.floor(Math.random() * SELECCIONES_BOTS.length)];
        while (ternaFiltrada.includes(rivalClasificacion)) {
            rivalClasificacion = SELECCIONES_BOTS[Math.floor(Math.random() * SELECCIONES_BOTS.length)];
        }

        return res.json({
            ok: true,
            terna: ternaFiltrada,
            rivalClasificacion: rivalClasificacion,
            monedasActualizadas: nuevoOro
        });
        
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/* ========================================================================
   🏆 ENDPOINT DEL MUNDIAL REFACTORIZADO CON INCIDENCIAS
   ======================================================================== */
app.post('/api/mundial/jugar', async (req, res) => {
    const { usuario_id, seleccionElegida, rivalClasificacion, jugadorIds } = req.body;

    if (!jugadorIds || jugadorIds.length !== 3) {
        return res.status(400).json({ ok: false, mensaje: "Debés alinear exactamente 3 jugadores." });
    }

    try {
        // 1. Verificar stock real de los jugadores enviados
        const jCheck = await pool.query(
            "SELECT j.rareza FROM usuario_progreso up JOIN jugadores j ON up.jugador_id = j.id WHERE up.usuario_id = $1 AND up.jugador_id = ANY($2) AND up.cantidad > 0",
            [usuario_id, jugadorIds]
        );

        if (jCheck.rows.length !== 3) {
            return res.json({ ok: false, mensaje: "❌ Uno o más jugadores seleccionados no están disponibles." });
        }

        // 2. Calcular las estrellas del equipo según promedio de rareza
        const sumaStats = jCheck.rows.reduce((acc, row) => acc + VALOR_STATS_RAREZA[row.rareza.toLowerCase()], 0);
        const promedio = sumaStats / 3;
        
        let estrellas = 1;
        if (promedio >= 90) estrellas = 5;
        else if (promedio >= 79) estrellas = 4;
        else if (promedio >= 70) estrellas = 3;
        else if (promedio >= 62) estrellas = 2;

                // 🔥 NUEVO MOTOR DE PROBABILIDAD ESCALONADO Y EXIGENTE
        let chanceVictoria = 0.10; // Base muy baja para 1 estrella

        if (estrellas === 2) {
            chanceVictoria = 0.25; // 2 Estrellas: Casi imposible ganar 4 partidos seguidos (Fase de grupos es un milagro)
        } else if (estrellas === 3) {
            chanceVictoria = 0.48; // 3 Estrellas: Competitivo. Podés pasar grupos si peleás, pero en Playoffs sufrís.
        } else if (estrellas === 4) {
            chanceVictoria = 0.70; // 4 Estrellas: Candidato. Pasás grupos caminando, Playoffs equilibrados.
        } else if (estrellas === 5) {
            chanceVictoria = 0.88; // 5 Estrellas: El "Dream Team". Sos el cuco del torneo.
        }

        // 3. SIMULACIÓN FASE 1: Partido único de Clasificación
        //if (Math.random() > chanceVictoria) {
            //await pool.query("UPDATE usuarios SET ultima_timba_mundial = NOW() WHERE id = $1", [usuario_id]);
            //return res.json({
                //ok: true,
                //progreso: { ganoClasificacion: false },
                //mensaje: `❌ Fuiste eliminado en la Clasificación por ${rivalClasificacion}. Volvé a intentarlo en 3 horas.`
            //});
        //}

        // 4. SIMULACIÓN FASE 2: FASE DE GRUPOS
        let botsDisponibles = SELECCIONES_BOTS.filter(s => s !== seleccionElegida);
        botsDisponibles = mezclarArray(botsDisponibles);

        const rivalGrupo1 = botsDisponibles[0];
        const rivalGrupo2 = botsDisponibles[1];
        const rivalGrupo3 = botsDisponibles[2];
        const integrantesGrupo = [seleccionElegida, rivalGrupo1, rivalGrupo2, rivalGrupo3];

        let bitacoraGrupo = [];
        
        function simularMatchCompleto(eq1, eq2, esUsuario) {
            let g1 = Math.floor(Math.random() * 3);
            let g2 = Math.floor(Math.random() * 3);
            if (esUsuario) {
                if (Math.random() <= chanceVictoria && g1 <= g2) g1 = g2 + Math.floor(Math.random() * 2) + 1;
                else if (Math.random() > chanceVictoria && g2 <= g1) g2 = g1 + Math.floor(Math.random() * 2) + 1;
            }
            return { goles1: g1, goles2: g2 };
        }

        // Fecha 1: Inyección de incidencias en la bitácora
        let f1_m1 = simularMatchCompleto(seleccionElegida, rivalGrupo1, true);
        let f1_m2 = simularMatchCompleto(rivalGrupo2, rivalGrupo3, false);
        bitacoraGrupo.push({ 
            fecha: 1, local: seleccionElegida, visitante: rivalGrupo1, gL: f1_m1.goles1, gV: f1_m1.goles2, 
            botL: rivalGrupo2, botV: rivalGrupo3, gBL: f1_m2.goles1, gBV: f1_m2.goles2,
            incidencias: generarIncidenciasPartido(seleccionElegida, rivalGrupo1) // 🔥 Inyectado
        });

        // Fecha 2: Inyección de incidencias
        let f2_m1 = simularMatchCompleto(seleccionElegida, rivalGrupo2, true);
        let f2_m2 = simularMatchCompleto(rivalGrupo1, rivalGrupo3, false);
        bitacoraGrupo.push({ 
            fecha: 2, local: seleccionElegida, visitante: rivalGrupo2, gL: f2_m1.goles1, gV: f2_m1.goles2, 
            botL: rivalGrupo1, botV: rivalGrupo3, gBL: f2_m2.goles1, gBV: f2_m2.goles2,
            incidencias: generarIncidenciasPartido(seleccionElegida, rivalGrupo2) // 🔥 Inyectado
        });

        // Fecha 3: Inyección de incidencias
        let f3_m1 = simularMatchCompleto(seleccionElegida, rivalGrupo3, true);
        let f3_m2 = simularMatchCompleto(rivalGrupo1, rivalGrupo2, false);
        bitacoraGrupo.push({ 
            fecha: 3, local: seleccionElegida, visitante: rivalGrupo3, gL: f3_m1.goles1, gV: f3_m1.goles2, 
            botL: rivalGrupo1, botV: rivalGrupo2, gBL: f3_m2.goles1, gBV: f3_m2.goles2,
            incidencias: generarIncidenciasPartido(seleccionElegida, rivalGrupo3) // 🔥 Inyectado
        });

        // Procesar matemáticamente la tabla de posiciones final
        let tablaPuntos = {};
        integrantesGrupo.forEach(p => { tablaPuntos[p] = { pais: p, pts: 0, gf: 0, gc: 0 }; });

        function acumular(loc, vis, gl, gv) {
            tablaPuntos[loc].gf += gl; tablaPuntos[loc].gc += gv;
            tablaPuntos[vis].gf += gv; tablaPuntos[vis].gc += gl;
            if (gl > gv) tablaPuntos[loc].pts += 3;
            else if (gl < gv) tablaPuntos[vis].pts += 3;
            else { tablaPuntos[loc].pts += 1; tablaPuntos[vis].pts += 1; }
        }

        bitacoraGrupo.forEach(f => {
            acumular(f.local, f.visitante, f.gL, f.gV);
            acumular(f.botL, f.botV, f.gBL, f.gBV);
        });

        let tablaOrdenada = Object.values(tablaPuntos).sort((a,b) => {
            if (b.pts !== a.pts) return b.pts - a.pts;
            return (b.gf - b.gc) - (a.gf - a.gc);
        });

        let posicionUsuario = tablaOrdenada.findIndex(r => r.pais === seleccionElegida) + 1;
        let clasificaALlaves = posicionUsuario <= 2; 

        // 5. SIMULACIÓN FASE 3: PLAY-OFFS
        let bitacoraPlayoffs = [];
        let campeon = false;
        let faseAlcanzada = "Fase de Grupos";

        if (clasificaALlaves) {
            faseAlcanzada = "Octavos de Final";
            const rivalOctavos = botsDisponibles[3];
            const rivalCuartos = botsDisponibles[4];
            const rivalSemi = botsDisponibles[5];
            const rivalFinal = botsDisponibles[6];

            const llaves = [
                { ronda: "Octavos de Final", rival: rivalOctavos, penalizacion: 0 },
                { ronda: "Cuartos de Final", rival: rivalCuartos, penalizacion: 0.08 },
                { ronda: "Semifinal", rival: rivalSemi, penalizacion: 0.16 },
                { ronda: "Gran Final del Mundo", rival: rivalFinal, penalizacion: 0.24 }
            ];

            campeon = true;
            for (let llave of llaves) {
                faseAlcanzada = llave.ronda;
                
                // Calculamos la chance real de esta ronda restando la penalización
                // Ej: Si tenías 3 estrellas (0.48), en la Final tu chance real será de 0.24 (24%).
                // Si tenías 5 estrellas (0.88), en la Final tu chance será de 0.64 (64%). ¡Se nota la diferencia!
                const chanceRondaReal = Math.max(0.10, chanceVictoria - llave.penalizacion);

                if (Math.random() <= chanceRondaReal) {
                    bitacoraPlayoffs.push({ 
                        ronda: llave.ronda, rival: llave.rival, resultado: "Ganaste ✅",
                        incidencias: generarIncidenciasPartido(seleccionElegida, llave.rival)
                    });
                } else {
                    campeon = false;
                    bitacoraPlayoffs.push({ 
                        ronda: llave.ronda, rival: llave.rival, resultado: "Perdiste ❌",
                        incidencias: generarIncidenciasPartido(seleccionElegida, llave.rival)
                    });
                    break;
                }
            }
        }

        // 6. Guardar base de datos y otorgar premios si corresponde
        const ahora = new Date();

        // 🔥 REPARADO: Quitamos el "COSTO_INSCRIPCION = 1500" que te cobraba doble.
        // Ahora solo SUMA el premio si salís Campeón, o no toca tus monedas si perdés (porque ya pagaste 500 al preparar)
        if (campeon) {
            // Suma los 5.000 de premio limpios, la copa y el ranking
            await pool.query(
                "UPDATE usuarios SET monedas = monedas + 5000, copas_mundiales = copas_mundiales + 1, puntos_ranking = puntos_ranking + 50, ultima_timba_mundial = $1 WHERE id = $2",
                [ahora, usuario_id]
            );
        } else {
            // Si perdés, no te saca más monedas. Solo refresca el timestamp por seguridad
            await pool.query(
                "UPDATE usuarios SET ultima_timba_mundial = $1 WHERE id = $2", 
                [ahora, usuario_id]
            );
        }

        const userFinal = await pool.query("SELECT monedas, puntos_ranking, copas_mundiales FROM usuarios WHERE id = $1", [usuario_id]);

        return res.json({
            ok: true,
            progreso: {
                ganoClasificacion: true,
                integrantesGrupo, 
                bitacoraGrupo,     
                clasifco: clasificaALlaves, 
                clasifico: clasificaALlaves,
                posicionFinalGrupo: posicionUsuario,
                campeon: campeon,
                faseAlcanzada: faseAlcanzada,
                bitacoraPlayoffs
            },
            datosActualizados: userFinal.rows[0]
        });

    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/* ========================================================================
   ⚽ DRAFT MULTIJUGADOR (PREPARACIÓN SIN COMPROMISO DE COOLDOWN)
   ======================================================================== */
app.post('/api/multijugador/preparar-draft', async (req, res) => {
    const { usuario_id } = req.body;
    try {
        const userCheck = await pool.query("SELECT id FROM usuarios WHERE id = $1", [usuario_id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Usuario inválido." });

        // Buscamos qué países tienen como mínimo 3 cartas obtenidas en su inventario
        const paisesValidosQuery = await pool.query(`
            SELECT j.pais 
            FROM usuario_progreso up 
            JOIN jugadores j ON up.jugador_id = j.id 
            WHERE up.usuario_id = $1 AND up.cantidad > 0 
            GROUP BY j.pais 
            HAVING COUNT(j.id) >= 3
        `, [usuario_id]);

        const paisesCandidatos = paisesValidosQuery.rows.map(r => r.pais);

        if (paisesCandidatos.length === 0) {
            return res.json({ ok: false, mensaje: "❌ Requisito insuficiente: Necesitás tener al menos 3 jugadores de un mismo país desbloqueados para participar." });
        }

        // Mandamos una terna aleatoria de 3 países sin activar cooldowns
        const ternaFiltrada = mezclarArray([...paisesCandidatos]).slice(0, 3);

        return res.json({
            ok: true,
            terna: ternaFiltrada
        });
        
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/* ========================================================================
   🏆 MÓDULO MULTIJUGADOR REFORMADO (SALAS, CREACIÓN, ACCESO, APUESTAS)
   ======================================================================== */
app.post('/api/multijugador/crear', async (req, res) => {
    const { usuario_id, seleccion, jugador_ids, tipo_apuesta, apuesta_oro, carta_apuesta_id } = req.body;

    if (!jugador_ids || jugador_ids.length !== 3) {
        return res.json({ ok: false, mensaje: "❌ Debés seleccionar 3 jugadores para tu plantel." });
    }

    const codigo_sala = Math.random().toString(36).substring(2, 8).toUpperCase();
    const modalidad = tipo_apuesta ? tipo_apuesta.toLowerCase() : 'amistoso';
    const montoApuesta = parseInt(apuesta_oro) || 0;

    try {
        // 1. Chequeamos saldo/cartas del creador antes de tocar la base de datos
        const userCheck = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Usuario inválido." });

        const monedasActuales = userCheck.rows[0].monedas;
        let nuevoOroCreador = monedasActuales;
        let pozoInicial = 0;

        // 🎰 Cobro dinámico al HOST según la modalidad
        if (modalidad === 'oro') {
            if (monedasActuales < montoApuesta) {
                return res.json({ ok: false, mensaje: `🪙 No tenés oro suficiente para fijar esa apuesta de ${montoApuesta} monedas.` });
            }
            nuevoOroCreador = monedasActuales - montoApuesta;
            pozoInicial = montoApuesta; // El pozo arranca con el aporte del creador
        } else if (modalidad === 'carta') {
            const miCromoRepetido = await pool.query(
                "SELECT jugador_id FROM usuario_progreso WHERE usuario_id = $1 AND cantidad > 1 LIMIT 1",
                [usuario_id]
            );
            if (miCromoRepetido.rows.length === 0) {
                return res.json({ ok: false, mensaje: "🃏 No podés crear la sala porque no tenés cartas repetidas para arriesgar." });
            }
            await pool.query(
                "UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2",
                [usuario_id, miCromoRepetido.rows[0].jugador_id]
            );
        }

        // 2. Si pasó los filtros, aplicamos el descuento de monedas (si corresponde)
        if (modalidad === 'oro') {
            await pool.query("UPDATE usuarios SET monedas = $1 WHERE id = $2", [nuevoOroCreador, usuario_id]);
        }

        // 3. Insertamos la sala guardando el TIPO_APUESTA y el POZO_TOTAL inicial
        const insertSalaQuery = `
            INSERT INTO mundial_salas (codigo_sala, creador_id, tipo_apuesta, apuesta_oro, pozo_total, estado)
            VALUES ($1, $2, $3, $4, $5, 'esperando')
            RETURNING id;
        `;
        const salaResult = await pool.query(insertSalaQuery, [codigo_sala, usuario_id, modalidad, montoApuesta, pozoInicial]);
        const sala_id = salaResult.rows[0].id;

        // 4. Insertamos al creador en la tabla de participantes
        const insertParticipanteQuery = `
            INSERT INTO sala_participantes (sala_id, usuario_id, seleccion, jugador_ids)
            VALUES ($1, $2, $3, $4);
        `;
        const arrayFormateado = `{${jugador_ids.join(',')}}`; 
        await pool.query(insertParticipanteQuery, [sala_id, usuario_id, seleccion, arrayFormateado]);

        return res.json({
            ok: true,
            sala_id: sala_id,
            codigo_sala: codigo_sala,
            monedasActualizadas: nuevoOroCreador, // Para que el frontend del host actualice su HUD al instante
            mensaje: "Sala creada con éxito en la Arena."
        });

    } catch (error) {
        console.error("❌ ERROR CRÍTICO DE NEON AL CREAR:", error.message);
        return res.status(500).json({ 
            ok: false, 
            mensaje: `Error de Base de Datos: ${error.message}` 
        });
    }
});

// Nuevo endpoint para consultar las reglas de la sala antes de unirse
app.get('/api/multijugador/consultar-sala/:codigo', async (req, res) => {
    const { codigo } = req.params;
    try {
        const salaCheck = await pool.query(
            "SELECT tipo_apuesta, apuesta_oro, estado FROM mundial_salas WHERE codigo_sala = $1", 
            [codigo.toUpperCase()]
        );
        if (salaCheck.rows.length === 0) return res.json({ ok: false, mensaje: "❌ La sala no existe." });
        
        const sala = salaCheck.rows[0];
        return res.json({
            ok: true,
            tipo_apuesta: sala.tipo_apuesta ? sala.tipo_apuesta.toLowerCase() : 'amistoso',
            apuesta_oro: sala.apuesta_oro,
            estado: sala.estado
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/multijugador/unirse', async (req, res) => {
    const { usuario_id, codigo_sala, seleccion, jugador_ids, carta_apuesta_id } = req.body;

    if (!codigo_sala) return res.json({ ok: false, mensaje: "❌ Falta el código de la sala." });
    if (!jugador_ids || jugador_ids.length !== 3) return res.json({ ok: false, mensaje: "❌ Debés seleccionar 3 jugadores." });

    try {
        const salaCheck = await pool.query(
            "SELECT id, tipo_apuesta, apuesta_oro, estado FROM mundial_salas WHERE codigo_sala = $1", 
            [codigo_sala.toUpperCase()]
        );
        if (salaCheck.rows.length === 0) return res.json({ ok: false, mensaje: "❌ La sala no existe." });
        const sala = salaCheck.rows[0];

        if (sala.estado !== 'esperando') return res.json({ ok: false, mensaje: "🚫 Sala cerrada." });

        const userCheck = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);
        const monedasActuales = userCheck.rows[0].monedas;
        let nuevoOroUsuario = monedasActuales;

        const tipoSala = sala.tipo_apuesta ? sala.tipo_apuesta.toLowerCase() : 'amistoso';

        // 🃏 COBRO EXPLÍCITO AL INVITADO SEGÚN LO QUE ELIGIÓ EN LA UI
        if (tipoSala === 'oro') {
            if (monedasActuales < sala.apuesta_oro) return res.json({ ok: false, mensaje: "🪙 No tenés oro suficiente." });
            nuevoOroUsuario = monedasActuales - sala.apuesta_oro;
            await pool.query("UPDATE usuarios SET monedas = $1 WHERE id = $2", [nuevoOroUsuario, usuario_id]);
            await pool.query("UPDATE mundial_salas SET pozo_total = pozo_total + $1 WHERE id = $2", [sala.apuesta_oro, sala.id]);
        } 
        else if (tipoSala === 'carta') {
            if (!carta_apuesta_id) return res.json({ ok: false, mensaje: "🃏 Debés seleccionar una carta repetida para apostar." });
            
            // Verificamos que realmente tenga ese cromo repetido
            const cromoCheck = await pool.query(
                "SELECT cantidad FROM usuario_progreso WHERE usuario_id = $1 AND jugador_id = $2 AND cantidad > 1",
                [usuario_id, carta_apuesta_id]
            );
            if (cromoCheck.rows.length === 0) return res.json({ ok: false, mensaje: "❌ No tenés ese cromo repetido para arriesgar." });

            // Se lo descontamos en el acto al entrar al vestuario
            await pool.query(
                "UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2",
                [usuario_id, carta_apuesta_id]
            );
        }

        // Validación de país libre
        const seleccionCheck = await pool.query("SELECT id FROM sala_participantes WHERE sala_id = $1 AND UPPER(seleccion) = $2", [sala.id, seleccion.toUpperCase()]);
        if (seleccionCheck.rows.length > 0) return res.json({ ok: false, mensaje: `La selección de ${seleccion.toUpperCase()} ya está ocupada.` });

        const arrayFormateadoPostgres = `{${jugador_ids.join(',')}}`;
        await pool.query(
            `INSERT INTO sala_participantes (sala_id, usuario_id, seleccion, jugador_ids) VALUES ($1, $2, $3, $4)`,
            [sala.id, usuario_id, seleccion, arrayFormateadoPostgres]
        );

        return res.json({
            ok: true,
            mensaje: "⚽ ¡Te uniste con éxito!",
            sala_id: sala.id,
            monedasActualizadas: nuevoOroUsuario 
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/multijugador/sala/:codigo', async (req, res) => {
    const { codigo } = req.params;
    try {
        const salaQuery = await pool.query(
            "SELECT id, creador_id, tipo_apuesta, apuesta_oro, pozo_total, estado FROM mundial_salas WHERE codigo_sala = $1",
            [codigo.toUpperCase()]
        );
        if (salaQuery.rows.length === 0) return res.json({ ok: false, mensaje: "La sala no existe." });
        const sala = salaQuery.rows[0];

        const participantesQuery = await pool.query(
            `SELECT sp.usuario_id, u.username, sp.seleccion 
             FROM sala_participantes sp
             JOIN usuarios u ON sp.usuario_id = u.id
             WHERE sp.sala_id = $1`, [sala.id]
        );

        return res.json({
            ok: true,
            sala_id: sala.id,
            creador_id: sala.creador_id,
            tipo_apuesta: sala.tipo_apuesta,
            apuesta_oro: sala.apuesta_oro,
            pozo_total: sala.pozo_total,
            estado: sala.estado,
            participantes: participantesQuery.rows
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/* ========================================================================
   💥 SIMULACIÓN Y PROCESAMIENTO EXCLUSIVO DE LLAVES MULTIJUGADOR
   ======================================================================== */
function simularPartidoEliminatorio(equipo1, equipo2) {
    let g1 = Math.floor(Math.random() * 4);
    let g2 = Math.floor(Math.random() * 4);
    let fueAPenales = false;
    let penales1 = 0; let penales2 = 0;
    let ganador;

    if (g1 > g2) ganador = equipo1;
    else if (g2 > g1) ganador = equipo2;
    else {
        fueAPenales = true;
        while (penales1 === penales2) {
            penales1 = Math.floor(Math.random() * 5) + 1;
            penales2 = Math.floor(Math.random() * 5) + 1;
        }
        ganador = (penales1 > penales2) ? equipo1 : equipo2;
    }

    return {
        local: equipo1, visitante: equipo2,
        golesL: g1, golesV: g2,
        penalesL: fueAPenales ? penales1 : null, penalesV: fueAPenales ? penales2 : null,
        definicionPenales: fueAPenales, ganador: ganador
    };
}

app.post('/api/multijugador/jugar', async (req, res) => {
    const { sala_id, usuario_id } = req.body;
    try {
        const salaQuery = await pool.query("SELECT * FROM mundial_salas WHERE id = $1", [sala_id]);
        if (salaQuery.rows.length === 0) return res.json({ ok: false, mensaje: "Sala no encontrada." });
        
        const sala = salaQuery.rows[0];
        if (sala.creador_id !== usuario_id) return res.json({ ok: false, mensaje: "⛔ Solo el creador puede iniciar." });
        if (sala.estado !== 'esperando') return res.json({ ok: false, mensaje: "🚫 Sala cerrada o ya simulada." });

        const participantesQuery = await pool.query(
            `SELECT sp.usuario_id, u.username, sp.seleccion 
             FROM sala_participantes sp
             JOIN usuarios u ON sp.usuario_id = u.id
             WHERE sp.sala_id = $1`, [sala_id]
        );
        
        let competidores = participantesQuery.rows.map(p => ({
            id: p.usuario_id,
            username: p.username,
            seleccion: p.seleccion,
            esBot: false
        }));

        if (competidores.length < 2) return res.json({ ok: false, mensaje: "❌ Se necesitan al menos 2 jugadores reales." });

        const PAISES_BOTS_BACKUP = ["ALEMANIA", "ITALIA", "ESPAÑA", "INGLATERRA", "PORTUGAL", "HOLANDA", "URUGUAY", "MÉXICO"];
        let botIdx = 0;
        while (competidores.length < 8) {
            let paisBot = PAISES_BOTS_BACKUP[botIdx % PAISES_BOTS_BACKUP.length];
            let yaExiste = competidores.some(c => c.seleccion.toUpperCase() === paisBot.toUpperCase());
            if (!yaExiste) {
                competidores.push({ id: null, username: `🤖 Bot ${paisBot}`, seleccion: paisBot, esBot: true });
            }
            botIdx++;
        }

        // 📋 1. REMOCIÓN PREVIA DE APUESTAS
        const modalidadSala = sala.tipo_apuesta ? sala.tipo_apuesta.toLowerCase() : 'amistoso';
        
        if (modalidadSala === 'carta') {
            for (let jugadorReal of competidores.filter(c => !c.esBot)) {
                const cartaCheck = await pool.query("SELECT jugador_id FROM usuario_progreso WHERE usuario_id = $1 AND cantidad > 0 LIMIT 1", [jugadorReal.id]);
                if (cartaCheck.rows.length > 0) {
                    await pool.query(
                        "UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2",
                        [jugadorReal.id, cartaCheck.rows[0].id]
                    );
                }
            }
        }

        // ========================================================================
        // 🎲 2. NUEVO SISTEMA DE SORTEO PURO DE LLAVES (ANTI-CRUCE FIJO)
        // ========================================================================
        let listaMezclada = mezclarArray([...competidores]);
        let grillaTorneo = new Array(8);
        
        // Repartimos a los usuarios y bots en casilleros aleatorios del 0 al 7
        for (let competidor of listaMezclada) {
            let posAleatoria = Math.floor(Math.random() * 8);
            while (grillaTorneo[posAleatoria] !== undefined) {
                posAleatoria = (posAleatoria + 1) % 8; // Evita solapamiento de posiciones
            }
            grillaTorneo[posAleatoria] = competidor;
        }

        let bitacoraPartidosPlana = [];

        // ========================================================================
        // 🏆 3. SIMULACIÓN DE CUARTOS DE FINAL (Usa grillaTorneo)
        // ========================================================================
        let ganadoresCuartos = new Array(4);
        let numeroPartido = 1;

        for (let i = 0; i < 8; i += 2) {
            // Se enfrentan de forma balanceada: 0 vs 1, 2 vs 3, 4 vs 5, 6 vs 7
            let cruce = simularPartidoEliminatorio(grillaTorneo[i], grillaTorneo[i+1]);
            
            bitacoraPartidosPlana.push({
                ronda: `Cuartos de Final (${numeroPartido}/4)`,
                local: cruce.local.seleccion,
                visitante: cruce.visitante.seleccion,
                golesLocal: cruce.golesL,
                golesVisitante: cruce.golesV,
                penalesLocal: cruce.penalesL,
                penalesVisitante: cruce.penalesV,
                definicionPenales: cruce.definicionPenales,
                ganadorUsername: cruce.ganador.username,
                incidencias: generarIncidenciasPartido(cruce.local.seleccion, cruce.visitante.seleccion) 
            });
            
            ganadoresCuartos[numeroPartido - 1] = cruce.ganador;
            numeroPartido++;
        }

        // ========================================================================
        // 🏆 4. SIMULACIÓN DE SEMIFINALES
        // ========================================================================
        let numeroSemi = 1;
        let ganadoresSemis = [];

        for (let i = 0; i < 4; i += 2) {
            let cruce = simularPartidoEliminatorio(ganadoresCuartos[i], ganadoresCuartos[i+1]);
            
            bitacoraPartidosPlana.push({
                ronda: `Semifinal (${numeroSemi}/2)`,
                local: cruce.local.seleccion,
                visitante: cruce.visitante.seleccion,
                golesLocal: cruce.golesL,
                golesVisitante: cruce.golesV,
                penalesLocal: cruce.penalesL,
                penalesVisitante: cruce.penalesV,
                definicionPenales: cruce.definicionPenales,
                ganadorUsername: cruce.ganador.username,
                incidencias: generarIncidenciasPartido(cruce.local.seleccion, cruce.visitante.seleccion)
            });
            
            ganadoresSemis.push(cruce.ganador);
            numeroSemi++;
        }

        // ========================================================================
        // 🏆 5. SIMULACIÓN DE LA GRAN FINAL
        // ========================================================================
        let finalCruce = simularPartidoEliminatorio(ganadoresSemis[0], ganadoresSemis[1]);
        const campeonMundial = finalCruce.ganador;
        
        bitacoraPartidosPlana.push({
            ronda: "Gran Final",
            local: finalCruce.local.seleccion,
            visitante: finalCruce.visitante.seleccion,
            golesLocal: finalCruce.golesL,
            golesVisitante: finalCruce.golesV,
            penalesLocal: finalCruce.penalesL,
            penalesVisitante: finalCruce.penalesV,
            definicionPenales: finalCruce.definicionPenales,
            ganadorUsername: finalCruce.ganador.username,
            incidencias: generarIncidenciasPartido(finalCruce.local.seleccion, finalCruce.visitante.seleccion)
        });

        // ========================================================================
        // 🎁 6. RECOMPENSAS FINALES Y POZOS
        // ========================================================================
        let datosPremio = { 
            ganoBot: true, 
            ganador_username: campeonMundial.username, 
            pozo: sala.pozo_total, 
            tipo_apuesta: sala.tipo_apuesta,
            nombreCartaPremio: null 
        };
        
        if (!campeonMundial.esBot) {
            datosPremio.ganoBot = false;

            if (modalidadSala === 'oro') {
                await pool.query("UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2", [sala.pozo_total, campeonMundial.id]);
            } else if (modalidadSala === 'carta') {
                const lootPremio = await pool.query("SELECT id, nombre, rareza FROM jugadores WHERE rareza IN ('epica', 'legendaria') ORDER BY RANDOM() LIMIT 1");
                const cartaRecompensa = lootPremio.rows[0];
                
                await pool.query(
                    `INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1) 
                     ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + 1`,
                    [campeonMundial.id, cartaRecompensa.id]
                );
                
                datosPremio.nombreCartaPremio = `${cartaRecompensa.nombre} (${cartaRecompensa.rareza.toUpperCase()})`;
            }
        }

        await pool.query("UPDATE mundial_salas SET estado = 'finalizado' WHERE id = $1", [sala_id]);

        BITACORAS_SALA_CACHE[sala_id] = { bitacora: bitacoraPartidosPlana, premio: datosPremio };

        return res.json({ ok: true, bitacora: bitacoraPartidosPlana, premio: datosPremio });

    } catch (err) {
        console.error("❌ Error en simulación:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/multijugador/resultado-invitado/:sala_id', async (req, res) => {
    const { sala_id } = req.params;
    try {
        const salaQuery = await pool.query("SELECT estado, tipo_apuesta, pozo_total FROM mundial_salas WHERE id = $1", [sala_id]);
        if (salaQuery.rows.length === 0) return res.json({ ok: false, mensaje: "Sala no encontrada." });
        
        const sala = salaQuery.rows[0];

        // 🛡️ Buscamos los datos unificados guardados calientes en memoria
        const datosCache = BITACORAS_SALA_CACHE[sala_id];
        if (datosCache) {
            return res.json({
                ok: true,
                bitacora: datosCache.bitacora,
                premio: datosCache.premio
            });
        }

        // Si la sala ya terminó pero la memoria se barrió, evitamos romper el frente mandando un array estructurado
        if (sala.estado === 'finalizado') {
            return res.json({
                ok: true,
                bitacora: [
                    { ronda: "Torneo Concluido", local: "Arena Online", visitante: "Estadio", golesLocal: 0, golesVisitante: 0, ganadorUsername: "Finalizado" }
                ],
                premio: { ganoBot: false, ganador_username: "Completado", pozo: sala.pozo_total, tipo_apuesta: sala.tipo_apuesta }
            });
        }

        return res.json({ ok: false, mensaje: "⏳ Esperando el procesamiento del silbatazo inicial del host..." });

    } catch (err) {
        console.error("❌ Error en consulta espejo de invitado:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/* ========================================================================
   🃏 BOT COMERCIANTE MUTADO: ESCALERA DE RAREZAS + EVENTOS ULTRA RAROS
   ======================================================================== */
app.post('/api/album/comerciar-bot', async (req, res) => {
    const { usuario_id, jugadorIdsASacar } = req.body; 

    if (!jugadorIdsASacar || jugadorIdsASacar.length !== 3) {
        return res.status(400).json({ ok: false, mensaje: "El Bot exige exactamente 3 cartas para el trato." });
    }

    try {
        // 1. Mapeamos el conteo solicitado en memoria
        const conteoSolicitado = {};
        jugadorIdsASacar.forEach(id => {
            conteoSolicitado[id] = (conteoSolicitado[id] || 0) + 1;
        });

        // 2. Traemos las rarezas reales de esas cartas haciendo un JOIN seguro
        // Esto nos permite saber de qué rareza es cada cromo que se está entregando
        const cartasInfo = await pool.query(
            `SELECT up.jugador_id, up.cantidad, j.rareza 
             FROM usuario_progreso up 
             JOIN jugadores j ON up.jugador_id = j.id 
             WHERE up.usuario_id = $1 AND up.jugador_id = ANY($2)`,
            [usuario_id, jugadorIdsASacar]
        );

        if (cartasInfo.rows.length === 0) {
            return res.json({ ok: false, mensaje: "❌ No se encontraron los cromos seleccionados en tu inventario." });
        }

        // Validamos el stock real de cada una de ellas antes de tocarlas
        for (let row of cartasInfo.rows) {
            const pedidas = conteoSolicitado[row.jugador_id];
            if (row.cantidad - pedidas < 1) {
                return res.json({ ok: false, mensaje: "❌ No tenés repetidas suficientes de alguno de los jugadores elegidos." });
            }
        }

        // 🔥 VALIDACIÓN CRUCIAL: Las 3 cartas entregadas deben ser de la misma rareza
        const rarezaBase = cartasInfo.rows[0].rareza.toLowerCase();
        const todasIgualRareza = cartasInfo.rows.every(row => row.rareza.toLowerCase() === rarezaBase);

        if (!todasIgualRareza) {
            return res.json({ ok: false, mensaje: "❌ El Bot exige que las 3 cartas sacrificadas sean de la misma rareza para calcular el escalón." });
        }

        // 3. Sistema de Escalera: Definimos qué rareza va a recibir a cambio
        let rarezaRecompensa = "rara"; // Por defecto (si mete común)
        if (rarezaBase === "rara") rarezaRecompensa = "epica";
        else if (rarezaBase === "epica") rarezaRecompensa = "legendaria";
        else if (rarezaBase === "legendaria") rarezaRecompensa = "legendaria"; // Tope de gama

        // 4. Procedemos a descontar el stock en Neon (columna 'cantidad')
        for (let jId of jugadorIdsASacar) {
            await pool.query(
                "UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2",
                [usuario_id, jId]
            );
        }

        // 5. Sorteamos el jugador de premio con la rareza superior garantizada
        const lootBot = await pool.query(
            "SELECT id, nombre, rareza FROM jugadores WHERE rareza = $1 ORDER BY RANDOM() LIMIT 1",
            [rarezaRecompensa]
        );
        const cartaPremio = lootBot.rows[0];

        // Inyectamos la recompensa al usuario
        await pool.query(
            `INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1) 
             ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + 1`,
            [usuario_id, cartaPremio.id]
        );

        // ========================================================================
        // 🎰 6. EVENTOS ULTRA RAROS (Solo con Épicas o Legendarias - 8% de Chance)
        // ========================================================================
        let eventoActivado = null;
        const esElite = (rarezaBase === "epica" || rarezaBase === "legendaria");

        if (esElite && Math.random() <= 0.08) { // 8% de probabilidad de romper el juego
            const dadosEvento = Math.random();

            if (dadosEvento < 0.50) {
                // Evento A: Reiniciar los tiros de penales (Ej: Actualizamos tu columna de energía/tiros a 10)
                // (Nota: Ajustá el nombre de la columna según manejes tus tiros en la tabla 'usuarios')
                await pool.query("UPDATE usuarios SET tiros_penales_disponibles = 10 WHERE id = $1", [usuario_id]);
                eventoActivado = "⚡ ¡EL BOT SE COPO! Te recargó el cargador: Volvés a tener 10 penales disponibles al toque.";
            } else {
                // Evento B: Limpiar el cooldown del mundial (Seteamos la última timba al pasado lejano)
                await pool.query(
                    "UPDATE usuarios SET ultima_timba_mundial = NOW() - INTERVAL '4 hours' WHERE id = $1", 
                    [usuario_id]
                );
                eventoActivado = "⏳ ¡CONTRABANDO TÁCTICO! El Bot alteró los papeles del vestuario. ¡Podés jugar el Mundial de vuelta YA sin esperar!";
            }
        }

        // 7. Retorno de respuesta limpia al Front
        return res.json({
            ok: true,
            mensaje: `🤝 ¡Trato hecho! Cambiaste 3 cartas de tipo [${rarezaBase.toUpperCase()}] por un escalón superior.`,
            cartaGanada: {
                id: cartaPremio.id,
                nombre: cartaPremio.nombre,
                rareza: cartaPremio.rareza.toUpperCase()
            },
            eventoEspecial: eventoActivado // Si es null, el front lo ignora
        });

    } catch (err) {
        console.error("❌ Error en Mercado Bot Mutado:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/* ========================================================================
   💸 ENGINE MERCADO DE PASES INTER-JUGADORES (P2P) - FIJADO EN 'CANTIDAD'
   ======================================================================== */

// 1. Publicar una carta a la vitrina de transferencias
app.post('/api/mercado/publicar', async (req, res) => {
    const { usuario_id, jugador_id, precio } = req.body;

    try {
        const checkStock = await pool.query(
            "SELECT cantidad FROM usuario_progreso WHERE usuario_id = $1 AND jugador_id = $2",
            [usuario_id, jugador_id]
        );

        if (checkStock.rows.length === 0 || checkStock.rows[0].cantidad <= 1) {
            return res.json({ ok: false, mensaje: "❌ No tenés copias repetidas suficientes de esta carta para vender." });
        }

        await pool.query(
            "UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2",
            [usuario_id, jugador_id]
        );

        await pool.query(
            "INSERT INTO mercado_pases (vendedor_id, jugador_id, precio_oro) VALUES ($1, $2, $3)",
            [usuario_id, jugador_id, precio]
        );

        return res.json({ ok: true, mensaje: "Carta publicada con éxito." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// 1. REEMPLAZÁ TU VIEJO GET CON ESTE (Ya viene con el filtro WHERE de 1 día)
app.get('/api/mercado/ofertas', async (req, res) => {
    let { usuario_id } = req.query;
    try {
        if (usuario_id && String(usuario_id).includes(":")) {
            usuario_id = String(usuario_id).split(":")[0];
        }

        const ofertas = await pool.query(
            `SELECT m.id, m.precio_oro, m.vendedor_id, j.nombre, j.rareza, j.bandera, u.username AS nombre_vendedor
             FROM mercado_pases m
             JOIN jugadores j ON m.jugador_id = j.id
             JOIN usuarios u ON m.vendedor_id = u.id
             WHERE m.fecha_publicacion >= NOW() - INTERVAL '1 day'
             ORDER BY m.fecha_publicacion DESC`
        );
        return res.json({ ok: true, ofertas: ofertas.rows });
    } catch (err) {
        console.error("❌ Error en GET ofertas mercado:", err);
        return res.json({ ok: false, error: err.message, mensaje: "Error al sincronizar con Neon." });
    }
});

// 2. PEGÁ EL LIMPIADOR ACÁ (Suelto en el archivo, abajo del GET)
setInterval(async () => {
    console.log("🧹 Revisando vitrinas del mercado para limpiar pases vencidos...");
    try {
        const vencidas = await pool.query(
            "SELECT id, vendedor_id, jugador_id FROM mercado_pases WHERE fecha_publicacion < NOW() - INTERVAL '1 day'"
        );

        if (vencidas.rows.length > 0) {
            console.log(`📦 Encontradas ${vencidas.rows.length} ofertas vencidas. Devolviendo cromos...`);
            for (let oferta of vencidas.rows) {
                await pool.query(
                    `INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1)
                     ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + 1`,
                    [oferta.vendedor_id, oferta.jugador_id]
                );
                await pool.query("DELETE FROM mercado_pases WHERE id = $1", [oferta.id]);
            }
            console.log("✅ Devolución y limpieza completada.");
        }
    } catch (err) {
        console.error("❌ Error crítico en el limpiador del mercado:", err.message);
    }
}, 15 * 60 * 1000); // Se ejecuta en background cada 15 min

// 3. Procesar la compra de un cromo expuesto de forma atómica
app.post('/api/mercado/comprar', async (req, res) => {
    let { usuario_id, oferta_id } = req.body; 

    try {
        // 🛡️ Blindaje por si el Front todavía arrastra un ID corrupto tipo "1:1"
        if (usuario_id && String(usuario_id).includes(":")) {
            usuario_id = String(usuario_id).split(":")[0];
        }
        usuario_id = parseInt(usuario_id);

        const buscarOferta = await pool.query(
            "SELECT vendedor_id, jugador_id, precio_oro FROM mercado_pases WHERE id = $1",
            [oferta_id]
        );

        if (buscarOferta.rows.length === 0) {
            return res.json({ ok: false, mensaje: "❌ La oferta ya no está disponible en el mercado." });
        }

        const { vendedor_id, jugador_id, precio_oro } = buscarOferta.rows[0];

        if (parseInt(vendedor_id) === usuario_id) {
            return res.json({ ok: false, mensaje: "❌ No podés comprar tu propia publicación." });
        }

        const checkOro = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);
        if (checkOro.rows.length === 0 || checkOro.rows[0].monedas < precio_oro) {
            return res.json({ ok: false, mensaje: "❌ No tenés suficiente Oro en tu cuenta para este fichaje." });
        }

        // Transferencia económica segura
        await pool.query("UPDATE usuarios SET monedas = monedas - $1 WHERE id = $2", [precio_oro, usuario_id]);
        await pool.query("UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2", [precio_oro, vendedor_id]);

        // Transferir el cromo al inventario
        await pool.query(
            `INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1)
             ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + 1`,
            [usuario_id, jugador_id]
        );

        // Sacamos la oferta de la vitrina
        await pool.query("DELETE FROM mercado_pases WHERE id = $1", [oferta_id]);

        // Traemos el nombre del jugador para el Front
        const infoJugador = await pool.query("SELECT nombre FROM jugadores WHERE id = $1", [jugador_id]);

        // 🔥 NUEVO: Consultamos el saldo final real directamente de la base de datos de Neon
        const checkOroNuevo = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);
        const nuevoOro = checkOroNuevo.rows[0].monedas;

        // Devuelve todo al Front, incluyendo las monedas actualizadas
        return res.json({ 
            ok: true, 
            jugador: infoJugador.rows[0].nombre,
            nuevoOro: nuevoOro 
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/* ========================================================================
   🎰 ENGINE QUINIELA COMBINADA (ROTATIVA Y ATÓMICA)
   ======================================================================== */

// Banco de partidos para que el sistema elija 3 al azar y vayan rotando
const BANCO_PARTIDOS_QUINIELA = [
    { local: "BOCA", visitante: "RIVER", emoji: "🔥" },
    { local: "REAL MADRID", visitante: "BARCELONA", emoji: "👑" },
    { local: "MANCHESTER CITY", visitante: "ARSENAL", emoji: "🦈" },
    { local: "RACING", visitante: "INDEPENDIENTE", emoji: "🎓" },
    { local: "MILAN", visitante: "INTER", emoji: "⚔️" },
    { local: "FLAMENGO", visitante: "PALMEIRAS", emoji: "🇧🇷" },
    { local: "LIVERPOOL", visitante: "MAN. UNITED", emoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    { local: "HURACÁN", visitante: "SAN LORENZO", emoji: "🎈" },
    { local: "BAYERN MUNICH", visitante: "DORTMUND", emoji: "🇩🇪" },
    { local: "JUVENTUS", visitante: "ROMA", emoji: "🇮🇹" }
];

// Almacén temporal en memoria para los 3 partidos activos de la fecha
let partidosActivosQuiniela = [];

// Mezcla el banco de datos y clava 3 partidos nuevos
function rotarFixtureQuiniela() {
    const copia = [...BANCO_PARTIDOS_QUINIELA];
    const mezclados = copia.sort(() => 0.5 - Math.random());
    partidosActivosQuiniela = mezclados.slice(0, 3);
}

// Inicializamos la primera tanda de partidos al arrancar el servidor
rotarFixtureQuiniela();

// 1. Endpoint para darle la cartelera rotativa actual al Frontend
app.get('/api/timba/quiniela/partidos', (req, res) => {
    res.json({ ok: true, partidos: partidosActivosQuiniela });
});

// 2. Endpoint para procesar la boleta combinada de forma segura
// Endpoint para procesar la boleta compartiendo la energía nativa de la timba
app.post('/api/timba/quiniela', async (req, res) => {
    let { usuario_id, monto, elecciones } = req.body;

    try {
        if (usuario_id && String(usuario_id).includes(":")) {
            usuario_id = String(usuario_id).split(":")[0];
        }
        usuario_id = parseInt(usuario_id);
        monto = parseInt(monto);

        if (!monto || monto < 50) {
            return res.json({ ok: false, mensaje: "⚠️ El monto mínimo para la boleta es de 50 de Oro." });
        }

        // 1. Validar fondos y energía en simultáneo desde la tabla usuarios
        const checkUser = await pool.query("SELECT monedas, ultimo_giro_timestamp, timbas_hoy FROM usuarios WHERE id = $1", [usuario_id]);
        if (checkUser.rows.length === 0) {
            return res.json({ ok: false, mensaje: "❌ Usuario no encontrado." });
        }

        const usuario = checkUser.rows[0];

        if (usuario.monedas < monto) {
            return res.json({ ok: false, mensaje: "❌ No tenés suficiente Oro en tu cuenta para esta jugada." });
        }

        // 2. 🔥 REPARADO: Calcular energía real con tu función core
        let { timbasActuales } = calcularTimbasActuales(usuario);

        if (timbasActuales <= 0) {
            return res.json({ 
                ok: false, 
                mensaje: "❌ ¡Te quedaste sin energía para apostar en la quiniela! Esperá a que recargue el cronómetro de la banca. ⏱️" 
            });
        }

        // Quemamos 1 intento de energía y actualizamos los timestamps igual que tu timba común
        const nuevasTimbasGuardadas = timbasActuales - 1;
        const ahora = new Date();

        // Descontamos Oro y cobramos 1 punto de energía en la misma transacción
        await pool.query(
            `UPDATE usuarios SET monedas = monedas - $1, ultimo_giro_timestamp = $2, timbas_hoy = $3 WHERE id = $4`,
            [monto, ahora, nuevasTimbasGuardadas, usuario_id]
        );

        // 3. SIMULACIÓN INTERNA DE LOS 3 ENCUENTROS ACTIVOS
        const opciones = ['L', 'E', 'V'];
        const reales = {
            p1: opciones[Math.floor(Math.random() * 3)],
            p2: opciones[Math.floor(Math.random() * 3)],
            p3: opciones[Math.floor(Math.random() * 3)]
        };

        const boletaGanadora = (elecciones.p1 === reales.p1 && elecciones.p2 === reales.p2 && elecciones.p3 === reales.p3);
        let premio = 0;
        let mensaje = "";

        if (boletaGanadora) {
            premio = monto * 10;
            await pool.query("UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2", [premio, usuario_id]);
            mensaje = `🔥 ¡QUINIELA DE ORO PERFECTA! Acertaste los 3 partidos y ganaste 🪙${premio}.`;
        } else {
            mensaje = "❌ Boleta perdedora. Fallaste en el pronóstico combinado.";
        }

        // Guardamos el registro en la tabla de la quiniela
        await pool.query(
            "INSERT INTO quiniela_apuestas (usuario_id, monto_apostado, predicciones, ganada, premio_entregado) VALUES ($1, $2, $3, $4, $5)",
            [usuario_id, monto, JSON.stringify(elecciones), boletaGanadora, premio]
        );

        // Traemos el saldo fresco final de Neon para actualizar la UI del cliente
        const checkOroFinal = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);
        const nuevoOro = checkOroFinal.rows[0].monedas;

        return res.json({
            ok: true,
            ganó: boletaGanadora,
            mensaje: mensaje,
            resultadosReales: reales,
            partidosSimulados: partidosActivosQuiniela,
            nuevoOro: nuevoOro
        });

    } catch (err) {
        console.error("❌ Error en la quiniela:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/* ========================================================================
   🚨 CONFIGURACIÓN Y ENDPOINT SEGURO DE ANUNCIOS GLOBAL
   ======================================================================== */
// Esta configuración vive en el servidor, nadie la puede tocar desde el navegador
const CONFIG_ANUNCIO_SERVIDOR = {
    activo: true,       // true = encendido | false = apagado
    tipo: "video",      // "texto" | "imagen" | "video"
    titulo: "¡ACTUALIZACIÓN DE TEMPORADA!",
    texto: "Prendete a los nuevos torneos en vivo. Calibramos el MiniMundial para que sea más justo.",
    urlImagen: "https://albumpe.onrender.com/assets/novedad.png", 
    urlVideo: "https://www.youtube.com/embed/6DTWH9kYAiY" 
};

// Endpoint público para que el juego consulte el anuncio
app.get('/api/anuncio-actual', (req, res) => {
    return res.json(CONFIG_ANUNCIO_SERVIDOR);
});

/* ========================================================================
   🚀 INICIALIZACIÓN DEL SERVIDOR
   ======================================================================== */
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en la Nube / Red Local activo en puerto ${PORT}`);
});
