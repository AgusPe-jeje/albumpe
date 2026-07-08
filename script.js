/* ========================================================================
   🎯 1. CONFIGURACIÓN, INSTANCIAS Y VARIABLES DE ESTADO GLOBAL
   ======================================================================== */

const URL_RENDER_SERVICIO = "https://albumpe.onrender.com";
const URL_BASE = `${URL_RENDER_SERVICIO}/api`;

// Estados del Usuario y Configuración de Sesión
let usuarioActual = null;
window.usuarioVisitaId = null;
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

// Mapeos EstStaticos de Diseño y Lógica de Puntos
const MAPA_PUNTOS_RAREZA = { 
    'comun': 60, 
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
     // 🔥 CORREGIDO: Agregamos '#modulo-mercado-pases' y '#modulo-contratos-sbc' para que se oculten correctamente al navegar
     document.querySelectorAll('.modulo-contenido, #modulo-mundial-multi, #modulo-mercado-pases, #modulo-contratos-sbc').forEach(mod => mod.style.display = 'none');
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
          // Si tu función cargarAlbumLocal() hace un fetch a la base de datos, 
          // nos aseguramos de que window.albumCompleto tenga información real antes de renderizar el select
          if (typeof cargarAlbumLocal === "function") {
               cargarAlbumLocal().then(() => {
                    cargarMisRepetidasParaVenta();
               }).catch(() => {
                    // Resguardo por si tu cargarAlbumLocal no es una Promesa async
                    cargarMisRepetidasParaVenta(); 
               });
          } else {
               cargarMisRepetidasParaVenta();
          }
          obtenerOfertasMercado();

          // 🟢 INYECCIÓN FEED RECIENTE: Refrescamos el historial dinámico al entrar a la sección
          if (typeof actualizarHistorialTransferenciasUI === "function") {
               actualizarHistorialTransferenciasUI();
          }
          
     }
     
     // 🦾 GATILLO DE ENTRADA: Al entrar al sector de Contratos SBC, inicializamos el panel del Bot Comerciante
     if (idModulo === 'modulo-contratos-sbc' && usuarioActual) {
          if (typeof cargarModuloSBC === "function") {
               cargarModuloSBC();
          }
     }
     
     if (idModulo === 'modulo-timba' && usuarioActual) {
          rotarPartidoTimba();
          document.getElementById("select-tipo-apuesta").value = "monedas"; 
          conmutarControlesTimbaUI();
          actualizarTimbasRestantesUI();
     }
     if (idModulo === 'modulo-minimundial' && usuarioActual) {
          chequearEstadoMundialServer();
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
     // 👤 GATILLO DE ENTRADA: Al entrar a Mi Perfil, traemos los datos de la base de datos en tiempo real
     if (idModulo === 'modulo-perfil' && usuarioActual) { // 👈 Cambiá 'modulo-perfil' por el ID de tu sección
          actualizarMiPerfilUI();
          renderizarCromoDestacadoUI();
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

async function autenticarUsuario(accion) {
     const username = document.getElementById("input-usuario").value.trim();
     const password = document.getElementById("input-pass").value;
     
     if (!username || !password) return alert("❌ Completá los datos.");

     // 🛡️ SECURITY FIX: Deshabilitamos el botón correspondiente para mitigar ataques de fuerza bruta / spam
     const btnAuth = document.getElementById(accion === 'login' ? 'btn-login' : 'btn-registro');
     if (btnAuth) btnAuth.disabled = true;

     const textoSpinner = accion === 'login' ? "Iniciando sesión..." : "Creando tu cuenta en la Arena...";
     const endpointFinal = accion === 'login' ? 'login' : 'registro';

     mostrarCarga(textoSpinner);

     try {
          const res = await fetch(`${URL_BASE}/${endpointFinal}`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ username, password })
          });
          
          // 🛡️ SECURITY FIX: Si el servidor responde con un estado de error (401, 403, 500, 503), frenamos
          if (!res.ok) {
               ocultarCarga();
               if (btnAuth) btnAuth.disabled = false;
               
               try {
                    const errorData = await res.json();
                    return alert(errorData.error || `❌ Error del servidor (Código ${res.status})`);
               } catch {
                    return alert(`🚧 Error inesperado en la infraestructura de la Arena (Código ${res.status}).`);
               }
          }
          
          const data = await res.json();
          ocultarCarga();

          if (data.error) {
               alert(data.error);
               if (btnAuth) btnAuth.disabled = false; // Rehabilitamos si el backend rebotó las credenciales
          } else {
               // 🔥 CORREGIDO: Clave unificada a "token" para que sea compatible con todo el ecosistema seguro del juego
               if (data.token) {
                    localStorage.setItem("token", data.token);
               }

               usuarioActual = data.usuario;
               
               document.getElementById("seccion-login").style.display = "none";
               
               const interfazJuego = document.getElementById("interfaz-juego");
               if (interfazJuego) {
                    interfazJuego.style.removeProperty("display");
                    interfazJuego.classList.add("mostrar");
               }
               
               // 🟢 SECTOR MISIONES API
               if (typeof cargarMisionesDelServidor === 'function') {
                    cargarMisionesDelServidor();
               }
               
               // ⏱️ SECTOR CRONÓMETRO
               if (typeof iniciarCronometroResetMisiones === 'function') {
                    iniciarCronometroResetMisiones();
               }
               
               // 📢 FLUJO DE ANUNCIOS Y EVENTOS
               if (typeof iniciarControladorAnunciosSeguro === 'function') {
                    setTimeout(iniciarControladorAnunciosSeguro, 1000); 
               } else if (typeof verificarRecompensaDiaria === 'function') {
                    setTimeout(verificarRecompensaDiaria, 1000);
               }
               
               filtroEstadoActual = 'todas';
               filtroRarezaActual = 'todas';
               
               actualizarInterfazUI();
               cargarAlbumLocal();
               if (typeof actualizarTimbasRestantesUI === 'function') actualizarTimbasRestantesUI();
               
               // 🎁 NUEVO FLUG COMPLEMENTARIO: Si es un usuario nuevo, el validador seguro se gatilla acá mismo
               if (typeof verificarAvatarInicial === 'function') {
                    verificarAvatarInicial();
               }

               if (accion === 'login') {
                    alert(`⚔️ ¡Bienvenido de vuelta, ${usuarioActual.username}!`);
               } else {
                    alert(`🎉 ¡Cuenta creada con éxito! Bienvenido a la Arena, ${usuarioActual.username}. Empezás con 200 monedas.`);
               }
          }
     } catch (err) {
          console.error("❌ Fallo crítico de red o código en autenticación:", err);
          ocultarCarga();
          if (btnAuth) btnAuth.disabled = false; // Rehabilitamos en caso de crash total
          alert("📡 Error de conexión. No se pudo establecer contacto con los servidores centrales de la Arena.");
     }
}

function obtenerHeadersSeguros() {
    const token = localStorage.getItem("arena_token");
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
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
          const res = await fetch(`${URL_BASE}/album/${usuarioActual.id}`, {
               headers: obtenerHeadersSeguros() // 🔥 Blindado con JWT
          });
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
     
     // 1. Filtramos los jugadores pertenecientes al país seleccionado
     const jugadoresFiltrados = albumCompleto.filter(figu => figu.pais === paisSeleccionado);

     // 🔥 NUEVO: Mapeo de prioridad de peso para ordenar de mayor a menor rareza
     const pesoRarezas = {
          'legendaria': 4,
          'epica': 3,
          'rara': 2,
          'comun': 1,
          'especial': 2 // Por si maneás algún string alternativo
     };

     // 2. Ordenamos el array dinámicamente según la tabla de pesos jerárquicos
     jugadoresFiltrados.sort((a, b) => {
          const pesoA = pesoRarezas[(a.rareza || 'comun').toLowerCase()] || 0;
          const pesoB = pesoRarezas[(b.rareza || 'comun').toLowerCase()] || 0;
          
          // Si tienen diferente rareza, el de mayor peso va primero
          if (pesoB !== pesoA) {
               return pesoB - pesoA;
          }
          // Si empatan en rareza, los ordenamos alfabéticamente por nombre
          return a.nombre.localeCompare(b.nombre);
     });

     // 3. Renderizado secuencial en la cuadrícula de la Arena
     jugadoresFiltrados.forEach((figu, index) => {
          const esObtenida = figu.obtenido > 0;
          const card = document.createElement("div");
          
          // Le agregamos posición relativa a la card para que contenga bien el menú superior
          card.className = `carta-clash ${figu.rareza.toLowerCase()} ${esObtenida ? '' : 'bloqueada'}`;
          card.style.animationDelay = `${(index % 12) * 30}ms`;
          card.style.position = "relative";
          card.style.overflow = "hidden"; // Esconde el botón si no está en hover
          
          // Estructura limpia: el botón se vuelve visible haciendo transiciones con opacity
          card.innerHTML = `
              ${figu.obtenido > 1 ? `<div class="badge-repetidas">x${figu.obtenido}</div>` : ''}
              <img src="${figu.foto}" class="carta-foto" alt="${figu.nombre}" style="width: 100%; height: 100%; object-fit: cover;">
              <div class="rareza-vertical">${figu.rareza.toUpperCase()}</div>
              
              ${esObtenida ? `
                  <div class="capa-interactiva-cromo" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(2, 6, 23, 0.8); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease; z-index: 5;">
                      <button type="button" onclick="marcarCromoComoDestacado(${figu.id}, '${figu.nombre.replace(/'/g, "\\'")}', '${figu.foto}', '${figu.rareza}')" class="btn-estadio" style="padding: 8px 12px; font-size: 0.75rem; background: var(--dorado); color: #000; border: none; font-weight: bold; cursor: pointer; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-family: 'Oswald'; letter-spacing: 0.5px;">
                          🌟 DESTACAR
                      </button>
                  </div>
              ` : ''}
          `;

          // ✨ EFECTO VISUAL: Controlamos la opacidad de la capa con eventos de mouse
          if (esObtenida) {
              card.onmouseenter = () => {
                  const capa = card.querySelector(".capa-interactiva-cromo");
                  if (capa) capa.style.opacity = "1";
              };
              card.onmouseleave = () => {
                  const capa = card.querySelector(".capa-interactiva-cromo");
                  if (capa) capa.style.opacity = "0";
              };
              // Soporte para celulares (un toque abre el menú, el botón procesa el click)
              card.onclick = (e) => {
                  // Si hizo click directo en el botón, que no resetee la opacidad
                  if (e.target.tagName === 'BUTTON') return;
                  
                  const capa = card.querySelector(".capa-interactiva-cromo");
                  if (capa) {
                      capa.style.opacity = capa.style.opacity === "1" ? "0" : "1";
                  }
              };
          }

          contenedorGrid.appendChild(card);
     });

     // 4. Ejecutamos el filtro secundario (Estado/Rareza) para mantener consistencia
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
     
     // 🛑 APAGAMOS LOS BOTONES DE LA TIENDA DE ENTRADA
     alternarBotonesCompraTienda(true);

     mostrarCarga(`Adquiriendo derechos de pack ${tipoCofre.toUpperCase()}...`);

     try {
          const res = await fetch(`${URL_BASE}/comprar-sobre`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...obtenerHeadersSeguros() },
                body: JSON.stringify({ tipoCofre: tipoCofre }) 
          });
          
          const data = await res.json();
          ocultarCarga();

          if (data.error_oro || data.error) {
               alternarBotonesCompraTienda(false); // Si falla, los rehabilitamos
               return alert(data.error_oro ? data.mensaje : "❌ Error: " + data.error);
          }

          usuarioActual.monedas = data.monedas; 
          actualizarInterfazUI();

          if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('monedas');
          if (typeof trackearProgresoMision === 'function') await trackearProgresoMision("sobres", 1);

          // Guardamos el sobre completo real en la caché para la grilla del final
          sobreAbiertoCompletoCache = data.sobre;
          indiceCartaActualPack = 0;

          // 🔍 CONTROL DE FILTRADO (SALTEAR REPETIDOS)
          const checkSaltear = document.getElementById("check-saltear-repetidos");
          
          if (checkSaltear && checkSaltear.checked) {
               // Filtramos dejando SOLO las cartas nuevas de verdad
               // (En tus jugadores es obtenido === 1, en avatares es !es_repetido_avatar)
               colaCartasPack = data.sobre.filter(carta => {
                    if (carta.es_foto_perfil) return !carta.es_repetido_avatar;
                    return carta.obtenido === 1;
               });
          } else {
               // Si no está marcado, va el sobre completo de 5 o 6 cartas
               colaCartasPack = data.sobre;
          }

          // 🔀 ATAJO CRÍTICO: Si no tocó NINGUNA carta nueva y el filtro estaba activo
          if (colaCartasPack.length === 0) {
               // Mandamos un cartel flotante rápido o alert informando el skip automático
               alert("✨ ¡Todas las cartas del sobre eran repetidas! Pasando directo al resumen global.");
               
               // Saltamos directo al final sin abrir la pantalla de cinemática
               renderizarGrillaFinalSobres();
               alternarBotonesCompraTienda(false); // Rehabilitamos la tienda
               return;
          }

          // Si hay cartas para mostrar, abrimos el escenario tradicional
          document.getElementById("grid-sobre-abierto").innerHTML = "";
          const contenedorOpening = document.getElementById("contenedor-pack-opening");
          contenedorOpening.style.display = "flex";
          contenedorOpening.scrollIntoView({ behavior: 'smooth', block: 'center' });

          if (typeof ejecutarSecuenciaReveladoCarta === 'function') {
               ejecutarSecuenciaReveladoCarta();
          }

     } catch (err) {
          console.error("Error en la apertura del pack:", err);
          ocultarCarga();
          alternarBotonesCompraTienda(false); // Protección por si crashea la red
     }
}

function alternarBotonesCompraTienda(deshabilitar) {
    // 🎯 Apuntamos directo a la clase real de tus botones del cofre
    const botones = document.querySelectorAll(".btn-comprar-pack");
    
    botones.forEach(btn => {
        btn.disabled = deshabilitar;
        
        if (deshabilitar) {
            // Estilos premium de bloqueo
            btn.style.opacity = "0.4";
            btn.style.filter = "grayscale(100%) brightness(0.7)";
            btn.style.cursor = "not-allowed";
            btn.style.transform = "scale(0.96)";
            btn.style.transition = "all 0.25s ease";
        } else {
            // Restauramos su facha original de la Arena
            btn.style.opacity = "1";
            btn.style.filter = "none";
            btn.style.cursor = "pointer";
            btn.style.transform = "scale(1)";
        }
    });
}

/* ========================================================================
   🍿 5. LOGICA CINEMÁTICA ASÍNCRONA DE PACK OPENING (SOBRES)
   ======================================================================== */

async function ejecutarSecuenciaReveladoCarta() {
    if (indiceCartaActualPack >= colaCartasPack.length) {
        document.getElementById("contenedor-pack-opening").style.display = "none";
        renderizarGrillaFinalSobres();
        alternarBotonesCompraTienda(false);
        animacionCartaEnCurso = false; 
        return;
    }

    animacionCartaEnCurso = true;
    const btnSiguiente = document.getElementById("btn-siguiente-carta-pack");
    if (btnSiguiente) btnSiguiente.disabled = true; 

    const carta = colaCartasPack[indiceCartaActualPack];

    // ========================================================================
    // 🔀 INTERCEPCIÓN MÍSTICA: SI ES UN AVATAR COSMÉTICO SORPRESA
    // ========================================================================
    if (carta.es_foto_perfil || carta.posicion === "AVATAR") {
        return revelarAvatarSorpresaEnLoop(carta, btnSiguiente);
    }

    const rarezaClase = (carta.rareza || '').toLowerCase();

    // 🏎️ INTERCEPCIÓN PREMIUM CON TRANSICIÓN NATURAL (Tus Legendarios normales)
    if ((rarezaClase === "legendaria" || rarezaClase === "legendario") && !carta.caminanteVisto) {
        const escenario = document.querySelector(".pack-opening-escenario");
        if (escenario) {
            carta.caminanteVisto = true;

            const flashOverlay = document.createElement("div");
            flashOverlay.id = "caminante-flash-cinematic";
            flashOverlay.className = "escenario-caminante-activo pulso-foco-oro";
            
            flashOverlay.innerHTML = `
                <div class="spinner-arena" style="border-top-color: var(--dorado); width: 80px; height: 80px; box-shadow: 0 0 20px rgba(255,177,0,0.3); border-radius:50%;"></div>
                <h2 style="color: var(--dorado); font-family: 'Oswald'; font-size: 2.2rem; margin-top: 25px; letter-spacing: 3px; text-transform: uppercase; text-shadow: 0 0 20px rgba(255,177,0,0.7); animation: pulse 1s infinite alternate;">
                    ✨ ¡ATENCIÓN, CAMINANTE DETECTADO! ✨
                </h2>
                <p style="color: #94a3b8; font-family: sans-serif; font-size: 1rem; margin: 8px 0 0 0; letter-spacing: 1px;">Las luces se apagan... Se viene una superestrella de la Arena.</p>
            `;
            escenario.appendChild(flashOverlay);

            const lanzarFuegosArtificiales = () => {
                for (let i = 0; i < 45; i++) {
                    const particula = document.createElement("div");
                    particula.className = "fuego-artificial";
                    const angulo = Math.random() * Math.PI * 2;
                    const distancia = 60 + Math.random() * 160;
                    particula.style.setProperty('--x', `${Math.cos(angulo) * distancia}px`);
                    particula.style.setProperty('--y', `${Math.sin(angulo) * distancia}px`);
                    
                    const colores = ['#ffb100', '#38bdf8', '#00ff88', '#ffffff'];
                    particula.style.background = colores[Math.floor(Math.random() * colores.length)];
                    particula.style.left = "50%";
                    particula.style.top = "45%";
                    flashOverlay.appendChild(particula);
                }
            };

            setTimeout(lanzarFuegosArtificiales, 500);
            setTimeout(lanzarFuegosArtificiales, 1300);

            setTimeout(() => {
                const flashBlanco = document.createElement("div");
                flashBlanco.className = "flash-revelado-total animar-flash";
                escenario.appendChild(flashBlanco);

                setTimeout(() => {
                    const wrapper = document.getElementById("pantalla-carta-presentada");
                    const pBandera = document.getElementById("pista-bandera");
                    const pPosicion = document.getElementById("pista-posicion");
                    const pRareza = document.getElementById("pista-rareza");
                    
                    if (wrapper) wrapper.innerHTML = ""; 
                    if (pBandera) { pBandera.className = "pista-bloque"; pBandera.innerText = "⏳ ?"; }
                    if (pPosicion) { pPosicion.className = "pista-bloque"; pPosicion.innerText = "⚽ ?"; }
                    if (pRareza) { pRareza.className = "pista-bloque"; pRareza.innerText = "🃏 ?"; }
                    
                    flashOverlay.remove(); 
                }, 150);

                setTimeout(() => {
                    flashBlanco.remove();
                    ejecutarSecuenciaReveladoCarta();
                }, 500);

            }, 3000);

            return; 
        }
    }

    // ==========================================
    // ⚪ FLUJO DE RENDERIZACIÓN DE LAS PISTAS Y LA CARTA NORMAL
    // ==========================================
    const wrapper = document.getElementById("pantalla-carta-presentada");
    const pBandera = document.getElementById("pista-bandera");
    const pPosicion = document.getElementById("pista-posicion");
    const pRareza = document.getElementById("pista-rareza");
    
    if (!carta.caminanteVisto) { 
        pBandera.className = "pista-bloque"; pBandera.innerText = "⏳ ?";
        pPosicion.className = "pista-bloque"; pPosicion.innerText = "⚽ ?";
        pRareza.className = "pista-bloque"; pRareza.innerText = "🃏 ?";
        wrapper.innerHTML = ""; 
    }

    // Pista 1: Bandera
    await new Promise(r => setTimeout(r, 200));
    pBandera.innerText = carta.bandera || "🃏";
    pBandera.classList.add("revelada");

    // Pista 2: Posición
    await new Promise(r => setTimeout(r, 600));
    let posText = "DEL";
    const posFiltro = carta.posicion ? carta.posicion.toUpperCase() : "";
    if (posFiltro.includes("DEF") || posFiltro.includes("ARQ") || posFiltro.includes("POR")) posText = "DEF";
    else if (posFiltro.includes("MED") || posFiltro.includes("VOL") || posFiltro.includes("CC")) posText = "MED";
    pPosicion.innerText = posText;
    pPosicion.classList.add("revelada");

    // Pista 3: Rareza
    await new Promise(r => setTimeout(r, 600));
    let rarezaTexto = carta.rareza.toUpperCase();
    if (rarezaTexto === "ESPECIAL") rarezaTexto = "RARA";
    pRareza.innerText = rarezaTexto;
    pRareza.classList.add("revelada");

    await new Promise(r => setTimeout(r, 500));
    
    let rarezaClaseLimpia = rarezaClase;
    if (rarezaClaseLimpia === "especial") rarezaClaseLimpia = "rara";
    
    const divCarta = document.createElement("div");
    divCarta.className = `carta-clash ${rarezaClaseLimpia} caminante-entrada`;
    
    let rarezaColor = "#8e9bb0";
    if (rarezaClaseLimpia === "rara") rarezaColor = "#0074e8";
    else if (rarezaClaseLimpia === "epica") rarezaColor = "#a335ee";
    else if (rarezaClaseLimpia === "legendaria") rarezaColor = "#ffb100";

    divCarta.innerHTML = `
        ${carta.obtenido > 1 ? `<div class="badge-repetidas">x${carta.obtenido}</div>` : ''}
        <img src="${carta.foto}" class="carta-foto" alt="${carta.nombre}">
        <div style="position: absolute; top: 0; left: 0; width: 18px; height: 100%; background: linear-gradient(90deg, ${rarezaColor} 0%, rgba(0,0,0,0) 100%); opacity: 0.4; z-index: 3;"></div>
        <div class="rareza-vertical">${rarezaTexto}</div>
    `;
    
    wrapper.innerHTML = ""; 
    wrapper.appendChild(divCarta);
    await new Promise(r => setTimeout(r, 400));

    animacionCartaEnCurso = false;
    if (btnSiguiente) btnSiguiente.disabled = false; 
}

async function revelarAvatarSorpresaEnLoop(avatar, btnSiguiente) {
    const wrapper = document.getElementById("pantalla-carta-presentada");
    const pBandera = document.getElementById("pista-bandera");
    const pPosicion = document.getElementById("pista-posicion");
    const pRareza = document.getElementById("pista-rareza");

    // 🌟 Adaptamos las pistas superiores para la temática cosmética
    if (pBandera) { pBandera.className = "pista-bloque revelada"; pBandera.innerText = "📸"; }
    if (pPosicion) { pPosicion.className = "pista-bloque revelada"; pPosicion.innerText = "AVATAR"; }
    if (pRareza) { pRareza.className = "pista-bloque revelada"; pRareza.innerText = "COSMÉTICO"; }

    wrapper.innerHTML = "";

    // 🃏 Creamos el contenedor físico de la carta clonando las dimensiones de las comunes
    const divAvatar = document.createElement("div");
    divAvatar.className = "carta-clash legendaria caminante-entrada"; 
    divAvatar.style.cssText = `
        position: relative; 
        border: 4px solid var(--dorado); 
        box-shadow: 0 0 35px rgba(255,177,0,0.5);
        cursor: pointer;
        overflow: hidden;
    `;

    // Estructura visual interna nativa
    divAvatar.innerHTML = `
        <img src="${avatar.foto}" class="carta-foto" alt="${avatar.nombre}" style="width: 100%; height: 100%; object-fit: cover;">
        <div class="rareza-vertical" style="color: var(--dorado);">PERFIL</div>
        <div style="position: absolute; top: -1px; left: 50%; transform: translateX(-50%); background: var(--dorado); color: #000; font-family: 'Oswald'; font-size: 0.75rem; font-weight: bold; padding: 2px 12px; border-radius: 0 0 4px 4px; z-index: 10; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
            ¡ÍTEM ESPECIAL! ⭐
        </div>
    `;

    // 🕹️ CAPA HOVER: Botón superpuesto con desenfoque de fondo
    if (!avatar.es_repetido_avatar) {
        const capaHover = document.createElement("div");
        capaHover.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.75);
            backdrop-filter: blur(3px);
            -webkit-backdrop-filter: blur(3px);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.25s ease;
            z-index: 20;
            padding: 10px;
            box-sizing: border-box;
        `;

        const btnAccionRapida = document.createElement("button");
        btnAccionRapida.className = "btn-estadio";
        btnAccionRapida.innerText = "EQUIPAR ⚡";
        btnAccionRapida.style.cssText = "background: var(--dorado); color:#000; font-weight:bold; font-size: 0.85rem; padding: 8px 12px; width: 85%; box-shadow: 0 4px 10px rgba(0,0,0,0.3);";
        
        btnAccionRapida.onclick = async (e) => {
            e.stopPropagation(); // Evitamos bugs de clicks fantasmas
            btnAccionRapida.disabled = true;
            const idLimpio = avatar.id.replace("avatar_", "");
            if (typeof equiparAvatarDesdeTienda === "function") {
                await equiparAvatarDesdeTienda(idLimpio);
            }
            btnAccionRapida.innerText = "EQUIPADO 📸";
        };

        capaHover.appendChild(btnAccionRapida);
        divAvatar.appendChild(capaHover);

        // Eventos nativos de JS para encender/apagar la capa al pasar el mouse
        divAvatar.onmouseenter = () => capaHover.style.opacity = "1";
        divAvatar.onmouseleave = () => capaHover.style.opacity = "0";
    } else {
        // Si es repetida, mostramos el cartel de aviso fijo abajo pero estilizado para que no tire la grilla
        const divRepetido = document.createElement("div");
        divRepetido.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(239, 68, 68, 0.9);
            color: #fff;
            font-family: 'Oswald';
            font-size: 0.75rem;
            text-align: center;
            padding: 4px 0;
            z-index: 15;
            text-transform: uppercase;
        `;
        divRepetido.innerText = "🔄 REPETIDO (+100 Oro)";
        divAvatar.appendChild(divRepetido);
    }

    // Inyectamos directo en el wrapper central (queda centrado exacto como Sulaka)
    wrapper.appendChild(divAvatar);

    await new Promise(r => setTimeout(r, 500));
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

          let rarezaClaseFinal = figu.rareza ? figu.rareza.toLowerCase() : 'comun';
          if (rarezaClaseFinal === "especial") rarezaClaseFinal = "rara";

          let rarezaTextoFinal = figu.es_foto_perfil ? "PERFIL" : (figu.rareza ? figu.rareza.toUpperCase() : "COMUN");
          if (rarezaTextoFinal === "ESPECIAL") rarezaTextoFinal = "RARA";

          const divCarta = document.createElement("div");
          divCarta.className = `carta-clash ${rarezaClaseFinal}`;
          divCarta.style.animationDelay = `${indice * 0.1}s`;
          
          // Si es el cromo especial de avatar, le clavamos el relieve dorado en la grilla final
          if (figu.es_foto_perfil) {
              divCarta.style.border = "2px solid var(--dorado)";
              divCarta.style.boxShadow = "0 0 15px rgba(255,177,0,0.3)";
          }
          
          divCarta.innerHTML = `
              ${figu.obtenido > 1 && !figu.es_foto_perfil ? `<div class="badge-repetidas">x${figu.obtenido}</div>` : ''}
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
          // 🟢 CORREGIDO: Ahora viaja con los headers JWT seguros para saltear el mantenimiento
          const res = await fetch(`${URL_BASE}/tiros-restantes/${usuarioActual.id}`, {
               method: "GET",
               headers: obtenerHeadersSeguros() 
          });
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
          // 🟢 CORREGIDO: Combinamos el JWT con el Content-Type para peticiones con BODY
          const res = await fetch(`${URL_BASE}/jugar-penal`, {
               method: 'POST',
               headers: {
                    ...obtenerHeadersSeguros(),
                    'Content-Type': 'application/json'
               },
               body: JSON.stringify({ gano: esGol })
          });
          const data = await res.json();
          if (typeof ocultarCarga === "function") ocultarCarga();
          
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
          const res = await fetch(`${URL_BASE}/timbas-restantes/${usuarioActual.id}`);
          const datos = await res.json();
          
          // 🔥 CORREGIDO: Usamos la variable global correcta del loop de la timba
          if (intervaloCronometroTimba) {
               clearInterval(intervaloCronometroTimba);
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

// ========================================================================
// 📈 MARQUESINA EN VIVO: HISTORIAL DE FICHAJES RECIENTES GLOBAL
// ========================================================================
async function actualizarHistorialTransferenciasUI() {
    // Buscá el contenedor de tu vitrina P2P en el DOM
    const contenedorMercado = document.getElementById("modulo-mercado-pases"); 
    if (!contenedorMercado) return;

    // Buscamos o creamos el bloque del feed abajo de todo en el módulo
    let feedBox = document.getElementById("arena-feed-transferencias");
    if (!feedBox) {
        feedBox = document.createElement("div");
        feedBox.id = "arena-feed-transferencias";
        feedBox.style.cssText = "margin-top: 25px; padding: 15px; background: rgba(11, 17, 30, 0.8); border: 1px solid #1e293b; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);";
        contenedorMercado.appendChild(feedBox);
    }

    try {
        const res = await fetch(`${URL_BASE}/mercado/historial`);
        const data = await res.json();

        if (!data.ok || !data.historial || data.historial.length === 0) {
            feedBox.innerHTML = `<h4 style="color: var(--celeste); font-family: 'Oswald'; margin: 0 0 5px 0; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.5px;">📈 ACTIVIDAD RECIENTE</h4><p style="color: #64748b; font-size: 0.85rem; margin: 0; font-style: italic;">Sin movimientos comerciales en las últimas horas...</p>`;
            return;
        }

        let htmlFeed = `
            <h4 style="color: var(--dorado); font-family: 'Oswald'; margin: 0 0 10px 0; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 6px;">
                ⚡ TRANSFERENCIAS RECIENTES EN VIVO
            </h4>
            <div style="display: flex; flex-direction: column; gap: 6px;">
        `;

        data.historial.forEach(log => {
            let tiempoTexto = "Hace un instante";
            if (log.segundos_atras >= 60) {
                const minutos = Math.floor(log.segundos_atras / 60);
                tiempoTexto = `Hace ${minutos} min`;
            } else if (log.segundos_atras > 5) {
                tiempoTexto = `Hace ${log.segundos_atras} seg`;
            }

            // Seteamos el color estratégico según la rareza de la venta
            let colorRareza = "#cbd5e1";
            const rarezaLimpia = log.rareza.toLowerCase();
            if (rarezaLimpia === 'rara' || rarezaLimpia === 'especial') colorRareza = "#38bdf8";
            else if (rarezaLimpia === 'epica') colorRareza = "#c084fc";
            else if (rarezaLimpia === 'legendaria') colorRareza = "#fbbf24";

            htmlFeed += `
                <div style="background: rgba(2, 6, 23, 0.4); border-left: 3px solid ${colorRareza}; padding: 8px 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 0.88rem;">
                    <span style="color: #94a3b8;">
                        👤 <strong style="color: #fff;">${log.comprador_username}</strong> fichó a 
                        <span style="color: ${colorRareza}; font-weight: bold;">${log.jugador_nombre.toUpperCase()}</span> 
                        de <span style="color: #cbd5e1;">${log.vendedor_username}</span>
                    </span>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-family: 'Oswald'; color: var(--verde-match); font-weight: bold;">🪙 ${log.precio_oro}</span>
                        <span style="color: #64748b; font-size: 0.75rem; min-width: 70px; text-align: right;">⏱️ ${tiempoTexto}</span>
                    </div>
                </div>
            `;
        });

        htmlFeed += `</div>`;
        feedBox.innerHTML = htmlFeed;

    } catch (err) {
        console.error("Error al pintar feed de transferencias:", err);
    }
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
               headers: obtenerHeadersSeguros(),
               body: JSON.stringify({
                    tipoApuesta, 
                    montoApuesta,
                    jugadorIdApostado: jugadorIdApostado ? parseInt(jugadorIdApostado) : null
               }) // ❌ usuario_id eliminado
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
            headers: obtenerHeadersSeguros(),
            body: JSON.stringify({ idOpcionElegida })
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
          local: `${bandLoc} ${nomLoc}`, 
          visitante: `${bandVis} ${nomVis}`, // 🔥 MAPEO CORREGIDO
          res: `${data.golesLReal} - ${data.golesVReal}`
          });
          timbaPreparada = false; 
          rotarPartidoTimba();
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

// 🔥 UNIFICADO Y BLINDADO: Trae el estado seguro y actualiza copas + reloj
async function chequearEstadoMundialServer() {
    try {
        const res = await fetch(`${URL_BASE}/mundial/estado`, {
            method: "GET",
            headers: obtenerHeadersSeguros() // ⚡ Pasa el mantenimiento usando tu token cifrado
        });
        const data = await res.json();
        
        if (data.ok) {
            // 1. Sincronizamos las copas en la UI de forma dinámica
            const lblCopas = document.getElementById("lbl-copas-mundiales");
            if (lblCopas && data.copas !== undefined) {
                lblCopas.innerText = data.copas;
            }

            // 2. Mandamos los milisegundos seguros al motor visual del reloj
            if (data.milisegundosRestantes !== undefined) {
                arrancarCronometroMundialVisual(Number(data.milisegundosRestantes));
            }
        } else {
            console.warn("⚠️ El servidor respondió con error al chequear el mundial:", data.error);
        }
    } catch (err) {
        console.error("❌ Error de red al solicitar cronómetro:", err);
    }
}

// ⏱️ MOTOR VISUAL DEL RELOJ DE LA ARENA
function arrancarCronometroMundialVisual(ms) {
     clearInterval(intervaloCronometroMundial);
     const lblReloj = document.getElementById("cronometro-mundial");
     const btnIniciar = document.getElementById("btn-preparar-mundial");
     const contenedorOpcionesPaises = document.getElementById("zona-eleccion-pais-mundial");
     if (!lblReloj) return;

     // 🛡️ CONTROL DE RESGUARDO ANTI-NAN: Si los milisegundos vienen corruptos o ausentes
     if (ms === undefined || ms === null || isNaN(ms)) {
          console.warn("⚠️ Los milisegundos del mundial llegaron corruptos o ausentes.");
          lblReloj.innerText = "⏳ Sincronizando vestuarios con la Arena...";
          lblReloj.style.color = "#64748b"; 
          if (btnIniciar) btnIniciar.style.display = "none";
          return;
     }

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
                  headers: obtenerHeadersSeguros(), 
                  body: JSON.stringify({}) 
          });
          const data = await res.json();
          ocultarCarga();

          if (!data.ok) return alert(data.mensaje);

          usuarioActual.monedas = data.monedasActualizadas;
          actualizarInterfazUI();

          const COOLDOWN_MUNDIAL_MS = 3 * 60 * 60 * 1000; 
          arrancarCronometroMundialVisual(COOLDOWN_MUNDIAL_MS);

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
             headers: obtenerHeadersSeguros(), 
             body: JSON.stringify({
                  seleccionElegida: window.mundialSeleccionUsuario,
                  rivalClasificacion: mundialRivalClasif, 
                  jugadorIds: jugadoresSeleccionadosDraft
             }) 
        });
        const data = await res.json(); ocultarCarga();

        if (!data.ok) return alert(data.mensaje);

        if (typeof trackearProgresoMision === 'function') {
             await trackearProgresoMision("mundial", 1);
        }

        document.getElementById("fase-draft-mundial").style.display = "none";
        document.getElementById("fase-fixture-mundial").style.display = "block";

        const contenedorLista = document.getElementById("lista-cruces-mundial-simulacion");
        contenedorLista.innerHTML = "";

        if (!data.progreso.ganoClasificacion) {
             contenedorLista.innerHTML = `<div class="item-historial-partido" style="color:var(--rojo); border-color:var(--rojo); text-align:center;"><span>❌ Quedaste afuera por falta de puntos en eliminatorias.</span></div>`;
             usuarioActual.monedas = data.datosActualizados?.monedas || usuarioActual.monedas;
             actualizarInterfazUI(); chequearEstadoMundialServer(); liberarNavegacionArenaUI(); return;
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

        if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('pitazo');

        // SIMULACIÓN CRONOLÓGICA DE LA FASE DE GRUPOS
        for (let f = 0; f < data.progreso.bitacoraGrupo.length; f++) {
             const fechaData = data.progreso.bitacoraGrupo[f];
             const divFecha = document.createElement("div");
             divFecha.style.cssText = "background:#0b111e; padding:12px; border-radius:8px; border-left:4px solid var(--celeste); margin-bottom:15px;";
             divFecha.innerHTML = `<div style="color:var(--celeste); font-size:0.9rem; font-weight:bold;">📅 FECHA ${fechaData.fecha}</div><div style="display:flex; justify-content:space-between;"><span>🇺🇾 ${fechaData.local} vs ${fechaData.visitante}</span><span id="goles-m1-f${f}" style="color:var(--verde-match); font-weight:bold;">0 - 0</span></div><div style="display:flex; justify-content:space-between;"><span>🤖 ${fechaData.botL} vs ${fechaData.botV}</span><span id="goles-m2-f${f}" style="color:#aaa;">0 - 0</span></div><div id="reloj-f${f}" style="text-align:center; font-size:0.8rem; color:#64748b;">⏱️ 00:00</div>`;
             contenedorLista.appendChild(divFecha); divFecha.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

             await new Promise((resolveFecha) => {
                  let segV = 0; let g1_L = 0; let g1_V = 0; let g2_L = 0; let g2_V = 0;
                  
                  const tGroup = setInterval(() => {
                       segV += 3; 
                       if (segV > 90) segV = 90;
                       
                       let huboGol = false;

                       // REPRODUCCIÓN ESTRICTA DEL BACKEND
                       if (fechaData.minutosL && fechaData.minutosL.includes(segV)) { g1_L++; huboGol = true; }
                       if (fechaData.minutosV && fechaData.minutosV.includes(segV)) { g1_V++; huboGol = true; }
                       if (fechaData.minutosBL && fechaData.minutosBL.includes(segV)) g2_L++;
                       if (fechaData.minutosBV && fechaData.minutosBV.includes(segV)) g2_V++;

                       if (huboGol && typeof AudioArena !== 'undefined' && AudioArena.play) {
                            AudioArena.play('gol');
                       }

                       document.getElementById(`goles-m1-f${f}`).innerText = `${g1_L} - ${g1_V}`;
                       document.getElementById(`goles-m2-f${f}`).innerText = `${g2_L} - ${g2_V}`;
                       document.getElementById(`reloj-f${f}`).innerText = `⏱️ MINUTO ${segV.toString().padStart(2, '0')}:00`;

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
                            renderizarTablaGrupoLive(estadoTablaMundial); 
                            resolveFecha();
                       }
                  }, 150);
             });
        }

        if (!data.progreso.clasifico) {
             const cartelEliminado = document.createElement("div");
             cartelEliminado.style.cssText = "text-align:center; padding:15px; border:2px solid var(--rojo); color:var(--rojo); font-weight:bold; border-radius:8px;";
             cartelEliminado.innerText = `❌ Quedaste fuera en Grupos (Puesto #${data.progreso.posicionFinalGrupo}).`;
             contenedorLista.appendChild(cartelEliminado);
             usuarioActual.monedas = data.datosActualizados?.monedas || usuarioActual.monedas;
             actualizarInterfazUI(); chequearEstadoMundialServer(); liberarNavegacionArenaUI(); return;
        }

        // REPRODUCCIÓN CRONOLÓGICA DE PLAYOFFS ELIMINATORIOS
        for (let i = 0; i < data.progreso.bitacoraPlayoffs.length; i++) {
             const partido = data.progreso.bitacoraPlayoffs[i];
             const ganoEsteCruce = partido.resultado.includes("Ganaste");
             await simularMarcadorPantalla(contenedorLista, partido.ronda, window.mundialSeleccionUsuario, partido.rival, ganoEsteCruce, partido);
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
        chequearEstadoMundialServer(); liberarNavegacionArenaUI();
    } catch (err) { console.error(err); ocultarCarga(); liberarNavegacionArenaUI(); }
}

// 🎭 BANCO MUNDIAL DE INCIDENCIAS INTERACTIVAS (RELATOS Y DECISIONES TÁCTICAS)
const CATALOGO_EVENTOS_MUNDIAL = {
    penal_favor: {
        titulo: "🔥 ¡PENAL A FAVOR!",
        relato: "¡Falta durísima adentro del área! El árbitro mete silbatazo y señala el punto penal. ¡Momento de máxima tensión en el estadio!",
        opciones: [
            { texto: "💥 Romperle el arco al medio de un fustazo", exito: 0.75, okTexto: "¡GOOOL! Cañonazo violento al centro, el arquero voló a un costado.", badTexto: "¡Ufff! El remate reventó el travesaño y salió volando al lateral." },
            { texto: "🎯 Colocarla sutil contra el palo derecho", exito: 0.85, okTexto: "¡GOOOL! La acarició con la cara interna pegada al poste, inalcanzable.", badTexto: "¡La adivinó! El arquero voló como un gato y la desvió al córner." },
            { texto: "👑 Picarla con clase a lo Abreu (Panenka)", exito: 0.40, okTexto: "¡GOOOLAZO! Qué locura divina, la picó con una frialdad de Leyenda.", badTexto: "¡Papelón! Fue masita al medio y el arquero la embolsó sin moverse." }
        ]
    },
    corner_favor: {
        titulo: "📐 CÓRNER TÁCTICO A FAVOR",
        relato: "Centro venenoso al corazón del área chica. Los defensores forcejean y pierden la marca...",
        opciones: [
            { texto: "🚀 Cabezazo potente ganando el primer palo", exito: 0.65, okTexto: "¡GOOOL! Anticipó a todos en el vértice del área chica y la clavó al ángulo.", badTexto: "El testazo rozó la parte externa de la red y salió por la línea de fondo." },
            { texto: "👟 Buscar una volea de primera en el rebote", exito: 0.50, okTexto: "¡GOOOL! Le quedó boyando atrás y metió un fierrazo rasante inatajable.", badTexto: "La agarró mordida y la pelota se fue desviada directamente al córner." }
        ]
    },
    tirolibre_favor: {
        titulo: "🎯 TIRO LIBRE EN LA PUERTA DEL ÁREA",
        relato: "La barrera rival se acomoda... El arquero da pasos cortos dando indicaciones. Hay aroma a gol.",
        opciones: [
            { texto: "📐 Pegarle suave por encima de la barrera", exito: 0.70, okTexto: "¡GOOOLAZO! Qué comba espectacular, bajó justo y se metió contra el caño.", badTexto: "El remate pegó directamente en la frente de un defensor en la barrera." },
            { texto: "💨 Fustazo potente al palo del arquero", exito: 0.55, okTexto: "¡GOOOL! El arquero dio un paso en falso esperando la comba y la pelota entró limpia.", badTexto: "El uno reaccionó de manera excelente y mandó el misil por arriba del travesaño." }
        ]
    },
    contrataque_favor: {
        titulo: "⚡ CONTRATAQUE EXPLOSIVO",
        relato: "¡Robo letal en mitad de cancha! Quedaron tus 2 delanteros contra 1 solo defensor desesperado...",
        opciones: [
            { texto: "🏃 Hacer la individual y eludir al arquero", exito: 0.60, okTexto: "¡GOOOL! Gambeta larga, desparramó al arquero por el piso y definió solo.", badTexto: "Se abrió demasiado al enganchar y el central llegó justo a trabarle el remate." },
            { texto: "🤝 Darle el pase atrás al compañero que entra libre", exito: 0.80, okTexto: "¡GOOOL! Pase milimétrico al medio para que el delantero la empuje a la red.", badTexto: "El pase fue muy exigido, rebotó en el talón del defensor y despejaron." }
        ]
    },
    defensa_urgente: {
        titulo: "🚨 ¡ATAQUE PELIGROSO RIVAL!",
        relato: "El enganche robó la pelota y habilitó al extremo que entra solo por la banda derecha...",
        opciones: [
            { texto: "🛑 Mandar al central a barrerse con todo", exito: 0.65, okTexto: "¡FRENADO! Cruce perfecto abajo barriendo limpiamente la pelota al lateral.", badTexto: "Llegó tarde. El delantero metió un amague sutil y quedó mano a mano." },
            { texto: "🧤 Ordenar que el arquero achique rápido el ángulo", exito: 0.55, okTexto: "¡SALVADA! El uno achicó de forma monumental y tapó el mano a mano con el pecho.", badTexto: "El atacante la pinchó con una categoría enorme por encima de tu arquero. Gol." }
        ]
    },
    atajar_penal: {
        titulo: "🚨 ¡PENAL EN CONTRA!",
        relato: "¡Peligro extremo! Tu defensor llegó tarde en el área chica. El rival acomoda el balón...",
        opciones: [
            { texto: "🧤 Volar decidido al palo izquierdo", exito: 0.50, okTexto: "¡MONUMENTAL! Volaste al poste izquierdo y la cacheteaste al córner con la punta de los dedos.", badTexto: "¡Gol del rival! Pateó fuerte y cruzado al ángulo opuesto." },
            { texto: "🧍 Quedarte parado esperando un remate al centro", exito: 0.40, okTexto: "¡ATAJASTE! Se la jugó a patear suave al medio y le adivinaste la intención.", badTexto: "¡Gol del rival! La abrió sutil contra el poste derecho mientras vos mirabas." }
        ]
    }
};

function simularMarcadorPantalla(contenedor, ronda, tuPais, rival, ganoUsuario, partidoData) {
    return new Promise((resolve) => {
        const filaPartido = document.createElement("div");
        filaPartido.className = "partido-simulado-card";
        const idUnico = ronda.replace(/ /g,'') + Math.floor(Math.random() * 1000);

        // 🛡️ INYECCIÓN ÚNICA DE ANIMACIONES REQUERIDAS
        if (!document.getElementById("estilos-premium-mundial")) {
            const estilos = document.createElement("style");
            estilos.id = "estilos-premium-mundial";
            estilos.innerHTML = `
                @keyframes screenShake {
                    0%, 100% { transform: translate(0, 0); }
                    20%, 60% { transform: translate(-4px, 2px) rotate(-0.5deg); }
                    40%, 80% { transform: translate(4px, -2px) rotate(0.5deg); }
                }
                @keyframes flashGlow {
                    0% { background: rgba(255,255,255,0.8); }
                    100% { background: transparent; }
                }
                @keyframes glitchVar {
                    0%, 100% { border-color: var(--dorado); box-shadow: 0 0 5px var(--dorado); }
                    50% { border-color: var(--celeste); box-shadow: 0 0 5px var(--celeste); }
                }
                .efecto-shake { animation: screenShake 0.35s ease-in-out; }
                .efecto-flash { position: fixed; top:0; left:0; width:100vw; height:100vh; background: transparent; z-index:9999; pointer-events:none; animation: flashGlow 0.4s ease-out; }
                .badge-var-live { background: var(--dorado); color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-family: 'Oswald'; margin-left: 8px; animation: glitchVar 1s infinite; }
                .boost-badge-gaming { background: var(--verde-match); color: #000; font-size: 0.7rem; font-family: 'Oswald'; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: bold; vertical-align: middle; }
                .oculto { display: none !important; }
            `;
            document.head.appendChild(estilos);
        }

        filaPartido.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; color:var(--dorado); border-bottom:1px solid #1e293b; padding-bottom:8px; margin-bottom:12px;">
                <span style="text-transform: uppercase; font-family:'Oswald'; font-size: 1rem; letter-spacing: 0.5px;">📋 ${ronda}</span>
                <span id="reloj-vivo-${idUnico}" style="font-weight:bold; color:var(--celeste); font-family: monospace; font-size: 0.9rem;">⏱️ MINUTO 00:00</span>
            </div>
            <div id="marcador-contenedor-${idUnico}" style="display:flex; justify-content:space-between; align-items:center; padding: 5px 0; transition: transform 0.2s;">
                <span style="width:42%; text-align:left; font-weight:bold; font-size:1.1rem; color: #fff;">
                    ⚽ ${tuPais.toUpperCase()} <span id="boost-badge-${idUnico}" class="boost-badge-gaming oculto">MOTIVADO</span>
                </span>
                <span id="score-vivo-${idUnico}" style="font-family:'Oswald'; font-size:1.9rem; background:#020617; padding:4px 18px; border-radius:8px; color:var(--verde-match); min-width:80px; text-align:center; border: 1px solid #1e293b; transition: all 0.2s;">0 - 0</span>
                <span style="width:42%; text-align:right; font-weight:bold; font-size:1.1rem; color: #fff;">
                    ${rival.toUpperCase()} 🤖
                </span>
            </div>

            <div id="consola-incidencias-${idUnico}" class="consola-incidencias-tv" style="background:#020617; padding:12px; border-radius:6px; min-height:45px; color:#cbd5e1; font-size:0.9rem; border:1px solid #1e293b; margin-top:10px; line-height: 1.4; transition: background 0.3s, color 0.3s;">
                ⚽ El árbitro da la orden... ¡Comienzan los cruces de eliminación directa!
            </div>

            <div id="modulo-interactivo-${idUnico}" style="display:none; background:rgba(15,23,42,0.95); border:1px solid var(--dorado); border-radius:8px; padding:15px; margin-top:12px; text-align:center; box-shadow: 0 0 15px rgba(255,177,0,0.15);">
                <h4 id="evento-titulo-${idUnico}" style="color:var(--dorado); margin:0 0 8px 0; font-family:'Oswald'; font-size:1.1rem; letter-spacing:0.5px;">🚨 JUGADA EN CURSO</h4>
                <p id="evento-texto-${idUnico}" style="font-size:0.85rem; color:#cbd5e1; margin-bottom:12px; text-align:left;"></p>
                <div id="evento-opciones-${idUnico}" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>
            <div id="multi-penales-box-${idUnico}" style="display:none; text-align:center; color:#ff3333; font-weight:bold; margin-top:12px; font-size:0.9rem; background:rgba(239,68,68,0.08); padding:8px; border-radius:6px; border: 1px solid rgba(239,68,68,0.2); font-family: 'Oswald';"></div>
        `;
        contenedor.appendChild(filaPartido);
        filaPartido.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('pitazo');

        let cronogramaGolesTu = partidoData.minutosL ? [...partidoData.minutosL] : [];
        let cronogramaGolesRival = partidoData.minutosV ? [...partidoData.minutosV] : [];

        let golesTuActuales = 0;
        let golesRivalActuales = 0;
        let segundoVirtual = 0;
        let enPausaDeContador = false;
        let ultimoMinutoBotProcesado = -1; 

        // Determinar velocidad según los participantes
        const esPartidoDeBotsPuro = partidoData.localEsBot && partidoData.visitanteEsBot;
        const tickRate = esPartidoDeBotsPuro ? 150 : 660; 

        const cartasElegidas = typeof albumCompleto !== 'undefined' && typeof jugadoresSeleccionadosDraft !== 'undefined'
            ? albumCompleto.filter(f => jugadoresSeleccionadosDraft.includes(f.id)) : [];
        const promedioDraft = cartasElegidas.length ? cartasElegidas.reduce((acc, c) => acc + MAPA_PUNTOS_RAREZA[c.rareza.toLowerCase()], 0) / 3 : 75;
        const esPartidoDefensivo = promedioDraft < 72;

        const bstBdg = document.getElementById(`boost-badge-${idUnico}`);
        if (bstBdg && promedioDraft >= 82) {
            bstBdg.classList.remove("oculto");
        }

        // ⏱️ TIMER PRINCIPAL CONTROLADO (ONLINE & OFFLINE)
        const timerMulti = setInterval(async () => {
            if (enPausaDeContador) return;

            try {
                // 1. CONTROL DE FLUJO PARA PARTIDOS EN VIVO MULTIJUGADOR
                if (typeof multiSalaId !== 'undefined' && multiSalaId) {
                    const salaIdentificador = multiSalaId || multiCodigoSala;
                    const resSala = await fetch(`${URL_BASE}/multijugador/estado-vivo/${salaIdentificador}`, {
                        method: 'GET',
                        headers: obtenerHeadersSeguros()
                    });
                    const dataSala = await resSala.json();
                    if (!dataSala.ok) return;

                    if (multiEsCreador) {
                        if (dataSala.estadoJugada !== 'esperando_eleccion' && dataSala.estadoJugada !== 'mostrar_contador') {
                            segundoVirtual += 1;
                            if (segundoVirtual > 90) segundoVirtual = 90;

                            await fetch(`${URL_BASE}/multijugador/actualizar-reloj`, {
                                method: 'POST',
                                headers: obtenerHeadersSeguros(),
                                body: JSON.stringify({ sala_id: multiSalaId, minuto: segundoVirtual })
                            }).catch(() => {});
                        }
                    } else {
                        segundoVirtual = dataSala.minuto || 0;
                    }

                    document.getElementById(`reloj-vivo-${idUnico}`).innerText = `⏱️ MINUTO ${segundoVirtual.toString().padStart(2,'0')}:00`;

                    const tieneGolLocal = cronogramaGolesTu.includes(segundoVirtual);
                    const tieneGolRival = cronogramaGolesRival.includes(segundoVirtual);

                    if ((tieneGolLocal || tieneGolRival) && dataSala.estadoJugada !== 'esperando_eleccion' && dataSala.estadoJugada !== 'mostrar_contador') {
                        if (multiEsCreador) {
                            await fetch(`${URL_BASE}/multijugador/pausar-por-evento`, {
                                method: 'POST',
                                headers: obtenerHeadersSeguros(),
                                body: JSON.stringify({ sala_id: multiSalaId })
                            });
                        }
                        return;
                    }

                    if (dataSala.estadoJugada === 'esperando_eleccion') {
                        // 🛠️ ¡CORREGIDO AQUÍ! Se cambió partidoData por partido
                        const idxTu = partidoData.minutosL ? partidoData.minutosL.indexOf(segundoVirtual) : -1;
                        const idxRiv = partidoData.minutosV ? partidoData.minutosV.indexOf(segundoVirtual) : -1;
                        const esLocalAtacando = idxTu !== -1;
                        const llaveEventoFijo = esLocalAtacando ? (partidoData.eventosL[idxTu] || "contrataque_favor") : (partidoData.eventosV[idxRiv] || "defensa_urgente");

                        if (yoJuegoEstePartido) {
                            const mod = document.getElementById(`modulo-interactivo-${idUnico}`);
                            if (mod.style.display !== "block") {
                                if (partidoData.esPvpReal) {
                                    const soyAtacante = (esLocalAtacando && soyElLocalDeEsteMatch) || (!esLocalAtacando && soyElInvitadoDeEsteMatch);
                                    lanzarBotoneraPVPUI(soyAtacante ? "ataque" : "defensa", soyAtacante);
                                } else {
                                    ejecutarPausaContraBot(llaveEventoFijo, esLocalAtacando);
                                }
                            }
                        } else {
                            if (esPartidoDeBotsPuro && multiEsCreador) {
                                if (ultimoMinutoBotProcesado === segundoVirtual) return; 
                                ultimoMinutoBotProcesado = segundoVirtual;

                                const exitoIA = Math.random() <= 0.50;
                                await fetch(`${URL_BASE}/multijugador/enviar-eleccion-bot`, {
                                    method: 'POST',
                                    headers: obtenerHeadersSeguros(),
                                    body: JSON.stringify({ sala_id: multiSalaId, exito: exitoIA, esLocal: esLocalAtacando })
                                }).catch(() => { ultimoMinutoBotProcesado = -1; });
                            } else {
                                document.getElementById(`consola-incidencias-${idUnico}`).innerText = `⏳ Jugadores decidiendo jugada interactiva...`;
                            }
                        }
                        return;
                    }

                    if (dataSala.estadoJugada === 'mostrar_contador') {
                        enPausaDeContador = true;
                        let cuentaRegresiva = 3;
                        const consola = document.getElementById(`consola-incidencias-${idUnico}`);
                        
                        const intervaloContadorVisual = setInterval(async () => {
                            cuentaRegresiva--;
                            if (cuentaRegresiva > 0) {
                                consola.innerText = `⏳ Computando jugada de vestuario en... ${cuentaRegresiva}`;
                            } else {
                                clearInterval(intervaloContadorVisual);
                                
                                const resFinal = dataSala.resultado; 
                                if (resFinal && resFinal.exito) {
                                    const esGolRealLocal = partidoData.minutosL && partidoData.minutosL.includes(segundoVirtual);
                                    const esGolRealRival = partidoData.minutosV && partidoData.minutosV.includes(segundoVirtual);

                                    if (esGolRealLocal) golesTuActuales++;
                                    if (esGolRealRival) golesRivalActuales++;

                                    dispararImpactoVisualMulti(`🎉 ¡GOOOL! Resolución táctica impacta en las mallas.`);
                                } else {
                                    consola.innerText = "❌ Movimiento contenido de forma excelente por la zaga defensiva.";
                                }

                                cronogramaGolesTu = cronogramaGolesTu.filter(m => m !== segundoVirtual);
                                cronogramaGolesRival = cronogramaGolesRival.filter(m => m !== segundoVirtual);

                                setTimeout(async () => {
                                    if (multiEsCreador) {
                                        await fetch(`${URL_BASE}/multijugador/reanudar-partido`, {
                                            method: 'POST',
                                            headers: obtenerHeadersSeguros(),
                                            body: JSON.stringify({ sala_id: multiSalaId })
                                        });
                                    }
                                    enPausaDeContador = false;
                                }, 2000);
                            }
                        }, 1000);
                        return;
                    }
                } 
                // 2. CONTROL DE FLUJO PARA PARTIDOS SINGLEPLAYER OFFLINE
                else {
                    segundoVirtual += 1;
                    if (segundoVirtual > 90) segundoVirtual = 90;

                    document.getElementById(`reloj-vivo-${idUnico}`).innerText = `⏱️ MINUTO ${segundoVirtual.toString().padStart(2,'0')}:00`;

                    if (cronogramaGolesTu.includes(segundoVirtual)) {
                        cronogramaGolesTu = cronogramaGolesTu.filter(m => m !== segundoVirtual);
                        if (!esPartidoDeBotsPuro && Math.random() <= 0.50) {
                            const llavesAtaque = ["penal_favor", "corner_favor", "tirolibre_favor", "contrataque_favor"];
                            ejecutarPausaEstratégica(llavesAtaque[Math.floor(Math.random() * llavesAtaque.length)], true);
                        } else {
                            if (!esPartidoDeBotsPuro && Math.random() <= 0.35) {
                                ejecutarMomentoVAR(true);
                            } else {
                                golesTuActuales++;
                                dispararEstimulantesImpacto(`⚽ ¡GOOOL DE ${tuPais.toUpperCase()}! Impresionante zapatazo desde afuera del área que rompe la red.`);
                            }
                        }
                    } 
                    else if (cronogramaGolesRival.includes(segundoVirtual)) {
                        cronogramaGolesRival = cronogramaGolesRival.filter(m => m !== segundoVirtual);
                        if (!esPartidoDeBotsPuro && Math.random() <= 0.35) {
                            ejecutarMomentoVAR(false);
                        } else {
                            golesRivalActuales++;
                            dispararEstimulantesImpacto(`💥 Gol de ${rival.toUpperCase()}. El delantero define cruzado e inalcanzable.`);
                        }
                    }

                    if (segundoVirtual % 15 === 0 && segundoVirtual < 90) {
                        const ambiente = esPartidoDefensivo 
                            ? ["Tu defensa resiste replegada. El bot presiona con intensidad.", "Se traba el partido en mitad de cancha. Juego muy físico."]
                            : ["Tu selección rota rápido el balón buscando profundidad.", "¡Qué buena jugada colectiva! El estadio empuja con cantos."];
                        document.getElementById(`consola-incidencias-${idUnico}`).innerText = `🏃 ${ambiente[Math.floor(Math.random() * ambiente.length)]}`;
                    }
                }

                // 3. FINALIZACIÓN UNIFICADA DE LOS 90 MINUTOS
                if (segundoVirtual >= 90 && !enPausaDeContador) {
                    clearInterval(timerMulti);
                    if (golesTuActuales === golesRivalActuales) {
                        ejecutarTandaPenalesDramatica();
                    } else {
                        finalizarPartidoDirecto();
                    }
                }
            } catch (err) {
                console.error("Error crítico en loop de juego:", err);
            }
        }, tickRate);

        // 🎯 TRANSMISIÓN DE EMOCIÓN DE GOL
        function dispararEstimulantesImpacto(relatoFinal) {
            const flash = document.createElement("div");
            flash.className = "efecto-flash";
            document.body.appendChild(flash);
            setTimeout(() => flash.remove(), 400);

            filaPartido.classList.add("efecto-shake");
            setTimeout(() => filaPartido.classList.remove("efecto-shake"), 350);

            const scoreLbl = document.getElementById(`score-vivo-${idUnico}`);
            if (scoreLbl) {
                scoreLbl.innerText = `${golesTuActuales} - ${golesRivalActuales}`;
                scoreLbl.style.transform = "scale(1.25)";
                scoreLbl.style.borderColor = "var(--verde-match)";
                setTimeout(() => {
                    scoreLbl.style.transform = "scale(1)";
                    scoreLbl.style.borderColor = "#1e293b";
                }, 500);
            }

            document.getElementById(`consola-incidencias-${idUnico}`).innerText = relatoFinal;
            if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('gol');
        }

        function dispararImpactoVisualMulti(textoRelato) {
             filaPartido.classList.add("efecto-shake");
             setTimeout(() => filaPartido.classList.remove("efecto-shake"), 350);
             const lbl = document.getElementById(`score-vivo-${idUnico}`);
             if (lbl) lbl.innerText = `${golesTuActuales} - ${golesRivalActuales}`;
             document.getElementById(`consola-incidencias-${idUnico}`).innerText = textoRelato;
             if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('gol');
        }

        // 🖥️ SUB-MOTOR DE CONTROL DE VAR
        function ejecutarMomentoVAR(esAtaqueFavor) {
            enPausaDeContador = true;
            const consola = document.getElementById(`consola-incidencias-${idUnico}`);
            const scoreLbl = document.getElementById(`score-vivo-${idUnico}`);

            if (esAtaqueFavor) golesTuActuales++; else golesRivalActuales++;
            dispararEstimulantesImpacto(`⚽ ¡GOOOL! Remate fulminante al palo cambiado.`);

            setTimeout(() => {
                consola.style.background = "#451a03";
                consola.innerHTML = `🚨 El árbitro detiene la reanudación del juego. <span class="badge-var-live">🖥️ REVISANDO VAR</span>`;
                if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('pitazo');
            }, 2000);

            setTimeout(() => {
                consola.innerText = "🖥️ Los asistentes trazan las líneas digitales de fuera de juego...";
            }, 4000);

            setTimeout(() => {
                const seAnulaElGol = Math.random() <= 0.50;
                if (seAnulaElGol) {
                    if (esAtaqueFavor) golesTuActuales--; else golesRivalActuales--;
                    consola.style.background = "rgba(239, 68, 68, 0.15)";
                    consola.style.color = "var(--rojo)";
                    consola.innerText = `❌ ¡ANULADO POR EL VAR! El gol no vale.`;
                    
                    if (scoreLbl) {
                        scoreLbl.innerText = `${golesTuActuales} - ${golesRivalActuales}`;
                        scoreLbl.style.transform = "scale(0.85)";
                        scoreLbl.style.borderColor = "var(--rojo)";
                        setTimeout(() => {
                            scoreLbl.style.transform = "scale(1)";
                            scoreLbl.style.borderColor = "#1e293b";
                        }, 400);
                    }
                } else {
                    consola.style.background = "rgba(34, 197, 94, 0.15)";
                    consola.style.color = "var(--verde-match)";
                    consola.innerText = `🏁 ¡GOL CONFIRMADO! El VAR valida la anotación.`;
                }

                setTimeout(() => {
                    consola.style.background = "#020617";
                    consola.style.color = "#cbd5e1";
                    enPausaDeContador = false; 
                }, 2500);
            }, 6500);
        }

        // 🏆 TANDA DE PENALES SINCRO
        function ejecutarTandaPenalesDramatica() {
            const consola = document.getElementById(`consola-incidencias-${idUnico}`);
            document.getElementById(`reloj-vivo-${idUnico}`).innerText = `⏱️ FINAL DE LOS 90'`;
            consola.style.background = "#0f172a";
            consola.style.color = "var(--dorado)";
            consola.style.fontWeight = "bold";
            consola.innerText = "🏁 ¡Empate en los 90'! Nos vamos a los penales obligatorios...";

            let pasoPenal = 0;
            let penTu = ganoUsuario ? 5 : 3;
            let penRiv = ganoUsuario ? 4 : 5;

            const intervaloPenales = setInterval(() => {
                pasoPenal++;
                if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('pitazo');

                if (pasoPenal === 1) consola.innerText = `👟 [PENAL] ${tuPais.toUpperCase()}... ¡Adentro! (1 - 0)`;
                else if (pasoPenal === 2) consola.innerText = `👟 [PENAL] ${rival.toUpperCase()}... Convierte. (1 - 1)`;
                else if (pasoPenal === 3) consola.innerText = `👟 [PENAL] Tu segundo tiro... ¡Entró pidiendo permiso! (2 - 1)`;
                else if (pasoPenal === 4) consola.innerText = `🧤 [PENAL] ¡ESPECTACULAR VOLADA DE TU ARQUERO! Lo tapó. (2 - 1)`;
                else if (pasoPenal === 5) consola.innerText = `👟 [PENAL] Tu tercer remate... Desviado por arriba. (2 - 1)`;
                else if (pasoPenal === 6) consola.innerText = `👟 [PENAL] Gol del rival, ajustado al palo. (2 - 2)`;
                else if (pasoPenal === 7) consola.innerText = `👟 [PENAL] Cuarto remate tuyo... ¡Golazo al ángulo! (3 - 2)`;
                else if (pasoPenal === 8) consola.innerText = `👟 [PENAL] El rival no perdona. Gol seco. (3 - 3)`;
                else if (pasoPenal === 9) {
                    consola.innerText = ganoUsuario 
                        ? `👟 [PENAL] ¡Último tiro decisivo! ¡GOOOL de zurda! Ventaja clave. (4 - 3)`
                        : `👟 [PENAL] ¡Último tiro tuyo! ¡Atajó el arquero rival! (3 - 3)`;
                } else if (pasoPenal === 10) {
                    clearInterval(intervaloPenales);
                    if (ganoUsuario) {
                        consola.style.color = "var(--verde-match)";
                        consola.innerText = `🧤 [TANDA FINAL] ¡LA ADIVINASTE! Ganaste (PENALES: ${penTu} - ${penRiv})`;
                    } else {
                        consola.style.color = "var(--rojo)";
                        consola.innerText = `💥 [TANDA FINAL] El capitán rival fusila sin piedad. (PENALES: ${penTu} - ${penRiv})`;
                    }
                    setTimeout(() => finalizarPartidoDirecto(true, penTu, penRiv), 3000);
                }
            }, 2000);
        }

        // FINALIZADOR LIMPIO
        function finalizarPartidoDirecto(fueEnPenales = false, pTu = 0, pRiv = 0) {
            if (!fueEnPenales) {
                golesTuActuales = partidoData.gL || partidoData.golesLocal || 0;
                golesRivalActuales = partidoData.gV || partidoData.golesVisitante || 0;
                const scoreLbl = document.getElementById(`score-vivo-${idUnico}`);
                if (scoreLbl) scoreLbl.innerText = `${golesTuActuales} - ${golesRivalActuales}`;
            }

            filaPartido.style.borderColor = ganoUsuario ? "var(--verde-match)" : "var(--rojo)";
            if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('pitazo');

            const finLabel = document.createElement("div");
            finLabel.style.cssText = `text-align:right; font-size:0.85rem; font-weight:bold; margin-top:8px; font-family:'Oswald'; color:${ganoUsuario ? 'var(--verde-match)' : 'var(--rojo)'};`;
            
            finLabel.innerText = fueEnPenales
                ? (ganoUsuario ? `🏁 FINAL (PEN: ${pTu}-${pRiv}) - AVANZAS ✅` : `🏁 FINAL (PEN: ${pTu}-${pRiv}) - ELIMINADO ❌`)
                : (ganoUsuario ? "🏁 FINAL 90' - AVANZAS ✅" : "🏁 FINAL 90' - ELIMINADO ❌");
            
            filaPartido.appendChild(finLabel);
            resolve();
        }

        // 👔 PAUSA ESTRATÉGICA INTERACTIVA CON CONTADOR INTEGRADO
        function ejecutarPausaEstratégica(tipoLlave, esAtaque) {
            enPausaDeContador = true; 
            
            const ev = CATALOGO_EVENTOS_MUNDIAL[tipoLlave];
            const modulo = document.getElementById(`modulo-interactivo-${idUnico}`);
            const txtTitulo = document.getElementById(`evento-titulo-${idUnico}`);
            const txtCuerpo = document.getElementById(`evento-texto-${idUnico}`);
            const contenedorOpciones = document.getElementById(`evento-opciones-${idUnico}`);

            if (!ev || !modulo) { enPausaDeContador = false; return; }

            txtTitulo.innerText = ev.titulo;
            txtCuerpo.innerText = ev.relato;
            contenedorOpciones.innerHTML = "";
            modulo.style.display = "block";

            ev.opciones.forEach(opc => {
                const btn = document.createElement("button");
                btn.className = "btn-estadio";
                btn.style.cssText = "padding:8px 12px; font-size:0.8rem; background:#1e293b; color:#fff; width:100%; text-align:left; border-radius:5px; border:1px solid #334155; cursor:pointer;";
                btn.innerText = `💥 ${opc.texto}`;

                btn.onclick = () => {
                    contenedorOpciones.innerHTML = ""; 
                    let cuentaRegresiva = 3;
                    const cajaIncidencias = document.getElementById(`consola-incidencias-${idUnico}`);
                    cajaIncidencias.innerText = `⏳ Procesando estrategia en... ${cuentaRegresiva}`;

                    const contadorTimer = setInterval(() => {
                        cuentaRegresiva--;
                        if (cuentaRegresiva > 0) {
                            cajaIncidencias.innerText = `⏳ Procesando estrategia en... ${cuentaRegresiva}`;
                        } else {
                            clearInterval(contadorTimer);
                            modulo.style.display = "none";
                            
                            const dados = Math.random();
                            if (dados <= opc.exito) {
                                if (esAtaque) {
                                    golesTuActuales++;
                                    dispararEstimulantesImpacto(`🎉 ${opc.okTexto}`);
                                } else {
                                    cajaIncidencias.style.color = "var(--verde-match)";
                                    cajaIncidencias.innerText = `🎉 ${opc.okTexto}`;
                                }
                            } else {
                                if (!esAtaque) {
                                    golesRivalActuales++;
                                    dispararEstimulantesImpacto(`❌ ${opc.badTexto}`);
                                } else {
                                    cajaIncidencias.style.color = "var(--rojo)";
                                    cajaIncidencias.innerText = `❌ ${opc.badTexto}`;
                                }
                            }

                            const scoreLbl = document.getElementById(`score-vivo-${idUnico}`);
                            if (scoreLbl) scoreLbl.innerText = `${golesTuActuales} - ${golesRivalActuales}`;
                            
                            setTimeout(() => {
                                cajaIncidencias.style.color = "#cbd5e1";
                                cajaIncidencias.style.fontWeight = "normal";
                                enPausaDeContador = false; 
                            }, 2000);
                        }
                    }, 1000);
                };
                contenedorOpciones.appendChild(btn);
            });
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

const CATALOGO_PVP_INTERACTIVO = {
    ataque: {
        titulo: "🔥 ¡JUGADA CRÍTICA EN ATAQUE!",
        relato: "Tu mediocampo rompió la línea defensiva y te armó un mano a mano letal. ¡Elegí tu ejecución antes de que se agote el tiempo!",
        opciones: [
            { id: 1, texto: "💥 Fustazo violento al primer palo", okTexto: "¡GOOOL! Cañonazo inapelable que dejó al arquero estático.", badTexto: "❌ ¡ATAJADO! El arquero rival adivinó tu misil y lo desvió con los puños." },
            { id: 2, texto: "🎯 Colocación sutil al poste cambiado", okTexto: "¡GOOOL! La cacheteaste con sutileza directo al rincón de las ánimas.", badTexto: "❌ ¡TAPADA! El uno rival leyó la comba y la embolsó con categoría." },
            { id: 3, texto: "👑 Picarla con vaselina sobre el achique", okTexto: "¡GOOOLAZO! Categoría pura, sombrerito magistral sobre el cuerpo del uno.", badTexto: "❌ ¡PAPELÓN! Se la diste mansa a las manos del arquero que ni se movió." }
        ]
    },
    defensa: {
        titulo: "🚨 ¡ALERTA MÁXIMA EN TU ÁREA!",
        relato: "El delantero rival se filtró entre tus centrales y prepara el remate. ¡Adiviná su intención para salvar tu arco!",
        opciones: [
            { id: 1, texto: "🛡️ Cubrir primer palo (Anticipar Fustazo)", okTexto: "¡SALVADA MONUMENTAL! Le adivinaste el misil al primer palo y la mandaste al córner.", badTexto: "💥 ¡GOL RIVAL! Te jugaste al primer poste pero la clavó con clase al otro lado." },
            { id: 2, texto: "🧤 Volar al palo cambiado (Prevenir Colocación)", okTexto: "¡GATO ESPECTACULAR! Volaste al ángulo opuesto y la cacheteaste con la punta de los dedos.", badTexto: "💥 ¡GOL RIVAL! Te tiraste buscando la comba pero te rompió el arco por el medio." },
            { id: 3, texto: "🧍 Aguantar el centro (Prevenir Vaselina)", okTexto: "¡CRACK TÁCTICO! Te quedaste parado y le embolsaste la vaselina con total frialdad.", badTexto: "💥 ¡GOL RIVAL! La pelota te pasó por arriba mientras te quedaste clavado en el piso." }
        ]
    }
};

async function abrirDraftMulti(esCreador) {
    multiEsCreador = esCreador;
    
    if (!esCreador) {
        const cod = document.getElementById("multi-input-codigo").value.trim().toUpperCase();
        if (cod.length !== 6) return alert("❌ Código inválido. Debe tener 6 caracteres.");
        multiCodigoSala = cod;

        mostrarCarga("Validando credenciales de la sala...");
        try {
            const res = await fetch(`${URL_BASE}/multijugador/sala/${cod}`, {
                method: 'GET',
                headers: obtenerHeadersSeguros()
            });
            const data = await res.json();

            if (!data.ok) {
                ocultarCarga();
                return alert(data.mensaje);
            }
            if (data.estado !== 'esperando') {
                ocultarCarga();
                return alert("🚫 Esta sala ya cerró o el torneo ya arrancó.");
            }

            multiSalaId = data.sala_id;
            window.multiTipoApuestaActual = data.tipo_apuesta ? data.tipo_apuesta.toLowerCase() : 'amistoso';

            let cartelAdvertencia = "";

            if (window.multiTipoApuestaActual === 'amistoso') {
                cartelAdvertencia = `🏟️ ¿Querés unirte a la Sala ${cod}?\n\n🔹 Modalidad: AMISTOSO\n🔸 No se arriesgan recursos. ¡Puro juego para foguear el plantel!`;
            } else if (window.multiTipoApuestaActual === 'oro') {
                cartelAdvertencia = `🪙 ¡ATENCIÓN JUGADOR!\n\nLa Sala ${cod} exige una entrada de: 🪙${data.apuesta_oro || 0} monedas de Oro.\n⚠️ El monto se debitará de tu cuenta al iniciar la simulación si confirmás tu plantilla. ¿Querés continuar?`;
            } else if (window.multiTipoApuestaActual === 'carta') {
                cartelAdvertencia = `🚨 ¡CUIDADO CRACK!\n\nLa Sala ${cod} es una contienda: POR CARTAS REPETIDAS.\n⚠️ Se descontará automáticamente un cromo repetido de tu stock al dar el silbatazo inicial. Si perdés, no vuelve. ¿Te la bancás?`;
            }

            ocultarCarga();
            if (!confirm(cartelAdvertencia)) return;

        } catch (e) { 
            console.error("Error en la conexión:", e);
            ocultarCarga(); 
            return alert("Error de conexión con la sala."); 
        }
    } else {
        const inputApuesta = document.getElementById("multi-input-apuesta");
        multiApuestaFijada = inputApuesta ? (parseInt(inputApuesta.value) || 0) : 0;
        const selectTipo = document.getElementById("multi-select-tipo-apuesta");
        window.multiTipoApuestaActual = selectTipo ? selectTipo.value.toLowerCase() : 'amistoso';
    }

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
                headers: obtenerHeadersSeguros(),
                body: JSON.stringify({})
          });
          const data = await res.json(); 
          ocultarCarga();

          if (!data.ok) {
               document.getElementById("multi-menu-inicial").style.display = "block";
               document.getElementById("multi-fase-inscripcion").style.display = "none";
               return alert(data.mensaje || data.error);
          }

          const barraNavegacion = document.querySelector(".nav-modulos-estadio");
          if (barraNavegacion) barraNavegacion.style.display = "none"; 
          const btnSalir = document.querySelector(".btn-logout-kick");
          if (btnSalir) btnSalir.style.display = "none";

          mundialTernaPaises = data.terna; 
          jugadoresSeleccionadosDraft = [];
          const contenedorTerna = document.getElementById("multi-zona-eleccion-pais");
          if (!contenedorTerna) return; 
          contenedorTerna.innerHTML = "";
          
          data.terna.forEach(pais => {
               const btn = document.createElement("button");
               btn.className = "btn-estadio btn-modulo-match"; 
               btn.style.margin = "8px";
               btn.innerText = `⚽ ${pais.toUpperCase()}`;
               btn.onclick = () => iniciarDraftJugadoresMundialMulti(pais);
               contenedorTerna.appendChild(btn);
          });
     } catch (err) { 
          console.error("Error en el draft:", err); 
          ocultarCarga(); 
     }
}

function iniciarDraftJugadoresMundialMulti(paisElegido) {
     window.mundialSeleccionUsuario = paisElegido;
     document.getElementById("multi-fase-inscripcion").style.display = "none";
     document.getElementById("multi-fase-draft").style.display = "block";
     document.getElementById("multi-lbl-tu-seleccion").innerText = paisElegido.toUpperCase();

     const wrapperApuestaInvitado = document.getElementById("multi-wrapper-apuesta-invitado");
     if (wrapperApuestaInvitado) wrapperApuestaInvitado.style.display = "none";
     
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
    window.multiMiCartaApostadaTexto = "Cromo repetido de tu stock";

    mostrarCarga("Enviando planilla de vestuarios a la Arena Online...");
    let url = `${URL_BASE}/multijugador/crear`;
    let cuerpo = {
        seleccion: paisElegido, 
        jugador_ids: arrayIdsJugadores,
        tipo_apuesta: window.multiTipoApuestaActual, 
        apuesta_oro: multiApuestaFijada
    };

    if (!multiEsCreador) {
        url = `${URL_BASE}/multijugador/unirse`;
        cuerpo = {
            seleccion: paisElegido, 
            jugador_ids: arrayIdsJugadores,
            codigo_sala: multiCodigoSala
        };
    }

    try {
        const res = await fetch(url, {
            method: 'POST', 
            headers: obtenerHeadersSeguros(), 
            body: JSON.stringify(cuerpo)
        });
        const data = await res.json();

        if (!data.ok) { ocultarCarga(); return alert(data.mensaje); }
        
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
        const res = await fetch(`${URL_BASE}/multijugador/sala/${multiCodigoSala}`, {
            method: 'GET',
            headers: obtenerHeadersSeguros()
        });
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
            let detalle = `🪙 MODALIDAD: TIMBA POR ORO\n⚠️ El Oro se debitará de tu cuenta al presionar 'Iniciar'.`;
            if (window.multiTipoApuestaActual === 'carta') {
                 detalle = `🃏 DUELO DE CARTAS REPETIDAS\n⚠️ ¡Muerte Súbita! Se descontará una carta repetida de tu stock al arrancar.\n\n🔒 TU APUESTA: CRÓMICA AUTOMÁTICA`;
            } else if (window.multiTipoApuestaActual === 'amistoso') { detalle = `🤝 MODALIDAD: AMISTOSO ONLINE`; }
            infoSalaBox.innerHTML = `<div style="background:rgba(11,17,30,0.8); padding:12px; border-radius:8px; border:1px solid var(--dorado); text-align:center; font-weight:bold; color:var(--dorado); margin-bottom:15px; font-family:'Oswald'; white-space:pre-line;">${detalle}</div>`;
        }

        const txtPozo = document.getElementById("lobby-txt-pozo");
        if (txtPozo) {
            if (window.multiTipoApuestaActual === 'carta') txtPozo.innerText = `🎰 Pozo: 1 Cromo Épico/Leg Mínimo`;
            else if (window.multiTipoApuestaActual === 'amistoso') txtPozo.innerText = `⚽ Modo de Práctica`;
            else txtPozo.innerText = `💰 Pozo Estimado: ${data.apuesta_oro * 2} Oro`;
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
    const miUsuarioId = usuarioActual ? (usuarioActual.id || usuarioActual._id) : null;

    try {
        const res = await fetch(`${URL_BASE}/multijugador/jugar`, { 
          method: 'POST', 
          headers: obtenerHeadersSeguros(),
          body: JSON.stringify({ 
              sala_id: multiSalaId, 
              codigo_sala: multiCodigoSala, 
              usuario_id: miUsuarioId,
              creador_id: miUsuarioId       
          })
        });
        const data = await res.json(); 
        ocultarCarga();
        
        if (!data.ok) { 
            alert(data.mensaje); 
            multiIntervaloLobby = setInterval(actualizarLobbyEnVivo, 3000); 
            return; 
        }

        window.renderizarFixturePasoAPaso(data.bitacora, data.premio);
    } catch (err) { 
        console.error(err); 
        ocultarCarga(); 
        multiIntervaloLobby = setInterval(actualizarLobbyEnVivo, 3000);
    }
}

async function consultarResultadoInvitado(intento = 1) {
     if (intento === 1) mostrarCarga("¡El Torneo comenzó! Recibiendo transmisión oficial...");
     try {
          const res = await fetch(`${URL_BASE}/multijugador/resultado-invitado/${multiSalaId}`, {
              method: 'GET',
              headers: obtenerHeadersSeguros()
          });
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
    if (!tablero) return; 

    // 🛡️ PARCHE DE SEGURIDAD GENERAL: Evita que el polling externo re-ejecute el motor
    if (document.getElementById("multi-partido-card-0")) {
        console.log("⚽ Transmisión en curso. Bloqueando intento de duplicación.");
        return;
    }

    tablero.innerHTML = ""; 

    if (apuestasTexto && Array.isArray(apuestasTexto) && apuestasTexto.length > 0) {
        const bloqueTextoApuestas = document.createElement("div");
        bloqueTextoApuestas.style.cssText = "background: rgba(239, 68, 68, 0.08); border: 1px dashed var(--rojo); padding: 14px; border-radius: 10px; margin-bottom: 20px; font-weight: bold; text-align: center;";
        bloqueTextoApuestas.innerHTML = `⚠️ <span style="color: var(--rojo); font-family: 'Oswald'; font-size: 1.1rem;">CROMOS ARRIESGADOS:</span><br>${apuestasTexto.join('<br>')}`;
        tablero.appendChild(bloqueTextoApuestas);
    }

    if (!bitacora || !Array.isArray(bitacora) || bitacora.length === 0) return;
    let secuenciaPromesas = Promise.resolve();
    const miIdFiel = usuarioActual ? (usuarioActual.id || usuarioActual._id) : null;

    bitacora.forEach((partido, index) => {
        const loc = partido.local || "Local"; 
        const vis = partido.visitante || "Rival";
        const rondaNombre = partido.ronda || `PARTIDO #${index + 1}`;
        
        const esPvpReal = partido.esPvpReal; 
        const localEsBot = partido.localEsBot;
        const visitanteEsBot = partido.visitanteEsBot;
        const esPartidoDeBotsPuro = localEsBot && visitanteEsBot; 
        const esHumanoVsBot = !esPvpReal && !esPartidoDeBotsPuro; 

        const soyElLocalDeEsteMatch = parseInt(partido.creador_id) === parseInt(miIdFiel);
        const soyElInvitadoDeEsteMatch = parseInt(partido.invitado_id) === parseInt(miIdFiel);
        const yoJuegoEstePartido = soyElLocalDeEsteMatch || soyElInvitadoDeEsteMatch;

        secuenciaPromesas = secuenciaPromesas.then(() => {
            return new Promise(async (resolveCruce) => {
                 if (esPvpReal) {
                     await ejecutarAnimaciónIntroVersus(tablero, loc, vis, rondaNombre);
                 }

                 const bloquePartido = document.createElement("div"); 
                 bloquePartido.className = "partido-simulado-card"; 
                 bloquePartido.id = `multi-partido-card-${index}`; 
                 bloquePartido.style.marginBottom = "20px";
                 bloquePartido.style.borderLeft = yoJuegoEstePartido ? "4px solid var(--verde-match)" : "4px solid #334155";
                 const idUnico = "multi-" + index + Math.floor(Math.random() * 500);
                 
                 bloquePartido.innerHTML = `
                     <div style="display:flex; justify-content:space-between; align-items:center; color:var(--dorado); border-bottom:1px solid #1e293b; padding-bottom:8px; margin-bottom:12px;">
                          <span style="font-family:'Oswald'; font-weight:bold; text-transform: uppercase; font-size: 1rem; letter-spacing: 0.5px;">📋 ${rondaNombre} ${yoJuegoEstePartido ? '⭐ TU MATCH' : '👁️ EN VIVO'}</span>
                          <span id="reloj-vivo-${idUnico}" style="color:var(--celeste); font-weight:bold; font-family: monospace; font-size: 0.9rem;">⏱️ MINUTO 00:00</span>
                     </div>
                     <div style="display:flex; justify-content:space-between; align-items:center; padding: 5px 0;">
                          <span style="width:42%; text-align:left; font-weight:bold; font-size:1.1rem; color: #fff;">⚽ ${loc.toUpperCase()}</span>
                          <span id="score-vivo-${idUnico}" style="font-family:'Oswald'; font-size:1.9rem; background:#020617; padding:4px 18px; border-radius:8px; color:var(--verde-match); min-width:80px; text-align:center; border: 1px solid #1e293b;">0 - 0</span>
                          <span style="width:42%; text-align:right; font-weight:bold; font-size:1.1rem; color: #fff;">${vis.toUpperCase()}</span>
                     </div>
                     <div id="consola-incidencias-${idUnico}" class="consola-incidencias-tv" style="background:#020617; padding:12px; border-radius:6px; min-height:45px; color:#cbd5e1; font-size:0.9rem; border:1px solid #1e293b; margin-top:10px;">
                          ⚽ Pitazo inicial... Comienzan las acciones en el Coliseo.
                     </div>
                     <div id="modulo-interactivo-${idUnico}" style="display:none; background:rgba(15,23,42,0.95); border:1px solid var(--dorado); border-radius:8px; padding:15px; margin-top:12px; text-align:center;">
                          <h4 id="evento-titulo-${idUnico}" style="color:var(--dorado); margin:0 0 8px 0; font-family:'Oswald';">🚨 JUGADA EN TIMELINE</h4>
                          <p id="evento-texto-${idUnico}" style="font-size:0.85rem; color:#cbd5e1; margin-bottom:12px; text-align:left;"></p>
                          <div id="evento-opciones-${idUnico}" style="display:flex; flex-direction:column; gap:8px;"></div>
                     </div>
                     <div id="multi-penales-box-${idUnico}" style="display:none; text-align:center; color:#ff3333; font-weight:bold; margin-top:12px; font-size:0.9rem; background:rgba(239,68,68,0.08); padding:8px; border-radius:6px; border: 1px solid rgba(239,68,68,0.2); font-family: 'Oswald';"></div>
                 `;
                 tablero.appendChild(bloquePartido); 
                 bloquePartido.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                 if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('pitazo');

                 let cronogramaGolesTu = partido.minutosL ? [...partido.minutosL] : [];
                 let cronogramaGolesRival = partido.minutosV ? [...partido.minutosV] : [];
                 let golesTuActuales = 0; 
                 let golesRivalActuales = 0;
                 let segundoVirtual = 0;
                 let enPausaDeContador = false;
                 let ultimoMinutoBotProcesado = -1;

                 const timerMulti = setInterval(async () => {
                     if (enPausaDeContador) return;

                     try {
                         const salaIdentificador = multiSalaId || multiCodigoSala;
                         const resSala = await fetch(`${URL_BASE}/multijugador/estado-vivo/${salaIdentificador}`, {
                             method: 'GET',
                             headers: obtenerHeadersSeguros()
                         });
                         const dataSala = await resSala.json();
                         if (!dataSala.ok) return;

                         if (multiEsCreador) {
                             if (dataSala.estadoJugada !== 'esperando_eleccion' && dataSala.estadoJugada !== 'mostrar_contador') {
                                 segundoVirtual += 1;
                                 if (segundoVirtual > 90) segundoVirtual = 90;

                                 await fetch(`${URL_BASE}/multijugador/actualizar-reloj`, {
                                     method: 'POST',
                                     headers: obtenerHeadersSeguros(),
                                     body: JSON.stringify({ sala_id: multiSalaId, minuto: segundoVirtual })
                                 }).catch(() => {});
                             }
                         } else {
                             segundoVirtual = dataSala.minuto || 0;
                         }

                         document.getElementById(`reloj-vivo-${idUnico}`).innerText = `⏱️ MINUTO ${segundoVirtual.toString().padStart(2,'0')}:00`;

                         const tieneGolLocal = cronogramaGolesTu.includes(segundoVirtual);
                         const tieneGolRival = cronogramaGolesRival.includes(segundoVirtual);

                         if ((tieneGolLocal || tieneGolRival) && dataSala.estadoJugada !== 'esperando_eleccion' && dataSala.estadoJugada !== 'mostrar_contador') {
                             if (multiEsCreador) {
                                 await fetch(`${URL_BASE}/multijugador/pausar-por-evento`, {
                                     method: 'POST',
                                     headers: obtenerHeadersSeguros(),
                                     body: JSON.stringify({ sala_id: multiSalaId })
                                 });
                             }
                             return;
                         }

                         if (dataSala.estadoJugada === 'esperando_eleccion') {
                             // 🛠️ ¡BUG SOLUCIONADO AQUÍ! Corregido partidoData por partido
                             const idxTu = partido.minutosL ? partido.minutosL.indexOf(segundoVirtual) : -1;
                             const idxRiv = partido.minutosV ? partido.minutosV.indexOf(segundoVirtual) : -1;
                             const esLocalAtacando = idxTu !== -1;
                             const llaveEventoFijo = esLocalAtacando ? (partido.eventosL[idxTu] || "contrataque_favor") : (partido.eventosV[idxRiv] || "defensa_urgente");

                             if (yoJuegoEstePartido) {
                                 const mod = document.getElementById(`modulo-interactivo-${idUnico}`);
                                 if (mod.style.display !== "block") {
                                     if (esPvpReal) {
                                         const soyAtacante = (esLocalAtacando && soyElLocalDeEsteMatch) || (!esLocalAtacando && soyElInvitadoDeEsteMatch);
                                         lanzarBotoneraPVPUI(soyAtacante ? "ataque" : "defensa", soyAtacante);
                                     } else if (esHumanoVsBot) {
                                         ejecutarPausaContraBot(llaveEventoFijo, esLocalAtacando);
                                     }
                                 }
                             } else {
                                 if (esPartidoDeBotsPuro && multiEsCreador) {
                                     if (ultimoMinutoBotProcesado === segundoVirtual) return;
                                     ultimoMinutoBotProcesado = segundoVirtual;

                                     const exitoIA = Math.random() <= 0.50;
                                     await fetch(`${URL_BASE}/multijugador/enviar-eleccion-bot`, {
                                         method: 'POST',
                                         headers: obtenerHeadersSeguros(),
                                         body: JSON.stringify({ sala_id: multiSalaId, exito: exitoIA, esLocal: esLocalAtacando })
                                     }).catch(() => { ultimoMinutoBotProcesado = -1; });
                                 } else {
                                     document.getElementById(`consola-incidencias-${idUnico}`).innerText = `⏳ Jugadores decidiendo jugada interactiva...`;
                                 }
                             }
                             return;
                         }

                         if (dataSala.estadoJugada === 'mostrar_contador') {
                             enPausaDeContador = true;
                             let cuentaRegresiva = 3;
                             const consola = document.getElementById(`consola-incidencias-${idUnico}`);
                             
                             const intervaloContadorVisual = setInterval(async () => {
                                 cuentaRegresiva--;
                                 if (cuentaRegresiva > 0) {
                                     consola.innerText = `⏳ Computando jugada de vestuario en... ${cuentaRegresiva}`;
                                 } else {
                                     clearInterval(intervaloContadorVisual);
                                     
                                     const resFinal = dataSala.resultado; 
                                     if (resFinal && resFinal.exito) {
                                         const esGolRealLocal = partido.minutosL && partido.minutosL.includes(segundoVirtual);
                                         const esGolRealRival = partido.minutosV && partido.minutosV.includes(segundoVirtual);

                                         if (esGolRealLocal) golesTuActuales++;
                                         if (esGolRealRival) golesRivalActuales++;

                                         dispararImpactoVisualMulti(`🎉 ¡GOOOL! Resolución táctica impacta en las mallas.`);
                                     } else {
                                         consola.innerText = "❌ Movimiento contenido de forma excelente por la zaga defensiva.";
                                     }

                                     cronogramaGolesTu = cronogramaGolesTu.filter(m => m !== segundoVirtual);
                                     cronogramaGolesRival = cronogramaGolesRival.filter(m => m !== segundoVirtual);

                                     setTimeout(async () => {
                                         if (multiEsCreador) {
                                             await fetch(`${URL_BASE}/multijugador/reanudar-partido`, {
                                                 method: 'POST',
                                                 headers: obtenerHeadersSeguros(),
                                                 body: JSON.stringify({ sala_id: multiSalaId })
                                             });
                                         }
                                         enPausaDeContador = false; 
                                     }, 2000);
                                 }
                             }, 1000);
                             return;
                         }

                         if (segundoVirtual >= 90 && !enPausaDeContador) {
                             clearInterval(timerMulti); 
                             
                             golesTuActuales = partido.golesLocal;
                             golesRivalActuales = partido.golesVisitante;
                             
                             const scoreLabel = document.getElementById(`score-vivo-${idUnico}`);
                             if (scoreLabel) scoreLabel.innerText = `${golesTuActuales} - ${golesRivalActuales}`;

                             if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('pitazo');

                             if (partido.definicionPenales) {
                                  const pBox = document.getElementById(`multi-penales-box-${idUnico}`);
                                  if (pBox) {
                                       pBox.style.display = "block";
                                       pBox.innerText = `💥 TANDA DE PENALES: (${partido.penalesLocal} - ${partido.penalesVisitante})`;
                                  }
                             }
                             
                             bloquePartido.style.borderColor = "var(--verde-match)";
                             const finTexto = document.createElement("div"); 
                             finTexto.style.cssText = "text-align:right; font-size:0.85rem; font-weight:bold; color:var(--verde-match); margin-top:8px; font-family:'Oswald';";
                             finTexto.innerText = `🏆 LLEVA EL CRUCE: ${partido.ganadorUsername.toUpperCase()} ✅`;
                             bloquePartido.appendChild(finTexto);
                             
                             const consolaIncidencias = document.getElementById(`consola-incidencias-${idUnico}`);
                             if (consolaIncidencias) consolaIncidencias.innerText = "🏁 Fin del partido. Planillas firmadas.";
                             
                             resolveCruce(); 
                             return; 
                         }
                     } catch (err) {
                         console.error("Error en loop multijugador:", err);
                     }
                 }, esPartidoDeBotsPuro ? 200 : 800);

                 function dispararImpactoVisualMulti(textoRelato) {
                     bloquePartido.classList.add("efecto-shake");
                     setTimeout(() => bloquePartido.classList.remove("efecto-shake"), 350);
                     const lbl = document.getElementById(`score-vivo-${idUnico}`);
                     if (lbl) lbl.innerText = `${golesTuActuales} - ${golesRivalActuales}`;
                     document.getElementById(`consola-incidencias-${idUnico}`).innerText = textoRelato;
                     if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('gol');
                 }
            });
        });
    });

    secuenciaPromesas.then(() => {
         // 🛡️ PARCHE DEFENSIVO: Si el cartel final ya existe en el DOM, no lo volvemos a inyectar
         if (document.getElementById("bloque-cronica-definitiva-multi")) return;

         const bloquePremio = document.createElement("div");
         bloquePremio.id = "bloque-cronica-definitiva-multi";
         bloquePremio.style.cssText = "text-align:center; margin-top:25px; padding:20px; background:rgba(0,255,136,0.03); border:2px dashed var(--dorado); border-radius:12px;";
         let textoPremio = `👑 ¡Fin de la transmisión!\n🎁 El torneo ha concluido exitosamente.`;
         
         if (premio && !premio.ganoBot) {
              if (premio.tipo_apuesta === 'oro') {
                   textoPremio = `🏆 ¡FIN DEL TORNEO ONLINE! 🏆\n👑 Campeón: ${premio.ganador_username.toUpperCase()}\n🎁 ¡Pozo de 🪙 ${premio.pozo} de Oro!`;
              } else if (premio.tipo_apuesta === 'carta') {
                   textoPremio = `🏆 ¡FIN DEL TORNEO ONLINE! 🏆\n👑 Campeón: ${premio.ganador_username.toUpperCase()}\n🎉 ¡Se lleva el cromo: [ ${premio.nombreCartaPremio || 'Jugador Épico'} ]!`;
              }
         }
         
         bloquePremio.innerHTML = `<h3 style="color:var(--dorado); font-family:'Oswald';">🏁 CRÓNICA DEFINITIVA</h3><p style="color:#fff; font-weight:bold; white-space:pre-line;">${textoPremio}</p><button type="button" id="btn-regresar-limpio-multi" class="btn-estadio" style="width:100%; max-width:350px; margin-top:15px; background:var(--celeste); color:#000; font-weight:bold;">🔄 REGRESAR A LA HOME</button>`;
         tablero.appendChild(bloquePremio); bloquePremio.scrollIntoView({ behavior: 'smooth' });

         document.getElementById("btn-regresar-limpio-multi").onclick = () => {
              document.getElementById("multi-pantalla-fixture").style.display = "none";
              document.getElementById("multi-menu-inicial").style.display = "block";
              liberarNavegacionArenaUI(); multiSalaId = null; multiCodigoSala = null; multiEsCreador = false; jugadoresSeleccionadosDraft = [];
         };
    });
};

/* ========================================================================
   🎮 MOTOR INTERACTIVO: BOTONERA PVP EN VIVO (CONEXIÓN NEON)
   ======================================================================== */
window.lanzarBotoneraPVPUI = function(rol, soyAtacante) {
    const modulos = document.querySelectorAll('[id^="modulo-interactivo-"]');
    const modActivo = modulos[modulos.length - 1];
    if (!modActivo) return;

    const idUnico = modActivo.id.replace("modulo-interactivo-", "");
    const contenedorOpciones = document.getElementById(`evento-opciones-${idUnico}`);
    const tituloEvento = document.getElementById(`evento-titulo-${idUnico}`);
    const textoEvento = document.getElementById(`evento-texto-${idUnico}`);

    if (!contenedorOpciones) return;
    contenedorOpciones.innerHTML = ""; 

    if (soyAtacante) {
        tituloEvento.innerText = "⚡ ¡ESTÁS ATACANDO, CRACK!";
        textoEvento.innerText = "🔟 El equipo rompió líneas. Elegí una estrategia ofensiva para burlar la marca del rival:";
        
        contenedorOpciones.innerHTML = `
            <button class="btn-estadio" onclick="confirmarEleccionPVPMulti('${idUnico}', 1, true)" style="background:var(--verde-match); color:#000; font-weight:bold; margin-bottom:5px;">🎯 Remate Colocado al Segundo Palo</button>
            <button class="btn-estadio" onclick="confirmarEleccionPVPMulti('${idUnico}', 2, true)" style="background:var(--verde-match); color:#000; font-weight:bold;">⚡ Centro Atrás al Ras del Pasto</button>
        `;
    } else {
        tituloEvento.innerText = "🛡️ ¡TE ESTÁN ATACANDO, PA!";
        textoEvento.innerText = "🟥 El rival se metió en tu área. Ordená un movemento defensivo urgente a tus centrales:";
        
        contenedorOpciones.innerHTML = `
            <button class="btn-estadio" onclick="confirmarEleccionPVPMulti('${idUnico}', 3, false)" style="background:var(--rojo); color:#fff; font-weight:bold; margin-bottom:5px;">🧤 Achique del Arquero y Cobertura</button>
            <button class="btn-estadio" onclick="confirmarEleccionPVPMulti('${idUnico}', 4, false)" style="background:var(--rojo); color:#fff; font-weight:bold;">🧱 Barrida Limpia a la Pelota</button>
        `;
    }

    modActivo.style.display = "block";
    modActivo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.confirmarEleccionPVPMulti = async function(idUnico, opcionId, esLocal) {
    const modActivo = document.getElementById(`modulo-interactivo-${idUnico}`);
    if (modActivo) modActivo.style.display = "none"; 

    document.getElementById(`consola-incidencias-${idUnico}`).innerText = "⏳ Elección enviada. Esperando resolución de la banca...";

    try {
        await fetch(`${URL_BASE}/multijugador/enviar-eleccion`, {
            method: 'POST',
            headers: obtenerHeadersSeguros(),
            body: JSON.stringify({
                sala_id: multiSalaId,
                opcion_id: opcionId,
                esLocal: multiEsCreador 
            })
        });
    } catch (e) {
        console.error("❌ Error enviando táctica PVP:", e);
    }
};

function inyectarGritoGolMulti(index, mensajeTexto) {
     const logView = document.getElementById(`multi-log-vivo-${index}`);
     if (!logView) return;
     logView.innerText = mensajeTexto;
     logView.style.color = "var(--dorado)";
     logView.style.fontWeight = "bold";
     setTimeout(() => { if (logView) { logView.style.color = "#94a3b8"; logView.style.fontWeight = "normal"; } }, 1600);
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

function ejecutarAnimaciónIntroVersus(contenedor, local, rival, ronda) {
    return new Promise((resolve) => {
        const divIntro = document.createElement("div");
        divIntro.style.cssText = "background:radial-gradient(circle, #0f172a 0%, #020617 100%); border:2px solid var(--dorado); border-radius:12px; padding:25px; text-align:center; margin-bottom:20px; position:relative; overflow:hidden; box-shadow: 0 0 25px rgba(255,177,0,0.2);";
        
        divIntro.innerHTML = `
            <div style="font-family:'Oswald'; font-size:0.8rem; color:var(--dorado); letter-spacing:2px; text-transform:uppercase; margin-bottom:10px;">⚡ TRANSMISIÓN EN DIRECTO REAL ⚡</div>
            <div style="color:var(--celeste); font-size:1.1rem; font-family:'Oswald'; font-weight:bold; margin-bottom:15px;">📋 ${ronda.toUpperCase()}</div>
            <div style="display:flex; justify-content:center; align-items:center; gap:20px; font-weight:bold; font-size:1.3rem; font-family:'Oswald';">
                <span style="color:#fff; text-shadow: 0 0 10px rgba(255,255,255,0.4); transform: translateX(-30px); transition: all 0.5s ease-out;" class="intro-loc-txt">⚽ ${local.toUpperCase()}</span>
                <span style="color:var(--rojo); font-size:1.8rem; font-style:italic; transform: scale(0); transition: all 0.3s ease-in;" class="intro-vs-txt">VS</span>
                <span style="color:#fff; text-shadow: 0 0 10px rgba(255,255,255,0.4); transform: translateX(30px); transition: all 0.5s ease-out;" class="intro-vis-txt">${rival.toUpperCase()}</span>
            </div>
            <div style="margin-top:15px; font-size:0.85rem; color:#64748b; font-weight:bold; transition: color 0.3s;" class="intro-status-txt">⚙️ SINCRONIZANDO VESTUARIOS...</div>
        `;
        
        contenedor.appendChild(divIntro);
        divIntro.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
            const l = divIntro.querySelector(".intro-loc-txt");
            const v = divIntro.querySelector(".intro-vs-txt");
            const r = divIntro.querySelector(".intro-vis-txt");
            const s = divIntro.querySelector(".intro-status-txt");
            
            if (l) l.style.transform = "translateX(0)";
            if (r) r.style.transform = "translateX(0)";
            if (v) v.style.transform = "scale(1.2)";
            if (s) { s.innerText = "🏁 ¡CONEXIÓN ESTABLECIDA! PITAZO INICIAL"; s.style.color = "var(--verde-match)"; }
        }, 100);

        setTimeout(() => {
            divIntro.style.opacity = "0";
            divIntro.style.transition = "opacity 0.4s ease-out";
            setTimeout(() => { divIntro.remove(); resolve(); }, 400);
        }, 3500);
    });
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
   📢 10. LEADERBOARDS (RANKINGS GENERAL Y MUNDIAL) Y BANNER INFORMATIVO (FIXED)
   ======================================================================== */

async function cargarRankingLocal() {
     cargarRankingMundialesLocal();
     const tbody = document.getElementById("tabla-ranking-body");
     if (!tbody) return;

     try {
          const token = localStorage.getItem("token");

          // Fetch con cabecera de tester para pasar el candado de mantenimiento
          const res = await fetch(`${URL_BASE}/ranking`, {
               method: "GET",
               headers: { "Authorization": `Bearer ${token}` }
          });
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

               // 🔥 CORREGIDO: Eliminadas las comillas extras de la función onclick para pasar el entero nativo
               tr.innerHTML = `
                    <td><b>${posicionText}</b></td>
                    <td style="text-align: left; padding-left: 15px; cursor: pointer; color: #fff; transition: color 0.2s;" 
                        onclick="inspeccionarPerfilRival(${user.id})"
                        onmouseover="this.style.color='var(--celeste)'" 
                        onmouseout="this.style.color='#fff'">
                        👤 ${user.username} ${usuarioActual && user.username === usuarioActual.username ? '<span style="color:var(--celeste); font-size:0.8rem;">(Vos)</span>' : ''}
                    </td>
                    <td style="color: #ff4a4a; font-weight: bold;">${user.puntos_ranking}</td>
               `;
               tbody.appendChild(tr);
          });
     } catch (err) { console.error(err); }
}

async function cargarRankingMundialesLocal() {
     const tbody = document.getElementById("tabla-ranking-mundiales-body");
     if (!tbody) return;

     try {
          const token = localStorage.getItem("token");

          // Fetch con cabecera de tester para pasar el candado de mantenimiento
          const res = await fetch(`${URL_BASE}/ranking-mundiales`, {
               method: "GET",
               headers: { "Authorization": `Bearer ${token}` }
          });
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

                // 🛡️ ESCANEO COMPLETO DE PROPIEDADES EN POSTGRES
                console.log("🕵️ Escaneando datos de la fila del ranking:", user);
                const idDetectado = user.id || user.usuario_id || user.id_usuario || user.autor_id;

                tr.innerHTML = `
                    <td><b>${posicionText}</b></td>
                    <td style="text-align: left; padding-left: 15px; cursor: pointer; color: #fff; transition: color 0.2s;" 
                        class="celda-rival-click"
                        onmouseover="this.style.color='var(--celeste)'" 
                        onmouseout="this.style.color='#fff'">
                        👤 ${user.username} ${usuarioActual && Number(idDetectado) === Number(usuarioActual.id) ? '<span style="color:var(--celeste); font-size:0.8rem;">(Vos)</span>' : ''}
                    </td>
                    <td style="color: var(--dorado); font-weight: bold; font-size: 1.2rem;">🏆 ${user.copas_mundiales || user.copas || 0}</td>
                `;

                const celdaClick = tr.querySelector(".celda-rival-click");
                
                if (celdaClick) {
                    celdaClick.addEventListener("click", async () => {
                        if (!idDetectado) {
                                console.error("❌ Mapeo roto. El objeto de la DB no contiene ninguna propiedad de ID conocida:", user);
                                return alert("❌ Error de datos: No se pudo rastrear el ID único de este competidor.");
                        }

                        const idLimpio = Number(idDetectado);
                        
                        // Control extra: Si dio NaN el casteo numérico por venir corrupto de la DB, frenamos acá
                        if (isNaN(idLimpio)) {
                                console.error("❌ El ID detectado no es un número válido (NaN):", idDetectado);
                                return alert("❌ Error de casteo: El ID del rival llegó corrupto de la base de datos.");
                        }

                        if (typeof inspeccionarPerfilRival === "function") {
                                await inspeccionarPerfilRival(idLimpio);
                        }
                    });
                }

                tbody.appendChild(tr);
            });
     } catch (err) { console.error("Error al cargar ranking de mundiales:", err); }
}

// Variable global temporal para retener los datos del informe que vienen de Neon
let datosInformeParcheCache = null;

/* ========================================================================
   📢 PASO 1: CONTROLADOR DE NOVEDADES Y PARCHES DE LA ARENA (MULTIMEDIA NATIVO)
   ======================================================================== */
async function iniciarControladorAnunciosSeguro() {
    try {
        const res = await fetch(`${URL_BASE}/anuncio-actual`);
        const anuncio = await res.json();
        
        if (!anuncio || !anuncio.activo) {
            // 🏎️ CONTROL DE FLUJO: Si no hay anuncio activo, salta directo a la Recompensa Diaria (Paso 3)
            verificarRecompensaDiaria();
            return;
        }

        datosInformeParcheCache = anuncio.informe || null;

        const modal = document.getElementById('modalAnuncioGlobal');
        const tituloHtml = document.getElementById('anuncioTitulo');
        const cuerpoHtml = document.getElementById('anuncioCuerpo');
        const btnEntendido = modal?.querySelector('button, .btn-estadio');
        
        if (!modal || !tituloHtml || !cuerpoHtml) return;

        tituloHtml.textContent = anuncio.titulo.toUpperCase();
        cuerpoHtml.innerHTML = ""; 

        // Inyección de Texto base
        if (anuncio.texto) {
            const p = document.createElement('p'); 
            p.style.cssText = "color: #cbd5e1; font-size: 0.95rem; line-height: 1.5; margin-bottom: 15px; text-align: center;";
            p.textContent = anuncio.texto; 
            cuerpoHtml.appendChild(p);
        }
        
        // Inyección de Video Iframe Responsivo
        if (anuncio.tipo === "video" && anuncio.urlVideo) {
            const containerVideo = document.createElement('div'); 
            containerVideo.className = "anuncio-video-container";
            containerVideo.style.cssText = "position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); margin-bottom: 15px;";
            
            const iframe = document.createElement('iframe'); 
            iframe.src = anuncio.urlVideo; 
            iframe.setAttribute('allowfullscreen', 'true'); 
            iframe.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;";
            
            containerVideo.appendChild(iframe); 
            cuerpoHtml.appendChild(containerVideo);
        } 
        // Inyección de Imagen alternativo
        else if (anuncio.tipo === "imagen" && anuncio.urlImagen) {
            const img = document.createElement('img'); 
            img.src = anuncio.urlImagen; 
            img.className = "anuncio-media"; 
            img.alt = "Novedades";
            cuerpoHtml.appendChild(img);
        }

        // Interceptamos el click nativo de cierre
        if (btnEntendido) {
            btnEntendido.onclick = () => {
                cerrarAnuncioGlobal();
            };
        }

        modal.style.display = "flex";
    } catch (err) { 
        console.error("Error en banner de novedades:", err); 
        verificarRecompensaDiaria(); // Resguardo por si falla la red, que pueda reclamar igual
    }
}

function cerrarAnuncioGlobal() {
    const modal = document.getElementById('modalAnuncioGlobal');
    if (modal) { 
        modal.style.display = "none"; 
        document.getElementById('anuncioCuerpo').innerHTML = ""; 
    }

    // 🏎️ PASO 2: Abre el HUD estructural si el caché guardó los datos del informe
    if (datosInformeParcheCache) {
        abrirInformeActualizacionUI(datosInformeParcheCache);
    } else {
        // Si no hay informe de cambios, pasa directo a la Recompensa Diaria
        verificarRecompensaDiaria();
    }
}

function abrirInformeActualizacionUI(info) {
    const elVersion = document.getElementById("informe-txt-version");
    const elFecha = document.getElementById("informe-txt-fecha");
    const contenedorCambios = document.getElementById("informe-lista-cambios");
    
    if (elVersion) elVersion.innerText = info.version || "v2.0";
    if (elFecha) elFecha.innerText = info.fecha || "Reciente";
    
    if (contenedorCambios) {
        contenedorCambios.innerHTML = "";
        if (Array.isArray(info.cambios)) {
            info.cambios.forEach(cambio => {
                const p = document.createElement("p");
                p.style.margin = "0";
                p.innerHTML = cambio.replace(/\*\*(.*?)\*\*/g, '<b style="color:var(--dorado);">$1</b>');
                contenedorCambios.appendChild(p);
            });
        }
    }
    
    const modalParche = document.getElementById("modal-informe-parche");
    if (modalParche) modalParche.style.display = "flex";
}

function cerrarInformeParche() {
    const modalParche = document.getElementById("modal-informe-parche");
    if (modalParche) modalParche.style.display = "none";
    datosInformeParcheCache = null; 

    // 🏎️ PASO 3 CORREGIDO: Llamamos a tu función real sin el "Secuencial"
    if (typeof verificarRecompensaDiaria === 'function') {
        verificarRecompensaDiaria();
    } else {
        console.warn("⚠️ No se encontró la función verificarRecompensaDiaria.");
    }
}

function abrirMercadoBot(listaTusRepetidas) {
    const contenedorBot = document.getElementById("modulo-comerciante-bot");
    contenedorBot.style.display = "block";

    // Estructura principal con HUD dinámico de selección
    contenedorBot.innerHTML = `
        <div class="caja-modulo-estadio" style="max-width: 650px; margin: 20px auto; padding: 25px; border: 2px solid var(--dorado); background: #0f172a; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
            <h3 style="color: var(--dorado); font-family: 'Oswald'; font-size: 1.8rem; margin-top: 0; text-transform: uppercase; letter-spacing: 1px;">🤖 CONTRATO DEL BOT COMERCIANTE</h3>
            <p style="color: #94a3b8; font-size: 0.95rem; font-style: italic; line-height: 1.5; margin-bottom: 20px; padding: 0 10px;">
                "Traeme 3 cartas repetidas de la misma rareza y te daré una carta de un escalón superior. ¡Si sacrificás cartas de Élite podrías activar recompensas especiales ocultas!"
            </p>
            
            <div id="zona-seleccion-bot" style="margin: 20px 0; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
                    <label style="color: #fff; font-size: 0.9rem; font-weight: bold; font-family: 'Oswald'; text-transform: uppercase; letter-spacing: 0.5px;">📋 TUS CROMOS REPETIDOS DISPONIBLES</label>
                    <span id="contador-seleccion-bot" style="background: #1e293b; color: var(--celeste); padding: 2px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; font-family: monospace; border: 1px solid var(--celeste);">0 / 3 ELEGIDOS</span>
                </div>
                
                <div id="lista-checks-repetidas" class="custom-scrollbar-paises" style="max-height: 320px; overflow-y: auto; background: #020617; padding: 15px; border-radius: 10px; border: 1px solid #1e293b; display: flex; flex-direction: column; gap: 15px;">
                </div>
            </div>

            <button type="button" id="btn-ejecutar-trato" class="btn-estadio" style="background: var(--verde-match); color: #000; width: 100%; font-weight: bold; font-size: 1.1rem; padding: 12px 0; border-radius: 8px; transition: all 0.3s ease; font-family: 'Oswald'; text-transform: uppercase; letter-spacing: 0.5px;">
                 🤝 FIRMAR CONTRATO DE TRADEO
            </button>
            <div id="resultado-trato-bot" style="margin-top: 15px; font-weight: bold; font-size: 1rem; min-height: 25px; text-align: center; font-family: 'Oswald';"></div>
        </div>
    `;

    const listaCheckboxes = document.getElementById("lista-checks-repetidas");
    
    const mapeoRarezas = {
        'legendaria': { titulo: "👑 REPETIDAS LEGENDARIAS", color: "#ffb100", listado: [] },
        'epica': { titulo: "🔮 REPETIDAS ÉPICAS", color: "#a335ee", listado: [] },
        'rara': { titulo: "⚡ REPETIDAS RARAS", color: "#0074e8", listado: [] },
        'comun': { titulo: "⚪ REPETIDAS COMUNES", color: "#8e9bb0", listado: [] }
    };

    let totalRepetidasValidas = 0;

    listaTusRepetidas.forEach(jugador => {
        const copias = jugador.obtenido !== undefined ? jugador.obtenido : (jugador.cantidad || 0);
        
        if (copias > 1) {
            let rarezaLimpia = (jugador.rareza || 'comun')
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

            if (rarezaLimpia === 'especial') rarezaLimpia = 'rara';
            
            if (mapeoRarezas[rarezaLimpia]) {
                mapeoRarezas[rarezaLimpia].listado.push({ ...jugador, disponibles: copias - 1 });
                totalRepetidasValidas++;
            }
        }
    });

    if (totalRepetidasValidas === 0) {
        listaCheckboxes.innerHTML = `
            <div style="color: var(--rojo); font-weight: bold; font-size: 1rem; text-align: center; padding: 30px 0; font-family: 'Oswald'; text-transform: uppercase;">
                 ❌ No tenés cromos repetidos en tu álbum para negociar.
            </div>
        `;
        const btnTrato = document.getElementById("btn-ejecutar-trato");
        btnTrato.disabled = true;
        btnTrato.style.background = "#334155";
        btnTrato.style.color = "#94a3b8";
        btnTrato.style.cursor = "not-allowed";
        btnTrato.innerText = "⛔ SIN ELEMENTOS PARA INTERCAMBIAR";
        return;
    }

    let htmlBolsas = "";
    Object.keys(mapeoRarezas).forEach(key => {
        const bloque = mapeoRarezas[key];
        if (bloque.listado.length > 0) {
            htmlBolsas += `
                <div class="grupo-rareza-bot" style="border-left: 3px solid ${bloque.color}; padding-left: 10px; margin-bottom: 5px;">
                    <div style="color: ${bloque.color}; font-size: 0.85rem; font-weight: bold; font-family: 'Oswald'; margin-bottom: 8px; letter-spacing: 0.5px;">${bloque.titulo}</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
            `;
            
            bloque.listado.forEach(j => {
                htmlBolsas += `
                    <label class="item-checkbox-premium" style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 6px; border: 1px solid #1a2436; cursor: pointer; transition: all 0.2s ease;">
                        <input type="checkbox" class="check-cromo-bot" value="${j.id}" data-rareza="${key}" style="width: 18px; height: 18px; accent-color: var(--verde-match); cursor: pointer; flex-shrink: 0;">
                        <span style="font-size: 1.1rem; flex-shrink: 0;">${j.bandera || '🃏'}</span>
                        <span style="flex-grow: 1; color: #cbd5e1; font-size: 0.85rem; font-weight: 500;">${j.nombre.toUpperCase()}</span>
                        <span style="background: rgba(255,255,255,0.05); color: #94a3b8; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-family: monospace;">x${j.disponibles} DISP</span>
                    </label>
                `;
            });

            htmlBolsas += `</div></div>`;
        }
    });

    listaCheckboxes.innerHTML = htmlBolsas;

    const checkboxes = document.querySelectorAll('.check-cromo-bot');
    const lblContador = document.getElementById('contador-seleccion-bot');

    checkboxes.forEach(chk => {
        chk.onchange = () => {
            const seleccionados = document.querySelectorAll('.check-cromo-bot:checked');
            lblContador.innerText = `${seleccionados.length} / 3 ELEGIDOS`;

            if (chk.checked) {
                chk.parentElement.style.background = "rgba(0, 255, 136, 0.05)";
                chk.parentElement.style.borderColor = "var(--verde-match)";
            } else {
                chk.parentElement.style.background = "rgba(255,255,255,0.02)";
                chk.parentElement.style.borderColor = "#1a2436";
            }

            if (seleccionados.length >= 3) {
                checkboxes.forEach(c => { if (!c.checked) c.disabled = true; });
            } else {
                checkboxes.forEach(c => c.disabled = false);
            }
        };
    });

    document.getElementById("btn-ejecutar-trato").onclick = async () => {
        const checksActivos = Array.from(document.querySelectorAll('.check-cromo-bot:checked'));
        const seleccionados = checksActivos.map(cb => parseInt(cb.value));

        if (seleccionados.length !== 3) {
            alert("⚠️ Tenés que seleccionar exactamente 3 cromos repetidos para hacer el trato.");
            return;
        }

        const rarezaPrimero = checksActivos[0].getAttribute('data-rareza');
        const mismaRareza = checksActivos.every(cb => cb.getAttribute('data-rareza') === rarezaPrimero);

        if (!mismaRareza) {
            alert("❌ ¡Trato denegado! Los 3 cromos sacrificados deben ser de la misma rareza.");
            return;
        }

        document.getElementById("btn-ejecutar-trato").disabled = true;
        document.getElementById("resultado-trato-bot").style.color = "var(--dorado)";
        document.getElementById("resultado-trato-bot").innerText = "⏳ EL BOT ESTÁ TASANDO TU TRATO EN LOS VESTUARIOS...";

        try {
            const res = await fetch(`${URL_BASE}/album/comerciar-bot`, {
                method: 'POST',
                headers: obtenerHeadersSeguros(), 
                body: JSON.stringify({ jugadorIdsASacar: seleccionados }) 
            });
            const data = await res.json();

            if (data.ok) {
                // 🟢 SECTOR MISIONES API: Impactamos el progreso en el backend de forma segura antes de renderizar
                if (typeof trackearProgresoMision === 'function') {
                    await trackearProgresoMision("trade", 1);
                }

                // Actualizar el álbum local en memoria inmediatamente tras el tradeo exitoso
                if (typeof cargarAlbumLocal === 'function') {
                    await cargarAlbumLocal(); 
                }

                document.getElementById("resultado-trato-bot").style.color = "var(--verde-match)";
                
                let plantillaMensaje = `
                    <div style="background: #020617; border: 1px solid #1e293b; padding: 15px; border-radius: 10px; margin-top: 15px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.8);">
                        <p style="margin: 0 0 10px 0; color: var(--verde-match);">🎉 ¡CONTRATO CERRADO EXITOSAMENTE!</p>
                        <span style="color: var(--dorado); font-size: 1.2rem; display: block; margin-bottom: 12px; font-family: 'Oswald';">
                            🌟 RECIBISTE A: ${data.cartaGanada.nombre.toUpperCase()} [${data.cartaGanada.rareza.toUpperCase()}]
                        </span>
                `;

                if (data.eventoEspecial) {
                    plantillaMensaje += `<span style="color: #38bdf8; font-weight: bold; font-size: 0.85rem; display: block; padding: 8px; background: #0c4a6e; border-radius: 6px; border: 1px dashed #0284c7; margin-bottom: 15px; font-family: system-ui; text-align: left;">🎁 ${data.eventoEspecial}</span>`;
                }

                plantillaMensaje += `
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button type="button" id="btn-bot-reintentar" class="btn-estadio" style="background: var(--celeste); color: #000; flex: 1; font-weight: bold; padding: 10px; border-radius: 6px; font-family: 'Oswald'; font-size: 0.9rem; text-transform: uppercase;">
                                 🔄 Seguir Tradeando
                            </button>
                            <button type="button" id="btn-bot-salir" class="btn-estadio" style="background: #334155; color: #fff; flex: 1; font-weight: bold; padding: 10px; border-radius: 6px; font-family: 'Oswald'; font-size: 0.9rem; text-transform: uppercase;">
                                 🏟️ Ir al Álbum
                            </button>
                        </div>
                    </div>
                `;

                document.getElementById("resultado-trato-bot").innerHTML = plantillaMensaje;
                
                // Acción para quedarse y seguir operando con el bot con el array limpio
                document.getElementById("btn-bot-reintentar").onclick = () => {
                    const albumActualizado = window.albumCompleto || albumCompleto;

                    if (albumActualizado && albumActualizado.length > 0) {
                         abrirMercadoBot(albumActualizado);
                    } else if (window.todosLosJugadoresGlobal) {
                         abrirMercadoBot(window.todosLosJugadoresGlobal);
                    } else {
                         location.reload(); 
                    }
                };

                // Acción para salir definitivamente a la sección principal
                document.getElementById("btn-bot-salir").onclick = () => {
                    cambiarModulo('modulo-album', null);
                };

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

/* ========================================================================
   💸 GESTIÓN DEL MERCADO DE PASES P2P CON LOGS EN VIVO Y SEGURIDAD JWT
   ======================================================================== */

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

async function publicarCartaMercado() {
    const jugadorId = document.getElementById("select-mercado-vender").value; 
    const precio = parseInt(document.getElementById("input-mercado-precio").value);

    if (!jugadorId || !precio || precio < 50) {
        alert("⚠️ Seleccioná un cromo válido y un precio mínimo de 🪙50 de Oro.");
        return;
    }

    try {
        const res = await fetch(`${URL_BASE}/mercado/publicar`, {
            method: 'POST',
            headers: obtenerHeadersSeguros(), 
            body: JSON.stringify({ jugador_id: parseInt(jugadorId), precio }) 
        });
        const data = await res.json();
        
        if (data.ok) {
            alert("✨ Cromo publicado en la vitrina internacional.");
            document.getElementById("input-mercado-precio").value = "";
            cargarAlbumLocal();
            setTimeout(() => { cambiarModulo('modulo-mercado-pases', document.getElementById('btn-nav-mercado')); }, 500);
        } else {
            alert(data.mensaje);
        }
    } catch (err) {
        console.error(err);
    }
}

async function obtenerOfertasMercado() {
    const grid = document.getElementById("grid-mercado-pases");
    if (!grid) return;
    grid.innerHTML = "<p style='color:#64748b; grid-column:1/-1; text-align:center;'>⏳ Cargando vitrina de pases...</p>";

    const idLimpio = usuarioActual && usuarioActual.id ? parseInt(usuarioActual.id) : null;

    if (!idLimpio || isNaN(idLimpio)) {
        grid.innerHTML = "<p style='color:var(--rojo); grid-column:1/-1; text-align:center;'>❌ Sesión de usuario inválida.</p>";
        return;
    }

    try {
        const res = await fetch(`${URL_BASE}/mercado/ofertas?usuario_id=${idLimpio}`);
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
            
            let etiquetaTiempo = "⏱️ Vence en 1 día";
            let colorTiempo = "var(--celeste)"; 

            if (oferta.segundos_restantes !== undefined && oferta.segundos_restantes !== null) {
                const segundos = parseFloat(oferta.segundos_restantes);
                if (segundos > 0) {
                    const horasTotales = Math.floor(segundos / 3600);
                    const minutosRestantes = Math.floor((segundos % 3600) / 60);
                    
                    if (horasTotales > 0) {
                        etiquetaTiempo = `⏱️ Quedan: ${horasTotales}h ${minutosRestantes}m`;
                    } else {
                        etiquetaTiempo = `🚨 ¡Vence en: ${minutosRestantes} min!`;
                        colorTiempo = "var(--rojo)";
                    }
                } else {
                    etiquetaTiempo = "⏳ Expirando...";
                    colorTiempo = "var(--rojo)";
                }
            }

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
                        <span style="font-size:0.75rem; color:${colorTiempo}; font-weight:bold; display:block; margin-top:4px; font-family:'Oswald';">${etiquetaTiempo}</span>
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

async function comprarCartaMercado(ofertaId) {
    try {
        mostrarCarga("Cerrando transferencia en Neon...");
        
        // 🔥 FIX: Inyectamos obtenerHeadersSeguros() para adjuntar el Bearer Token JWT y evitar el 401
        const res = await fetch(`${URL_BASE}/mercado/comprar`, {
            method: 'POST',
            headers: obtenerHeadersSeguros(),
            body: JSON.stringify({ oferta_id: ofertaId })
        });
        const data = await res.json();
        ocultarCarga();

        if (data.ok) {
            alert(`🎉 ¡Fichaje cerrado! Recibiste a ${data.jugador.toUpperCase()}. El Oro fue transferido.`);
            
            if (usuarioActual && data.nuevoOro !== undefined) {
                usuarioActual.monedas = data.nuevoOro;
            }

            const elMonedas = document.getElementById("lbl-monedas");
            if (elMonedas && data.nuevoOro !== undefined) {
                elMonedas.innerText = data.nuevoOro;
            }

            // 🎵 Gatillo de audio premium
            if (typeof AudioArena !== 'undefined' && AudioArena.play) {
                AudioArena.play('monedas');
            }

            if (typeof cargarDatosUsuario === "function") cargarDatosUsuario();
            if (typeof actualizarPerfilUI === "function") actualizarPerfilUI();

            cargarAlbumLocal(); 
            obtenerOfertasMercado(); // 🔥 FIX: Corregido de obtenerOffersMercado() a obtenerOfertasMercado()

            // Refrescamos el historial dinámico si ya metiste el feed global abajo
            if (typeof actualizarHistorialTransferenciasUI === "function") {
                actualizarHistorialTransferenciasUI();
            }

        } else {
            alert(data.mensaje);
        }
    } catch (err) {
        console.error(err);
        ocultarCarga();
        alert("❌ Ocurrió un problema de red al procesar el fichaje.");
    }
}

// 📑 MANTENER COMO OBJETO CONSTANTE PARA EVITAR PÉRDIDA DE REFERENCIA GLOBAL
const eleccionesQuiniela = { p1: null, p2: null, p3: null };

async function cargarPartidosQuinielaUI() {
    const contenedor = document.getElementById("contenedor-lista-quiniela");
    if (!contenedor) return;

    try {
        // 🔥 INYECTADO: Se agregan headers seguros por si la ruta requiere verificarToken
        const res = await fetch(`${URL_BASE}/timba/quiniela/partidos`, {
            method: 'GET',
            headers: typeof obtenerHeadersSeguros === "function" ? obtenerHeadersSeguros() : { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.ok && data.partidos && data.partidos.length === 3) {
            contenedor.innerHTML = ""; 

            data.partidos.forEach((partido, index) => {
                const numP = index + 1;
                contenedor.innerHTML += `
                    <div style="background: rgba(2, 6, 23, 0.6); padding: 10px; border-radius: 6px; border: 1px solid #334155; margin-bottom: 8px;">
                        <div style="color: #cbd5e1; font-size: 0.8rem; font-weight: bold; text-align: center; margin-bottom: 6px; letter-spacing: 0.5px;">
                            ${partido.emoji || '⚽'} PARTIDO ${numP}: ${partido.local} vs ${partido.visitante}
                        </div>
                        <div style="display: flex; justify-content: space-around; gap: 6px;">
                            <button type="button" class="btn-quiniela-p${numP}" style="background: #1e293b; color: #fff; padding: 6px 10px; cursor: pointer; font-size: 0.75rem; border-radius: 4px; border: 1px solid #475569; width: 32%; font-weight: bold;" onclick="seleccionarQuiniela(${numP}, 'L', this)">LOCAL</button>
                            <button type="button" class="btn-quiniela-p${numP}" style="background: #1e293b; color: #fff; padding: 6px 10px; cursor: pointer; font-size: 0.75rem; border-radius: 4px; border: 1px solid #475569; width: 32%; font-weight: bold;" onclick="seleccionarQuiniela(${numP}, 'E', this)">EMPATE</button>
                            <button type="button" class="btn-quiniela-p${numP}" style="background: #1e293b; color: #fff; padding: 6px 10px; cursor: pointer; font-size: 0.75rem; border-radius: 4px; border: 1px solid #475569; width: 32%; font-weight: bold;" onclick="seleccionarQuiniela(${numP}, 'V', this)">VISITA</button>
                        </div>
                    </div>
                `;
            });
        } else {
            contenedor.innerHTML = "<p style='color:var(--dorado); text-align:center;'>⏳ No hay partidos disponibles en la cartelera actual.</p>";
        }
    } catch (err) {
        console.error("Error cargando quiniela rotativa:", err);
        contenedor.innerHTML = "<p style='color:var(--rojo); text-align:center;'>❌ Error al sincronizar la cartelera.</p>";
    }
}

function seleccionarQuiniela(partido, prediccion, boton) {
    document.querySelectorAll(`.btn-quiniela-p${partido}`).forEach(btn => {
        btn.style.background = "#1e293b";
        btn.style.color = "#fff";
        btn.style.borderColor = "#475569";
    });

    boton.style.background = "var(--dorado, #fbbf24)";
    boton.style.color = "#000";
    boton.style.borderColor = "var(--dorado, #fbbf24)";

    eleccionesQuiniela[`p${partido}`] = prediccion;
}

async function enviarBoletaQuiniela() {
    const monto = parseInt(document.getElementById("input-monto-quiniela").value);
    const divRes = document.getElementById("resultado-quiniela");
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
        // 🔥 CORREGIDO: Se inyecta obtenerHeadersSeguros() para pasar el token JWT requerido por verificarToken
        const miUsuarioId = usuarioActual ? (usuarioActual.id || usuarioActual._id) : null;
        
        const res = await fetch(`${URL_BASE}/timba/quiniela`, {
            method: 'POST',
            headers: typeof obtenerHeadersSeguros === "function" ? obtenerHeadersSeguros() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id: miUsuarioId,
                monto: monto,
                elecciones: eleccionesQuiniela
            })
        });
        const data = await res.json();

        if (data.ok) {
            if (usuarioActual && data.nuevoOro !== undefined) usuarioActual.monedas = data.nuevoOro;
            const elMonedas = document.getElementById("lbl-monedas");
            if (elMonedas && data.nuevoOro !== undefined) elMonedas.innerText = data.nuevoOro;

            if (typeof actualizarTimbasRestantesUI === "function") {
                actualizarTimbasRestantesUI();
            }

            const trad = (sigla) => sigla === 'L' ? 'Local' : (sigla === 'E' ? 'Empate' : 'Visita');
            
            // 🛡️ CONTROL DE RESGUARDO: Si falló la sincronización de partidosSimulados, evita romper la UI
            const p1 = data.partidosSimulados ? data.partidosSimulados[0] : { local: 'P1', visitante: 'Rival' };
            const p2 = data.partidosSimulados ? data.partidosSimulados[1] : { local: 'P2', visitante: 'Rival' };
            const p3 = data.partidosSimulados ? data.partidosSimulados[2] : { local: 'P3', visitante: 'Rival' };

            const resP1 = data.resultadosReales ? data.resultadosReales.p1 : 'L';
            const resP2 = data.resultadosReales ? data.resultadosReales.p2 : 'L';
            const resP3 = data.resultadosReales ? data.resultadosReales.p3 : 'L';

            const desglose = `<br><span style="color:#94a3b8; font-size:0.8rem;">
                [${p1.local} vs ${p1.visitante}: ${trad(resP1)}]<br>
                [${p2.local} vs ${p2.visitante}: ${trad(resP2)}]<br>
                [${p3.local} vs ${p3.visitante}: ${trad(resP3)}]
            </span>`;

            if (data.ganó) {
                divRes.style.color = "var(--verde-match, #10b981)";
                divRes.innerHTML = `🎉 ${data.mensaje}${desglose}`;
            } else {
                divRes.style.color = "var(--rojo, #ef4444)";
                divRes.innerHTML = `❌ ${data.mensaje}${desglose}`;
            }

            document.getElementById("input-monto-quiniela").value = "100";
            
            // 🔥 CORREGIDO: Se limpian los campos del objeto manteniendo la misma referencia
            eleccionesQuiniela.p1 = null;
            eleccionesQuiniela.p2 = null;
            eleccionesQuiniela.p3 = null;
            
            document.querySelectorAll('[class^="btn-quiniela-p"]').forEach(btn => {
                btn.style.background = "#1e293b";
                btn.style.color = "#fff";
                btn.style.borderColor = "#475569";
            });

            cargarPartidosQuinielaUI();

        } else {
            divRes.style.color = "var(--rojo)";
            divRes.innerText = data.mensaje || "Error procesando la jugada.";
        }
    } catch (err) {
        console.error(err);
        divRes.style.color = "var(--rojo)";
        divRes.innerText = "❌ Error de conexión.";
    }
}

// Asegurar que al cargar la página el foco se posicione en el primer input
document.addEventListener("DOMContentLoaded", () => {
    const primerInput = document.getElementById("input-usuario");
    if (primerInput) primerInput.focus();
});

/* ========================================================================
   🏅 SISTEMA DE RETENCIÓN: MISIONES DIARIAS SINCRONIZADAS AL SERVIDOR
   ======================================================================== */
// Variable global en memoria que se refrescará con lo que devuelva el servidor
window.misionesDiariasUsuario = [];
let intervaloResetMisiones = null; // Control atómico del bucle del reloj

// Esta función se ejecuta al iniciar sesión (adentro de autenticarUsuario)
async function cargarMisionesDelServidor() {
    try {
        const res = await fetch(`${URL_BASE}/misiones/obtener`, {
            method: 'GET',
            headers: obtenerHeadersSeguros()
        });
        const data = await res.json();
        
        if (data.ok) {
            window.misionesDiariasUsuario = data.misiones;
            renderizarMisionesDiarias();
            // ⏱️ Encendemos el reloj dinámico apuntando al ID correcto del HTML
            iniciarCronometroResetMisiones();
        }
    } catch (err) {
        console.error("Error al traer misiones del server:", err);
    }
}

function renderizarMisionesDiarias() {
    const contenedor = document.getElementById("contenedor-lista-misiones");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    if (window.misionesDiariasUsuario.length === 0) {
        contenedor.innerHTML = `<p style="color: #64748b; text-align: center; font-size: 0.85rem;">⏳ Cargando objetivos de la cartelera oficial...</p>`;
        return;
    }

    window.misionesDiariasUsuario.forEach(mision => {
        const porcentaje = Math.min(Math.round((mision.progreso / mision.meta) * 100), 100);
        const estaCompleta = mision.progreso >= mision.meta;
        
        const divMision = document.createElement("div");
        divMision.style.cssText = "background: rgba(2, 6, 23, 0.6); border: 1px solid #1e293b; border-radius: 10px; padding: 12px 15px; display: flex; flex-direction: column; gap: 8px;";
        if (estaCompleta && !mision.reclamada) divMision.style.borderColor = "var(--verde-match)";

        divMision.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                <p style="margin: 0; font-size: 0.9rem; color: #cbd5e1; font-weight: 500; text-align: left;">${mision.descripcion}</p>
                <span style="font-family: 'Oswald'; color: var(--dorado); font-size: 1rem; flex-shrink: 0;">🪙 +${mision.recompensa}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 15px; margin-top: 4px;">
                <div style="background: #161c30; height: 10px; border-radius: 6px; flex-grow: 1; padding: 1px;">
                    <div style="background: linear-gradient(90deg, var(--celeste) 0%, var(--verde-match) 100%); height: 100%; width: ${porcentaje}%; border-radius: 6px; transition: width 0.3s ease;"></div>
                </div>
                <span style="font-size: 0.75rem; font-family: monospace; color: #64748b; font-weight: bold; min-width: 45px; text-align: right;">${mision.progreso}/${mision.meta}</span>
                ${
                    mision.reclamada 
                    ? `<button type="button" class="btn-estadio" disabled style="padding: 4px 10px; font-size: 0.75rem; background: #1e293b !important; color: #64748b !important; box-shadow: none !important;">CLAIMED</button>`
                    : estaCompleta 
                        ? `<button type="button" class="btn-estadio" onclick="reclamarPremioMisionServer(${mision.id})" style="padding: 4px 10px; font-size: 0.75rem; background: var(--verde-match); color: #000; box-shadow: 0 2px 0 #00b35f;">RECLAMAR</button>`
                        : `<button type="button" class="btn-estadio" disabled style="padding: 4px 10px; font-size: 0.75rem; background: #1e293b !important; color: #475569 !important; box-shadow: none !important;">EN CURSO</button>`
                }
            </div>
        `;
        contenedor.appendChild(divMision);
    });
}

// Envía la acción al servidor en segundo plano cada vez que haces un sobre/trade/mundial
async function trackearProgresoMision(tipo, cantidad = 1) {
    try {
        const res = await fetch(`${URL_BASE}/misiones/trackear`, {
            method: 'POST',
            headers: obtenerHeadersSeguros(),
            body: JSON.stringify({ tipo, cantidad })
        });
        const data = await res.json();
        if (data.ok) {
            window.misionesDiariasUsuario = data.misiones;
            renderizarMisionesDiarias();
        }
    } catch (err) {
        console.error("Error al trackear misión en servidor:", err);
    }
}

// Reclama cobrando directo desde el saldo calculado por el backend
async function reclamarPremioMisionServer(idMision) {
    try {
        const res = await fetch(`${URL_BASE}/misiones/reclamar`, {
            method: 'POST',
            headers: obtenerHeadersSeguros(),
            body: JSON.stringify({ misionId: idMision })
        });
        const data = await res.json();

        if (data.ok) {
            window.misionesDiariasUsuario = data.misiones;
            if (typeof usuarioActual !== 'undefined' && usuarioActual) {
                usuarioActual.monedas = data.monedas; 
                const elMonedas = document.getElementById("lbl-monedas");
                if (elMonedas) elMonedas.innerText = usuarioActual.monedas;
            }
            
            // 🎵 GATILLO DE AUDIO INYECTADO: Sonido de moneditas al cobrar tu recompensa
            if (typeof AudioArena !== 'undefined' && AudioArena.play) {
                AudioArena.play('monedas');
            }

            renderizarMisionesDiarias();
            console.log(`🪙 Recompensa cobrada con éxito. Balance actualizado a: ${data.monedas}`);

        } else {
            const modal = document.getElementById('modalAnuncioGlobal');
            const tituloHtml = document.getElementById('anuncioTitulo');
            const cuerpoHtml = document.getElementById('anuncioCuerpo');
            
            if (modal && tituloHtml && cuerpoHtml) {
                tituloHtml.textContent = "⚠️ RECLAMO DENEGADO";
                cuerpoHtml.innerHTML = `<p style="text-align:center; color:#cbd5e1; padding:15px;">${data.error}</p>`;
                modal.style.display = "flex";
            } else {
                alert(`❌ Error: ${data.error}`); 
            }
        }
    } catch (err) {
        console.error("Error al reclamar recompensa:", err);
    }
}

// ⏱️ MOTOR ASÍNCRONO DEL CRONÓMETRO DE REINICIO DIARIO BLINDADO ANTI-LOOP
function iniciarCronometroResetMisiones() {
    if (intervaloResetMisiones) clearInterval(intervaloResetMisiones);

    const elTimer = document.getElementById("timer-misiones"); 
    if (!elTimer) return;

    intervaloResetMisiones = setInterval(() => {
        const ahora = new Date();
        const medianoche = new Date();
        medianoche.setHours(24, 0, 0, 0); // Define el corte automático de fin de día

        let tiempoRestanteMs = medianoche - ahora;

        // 🛡️ PARCHE DE SEGURIDAD: Si el reloj cae en un remanente negativo o cero absoluto, 
        // frenamos el loop, forzamos el cartel y desfasamos la recarga para romper el bucle.
        if (tiempoRestanteMs <= 0) {
            clearInterval(intervaloResetMisiones);
            elTimer.innerHTML = `🔄 REINICIANDO CARTELERA...`;
            
            setTimeout(() => {
                // Pedimos las misiones y este mismo método encenderá un reloj limpio apuntando al día de mañana
                cargarMisionesDelServidor(); 
            }, 3000); // 3 segundos de resguardo estructural
            return;
        }

        const totalSegundos = Math.floor(tiempoRestanteMs / 1000);
        const horas = Math.floor(totalSegundos / 3600);
        const minutos = Math.floor((totalSegundos % 3600) / 60); // 🔥 FIX: Alineado a nomenclatura en español
        const segundos = totalSegundos % 60;

        const stringReloj = `${horas}h ${minutos.toString().padStart(2, '0')}m ${segundos.toString().padStart(2, '0')}s`;
        elTimer.innerText = `🔄 REINICIO EN: ${stringReloj}`;
    }, 1000);
}

/* ========================================================================
   🎁 PASO 3: SISTEMA PREMIUM: RECOMPENSA POR CONEXIÓN DIARIA CONTINUA (DAILY CLAIM)
   ======================================================================== */
async function verificarRecompensaDiaria() {
    try {
        const res = await fetch(`${URL_BASE}/usuarios/reclamar-diario`, {
            method: 'POST',
            headers: obtenerHeadersSeguros()
        });
        const data = await res.json();

        if (data.ok) {
            if (usuarioActual) usuarioActual.monedas = data.monedas;
            actualizarInterfazUI();

            const modal = document.getElementById('modalAnuncioGlobal');
            const tituloHtml = document.getElementById('anuncioTitulo');
            const cuerpoHtml = document.getElementById('anuncioCuerpo');
            const btnEntendido = modal?.querySelector('button, .btn-estadio');

            if (modal && tituloHtml && cuerpoHtml) {
                tituloHtml.textContent = "🔥 ARENA DAILY REWARDS 🔥";
                cuerpoHtml.innerHTML = `
                    <div style="text-align: center; padding: 10px;">
                        <p style="font-size: 1.1rem; color: #fff; margin-bottom: 15px;">${data.mensaje}</p>
                        <div style="background: rgba(2, 6, 23, 0.8); border: 1px solid var(--dorado); padding: 12px; border-radius: 10px; font-family: 'Oswald'; font-size: 1.3rem; color: var(--dorado); letter-spacing: 1px; display: inline-block; margin-bottom: 10px;">
                            ⭐ RACHA ACTUAL: ${data.racha} / 7 DÍAS
                        </div>
                        <p style="color: #94a3b8; font-size: 0.85rem; margin-top: 10px;">¡Seguí entrando todos los días para reclamar el gran premio final!</p>
                    </div>
                `;
                modal.style.display = "flex";

                if (btnEntendido) {
                    btnEntendido.onclick = () => {
                        modal.style.display = "none";
                        cuerpoHtml.innerHTML = "";

                        if (data.regaloSobre && typeof comprarSobreEspecifico === 'function') {
                            comprarSobreEspecifico("legendaria");
                        }
                    };
                }
            }
        } else {
            console.log(`ℹ️ Control diario completado: ${data.mensaje}`);
        }
    } catch (err) {
        console.error("Error al gestionar el bono de racha diario:", err);
    }
}

/* ========================================================================
   🎵 MOTOR DE AUDIO: SÍNTESIS DE EFECTOS DE TRANSMISIÓN (WEB AUDIO API)
   ======================================================================== */
const AudioArena = {
    ctx: null,

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    play(tipo) {
        try {
            this.init();
            if (!this.ctx) return;
            
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            const ahora = this.ctx.currentTime;

            if (tipo === 'monedas') {
                [0, 0.08].forEach((delay) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(delay === 0 ? 880 : 1200, ahora + delay);
                    
                    gain.gain.setValueAtTime(0.15, ahora + delay);
                    gain.gain.exponentialRampToValueAtTime(0.001, ahora + delay + 0.2);
                    
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(ahora + delay);
                    osc.stop(ahora + delay + 0.2);
                });
            } 
            else if (tipo === 'pitazo') {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, ahora);
                osc.frequency.linearRampToValueAtTime(850, ahora + 0.15);
                
                gain.gain.setValueAtTime(0.2, ahora);
                gain.gain.linearRampToValueAtTime(0.2, ahora + 0.3);
                gain.gain.exponentialRampToValueAtTime(0.001, ahora + 0.4);
                
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(ahora);
                osc.stop(ahora + 0.4);
            } 
            else if (tipo === 'gol') {
                const bufferSize = this.ctx.sampleRate * 1.5;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }

                const ruido = this.ctx.createBufferSource();
                ruido.buffer = buffer;

                const filtro = this.ctx.createBiquadFilter();
                filtro.type = 'lowpass';
                filtro.frequency.setValueAtTime(400, ahora);
                filtro.frequency.exponentialRampToValueAtTime(200, ahora + 1.2);

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.3, ahora);
                gain.gain.exponentialRampToValueAtTime(0.001, ahora + 1.5);

                ruido.connect(filtro);
                filtro.connect(gain);
                gain.connect(this.ctx.destination);
                
                ruido.start(ahora);
                ruido.stop(ahora + 1.5);
            }
            // 🔥 ADICIÓN SURGICAL: Evitamos crasheos por llamadas a clicks de UI
            else if (tipo === 'click') {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, ahora);
                gain.gain.setValueAtTime(0.1, ahora);
                gain.gain.exponentialRampToValueAtTime(0.001, ahora + 0.05);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(ahora);
                osc.stop(ahora + 0.05);
            }
        } catch (e) {
            console.warn("Audio bloqueado o no soportado:", e);
        }
    }
};

/* ========================================================================
   🦾 ENGINE INTERACTIVO MULTI-SBC: CONTRATOS SEMANALES EN CADENA ROTATIVA
   ======================================================================== */
let poolContratosCache = [];
let idContratoSeleccionado = null; // ID del contrato activo en el HUD
let sbcJugadoresSeleccionados = []; 
let sbcIntervaloRotacion = null; // Control del temporizador semanal de la cartelera

async function cargarModuloSBC() {
    const grid = document.getElementById("grid-sbc-elegibles");
    if (!grid) return;

    sbcJugadoresSeleccionados = [];
    const elContador = document.getElementById("sbc-contador-slots");
    if (elContador) elContador.innerText = "0 / 0";

    try {
        const res = await fetch(`${URL_BASE}/contratos/activo`, {
            method: 'GET',
            headers: obtenerHeadersSeguros()
        });
        const data = await res.json();

        if (!data.ok || !data.contratos || data.contratos.length === 0) {
            const elTitulo = document.getElementById("sbc-titulo-desafio");
            if (elTitulo) elTitulo.innerText = "❌ SIN CONTRATOS VIGENTES";
            return;
        }

        poolContratosCache = data.contratos;
        
        // 🏁 Inicialización: Si no hay ninguno seleccionado en foco, tomamos el primero del pool
        if (!idContratoSeleccionado || !poolContratosCache.some(c => c.id === idContratoSeleccionado)) {
            idContratoSeleccionado = poolContratosCache[0].id;
        }

        dibujarSelectoresContratosUI();
        actualizarContratoEnFoco();
        
        // ⏳ Activamos la cuenta regresiva que lee el tiempo real del backend
        iniciarCronometroRotacionSBC();

    } catch (err) {
        console.error("Error al cargar pool de SBC:", err);
        grid.innerHTML = "<p style='color:var(--rojo); text-align:center;'>Fallo de red al conectar con el Bot.</p>";
    }
}

// Genera pestañas o botones dinámicos inline arriba del título para cambiar de contrato
function dibujarSelectoresContratosUI() {
    const tituloHtml = document.getElementById("sbc-titulo-desafio");
    if (!tituloHtml) return;

    // Buscamos o creamos un contenedor de pestañas arriba del título
    let contenedorPestañas = document.getElementById("sbc-pestañas-navegacion");
    if (!contenedorPestañas) {
        contenedorPestañas = document.createElement("div");
        contenedorPestañas.id = "sbc-pestañas-navegacion";
        contenedorPestañas.style.cssText = "display: flex; gap: 10px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;";
        tituloHtml.parentNode.insertBefore(contenedorPestañas, tituloHtml);
    }

    contenedorPestañas.innerHTML = "";
    
    poolContratosCache.forEach(c => {
        const btnTab = document.createElement("button");
        btnTab.className = "btn-estadio";
        btnTab.innerText = c.titulo.split(" ")[1] || c.titulo; // Simplifica o muestra completo
        
        // Estilo activo/inactivo premium
        if (c.id === idContratoSeleccionado) {
            btnTab.style.cssText = "background: var(--dorado); color: #000; padding: 6px 15px; font-size: 0.85rem; font-weight: bold;";
        } else {
            btnTab.style.cssText = "background: #1e293b; color: #94a3b8; padding: 6px 15px; font-size: 0.85rem;";
        }

        btnTab.onclick = () => {
            idContratoSeleccionado = c.id;
            sbcJugadoresSeleccionados = []; // Reset de sacrificios al cambiar de pestaña
            dibujarSelectoresContratosUI(); // Refresca clases de botones activo/inactivo
            actualizarContratoEnFoco();
        };

        contenedorPestañas.appendChild(btnTab);
    });
}

function actualizarContratoEnFoco() {
    const contrato = poolContratosCache.find(c => c.id === idContratoSeleccionado);
    if (!contrato) return;

    const req = contrato.requisitos;
    
    document.getElementById("sbc-titulo-desafio").innerText = contrato.titulo.toUpperCase();
    document.getElementById("sbc-descripcion-desafio").innerText = contrato.descripcion;
    document.getElementById("sbc-contador-slots").innerText = `0 / ${req.cantidad}`;

    document.getElementById("sbc-lista-requisitos").innerHTML = `
        <div>🔹 <strong>Cantidad exigida:</strong> ${req.cantidad} jugadores.</div>
        <div>🔹 <strong>Rareza exacta:</strong> ${req.rareza.toUpperCase()}</div>
        <div>🔹 <strong>País de origen:</strong> ${req.pais.toUpperCase()}</div>
        <div style="margin-top: 8px; border-top: 1px dashed #334155; padding-top: 8px; color: var(--verde-match);">
            🎁 <strong>Premio:</strong> 🪙 ${contrato.recompensa.valor} Oro Neto.
        </div>
    `;

    renderizarCartasElegiblesSBC();
}

function renderizarCartasElegiblesSBC() {
    const grid = document.getElementById("grid-sbc-elegibles");
    const contrato = poolContratosCache.find(c => c.id === idContratoSeleccionado);
    if (!grid || !contrato) return;
    
    grid.innerHTML = "";
    const req = contrato.requisitos;
    const miAlbum = window.albumCompleto || [];
    const totalSeleccionadas = sbcJugadoresSeleccionados.length;

    const elegibles = miAlbum.filter(carta => {
        const copias = carta.obtenido !== undefined ? carta.obtenido : (carta.cantidad || 0);
        return copias > 1 && 
               carta.rareza.toLowerCase() === req.rareza.toLowerCase() && 
               carta.pais.toLowerCase() === req.pais.toLowerCase();
    });

    if (elegibles.length === 0) {
        grid.innerHTML = `<div style="color:#64748b; grid-column:1/-1; text-align:center; padding:30px; font-style:italic;">❌ No tenés cromos REPETIDOS aptos para este contrato.</div>`;
        return;
    }

    elegibles.forEach(carta => {
        const cardBox = document.createElement("div");
        const copias = carta.obtenido !== undefined ? carta.obtenido : (carta.cantidad || 0);
        const maxRepetidasDisponibles = copias - 1;
        const vecesElegido = sbcJugadoresSeleccionados.filter(id => id === carta.id).length;
        const estaElegida = vecesElegido > 0;

        cardBox.className = `carta-clash ${carta.rareza.toLowerCase()} ${estaElegida ? 'carta-sbc-seleccionada' : ''}`;
        cardBox.style.cursor = "pointer";
        
        cardBox.innerHTML = `
            <div class="badge-repetidas" style="background: ${vecesElegido === maxRepetidasDisponibles ? 'var(--rojo)' : 'var(--celeste)'}; color:#000; font-weight:bold;">
                ${vecesElegido} / ${maxRepetidasDisponibles}
            </div>
            <img src="${carta.foto}" class="carta-foto" alt="${carta.nombre}">
            <div class="rareza-vertical">${carta.rareza.toUpperCase()}</div>
        `;

        cardBox.onclick = () => {
            if (vecesElegido < maxRepetidasDisponibles) {
                if (totalSeleccionadas >= req.cantidad) return alert(`⚠️ Este contrato exige ${req.cantidad} jugadores.`);
                sbcJugadoresSeleccionados.push(carta.id);
            } else {
                // Removemos solo una instancia del ID del pool de sacrificio
                const index = sbcJugadoresSeleccionados.indexOf(carta.id);
                if (index > -1) sbcJugadoresSeleccionados.splice(index, 1);
            }
            document.getElementById("sbc-contador-slots").innerText = `${sbcJugadoresSeleccionados.length} / ${req.cantidad}`;
            renderizarCartasElegiblesSBC();
        };

        grid.appendChild(cardBox);
    });
}

async function enviarContratoAlBot() {
    const contrato = poolContratosCache.find(c => c.id === idContratoSeleccionado);
    if (!contrato) return;

    if (sbcJugadoresSeleccionados.length !== contrato.requisitos.cantidad) {
        return alert("❌ Planilla incompleta para este contrato.");
    }

    if (!confirm(`⚠️ ¿Firmamos el trato para '${contrato.titulo}'?\n\nLas cartas elegidas se destruirán en Neon.`)) return;

    mostrarCarga("El Bot está destruyendo tus pases...");

    try {
        const res = await fetch(`${URL_BASE}/contratos/completar`, {
            method: 'POST',
            headers: obtenerHeadersSeguros(),
            body: JSON.stringify({ 
                contratoId: idContratoSeleccionado, 
                jugadorIds: sbcJugadoresSeleccionados 
            })
        });
        const data = await res.json();
        ocultarCarga();

        if (data.ok) {
            alert(data.mensaje);
            if (usuarioActual && data.nuevoOro !== undefined) {
                usuarioActual.monedas = data.nuevoOro;
                const lblMonedas = document.getElementById("lbl-monedas");
                if (lblMonedas) lblMonedas.innerText = usuarioActual.monedas;
            }
            if (typeof AudioArena !== 'undefined' && AudioArena.play) AudioArena.play('monedas');
            if (typeof cargarAlbumLocal === 'function') await cargarAlbumLocal();
            
            cargarModuloSBC(); // Recarga y limpia la cartelera completa de forma fluida
        } else {
            alert(data.mensaje || "❌ Trato rechazado.");
        }
    } catch (err) {
        console.error(err);
        ocultarCarga();
    }
}

// ⏱️ CUENTA REGRESIVA INTEGRADA DE ROTACIÓN DE CARTELERA
function iniciarCronometroRotacionSBC() {
    if (sbcIntervaloRotacion) clearInterval(sbcIntervaloRotacion);
    
    const elTimer = document.getElementById("sbc-timer-rotacion");
    if (!elTimer) return;

    sbcIntervaloRotacion = setInterval(() => {
        const ahora = new Date();
        
        // Calculamos el próximo lunes a las 00:00:00 exactas
        const proximoLunes = new Date();
        const diasHastaLunes = (8 - ahora.getDay()) % 7 || 7; 
        
        proximoLunes.setDate(ahora.getDate() + diasHastaLunes);
        proximoLunes.setHours(0, 0, 0, 0);

        const tiempoRestanteMs = proximoLunes - ahora;

        if (tiempoRestanteMs <= 0) {
            clearInterval(sbcIntervaloRotacion);
            elTimer.innerHTML = `🔄 ROTANDO CARTELERA DEL BOT...`;
            setTimeout(() => { cargarModuloSBC(); }, 3000); 
            return;
        }

        const totalSegundos = Math.floor(tiempoRestanteMs / 1000);
        const dias = Math.floor(totalSegundos / 86400);
        const horas = Math.floor((totalSegundos % 86400) / 3600);
        const minutos = Math.floor((totalSegundos % 3600) / 60);
        const segundos = totalSegundos % 60;

        elTimer.innerText = `⏳ Próximos desafíos en: ${dias}d ${horas}h ${minutos.toString().padStart(2, '0')}m ${segundos.toString().padStart(2, '0')}s`;
    }, 1000);
}

function toggleVisibilidadMisiones() {
    const wrapper = document.getElementById("wrapper-desplegable-misiones");
    const boton = document.getElementById("btn-toggle-misiones");
    
    if (!wrapper || !boton) return;

    // Conmutamos la clase de colapso
    wrapper.classList.toggle("colapsado");

    // Feedback visual y cambio de flecha
    if (wrapper.classList.contains("colapsado")) {
        boton.innerText = "▼";
        boton.style.color = "var(--dorado)"; // Pasa a dorado para resaltar que está guardado
    } else {
        boton.innerText = "▲";
        boton.style.color = "#64748b"; // Vuelve al color gris neutro
    }

    // Opcional: Gatillo de audio si ya tenés cargada la librería de sonidos
    if (typeof AudioArena !== 'undefined' && AudioArena.play) {
        AudioArena.play('click');
    }
}

async function inspeccionarPerfilRival(usuarioId) {
     // Evitamos que salte si el usuario hace clic en sí mismo
     if (usuarioActual && parseInt(usuarioId) === parseInt(usuarioActual.id)) {
          alert("¡Es tu propio perfil! Podés verlo completo en la pestaña 'MI PERFIL'.");
          return;
     }

     try {
          const token = localStorage.getItem("token");

          // Fetch blindado para mantenimiento
          const res = await fetch(`${URL_BASE}/usuarios/perfil/${usuarioId}`, {
               method: "GET",
               headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
               }
          });

          if (!res.ok) throw new Error("No se pudo obtener el perfil del rival");
          
          const data = await res.json();
          if (!data.ok || !data.perfil) return alert(data.mensaje || "Error al leer datos del rival.");

          const rival = data.perfil; // 🟢 Sincronizado con la propiedad 'perfil' de tu backend

          // 📌 ASIGNACIÓN CLAVE: Guardamos el ID del rival que estamos visitando para el botón "Firmar" del HTML
          window.usuarioVisitaId = parseInt(usuarioId);

          // 🔓 CONTROL FORMULARIO: Si visito a otro, me aseguro de mostrar la caja para escribir
          const cajaFormulario = document.getElementById("caja-formulario-firma");
          if (cajaFormulario) cajaFormulario.style.display = "flex";

          // 1. Datos Principales (Header del Visitante)
          const txtUsername = document.getElementById("rival-txt-username");
          if (txtUsername) {
               txtUsername.innerText = rival.nombre ? rival.nombre.toUpperCase() : "COMPETIDOR";
          }

          const txtProgresoTotal = document.getElementById("rival-txt-progreso-total");
          if (txtProgresoTotal) {
               txtProgresoTotal.innerText = `${rival.estadisticasAlbum?.porcentajeCompletado || 0}% COMPLETADO`;
          }

          const txtRango = document.getElementById("rival-txt-rango");
          if (txtRango && rival.puntosRanking !== undefined) {
               if (rival.puntosRanking >= 10000) txtRango.innerText = `RANKING: LEYENDA GLOBAL (${rival.puntosRanking} PTS)`;
               else if (rival.puntosRanking >= 5000) txtRango.innerText = `RANKING: PROFESIONAL (${rival.puntosRanking} PTS)`;
               else txtRango.innerText = `RANKING: DEBUTANTE (${rival.puntosRanking} PTS)`;
          }

          // 2. Bloque A: Inventario de Rarezas del Rival
          if (document.getElementById("rival-stat-comunes")) document.getElementById("rival-stat-comunes").innerText = rival.estadisticasAlbum?.comunes || 0;
          if (document.getElementById("rival-stat-raras")) document.getElementById("rival-stat-raras").innerText = rival.estadisticasAlbum?.raras || 0;
          if (document.getElementById("rival-stat-epicas")) document.getElementById("rival-stat-epicas").innerText = rival.estadisticasAlbum?.epicas || 0;
          if (document.getElementById("rival-stat-legendarias")) document.getElementById("rival-stat-legendarias").innerText = rival.estadisticasAlbum?.legendarias || 0;

          // 3. Bloque B: Rendimiento en Competencia del Rival
          const txtTimbaEfectividad = document.getElementById("rival-txt-timba-efectividad");
          if (txtTimbaEfectividad) txtTimbaEfectividad.innerText = `${rival.estadisticasTimba?.porcentajeEfectividad || 0}%`;

          const txtTimbaJugadas = document.getElementById("rival-txt-timba-jugadas");
          if (txtTimbaJugadas) {
               const ganadas = (rival.estadisticasTimba?.ganadasExacto || 0) + (rival.estadisticasTimba?.ganadasSigno || 0);
               txtTimbaJugadas.innerText = `${ganadas} Ganados / ${rival.estadisticasTimba?.jugadas || 0} Totales`;
          }

          const txtMundiales = document.getElementById("rival-stat-mundiales-copas");
          if (txtMundiales) {
               // Resguardamos por si la propiedad copas viene directo de la fila
               txtMundiales.innerText = `🏆 ${rival.copasMundiales || 0}`;
          }

          // 4. Render de la foto del Rival agrandada estilo cromo
          const divAvatar = document.getElementById("rival-avatar-user");
          if (divAvatar && rival.foto) {
               divAvatar.style.borderRadius = "12px";
               divAvatar.style.backgroundImage = `url('${rival.foto}')`;
               divAvatar.style.backgroundSize = "cover";
               divAvatar.style.backgroundPosition = "center";
               divAvatar.innerText = ""; // Limpiamos el emoji base
          }

          // 5. 🌟 RENDER DE INSIGNIA DEL RIVAL
          const contenedorDestacado = document.getElementById("rival-contenedor-destacado");
          if (contenedorDestacado) {
               contenedorDestacado.innerHTML = `<p style="color: #64748b; font-style: italic; font-size: 0.85rem; margin: 0;">Inspeccionando facha del competidor en tiempo real...</p>`;
          }

          // ✍️ CARGA DE FIRMAS: Traemos el muro de la DB exclusivo para el rival inspeccionado
          if (typeof cargarFirmasDelPerfil === "function") {
               cargarFirmasDelPerfil(usuarioId);
          }

          // Mostramos el modal dándole display block
          document.getElementById("modal-rival").style.display = "block";

     } catch (err) {
          console.error("❌ Error al inspeccionar rival:", err);
          alert("❌ No se pudieron sincronizar los datos completos de este jugador.");
     }
}

// Función simple para cerrar el modal
function cerrarModalRival() {
    document.getElementById("modal-rival").style.display = "none";
}


async function actualizarMiPerfilUI() {
    if (!usuarioActual || !usuarioActual.id) return;

    try {
        const token = localStorage.getItem("token");

        const res = await fetch(`${URL_BASE}/usuarios/perfil/${usuarioActual.id}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (!res.ok) return;

        const data = await res.json();
        if (!data.ok || !data.perfil) return;

        const perfil = data.perfil;

        // 🔒 CONTROL FORMULARIO: Al ver MI PROPIO perfil, escondemos la caja para evitar auto-firmas
        const cajaFormulario = document.getElementById("caja-formulario-firma");
        if (cajaFormulario) cajaFormulario.style.display = "none";

        // 1. Datos Principales (Header)
        const txtUsername = document.getElementById("perfil-txt-username");
        if (txtUsername) txtUsername.innerText = perfil.nombre ? perfil.nombre.toUpperCase() : "SIN NOMBRE";

        const txtProgresoTotal = document.getElementById("perfil-txt-progreso-total");
        if (txtProgresoTotal) txtProgresoTotal.innerText = `${perfil.estadisticasAlbum?.porcentajeCompletado || 0}% COMPLETADO`;

        const txtRango = document.getElementById("perfil-txt-rango");
        if (txtRango && perfil.puntosRanking !== undefined) {
            if (perfil.puntosRanking >= 10000) txtRango.innerText = `RANKING: LEYENDA GLOBAL (${perfil.puntosRanking} PTS)`;
            else if (perfil.puntosRanking >= 5000) txtRango.innerText = `RANKING: PROFESIONAL (${perfil.puntosRanking} PTS)`;
            else txtRango.innerText = `RANKING: DEBUTANTE (${perfil.puntosRanking} PTS)`;
        }

        // 2. Bloque A: Inventario de Rarezas
        if (document.getElementById("stat-comunes")) document.getElementById("stat-comunes").innerText = perfil.estadisticasAlbum?.comunes || 0;
        if (document.getElementById("stat-raras")) document.getElementById("stat-raras").innerText = perfil.estadisticasAlbum?.raras || 0;
        if (document.getElementById("stat-epicas")) document.getElementById("stat-epicas").innerText = perfil.estadisticasAlbum?.epicas || 0;
        if (document.getElementById("stat-legendarias")) document.getElementById("stat-legendarias").innerText = perfil.estadisticasAlbum?.legendarias || 0;

        // 3. Bloque B: Estadísticas de Juego Remapeadas
        const txtTimbaEfectividad = document.getElementById("perfil-txt-timba-efectividad");
        if (txtTimbaEfectividad) txtTimbaEfectividad.innerText = `${perfil.estadisticasTimba?.porcentajeEfectividad || 0}%`;

        const txtTimbaJugadas = document.getElementById("perfil-txt-timba-jugadas");
        if (txtTimbaJugadas) {
            const ganadas = (perfil.estadisticasTimba?.ganadasExacto || 0) + (perfil.estadisticasTimba?.ganadasSigno || 0);
            txtTimbaJugadas.innerText = `${ganadas} Ganados / ${perfil.estadisticasTimba?.jugadas || 0} Totales`;
        }

        const txtMundiales = document.getElementById("stat-mundiales-copas");
        if (txtMundiales) txtMundiales.innerText = `🏆 ${usuarioActual.copas_mundiales || 0}`;

        const txtMonedas = document.getElementById("stat-monedas");
        if (txtMonedas) txtMonedas.innerText = perfil.monedas !== undefined ? perfil.monedas.toLocaleString() : 0;

        // 4. Render de la Carta Físicamente Agrandada
        const divAvatar = document.getElementById("perfil-avatar-user");
        if (divAvatar && perfil.foto) {
            divAvatar.style.borderRadius = "12px";
            divAvatar.style.backgroundImage = `url('${perfil.foto}')`;
            divAvatar.style.backgroundSize = "cover";
            divAvatar.style.backgroundPosition = "center";
            divAvatar.innerText = "";
        }

        // ✍️ CARGA DE FIRMAS: Traemos las firmas de mi propio muro para exhibirlas
        if (typeof cargarFirmasDelPerfil === "function") {
             cargarFirmasDelPerfil(usuarioActual.id);
        }

    } catch (err) {
        console.error("❌ Error al renderizar los nuevos bloques del perfil:", err);
    }
}

// A. Abre el panel dinámico y renderiza tus banderas/avatares desde Neon
async function abrirCatalogoAvataresUI() {
    const panel = document.getElementById("perfil-panel-avatares");
    if (panel) {
        // Efecto toggle: si está abierto lo cierra, si está cerrado lo abre
        panel.style.display = panel.style.display === "none" ? "block" : "none";
        if (panel.style.display === "none") return;
    }

    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${URL_BASE}/fotos-perfil/mis-avatares`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.ok) return;

        const contenedor = document.getElementById("perfil-grilla-avatares");
        if (!contenedor) return;
        contenedor.innerHTML = "";

        data.catalogo.forEach(avatar => {
            const divCarta = document.createElement("div");
            divCarta.style.width = "80px";
            divCarta.style.height = "105px";
            divCarta.style.borderRadius = "6px";
            divCarta.style.backgroundImage = `url('${avatar.ruta_jpg}')`;
            divCarta.style.backgroundSize = "cover";
            divCarta.style.backgroundPosition = "center";
            divCarta.style.cursor = "pointer";
            divCarta.style.transition = "transform 0.2s";
            
            if (!avatar.desbloqueada) {
                divCarta.style.filter = "brightness(0.25) grayscale(1)";
                divCarta.title = "🔒 Conseguilo en un sobre de la tienda";
            } else {
                divCarta.style.border = "2px solid var(--celeste)";
                divCarta.title = `Equipar ${avatar.nombre}`;
                divCarta.onmouseover = () => divCarta.style.transform = "scale(1.05)";
                divCarta.onmouseout = () => divCarta.style.transform = "scale(1)";
                
                // Al hacer click, llama al endpoint de actualización
                divCarta.onclick = () => procesarCambioFotoPerfil(avatar.id);
            }
            contenedor.appendChild(divCarta);
        });
    } catch (err) {
        console.error("❌ Error al cargar vitrina de avatares:", err);
    }
}

// B. Envía el PUT al servidor para impactar la DB y refresca tu cromo
async function procesarCambioFotoPerfil(fotoId) {
    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${URL_BASE}/usuarios/cambiar-foto`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ fotoId: parseInt(fotoId) })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) return alert(data.mensaje || "❌ Error al cambiar avatar.");

        // Cerramos el panel y actualizamos la facha del perfil de una
        document.getElementById("perfil-panel-avatares").style.display = "none";
        actualizarMiPerfilUI();
    } catch (err) {
        console.error("❌ Error al cambiar la foto de perfil:", err);
    }
}

// Guarda tu carta favorita en el almacenamiento local del juego
function marcarCromoComoDestacado(id, nombre, foto, rareza) {
    const cromo = { id, nombre, foto, rareza };
    localStorage.setItem("cromo_destacado_perfil", JSON.stringify(cromo));
    alert(`🌟 ¡${nombre.toUpperCase()} fue asignado como tu cromo insignia del vestuario!`);
}

// Inyecta el cromo seleccionado dentro de la caja de tu perfil
function renderizarCromoDestacadoUI() {
    const contenedor = document.getElementById("perfil-contenedor-destacado");
    if (!contenedor) return;

    const cromoGuardado = localStorage.getItem("cromo_destacado_perfil");

    if (!cromoGuardado) {
        contenedor.innerHTML = `<p style="color: #64748b; font-style: italic; font-size: 0.85rem; margin: 0;">No se seleccionó cromo insignia... Elegilo desde tu pestaña 'MI ÁLBUM'</p>`;
        return;
    }

    const cromo = JSON.parse(cromoGuardado);
    
    // Determinamos el color de borde según la rareza para mantener la estética limpia
    let colorBorde = "var(--celeste)";
    if (cromo.rareza.toLowerCase() === "epica") colorBorde = "#a855f7";
    if (cromo.rareza.toLowerCase() === "legendaria") colorBorde = "var(--dorado)";
    if (cromo.rareza.toLowerCase() === "comun") colorBorde = "#475569";

    contenedor.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div style="width: 110px; height: 145px; background: #020617; border: 3px solid ${colorBorde}; border-radius: 8px; background-image: url('${cromo.foto}'); background-size: cover; background-position: center; box-shadow: 0 0 15px rgba(0,0,0,0.5);"></div>
            <span style="color: #fff; font-family: 'Oswald'; font-size: 1rem; letter-spacing: 0.5px;">${cromo.nombre.toUpperCase()}</span>
            <span style="color: ${colorBorde}; font-size: 0.7rem; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">[${cromo.rareza}]</span>
        </div>
    `;
}

// ========================================================================
// 🎁 LÓGICA: CONTROL DE IDENTIDAD Y AVATAR INICIAL DE BIENVENIDA
// ========================================================================

// 1. Pide las 3 opciones al azar y las dibuja en el modal bloqueante
// 🛡️ VERSIÓN BLINDADA: Espera a que el token esté asentado para evitar el 403
async function verificarAvatarInicial() {
    if (!usuarioActual || usuarioActual.eligio_avatar === true) return;

    // Le damos 100 milisegundos para asegurar que el localStorage impactó el token del login
    setTimeout(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return console.warn("⚠️ No se encontró token para validar el avatar inicial.");

            const res = await fetch(`${URL_BASE}/usuarios/opciones-avatar-inicial`, {
                method: "GET",
                headers: { 
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            // Si el servidor rechaza por falta de token o mantenimiento, lo atrapamos acá
            if (!res.ok) {
                console.error(`❌ Error de validación en la Arena (Status: ${res.status})`);
                return;
            }

            const data = await res.json();
            if (!data.ok || !data.opciones || data.opciones.length === 0) return;

            const contenedor = document.getElementById("contenedor-opciones-iniciales");
            if (!contenedor) return;
            contenedor.innerHTML = ""; 

            data.opciones.forEach(avatar => {
                const divCarta = document.createElement("div");
                divCarta.style.width = "110px";
                divCarta.style.height = "145px";
                divCarta.style.borderRadius = "10px";
                divCarta.style.border = "3px solid #334155";
                divCarta.style.backgroundImage = `url('${avatar.ruta_jpg}')`;
                divCarta.style.backgroundSize = "cover";
                divCarta.style.backgroundPosition = "center";
                divCarta.style.cursor = "pointer";
                divCarta.style.transition = "all 0.2s ease";
                divCarta.title = `Elegir ${avatar.nombre}`;

                divCarta.onmouseenter = () => {
                    divCarta.style.transform = "scale(1.08) translateY(-5px)";
                    divCarta.style.borderColor = "var(--dorado)";
                    divCarta.style.boxShadow = "0 10px 20px rgba(255,177,0,0.35)";
                };
                divCarta.onmouseleave = () => {
                    divCarta.style.transform = "scale(1) translateY(0)";
                    divCarta.style.borderColor = "#334155";
                    divCarta.style.boxShadow = "none";
                };

                divCarta.onclick = () => procesarEleccionInicial(avatar.id);
                contenedor.appendChild(divCarta);
            });

            // Mostramos el modal bloqueante una vez cargado de forma segura
            document.getElementById("modal-avatar-inicial").style.display = "flex";

        } catch (err) {
            console.error("❌ Fallo en la comunicación segura de avatares:", err);
        }
    }, 150); // El delay mágico anti-403
}

// 2. Impacta la elección en el servidor, actualiza las flags locales y refresca la facha
async function procesarEleccionInicial(fotoId) {
    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${URL_BASE}/usuarios/seleccionar-avatar-inicial`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ fotoId: parseInt(fotoId) })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) return alert("❌ No se pudo guardar la elección. Intentá de nuevo.");

        // Cerramos el modal de bienvenida
        document.getElementById("modal-avatar-inicial").style.display = "none";
        
        // Actualizamos la sesión del usuario en vivo
        usuarioActual.eligio_avatar = true;
        
        // Forzamos el redibujado de la interfaz para que el cromo del perfil actualice al instante
        if (typeof actualizarMiPerfilUI === "function") actualizarMiPerfilUI();
        if (typeof actualizarInterfazUI === "function") actualizarInterfazUI();

    } catch (err) {
        console.error("❌ Fallo en el guardado de la foto inicial:", err);
    }
}

// ========================================================================
// 📸 AUXILIAR: EQUIPAR FOTO DE PERFIL DESDE LA INTERFAZ
// ========================================================================
async function equiparAvatarDesdeTienda(fotoId) {
    mostrarCarga("Equipando nuevo avatar...");
    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${URL_BASE}/usuarios/cambiar-foto`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ fotoId: parseInt(fotoId) })
        });
        
        const data = await res.json();
        ocultarCarga();
        
        if (data.ok) {
            alert("📸 ¡Facha actualizada al instante!");
            if (typeof cargarDatosMiPerfil === "function") cargarDatosMiPerfil();
            if (typeof actualizarInterfazUI === "function") actualizarInterfazUI();
        } else {
            alert(data.mensaje || "❌ No se pudo equipar el avatar.");
        }
    } catch (err) {
        ocultarCarga();
        console.error("❌ Error al auto-equipar:", err);
    }
}

// ========================================================================
// ✍️ LÓGICA DE INTERFAZ: LIBRO DE FIRMAS DE PERFILES DE LA ARENA
// ========================================================================

async function cargarFirmasDelPerfil(perfilId) {
    // 🔍 Seleccionamos dinámicamente el contenedor correcto según el ID del muro
    const esMiMuro = usuarioActual && usuarioActual.id === parseInt(perfilId);
    const idContenedor = esMiMuro ? "mi-contenedor-lista-firmas" : "contenedor-lista-firmas";

    const contenedor = document.getElementById(idContenedor);
    if (!contenedor) return;
    contenedor.innerHTML = "<p style='color: #64748b; font-size: 0.9rem;'>Cargando dedicatorias...</p>";

    try {
        const res = await fetch(`${URL_BASE}/firmas/${perfilId}`, {
            method: 'GET',
            headers: obtenerHeadersSeguros()
        });
        const data = await res.json();

        if (!data.ok || data.firmas.length === 0) {
            // Cartel inteligente si el muro está en 0 firmas
            if (esMiMuro) {
                contenedor.innerHTML = "<p style='color: #475569; text-align: center; font-size: 0.9rem; padding: 15px;'>Nadie firmó tu vestuario todavía. ¡Hacete notar en las tablas para que vengan! 📋</p>";
            } else {
                contenedor.innerHTML = "<p style='color: #475569; text-align: center; font-size: 0.9rem; padding: 15px;'>Nadie firmó este muro todavía. ¡Sé el primero en dejar tu marca! 🚀</p>";
            }
            return;
        }

        contenedor.innerHTML = "";
        data.firmas.forEach(f => {
            const divFirma = document.createElement("div");
            divFirma.style.cssText = "background: rgba(15, 23, 42, 0.4); border: 1px solid #1e293b; padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px; text-align: left;";
            
            // Evaluamos las fechas para ver si fue editado
            const fechaOriginal = new Date(f.creado_en).toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
            let flagFecha = `<span style="color: #475569; font-size: 0.75rem;">${fechaOriginal}</span>`;
            
            if (f.editado_en) {
                const fechaEdit = new Date(f.editado_en).toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
                flagFecha = `<span style="color: var(--dorado); font-size: 0.75rem;" title="Original: ${fechaOriginal}">✏️ Editado el ${fechaEdit}</span>`;
            }

            // Si el usuario logueado es el autor de esta firma, le damos controles rápidos
            const esMio = usuarioActual && usuarioActual.id === f.autor_id;
            const botonera = esMio ? `
                <div style="display: flex; gap: 8px; margin-top: 5px; justify-content: flex-end;">
                    <button onclick="dispararEditarFirma(${f.id}, '${f.mensaje}', ${perfilId})" class="btn-estadio" style="padding: 2px 8px; font-size: 0.7rem; background: #334155;">Editar</button>
                    <button onclick="ejecutarBorrarFirma(${f.id}, ${perfilId})" class="btn-estadio" style="padding: 2px 8px; font-size: 0.7rem; background: #ef4444; color: #fff;">Borrar</button>
                </div>
            ` : '';

            divFirma.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: var(--celeste); font-size: 0.9rem;">@${f.username}</strong>
                    ${flagFecha}
                </div>
                <p id="texto-firma-${f.id}" style="margin: 4px 0; color: #cbd5e1; font-size: 0.9rem; word-break: break-word;">${f.mensaje}</p>
                ${botonera}
            `;
            contenedor.appendChild(divFirma);
        });

    } catch (err) {
        console.error("❌ Fallo de red en firmas:", err);
        contenedor.innerHTML = "<p style='color: #ef4444; text-align: center; font-size: 0.85rem;'>📡 Error al conectar con el servidor de firmas.</p>";
    }
}

// MANDAR NUEVA FIRMA
async function enviarNuevaFirma(perfilId) {
    const input = document.getElementById("input-mensaje-firma");
    if (!input) return;
    const mensaje = input.value.trim();

    if (!mensaje) return alert("❌ Escribí algo antes de firmar.");

    try {
        const res = await fetch(`${URL_BASE}/firmas/crear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...obtenerHeadersSeguros() },
            body: JSON.stringify({ perfilId, mensaje })
        });
        const data = await res.json();

        if (data.ok) {
            input.value = "";
            cargarFirmasDelPerfil(perfilId); // Recargamos el feed en vivo
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error("❌ Fallo al guardar firma:", err);
    }
}

// MANDAR EDICIÓN (PROMPT SIMPLE RÁPIDO)
async function dispararEditarFirma(firmaId, mensajeViejo, perfilId) {
    const nuevoTexto = prompt("Modificá tu dedicatoria (máx 140 caracteres):", mensajeViejo);
    if (nuevoTexto === null) return; // Canceló el prompt
    
    if (!nuevoTexto.trim()) return alert("❌ El mensaje no puede estar vacío.");

    try {
        const res = await fetch(`${URL_BASE}/firmas/editar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...obtenerHeadersSeguros() },
            body: JSON.stringify({ firmaId, nuevoMensaje: nuevoTexto.trim() })
        });
        const data = await res.json();

        if (data.ok) {
            cargarFirmasDelPerfil(perfilId);
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error("❌ Fallo al editar firma:", err);
    }
}

// BORRAR FIRMA
async function ejecutarBorrarFirma(firmaId, perfilId) {
    if (!confirm("🚨 ¿Seguro de que querés borrar tu firma de este perfil?")) return;

    try {
        const res = await fetch(`${URL_BASE}/firmas/borrar/${firmaId}`, {
            method: 'DELETE',
            headers: obtenerHeadersSeguros()
        });
        const data = await res.json();

        if (data.ok) {
            cargarFirmasDelPerfil(perfilId);
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error("❌ Fallo al borrar firma:", err);
    }
}

// ⚡ MOTOR DE SCROLL HORIZONTAL CON LA RUEDA DEL MOUSE
document.addEventListener("DOMContentLoaded", () => {
    const contenedorScroll = document.querySelector(".menu-scroll-padre");
    
    if (contenedorScroll) {
        contenedorScroll.addEventListener("wheel", (evt) => {
            // Si el usuario mueve la rueda vertical, interceptamos el evento
            evt.preventDefault();
            // Desplazamos horizontalmente la misma cantidad de pixeles
            contenedorScroll.scrollLeft += evt.deltaY;
        }, { passive: false });
    }
});
