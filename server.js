/* ========================================================================
   📦 REQUERIMIENTOS, CONFIGURACIONES INICIALES Y CACHÉ
   ======================================================================== */
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); 
const path = require('path');
const BITACORAS_SALA_CACHE = {};

const app = express();

const jwt = require('jsonwebtoken'); 
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_super_segura_para_la_arena';

// ✨ Clave para leer la IP real del cliente detrás del proxy de Render
app.set('trust proxy', true);

// ✨ Render asigna el puerto dinámicamente; si no encuentra, usa el 3000
const PORT = process.env.PORT || 3000;

// Habilitamos CORS y JSON arriba de todo para que los middlewares lean el body sin problemas
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
   🛡️ MIDDLEWARE CORE: VERIFICACIÓN DE TOKEN JWT
   ======================================================================== */
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ ok: false, error: "🔒 Acceso denegado. Iniciá sesión en la Arena." });
    }

    try {
        const verificado = jwt.verify(token, JWT_SECRET);
        req.usuarioLogueado = verificado; // Guardamos id y username descifrados en la petición
        next();
    } catch (err) {
        return res.status(403).json({ ok: false, error: "❌ Sesión inválida o expirada. Volvé a loguearte." });
    }
};

/* ========================================================================
   🛠️ MIDDLEWARE: MODO MANTENIMIENTO / ACCESO SELECTIVO TESTERS (FIXED DEFINITIVO)
   ======================================================================== */
const MODO_MANTENIMIENTO = false; 
const TESTERS_PERMITIDOS = ["aguspe", "evepro"]; 

app.use((req, res, next) => {
    if (!MODO_MANTENIMIENTO) {
        return next();
    }

    // A. Permitimos descargar los archivos estáticos para que cargue la interfaz visual a cualquiera
    if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html') || req.path.endsWith('.css') || req.path.endsWith('.js') || req.path.endsWith('.png') || req.path.endsWith('.jpg') || req.path.endsWith('.svg'))) {
        return next();
    }

    // B. Filtro estricto para las rutas de autenticación (Login)
    if (req.path.startsWith('/api/login')) {
        const { username } = req.body;
        
        if (username && TESTERS_PERMITIDOS.includes(username.trim().toLowerCase())) {
            return next();
        }
        
        return res.status(503).json({ 
            error: "🚧 La Arena está en mantenimiento por reformas de infraestructura. ¡Volvé más tarde, pa! 🏗️" 
        });
    }

    // Bloqueamos el registro por completo en mantenimiento
    if (req.path.startsWith('/api/registro')) {
        return res.status(503).json({ 
            error: "🚧 La Arena está en mantenimiento. El registro de nuevas cuentas está cerrado por el momento." 
        });
    }

    // C. 🛡️ FILTRO DE CONTROL: Excepciones para endpoints sin token y validación de testers
    
    // 1️⃣ Dejamos pasar las peticiones de base o logout que no siempre mandan cabecera Bearer
    if (
        req.path.startsWith('/api/anuncio-actual') || 
        req.path.startsWith('/api/timbas-restantes') || 
        req.path.startsWith('/api/tiros-restantes') || 
        req.path.startsWith('/api/logout') ||
        req.path.startsWith('/api/misiones') ||
        req.path.startsWith('/api/ranking') ||       // 🌟 Para el Top 10 de la Arena / Penales
        req.path.startsWith('/api/mundial') ||       // 🌟 Para los Reyes del Mundo y el contador de tiempo
        req.path.startsWith('/api/mercado') || 
        req.path.startsWith('/api/usuarios/reclamar-diario') ||
        req.path.startsWith('/api/contratos')
        
    ) {
        return next();
    }

    // 2️⃣ Para cualquier otra ruta privada del juego, exigimos el token del tester autorizado
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.split(' ')[1]) {
        return next(); // Es un tester con sesión iniciada (sobres, trading, mundial, etc.)
    }

    // D. Si no es un archivo estático, ni un login de tester, ni tiene sesión iniciada, rebota acá:
    return res.status(503).json({ 
        error: "🚧 La Arena está en mantenimiento por reformas de infraestructura." 
    });
});

// Carpeta estática asignada después del filtro de mantenimiento
app.use(express.static(path.join(__dirname)));

/* ========================================================================
   📦 CONFIGURACIÓN, INICIALIZACIÓN Y CARGA DE BASE DE DATOS (NEON)
   ======================================================================== */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('❌ Error de conexión a Neon:', err.message);
    else console.log('📦 Conectado con éxito a PostgreSQL en Neon.');
});

async function inicializarTablas() {
    try {
        // 1. Tabla de Usuarios
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
            copas_mundiales INTEGER DEFAULT 0, 
            ultima_timba_mundial TIMESTAMP WITH TIME ZONE DEFAULT NULL
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

        // 3. Tabla de Progreso (Álbum)
        await pool.query(`CREATE TABLE IF NOT EXISTS usuario_progreso (
            usuario_id INTEGER REFERENCES usuarios(id),
            jugador_id INTEGER REFERENCES jugadores(id),
            cantidad INTEGER DEFAULT 1,
            PRIMARY KEY (usuario_id, jugador_id)
        )`);

        // 4. Tabla del Mercado P2P
        await pool.query(`CREATE TABLE IF NOT EXISTS mercado_pases (
            id SERIAL PRIMARY KEY,
            vendedor_id INTEGER REFERENCES usuarios(id),
            jugador_id INTEGER REFERENCES jugadores(id),
            precio_oro INTEGER NOT NULL,
            fecha_publicacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`);

        // 5. Tabla de las Salas Multijugador
        await pool.query(`CREATE TABLE IF NOT EXISTS mundial_salas (
            id SERIAL PRIMARY KEY,
            codigo_sala VARCHAR(10) UNIQUE NOT NULL,
            creador_id INTEGER REFERENCES usuarios(id),
            tipo_apuesta VARCHAR(20) DEFAULT 'amistoso',
            apuesta_oro INTEGER DEFAULT 0,
            pozo_total INTEGER DEFAULT 0,
            estado VARCHAR(20) DEFAULT 'esperando'
        )`);

        // 6. Tabla de Participantes en Salas
        await pool.query(`CREATE TABLE IF NOT EXISTS sala_participantes (
            id SERIAL PRIMARY KEY,
            sala_id INTEGER REFERENCES mundial_salas(id) ON DELETE CASCADE,
            usuario_id INTEGER REFERENCES usuarios(id),
            seleccion VARCHAR(50) NOT NULL,
            jugador_ids INTEGER[] NOT NULL
        )`);

        // 7. Tabla de Apuestas en la Quiniela
        await pool.query(`CREATE TABLE IF NOT EXISTS quiniela_apuestas (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES usuarios(id),
            monto_apostado INTEGER NOT NULL,
            predicciones JSONB NOT NULL,
            ganada BOOLEAN NOT NULL,
            premio_entregado INTEGER DEFAULT 0,
            fecha_jugada TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`);

        // 🔥 8. MÓDULO NUEVO: Tabla de Control de Objetivos Diarios
        await pool.query(`CREATE TABLE IF NOT EXISTS usuario_misiones (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
            mision_id INTEGER NOT NULL,
            descripcion VARCHAR(255) NOT NULL,
            tipo VARCHAR(50) NOT NULL,
            progreso INTEGER DEFAULT 0,
            meta INTEGER NOT NULL,
            recompensa INTEGER NOT NULL,
            reclamada BOOLEAN DEFAULT FALSE,
            actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT uq_usuario_mision UNIQUE (usuario_id, mision_id)
        )`);

        // ⚡ Indexación de alta velocidad para acelerar el login de los jugadores
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usuario_misiones_uid ON usuario_misiones(usuario_id)`);

        console.log('🏟️ Todas las tablas del coliseo fueron inicializadas con éxito en Neon.');

        const checkJugadores = await pool.query("SELECT COUNT(*) as count FROM jugadores");
        if (parseInt(checkJugadores.rows[0].count) === 0) {
            // 📝 Lista vacía para que le agregues tus jugadores cuando quieras, Momito
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
                    ['Seko Fofana', 'Costa de Marfil', 'cm', 'Mediocampista', 'fotos/cm_fofana-.jpg', 'comun'],
                    ['Sébastien Haller', 'Costa de Marfil', 'cm', 'Delantero', 'fotos/cm_haller.jpg', 'legendaria'],
                    ['Ghislain Konan', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_konan.jpg', 'comun'],
                    ['Odilon Kossounou', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_kossounou.jpg', 'rara'],
                    ['Evan Ndicka', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_ndicka.jpg', 'epica'],
                    ['Wilfried Singo', 'Costa de Marfil', 'cm', 'Defensor', 'fotos/cm_singo.jpg', 'rara'],

                    // --- COLOMBIA ---
                    ['Jhon Arias', 'Colombia', 'col', 'Defensor', 'fotos/col_arias.jpg', 'epica'],
                    ['Santiago Arias', 'Colombia', 'col', 'Defensor', 'fotos/col_arias-.jpg', 'comun'],
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
                    ['Mohanad Lasheen', 'Egipto', '🇪🇬', 'Mediocampista', 'fotos/egi_laheen.jpg', 'comun'], // Nota: El archivo dice laheen pero es Ahmed Hassan (Kouka)
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
            console.log(`✅ Estructuras inicializadas. ${granListaJugadores.length} jugadores cargados de forma inicial.`);
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
        // 🟢 CORREGIDO: Eliminamos el .toLowerCase() para respetar el casing de la base de datos
        const userCheck = await pool.query("SELECT * FROM usuarios WHERE username = $1", [username.trim()]);
          
        if (userCheck.rows.length === 0) {
             return res.status(400).json({ error: "❌ El usuario no existe. ¡Registrate primero!" });
        }

        const user = userCheck.rows[0];
        
        // ¡OJO ACÁ! Si estás usando bcrypt para comparar contraseñas, asegurate de usar await bcrypt.compare(password, user.password)
        // Por ahora mantenemos tu lógica, pero recordá que comparar passwords en texto plano es inseguro.
        if (user.password === password) {
             console.log(`🔑 [LOGIN] El usuario "${username}" ingresó a la Arena.`);
             
             // 🔥 RESERVA DE SEGURIDAD: Inicializa misiones para usuarios viejos (No pisa el progreso si ya existen)
             const queryVerificarMisionesLogin = `
                 INSERT INTO usuario_misiones (usuario_id, mision_id, descripcion, tipo, meta, recompensa)
                 VALUES 
                     ($1, 1, 'Abrir 3 sobres de cualquier rareza en la Tienda', 'sobres', 3, 250),
                     ($1, 2, 'Firmar un contrato de intercambio con el Bot Comerciante', 'trade', 1, 400),
                     ($1, 3, 'Alinear tus cromos y disputar un cruce en el MiniMundial', 'mundial', 1, 300)
                 ON CONFLICT (usuario_id, mision_id) DO NOTHING;
             `;
             await pool.query(queryVerificarMisionesLogin, [user.id]);
             console.log(`🎯 [MISIONES] Sincronización diaria garantizada para el usuario ID: ${user.id}`);

             const token = jwt.sign(
                 { id: user.id, username: user.username }, 
                 JWT_SECRET, 
                 { expiresIn: '24h' }
             );

             return res.json({ 
                 mensaje: "Login exitoso", 
                 usuario: user,
                 token: token 
             });
        } else {
             return res.status(400).json({ error: "❌ Contraseña incorrecta." });
        }
    } catch (err) {
         console.error("❌ Error interno en /api/login:", err.message);
         return res.status(500).json({ error: "Error interno en el login." });
    }
});

app.post('/api/registro', async (req, res) => {
    const { username, password } = req.body;
    const ipCliente = req.ip;

    if (!username || username.trim().length > 14) {
        return res.status(400).json({ error: "❌ El nombre de usuario no puede tener más de 14 caracteres." });
    }
    try {
        const userCheck = await pool.query("SELECT * FROM usuarios WHERE username = $1", [username.trim().toLowerCase()]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "❌ Ese nombre de usuario ya está ocupado." });
        }

        if (ipCliente && ipCliente !== '::1' && ipCliente !== '127.0.0.1') {
            const ipCheck = await pool.query("SELECT * FROM usuarios WHERE ip_registro = $1", [ipCliente]);
            if (ipCheck.rows.length > 0) {
                return res.status(400).json({ error: "❌ Límite excedido: Ya se creó una cuenta desde esta conexión a Internet." });
            }
        }

        // 1. Insertamos el usuario como siempre
        const nuevoUsuario = await pool.query(
            "INSERT INTO usuarios (username, password, ip_registro) VALUES ($1, $2, $3) RETURNING *", 
            [username.trim().toLowerCase(), password, ipCliente]
        );
        
        const nuevoUsuarioId = nuevoUsuario.rows[0].id; // 🔑 Guardamos el ID que generó la base de datos
        console.log(`✨ [REGISTRO] Nuevo usuario creado: "${username.toUpperCase()}" (ID: ${nuevoUsuarioId}) desde la IP: ${ipCliente}`);

        // 2. 🎯 ASIGNACIÓN DE OBJETIVOS DIARIOS: Insertamos las 3 misiones iniciales ligadas a su id
        const queryMisionesIniciales = `
            INSERT INTO usuario_misiones (usuario_id, mision_id, descripcion, tipo, meta, recompensa)
            VALUES 
                ($1, 1, 'Abrir 3 sobres de cualquier rareza en la Tienda', 'sobres', 3, 250),
                ($1, 2, 'Firmar un contrato de intercambio con el Bot Comerciante', 'trade', 1, 400),
                ($1, 3, 'Alinear tus cromos y disputar un cruce en el MiniMundial', 'mundial', 1, 300)
            ON CONFLICT (usuario_id, mision_id) DO UPDATE 
            SET progreso = 0, reclamada = FALSE, actualizado_en = CURRENT_TIMESTAMP;
        `;
        
        // Ejecutamos la consulta pasándole el nuevoUsuarioId al marcador $1 de Postgres
        await pool.query(queryMisionesIniciales, [nuevoUsuarioId]);
        console.log(`🎯 [MISIONES] Inicializadas con éxito para el usuario ID: ${nuevoUsuarioId}`);

        // 3. Respondemos al frontend con éxito total
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

app.post('/api/actualizar-progreso', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { monedas, puntos } = req.body;

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

app.post('/api/comprar-sobre', verificarToken, async (req, res) => {
    const { tipoCofre } = req.body; 
    const usuario_id = req.usuarioLogueado.id;

    let costo = 250;
    let probLegendaria = 0.015; 
    let probEpica = 0.10;       
    let probRara = 0.25;        

    if (tipoCofre === 'plata') {
        costo = 100;
        probLegendaria = 0.001; 
        probEpica = 0.03;       
        probRara = 0.15;    
    } 
    else if (tipoCofre === 'legendario') {
        costo = 500;
        probLegendaria = 0.08;  
        probEpica = 0.30;       
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

            if (rand < probLegendaria) {
                rarezaElegida = 'legendaria';
            } else if (rand < probLegendaria + probEpica) {
                rarezaElegida = 'epica';
            } else if (rand < probLegendaria + probEpica + probRara) {
                rarezaElegida = 'rara'; 
            }

            let poolFiltrado = todosLosJugadores.filter(j => j.rareza === rarezaElegida);
            
            if (poolFiltrado.length === 0) {
                poolFiltrado = todosLosJugadores.filter(j => j.rareza === 'comun');
            }
            
            let elegido = poolFiltrado[Math.floor(Math.random() * poolFiltrado.length)];
            sobreAbierto.push({ ...elegido });
        }

        const nuevoOro = usuario.monedas - costo;
        await pool.query("UPDATE usuarios SET monedas = $1 WHERE id = $2", [nuevoOro, usuario_id]);

        // Guardado usando EXCLUDED para evitar bugs en Postgres
        for (let jugador of sobreAbierto) {
            const resProg = await pool.query(
                `INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1)
                 ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad
                 RETURNING cantidad`,
                [usuario_id, jugador.id]
            );
            jugador.obtenido = resProg.rows[0].cantidad;
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

app.post('/api/jugar-penal', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { gano } = req.body;
    const ahora = new Date();

    try {
        const result = await pool.query("SELECT monedas, puntos_ranking, ultimo_tiro_timestamp, tiros_hoy FROM usuarios WHERE id = $1", [usuario_id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

        const usuario = result.rows[0];
        let { tirosActuales } = calcularTirosActuales(usuario);

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
    if (r < 0.08) return 0;  // 📉 Bajamos el 0 absoluto a solo un 8% (Chau arco en cero constante)
    if (r < 0.38) return 1;  // 🎯 30% de chances para 1 gol
    if (r < 0.68) return 2;  // 🎯 30% de chances para 2 goles (El resultado más común en el fútbol)
    if (r < 0.88) return 3;
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

app.post('/api/timba/preparar', verificarToken, async (req, res) => { 
    const usuario_id = req.usuarioLogueado.id;
    const { tipoApuesta, montoApuesta, jugadorIdApostado } = req.body;

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

        let { timbasActuales } = calcularTimbasActuales(usuario);

        if (timbasActuales <= 0) {
            return res.json({ 
                ok: false,
                error_limite: true, 
                mensaje: "❌ ¡Te quedaste sin energía para apostar! Esperá a que recargue el cronómetro de la banca. ⏱️" 
            });
        }

        const nuevasTimbasGuardadas = timbasActuales - 1;
        await pool.query(`UPDATE usuarios SET ultimo_giro_timestamp = NOW(), timbas_hoy = $1 WHERE id = $2`, [nuevasTimbasGuardadas, usuario_id]);

        // 🎲 1. GENERACIÓN REAL DE LA BANCA
        const golesLReal = generarGolesServidor();
        const golesVReal = generarGolesServidor();
        const labelReal = `${golesLReal} - ${golesVReal}`;

        // 🎡 2. INICIALIZACIÓN DE LA RULETA (6 casilleros físicos fijos)
        const ruletaCasilleros = Array(6).fill(null);
        const combinacionesUsadas = new Set([labelReal]);

        // Decidimos en qué posición exacta va a caer el premio mayor en este giro (del 0 al 5)
        const casilleroGanadorAzar = Math.floor(Math.random() * 6);
        
        // Clavamos el resultado real directamente en su casillero asignado
        ruletaCasilleros[casilleroGanadorAzar] = { label: labelReal, tipo: 'exacto', idOpcion: casilleroGanadorAzar };

        // Función puramente caótica para rellenar el resto de la ruleta
        function crearMarcadorRuleta() {
            const r = Math.random();
            if (r < 0.12) return { l: 0, v: 0 }; 
            if (r < 0.38) return { l: Math.floor(Math.random() * 3) + 1, v: Math.floor(Math.random() * 2) }; // Locales variados
            if (r < 0.64) return { l: Math.floor(Math.random() * 2), v: Math.floor(Math.random() * 3) + 1 }; // Visitantes variados
            if (r < 0.82) return { l: Math.floor(Math.random() * 2) + 2, v: Math.floor(Math.random() * 2) + 2 }; // Empates/Scores altos
            return { l: Math.floor(Math.random() * 3) + 3, v: Math.floor(Math.random() * 3) }; // Goleadas locas
        }

        // 🌪️ 3. RELLENAMOS LOS CASILLEROS RESTANTES UNO POR UNO
        for (let i = 0; i < 6; i++) {
            // Si es la posición del ganador, saltamos porque ya está ocupada
            if (i === casilleroGanadorAzar) continue;

            let safeBucle = 0;
            let asignado = false;

            while (!asignado && safeBucle < 150) {
                safeBucle++;
                const marcador = crearMarcadorRuleta();
                const combo = `${marcador.l} - ${marcador.v}`;

                if (!combinacionesUsadas.has(combo)) {
                    combinacionesUsadas.add(combo);
                    ruletaCasilleros[i] = { label: combo, tipo: 'ruido', idOpcion: i };
                    asignado = true;
                }
            }

            // Salvaguarda total anti-repetidos por si se traba el set
            if (!ruletaCasilleros[i]) {
                const comboFuerzaBruta = `${golesLReal + i + 1} - ${golesVReal + i}`;
                ruletaCasilleros[i] = { label: comboFuerzaBruta, tipo: 'ruido', idOpcion: i };
            }
        }

        // 🧠 4. MAPEO LIMPIO DIRECTO AL ENVIAR (Mantiene el orden físico de los casilleros del 0 al 5)
        const poolParaCliente = ruletaCasilleros.map(slot => ({
            idOpcion: slot.idOpcion, // Vinculado a su índice real fijo
            label: slot.label
        }));

        // Guardamos la configuración en la sesión temporal de la Arena
        apuestasActivasServidor[usuario_id] = {
            golesLReal,
            golesVReal,
            tipoApuesta,
            montoApuesta,
            jugadorIdApostado,
            mapeoOpciones: ruletaCasilleros // Mantiene la verdad indexada por posición
        };

        const tiempoActualizado = nuevasTimbasGuardadas >= MAX_TIMBAS ? 0 : MILISEGUNDOS_POR_TIMBA;
        
        return res.json({ 
            ok: true, 
            opciones: poolParaCliente,
            timbas_restantes: nuevasTimbasGuardadas,
            siguienteIn: tiempoActualizado
        });

    } catch (err) {
        console.error("❌ Fallo en motor de Ruleta de Timba:", err.message);
        return res.status(500).json({ ok: false, mensaje: "Error en el servidor al preparar la ruleta." });
    }
});

app.post('/api/timba/procesar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { idOpcionElegida } = req.body;
    const apuesta = apuestasActivasServidor[usuario_id];

    if (!apuesta) {
        return res.status(400).json({ ok: false, mensaje: "No hay una apuesta activa preparada." });
    }

    const { golesLReal, golesVReal, tipoApuesta, montoApuesta, jugadorIdApostado, mapeoOpciones } = apuesta;
    
    // 🕵️‍♂️ Recuperamos la opción elegida del array barajado usando el ID oculto
    const opcionElegida = mapeoOpciones.find(o => o.idOpcion === parseInt(idOpcionElegida)) || mapeoOpciones[idOpcionElegida];

    if (!opcionElegida) {
        return res.status(400).json({ ok: false, mensaje: "Opción de apuesta inválida o alterada." });
    }

    // 🛡️ DETECTOR DE VERDAD MATEMÁTICO PURO (Sin patrones, lee texto directo)
    const labelReal = `${golesLReal} - ${golesVReal}`;
    const signoReal = golesLReal > golesVReal ? 'L' : (golesLReal < golesVReal ? 'V' : 'E');

    // Desarmamos el string de lo que el usuario seleccionó en la interfaz
    const [golesLElegidos, golesVElegidos] = opcionElegida.label.split(' - ').map(Number);
    const signoElegido = golesLElegidos > golesVElegidos ? 'L' : (golesLElegidos < golesVElegidos ? 'V' : 'E');

    // Clasificación dinámica en caliente
    let tipoDictamen = 'error'; 
    if (opcionElegida.label === labelReal) {
        tipoDictamen = 'exacto';
    } else if (signoElegido === signoReal) {
        tipoDictamen = 'signo';
    }

    let balanceMonedas = 0;
    let puntosAsignados = 0;
    let mensajeResultado = "";

    try {
        // ========================================================================
        // 🪙 CASO A: APUESTA POR MONEDAS DE ORO
        // ========================================================================
        if (tipoApuesta === "monedas") {
            if (tipoDictamen === 'exacto') {
                balanceMonedas = montoApuesta * 3; 
                puntosAsignados = 20;
                mensajeResultado = `¡QUÉ ANIMAL! Acertaste el resultado exacto (${golesLReal}-${golesVReal}).\nGanaste: ${montoApuesta * 3} monedas.`;
            } else if (tipoDictamen === 'signo') {
                balanceMonedas = Math.round(montoApuesta * 0.5);
                mensajeResultado = `¡BIEN AHÍ! Acertaste el ganador (${opcionElegida.label}). El resultado fue ${golesLReal}-${golesVReal}.\nGanaste: ${balanceMonedas} monedas.`;
            } else {
                balanceMonedas = -montoApuesta;
                mensajeResultado = `¡ERRASTE! El partido terminó ${golesLReal}-${golesVReal} y elegiste ${opcionElegida.label}.\nPerdiste: ${montoApuesta} monedas.`;
            }

            await pool.query(
                `UPDATE usuarios SET monedas = monedas + $1, puntos_ranking = puntos_ranking + $2 WHERE id = $3`, 
                [balanceMonedas, puntosAsignados, usuario_id]
            );

        // ========================================================================
        // 🃏 CASO B: TIMBA POR CROMOS REPETIDOS
        // ========================================================================
        } else {
            const cardQuery = await pool.query("SELECT nombre, rareza FROM jugadores WHERE id = $1", [jugadorIdApostado]);
            const cromoApostado = cardQuery.rows[0];
            const rarezaOriginal = cromoApostado.rareza.toLowerCase();

            if (tipoDictamen === 'exacto' || tipoDictamen === 'signo') {
                
                if (rarezaOriginal === "legendaria") {
                    let oroPremio = (tipoDictamen === 'exacto') ? 2500 : 1000;
                    puntosAsignados = (tipoDictamen === 'exacto') ? 40 : 20;

                    await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugadorIdApostado]);
                    await pool.query("UPDATE usuarios SET monedas = monedas + $1, puntos_ranking = puntos_ranking + $2 WHERE id = $3", [oroPremio, puntosAsignados, usuario_id]);

                    if (tipoDictamen === 'exacto') {
                        mensajeResultado = `👑 ¡DIOS SANTO PE! Apostaste a ${cromoApostado.nombre.toUpperCase()} Legendario y la clavaste al ángulo (${golesLReal}-${golesVReal}).\n\n💰 ¡LA CASA TE PAGA 🪙2.500 MONEDAS!`;
                    } else {
                        mensajeResultado = `💰 ¡BIEN AHÍ! Acertaste el ganador con tu Legendario (${golesLReal}-${golesVReal}).\n\n🎁 ¡Te llevás 🪙1.000 monedas!`;
                    }

                } else {
                    await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugadorIdApostado]);
                    
                    let rarezaPremio = rarezaOriginal; 
                    if (tipoDictamen === 'exacto') {
                        if (rarezaOriginal === "comun") rarezaPremio = "rara";
                        else if (rarezaOriginal === "rara") rarezaPremio = "epica";
                        else if (rarezaOriginal === "epica") rarezaPremio = "legendaria";
                    }

                    const poolPremio = await pool.query("SELECT id, nombre, rareza FROM jugadores WHERE rareza = $1 ORDER BY RANDOM() LIMIT 1", [rarezaPremio]);
                    const cromoGanado = poolPremio.rows[0];

                    await pool.query(
                        `INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1)
                         ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad`,
                        [usuario_id, cromoGanado.id]
                    );

                    puntosAsignados = (tipoDictamen === 'exacto') ? 30 : 15;
                    await pool.query("UPDATE usuarios SET puntos_ranking = puntos_ranking + $1 WHERE id = $2", [puntosAsignados, usuario_id]);

                    if (tipoDictamen === 'exacto') {
                        mensajeResultado = `🔥 ¡PRO DISPARO! Acertaste el exacto (${golesLReal}-${golesVReal}).\n🎁 ¡EVOLUCIÓN! Te ganaste un cromo SUPERIOR: ${cromoGanado.nombre.toUpperCase()} [${cromoGanado.rareza.toUpperCase()}]`;
                    } else {
                        mensajeResultado = `⚽ ¡GOOOL! Acertaste el ganador. El partido terminó ${golesLReal}-${golesVReal}.\n🃏 La banca te devuelve otro cromo: ${cromoGanado.nombre.toUpperCase()} [${cromoGanado.rareza.toUpperCase()}]`;
                    }
                }

            } else {
                // Perdió el cromo repetido de forma permanente
                await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugadorIdApostado]);
                mensajeResultado = `❌ ¡CROMO PERDIDO! El partido terminó ${golesLReal}-${golesVReal} y tu opción fue ${opcionElegida.label}.\nPerdiste 1 copia de ${cromoApostado.nombre.toUpperCase()}.`;
            }
        }

        // Limpieza atómica de la jugada activa para evitar doble procesamiento (Exploit Fix)
        const userCheck = await pool.query("SELECT monedas, puntos_ranking FROM usuarios WHERE id = $1", [usuario_id]);
        delete apuestasActivasServidor[usuario_id];

        return res.json({
            ok: true,
            mensajeResultado,
            golesLReal,
            golesVReal,
            datos: userCheck.rows[0]
        });

    } catch (err) {
        console.error("❌ Fallo crítico en el procesamiento de la timba:", err);
        return res.status(500).json({ ok: false, mensaje: "Error en DB al procesar tu jugada." });
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
        `🧤 ¡Mano a mano agónico! El arquero salva en la línea de gol.`,
        `🟥 ¡Tarjeta Roja! Un defensor se va expulsado por juego brusco.`,
        `⚠️ ¡Tiro libre peligroso en la puerta del área! Pasa rozando el palo.`,
        `⚡ ¡Contraataque letal comandado por las tácticas del DT! El estadio es un hervidero.`,
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
const COOLDOWN_MUNDIAL_MS = 3 * 60 * 60 * 1000; 

const VALOR_STATS_RAREZA = {
    'comun': 60,
    'rara': 75,
    'epica': 85,
    'legendaria': 96
};

function mezclarArray(arr) {
    return arr.sort(() => Math.random() - 0.5);
}

const SELECCIONES_BOTS = [
    "Francia", "Brasil", "Alemania", "España", "Italia", "Inglaterra", 
    "Países Bajos", "Portugal", "Uruguay", "Croacia", "Bélgica", "Marruecos", 
    "Japón", "Senegal", "Estados Unidos", "Colombia", "México", "Argentina",
    "Ecuador", "Perú", "Chile", "Paraguay", "Venezuela", "Canadá", "Costa Rica",
    "Nigeria", "Egipto", "Argelia", "Túnez", "Ghana", "Corea del Sur", "Australia",
    "Arabia Saudita", "Irán", "Suiza", "Dinamarca", "Suecia", "Polonia", "Ucrania", "Austria"
];

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

app.post('/api/mundial/preparar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    try {
        const userCheck = await pool.query("SELECT monedas, ultima_timba_mundial FROM usuarios WHERE id = $1", [usuario_id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Usuario inválido." });

        if (userCheck.rows[0].ultima_timba_mundial) {
            const transcurrido = new Date() - new Date(userCheck.rows[0].ultima_timba_mundial);
            if (transcurrido < COOLDOWN_MUNDIAL_MS) {
                return res.json({ ok: false, elVestuarioEstaCerrado: true, mensaje: `⏳ Vestuario cerrado. Debés esperar a que se cumpla el tiempo.` });
            }
        }

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

app.post('/api/mundial/jugar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { seleccionElegida, rivalClasificacion, jugadorIds } = req.body;

    if (!jugadorIds || jugadorIds.length !== 3) {
        return res.status(400).json({ ok: false, mensaje: "Debés alinear exactamente 3 jugadores." });
    }

    try {
        const jCheck = await pool.query(
            "SELECT j.rareza FROM usuario_progreso up JOIN jugadores j ON up.jugador_id = j.id WHERE up.usuario_id = $1 AND up.jugador_id = ANY($2) AND up.cantidad > 0",
            [usuario_id, jugadorIds]
        );

        if (jCheck.rows.length !== 3) {
            return res.json({ ok: false, mensaje: "❌ Uno o más jugadores seleccionados no están disponibles." });
        }

        const sumaStats = jCheck.rows.reduce((acc, row) => acc + VALOR_STATS_RAREZA[row.rareza.toLowerCase()], 0);
        const promedio = sumaStats / 3;
        
        let estrellas = 1;
        if (promedio >= 90) estrellas = 5;
        else if (promedio >= 79) estrellas = 4;
        else if (promedio >= 70) estrellas = 3;
        else if (promedio >= 62) estrellas = 2;

        let chanceVictoria = 0.10; 
        if (estrellas === 2) chanceVictoria = 0.25;
        else if (estrellas === 3) chanceVictoria = 0.48;
        else if (estrellas === 4) chanceVictoria = 0.70;
        else if (estrellas === 5) chanceVictoria = 0.88;

        let botsDisponibles = SELECCIONES_BOTS.filter(s => s !== seleccionElegida);
        botsDisponibles = mezclarArray(botsDisponibles);

        const rivalGrupo1 = botsDisponibles[0];
        const rivalGrupo2 = botsDisponibles[1];
        const rivalGrupo3 = botsDisponibles[2];
        const integrantesGrupo = [seleccionElegida, rivalGrupo1, rivalGrupo2, rivalGrupo3];

        // 🛡️ SUB-MOTOR INTERNO DEL BACKEND: Genera minutos de gol distribuidos sin pisarse
        function generarMinutosGolesFútbol(cantidad) {
            let minutos = [];
            while(minutos.length < cantidad) {
                // Pasos de a 3 min para encajar simétrico con el reloj virtual del Front
                let min = Math.floor(Math.random() * 29) * 3 + 3; 
                if (!minutos.includes(min) && min !== 45 && min !== 90) {
                    minutos.push(min);
                }
            }
            return minutos.sort((a, b) => a - b);
        }

        function simularMatchCompleto(eq1, eq2, esUsuario) {
            let g1 = Math.floor(Math.random() * 3);
            let g2 = Math.floor(Math.random() * 3);
            if (esUsuario) {
                if (Math.random() <= chanceVictoria && g1 <= g2) g1 = g2 + Math.floor(Math.random() * 2) + 1;
                else if (Math.random() > chanceVictoria && g2 <= g1) g2 = g1 + Math.floor(Math.random() * 2) + 1;
            }
            
            // Calculamos las líneas de tiempo acá en el servidor
            return {
                goles1: g1,
                goles2: g2,
                minutosEq1: generarMinutosGolesFútbol(g1),
                minutosEq2: generarMinutosGolesFútbol(g2)
            };
        }

        // Simular Fase de Grupos con líneas de tiempo reales
        let let_f1_m1 = simularMatchCompleto(seleccionElegida, rivalGrupo1, true);
        let let_f1_m2 = simularMatchCompleto(rivalGrupo2, rivalGrupo3, false);
        
        let bitacoraGrupo = [];
        bitacoraGrupo.push({ 
            fecha: 1, local: seleccionElegida, visitante: rivalGrupo1, 
            gL: let_f1_m1.goles1, gV: let_f1_m1.goles2, 
            minutosL: let_f1_m1.minutosEq1, minutosV: let_f1_m1.minutosEq2, // 🟢 ENVIADO
            botL: rivalGrupo2, botV: rivalGrupo3, 
            gBL: let_f1_m2.goles1, gBV: let_f1_m2.goles2,
            minutosBL: let_f1_m2.minutosEq1, minutosBV: let_f1_m2.minutosEq2
        });

        let let_f2_m1 = simularMatchCompleto(seleccionElegida, rivalGrupo2, true);
        let let_f2_m2 = simularMatchCompleto(rivalGrupo1, rivalGrupo3, false);
        bitacoraGrupo.push({ 
            fecha: 2, local: seleccionElegida, visitante: rivalGrupo2, 
            gL: let_f2_m1.goles1, gV: let_f2_m1.goles2, 
            minutosL: let_f2_m1.minutosEq1, minutosV: let_f2_m1.minutosEq2,
            botL: rivalGrupo1, botV: rivalGrupo3, 
            gBL: let_f2_m2.goles1, gBV: let_f2_m2.goles2,
            minutosBL: let_f2_m2.minutosEq1, minutosBV: let_f2_m2.minutosEq2
        });

        let let_f3_m1 = simularMatchCompleto(seleccionElegida, rivalGrupo3, true);
        let let_f3_m2 = simularMatchCompleto(rivalGrupo1, rivalGrupo2, false);
        bitacoraGrupo.push({ 
            fecha: 3, local: seleccionElegida, visitante: rivalGrupo3, 
            gL: let_f3_m1.goles1, gV: let_f3_m1.goles2, 
            minutosL: let_f3_m1.minutosEq1, minutosV: let_f3_m1.minutosEq2,
            botL: rivalGrupo1, botV: rivalGrupo2, 
            gBL: let_f3_m2.goles1, gBV: let_f3_m2.goles2,
            minutosBL: let_f3_m2.minutosEq1, minutosBV: let_f3_m2.minutosEq2
        });

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

        // Play-offs
        let bitacoraPlayoffs = [];
        let campeon = false;
        let faseAlcanzada = "Fase de Grupos";

        if (clasificaALlaves) {
            faseAlcanzada = "Octavos de Final";
            const llaves = [
                { ronda: "Octavos de Final", rival: botsDisponibles[3], penalizacion: 0 },
                { ronda: "Cuartos de Final", rival: botsDisponibles[4], penalizacion: 0.08 },
                { ronda: "Semifinal", rival: botsDisponibles[5], penalizacion: 0.16 },
                { ronda: "Gran Final del Mundo", rival: botsDisponibles[6], penalizacion: 0.24 }
            ];

            campeon = true;
            for (let llave of llaves) {
                faseAlcanzada = llave.ronda;
                const chanceRondaReal = Math.max(0.10, chanceVictoria - llave.penalizacion);
                
                // Precalculamos score exacto de llaves en backend
                let gTu = Math.floor(Math.random() * 3);
                let gRiv = Math.floor(Math.random() * 3);
                const ganoEsteCruce = Math.random() <= chanceRondaReal;
                
                if (ganoEsteCruce) {
                    if (gTu <= gRiv) gTu = gRiv + 1;
                    bitacoraPlayoffs.push({ 
                        ronda: llave.ronda, rival: llave.rival, resultado: "Ganaste ✅",
                        gL: gTu, gV: gRiv,
                        minutosL: generarMinutosGolesFútbol(gTu), minutosV: generarMinutosGolesFútbol(gRiv)
                    });
                } else {
                    campeon = false;
                    if (gRiv <= gTu) gRiv = gTu + 1;
                    bitacoraPlayoffs.push({ 
                        ronda: llave.ronda, rival: llave.rival, resultado: "Perdiste ❌",
                        gL: gTu, gV: gRiv,
                        minutosL: generarMinutosGolesFútbol(gTu), minutosV: generarMinutosGolesFútbol(gRiv)
                    });
                    break;
                }
            }
        }

        const ahora = new Date();
        if (campeon) {
            await pool.query(
                "UPDATE usuarios SET monedas = monedas + 5000, copas_mundiales = copas_mundiales + 1, puntos_ranking = puntos_ranking + 50, ultima_timba_mundial = $1 WHERE id = $2",
                [ahora, usuario_id]
            );
        } else {
            await pool.query("UPDATE usuarios SET ultima_timba_mundial = $1 WHERE id = $2", [ahora, usuario_id]);
        }

        const userFinal = await pool.query("SELECT monedas, puntos_ranking, copas_mundiales FROM usuarios WHERE id = $1", [usuario_id]);

        return res.json({
            ok: true,
            progreso: {
                ganoClasificacion: true,
                integrantesGrupo, 
                bitacoraGrupo,     
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
app.post('/api/multijugador/preparar-draft', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    try {
        const userCheck = await pool.query("SELECT id FROM usuarios WHERE id = $1", [usuario_id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Usuario inválido." });

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
   🏆 MÓDULO MULTIJUGADOR REFORMADO (ENTRADA GRATUITA - COBRO AL INICIAR)
   ======================================================================== */
app.post('/api/multijugador/crear', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { seleccion, jugador_ids, tipo_apuesta, apuesta_oro } = req.body;

    if (!jugador_ids || jugador_ids.length !== 3) {
        return res.json({ ok: false, mensaje: "❌ Debés seleccionar 3 jugadores para tu plantel." });
    }

    const codigo_sala = Math.random().toString(36).substring(2, 8).toUpperCase();
    const modalidad = tipo_apuesta ? tipo_apuesta.toLowerCase() : 'amistoso';
    const montoApuesta = parseInt(apuesta_oro) || 0;

    try {
        const userCheck = await pool.query("SELECT username FROM usuarios WHERE id = $1", [usuario_id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Usuario inválido." });

        const insertSalaQuery = `
            INSERT INTO mundial_salas (codigo_sala, creador_id, tipo_apuesta, apuesta_oro, pozo_total, estado)
            VALUES ($1, $2, $3, $4, 0, 'esperando')
            RETURNING id;
        `;
        const salaResult = await pool.query(insertSalaQuery, [codigo_sala, usuario_id, modalidad, montoApuesta]);
        const sala_id = salaResult.rows[0].id;

        const insertParticipanteQuery = `
            INSERT INTO sala_participantes (sala_id, usuario_id, seleccion, jugador_ids)
            VALUES ($1, $2, $3, $4);
        `;
        
        // ✨ Corregido: Se pasa el array directo nativo, pg de Node lo mapea solo
        await pool.query(insertParticipanteQuery, [sala_id, usuario_id, seleccion, jugador_ids]);

        return res.json({
            ok: true,
            sala_id: sala_id,
            codigo_sala: codigo_sala,
            mensaje: "Sala creada con éxito. Ya podés pasar el código a tu rival."
        });

    } catch (error) {
        console.error("❌ ERROR AL CREAR SALA:", error.message);
        return res.status(500).json({ ok: false, mensaje: "Error de Base de Datos al abrir la sala." });
    }
});

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

app.post('/api/multijugador/unirse', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { codigo_sala, seleccion, jugador_ids } = req.body;

    if (!codigo_sala) return res.json({ ok: false, mensaje: "❌ Falta el código de la sala." });
    if (!jugador_ids || jugador_ids.length !== 3) return res.json({ ok: false, mensaje: "❌ Debés seleccionar 3 jugadores." });

    try {
        const salaCheck = await pool.query(
            "SELECT id, estado FROM mundial_salas WHERE codigo_sala = $1", 
            [codigo_sala.toUpperCase()]
        );
        if (salaCheck.rows.length === 0) return res.json({ ok: false, mensaje: "❌ La sala no existe." });
        const sala = salaCheck.rows[0];

        if (sala.estado !== 'esperando') return res.json({ ok: false, mensaje: "🚫 Sala cerrada." });

        const seleccionCheck = await pool.query(
            "SELECT id FROM sala_participantes WHERE sala_id = $1 AND UPPER(seleccion) = $2", 
            [sala.id, seleccion.toUpperCase()]
        );
        if (seleccionCheck.rows.length > 0) return res.json({ ok: false, mensaje: `La selección de ${seleccion.toUpperCase()} ya está ocupada.` });

        await pool.query(
            `INSERT INTO sala_participantes (sala_id, usuario_id, seleccion, jugador_ids) VALUES ($1, $2, $3, $4)`,
            [sala.id, usuario_id, seleccion, jugador_ids]
        );

        return res.json({
            ok: true,
            mensaje: "⚽ ¡Te uniste con éxito! Esperando que el host inicie el fixture...",
            sala_id: sala.id
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
   💥 SIMULACIÓN Y PROCESAMIENTO CON TIMELINE EXCLUSIVO MULTIJUGADOR
   ======================================================================== */

// Sub-motor interno: Genera minutos de gol distribuidos uniformemente cada 3 minutos virtuales
function generarMinutosGolesMultijugador(cantidad) {
    let minutos = [];
    while(minutos.length < cantidad) {
        let min = Math.floor(Math.random() * 29) * 3 + 3; // Bloques de 3 minutos (Evita min 0)
        if (!minutos.includes(min) && min !== 45 && min !== 90) {
            minutos.push(min);
        }
    }
    return minutos.sort((a, b) => a - b);
}

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

    // 🟢 Inyectamos las matrices de minutos exactos calculadas en frío en Node
    return {
        local: equipo1, visitante: equipo2,
        golesL: g1, golesV: g2,
        minutosL: generarMinutosGolesMultijugador(g1),
        minutosV: generarMinutosGolesMultijugador(g2),
        penalesL: fueAPenales ? penales1 : null, penalesV: fueAPenales ? penales2 : null,
        definicionPenales: fueAPenales, ganador: ganador
    };
}

app.post('/api/multijugador/jugar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado?.id || req.usuarioLogueado?.usuario_id;
    const { sala_id, codigo_sala } = req.body;
    
    try {
        let salaQuery = await pool.query("SELECT * FROM mundial_salas WHERE id = $1", [sala_id]);
        
        if (salaQuery.rows.length === 0 && codigo_sala) {
            salaQuery = await pool.query("SELECT * FROM mundial_salas WHERE codigo_sala = $1", [codigo_sala.toUpperCase()]);
        }
        
        if (salaQuery.rows.length === 0) {
            return res.json({ ok: false, mensaje: "❌ Sala no encontrada en los registros de la Arena." });
        }
        
        const sala = salaQuery.rows[0];
        const sala_id_real = sala.id;

        const idDelCreadorEnBase = parseInt(sala.creador_id);
        const idTuyaIdentificada = parseInt(usuario_id);

        if (idDelCreadorEnBase !== idTuyaIdentificada) { 
            return res.json({ 
                ok: false, 
                mensaje: `⛔ Error de Dueño: El creador en Neon es el ID [${idDelCreadorEnBase}], pero tu token descifró el ID [${idTuyaIdentificada}].` 
            }); 
        }
        
        if (sala.estado !== 'esperando') {
            return res.json({ ok: false, mensaje: "🚫 Sala cerrada o ya simulada." });
        }

        const participantesQuery = await pool.query(
            `SELECT sp.usuario_id, u.username, sp.seleccion 
             FROM sala_participantes sp
             JOIN usuarios u ON sp.usuario_id = u.id
             WHERE sp.sala_id = $1`, [sala_id_real]
        );
        
        let competidores = participantesQuery.rows.map(p => ({
            id: p.usuario_id,
            username: p.username,
            seleccion: p.seleccion,
            esBot: false
        }));

        if (competidores.length < 2) {
            return res.json({ ok: false, mensaje: "❌ Se necesitan al menos 2 jugadores reales en el lobby." });
        }

        const idHost = sala.creador_id;
        const idInvitado = competidores.find(c => c.id !== idHost).id;
        const modalidadSala = sala.tipo_apuesta ? sala.tipo_apuesta.toLowerCase() : 'amistoso';
        const arancelOro = sala.apuesta_oro || 0;

        if (modalidadSala === 'oro') {
            const chequearMonedas = await pool.query("SELECT id, monedas FROM usuarios WHERE id IN ($1, $2)", [idHost, idInvitado]);
            const oroHost = chequearMonedas.rows.find(r => r.id === idHost)?.monedas || 0;
            const oroInvitado = chequearMonedas.rows.find(r => r.id === idInvitado)?.monedas || 0;

            if (oroHost < arancelOro) return res.json({ ok: false, mensaje: "❌ Suspensión por Fondos: El Host no tiene Oro suficiente." });
            if (oroInvitado < arancelOro) return res.json({ ok: false, mensaje: "❌ Suspensión por Fondos: El rival invitado se quedó sin Oro suficiente." });

            await pool.query("UPDATE usuarios SET monedas = monedas - $1 WHERE id = $2", [arancelOro, idHost]);
            await pool.query("UPDATE usuarios SET monedas = monedas - $1 WHERE id = $2", [arancelOro, idInvitado]);
            
            sala.pozo_total = arancelOro * 2;
            await pool.query("UPDATE mundial_salas SET pozo_total = $1 WHERE id = $2", [sala.pozo_total, sala_id_real]);

        } else if (modalidadSala === 'carta') {
            const repetidasHost = await pool.query("SELECT jugador_id FROM usuario_progreso WHERE usuario_id = $1 AND cantidad > 1 LIMIT 1", [idHost]);
            const repetidasInvitado = await pool.query("SELECT jugador_id FROM usuario_progreso WHERE usuario_id = $1 AND cantidad > 1 LIMIT 1", [idInvitado]);

            if (repetidasHost.rows.length === 0) return res.json({ ok: false, mensaje: "❌ Suspensión por Inventario: Ya no contás con cartas repetidas." });
            if (repetidasInvitado.rows.length === 0) return res.json({ ok: false, mensaje: "❌ Suspensión por Inventario: Tu rival no posee cartas repetidas." });

            await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [idHost, repetidasHost.rows[0].jugador_id]);
            await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [idInvitado, repetidasInvitado.rows[0].jugador_id]);
        }

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

        let listaMezclada = mezclarArray([...competidores]);
        let grillaTorneo = new Array(8);
        for (let competidor of listaMezclada) {
            let posAleatoria = Math.floor(Math.random() * 8);
            while (grillaTorneo[posAleatoria] !== undefined) { posAleatoria = (posAleatoria + 1) % 8; }
            grillaTorneo[posAleatoria] = competidor;
        }

        let bitacoraPartidosPlana = [];

        // 📊 SIMULACIÓN DE CUARTOS
        let ganadoresCuartos = new Array(4);
        let numeroPartido = 1;
        for (let i = 0; i < 8; i += 2) {
            let cruce = simularPartidoEliminatorio(grillaTorneo[i], grillaTorneo[i+1]);
            bitacoraPartidosPlana.push({
                ronda: `Cuartos de Final (${numeroPartido}/4)`,
                local: cruce.local.seleccion,
                visitante: cruce.visitante.seleccion,
                golesLocal: cruce.golesL,
                golesVisitante: cruce.golesV,
                minutosL: cruce.minutosL, // 🟢 EMBAJADA DE LÍNEA DE TIEMPO
                minutosV: cruce.minutosV, // 🟢 EMBAJADA DE LÍNEA DE TIEMPO
                penalesLocal: cruce.penalesL,
                penalesVisitante: cruce.penalesV,
                definicionPenales: cruce.definicionPenales,
                ganadorUsername: cruce.ganador.username
            });
            ganadoresCuartos[numeroPartido - 1] = cruce.ganador;
            numeroPartido++;
        }

        // 📊 SIMULACIÓN DE SEMIFINALES
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
                minutosL: cruce.minutosL,
                minutosV: cruce.minutosV,
                penalesLocal: cruce.penalesL,
                penalesVisitante: cruce.penalesV,
                definicionPenales: cruce.definicionPenales,
                ganadorUsername: cruce.ganador.username
            });
            ganadoresSemis.push(cruce.ganador);
            numeroSemi++;
        }

        // 📊 SIMULACIÓN DE LA GRAN FINAL
        let finalCruce = simularPartidoEliminatorio(ganadoresSemis[0], ganadoresSemis[1]);
        const campeonMundial = finalCruce.ganador;
        
        bitacoraPartidosPlana.push({
            ronda: "Gran Final",
            local: finalCruce.local.seleccion,
            visitante: finalCruce.visitante.seleccion,
            golesLocal: finalCruce.golesL,
            golesVisitante: finalCruce.golesV,
            minutosL: finalCruce.minutosL,
            minutosV: finalCruce.minutosV,
            penalesLocal: finalCruce.penalesL,
            penalesVisitante: finalCruce.penalesV,
            definicionPenales: finalCruce.definicionPenales,
            ganadorUsername: finalCruce.ganador.username
        });

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
                     ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad`,
                    [campeonMundial.id, cartaRecompensa.id]
                );
                datosPremio.nombreCartaPremio = `${cartaRecompensa.nombre} (${cartaRecompensa.rareza.toUpperCase()})`;
            }
        }

        await pool.query("UPDATE mundial_salas SET estado = 'finalizado' WHERE id = $1", [sala_id_real]);
        BITACORAS_SALA_CACHE[sala_id_real] = { bitacora: bitacoraPartidosPlana, premio: datosPremio };

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
        const datosCache = BITACORAS_SALA_CACHE[sala_id];
        if (datosCache) {
            return res.json({
                ok: true,
                bitacora: datosCache.bitacora,
                prize: datosCache.premio,
                premio: datosCache.premio
            });
        }

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
app.post('/api/album/comerciar-bot', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { jugadorIdsASacar } = req.body; 

    if (!jugadorIdsASacar || jugadorIdsASacar.length !== 3) {
        return res.status(400).json({ ok: false, mensaje: "El Bot exige exactamente 3 cartas para el trato." });
    }

    try {
        const conteoSolicitado = {};
        jugadorIdsASacar.forEach(id => {
            conteoSolicitado[id] = (conteoSolicitado[id] || 0) + 1;
        });

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

        for (let row of cartasInfo.rows) {
            const pedidas = conteoSolicitado[row.jugador_id];
            if (row.cantidad - pedidas < 1) {
                return res.json({ ok: false, mensaje: "❌ No tenés repetidas suficientes de alguno de los jugadores elegidos." });
            }
        }

        const rarezaBase = cartasInfo.rows[0].rareza.toLowerCase();
        const todasIgualRareza = cartasInfo.rows.every(row => row.rareza.toLowerCase() === rarezaBase);

        if (!todasIgualRareza) {
            return res.json({ ok: false, mensaje: "❌ El Bot exige que las 3 cartas sacrificadas sean de la misma rareza para calcular el escalón." });
        }

        let rarezaRecompensa = "rara"; 
        if (rarezaBase === "rara") rarezaRecompensa = "epica";
        else if (rarezaBase === "epica") rarezaRecompensa = "legendaria";
        else if (rarezaBase === "legendaria") rarezaRecompensa = "legendaria"; 

        for (let jId of jugadorIdsASacar) {
            await pool.query(
                "UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2",
                [usuario_id, jId]
            );
        }

        const lootBot = await pool.query(
            "SELECT id, nombre, rareza FROM jugadores WHERE rareza = $1 ORDER BY RANDOM() LIMIT 1",
            [rarezaRecompensa]
        );
        const cartaPremio = lootBot.rows[0];

        // Corregido con EXCLUDED
        await pool.query(
            `INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1) 
             ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad`,
            [usuario_id, cartaPremio.id]
        );

        let eventoActivado = null;
        const esElite = (rarezaBase === "epica" || rarezaBase === "legendaria");

        if (esElite && Math.random() <= 0.08) { 
            const dadosEvento = Math.random();

            if (dadosEvento < 0.50) {
                await pool.query("UPDATE usuarios SET tiros_hoy = 10 WHERE id = $1", [usuario_id]);
                eventoActivado = "⚡ ¡EL BOT SE COPÓ! Te recargó los tiros: Volvés a tener 10 penales disponibles al toque.";
            } else {
                await pool.query(
                    "UPDATE usuarios SET ultima_timba_mundial = NOW() - INTERVAL '4 hours' WHERE id = $1", 
                    [usuario_id]
                );
                eventoActivado = "⏳ ¡CONTRABANDO TÁCTICO! El Bot alteró los papeles del vestuario. ¡Podés jugar el Mundial de vuelta YA!";
            }
        }

        return res.json({
            ok: true,
            mensaje: `🤝 ¡Trato hecho! Cambiaste 3 cartas de tipo [${rarezaBase.toUpperCase()}] por un escalón superior.`,
            cartaGanada: {
                id: cartaPremio.id,
                nombre: cartaPremio.nombre,
                rareza: cartaPremio.rareza.toUpperCase()
            },
            eventoEspecial: eventoActivado 
        });

    } catch (err) {
        console.error("❌ Error en Mercado Bot Mutado:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/* ========================================================================
   💸 ENGINE MERCADO DE PASES INTER-JUGADORES (P2P)
   ======================================================================== */
app.post('/api/mercado/publicar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { jugador_id, precio } = req.body;

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

app.get('/api/mercado/ofertas', async (req, res) => {
    try {
        const ofertas = await pool.query(
            `SELECT m.id, m.precio_oro, m.vendedor_id, j.nombre, j.rareza, j.bandera, u.username AS nombre_vendedor,
                    EXTRACT(EPOCH FROM (m.fecha_publicacion + INTERVAL '1 day' - NOW())) AS segundos_restantes
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

// Limpiador automático del Mercado P2P
setInterval(async () => {
    console.log("🧹 Revisando vitrinas del mercado para limpiar pases vencidos...");
    try {
        const vencidas = await pool.query(
            "SELECT id, vendedor_id, jugador_id FROM mercado_pases WHERE fecha_publicacion < NOW() - INTERVAL '1 day'"
        );

        if (vencidas.rows.length > 0) {
            console.log(`📦 Encontradas ${vencidas.rows.length} ofertas vencidas. Devolviendo cromos...`);
            for (let oferta of vencidas.rows) {
                // Corregido con EXCLUDED
                await pool.query(
                    `INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1)
                     ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad`,
                    [oferta.vendedor_id, oferta.jugador_id]
                );
                await pool.query("DELETE FROM mercado_pases WHERE id = $1", [oferta.id]);
            }
            console.log("✅ Devolución y limpieza completada.");
        }
    } catch (err) {
        console.error("❌ Error crítico en el limpiador del mercado:", err.message);
    }
}, 15 * 60 * 1000); 

app.post('/api/mercado/comprar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { oferta_id } = req.body; 

    try {
        // 1. Buscamos la oferta en tu tabla real mercado_pases
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

        // Intercambio de Oro
        await pool.query("UPDATE usuarios SET monedas = monedas - $1 WHERE id = $2", [precio_oro, usuario_id]);
        await pool.query("UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2", [precio_oro, vendedor_id]);

        // Sincronización del Álbum (usuario_progreso)
        await pool.query(
            `INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1)
             ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad`,
            [usuario_id, jugador_id]
        );

        // Eliminamos la publicación de la vitrina
        await pool.query("DELETE FROM mercado_pases WHERE id = $1", [oferta_id]);

        // Obtenemos datos esenciales para la respuesta y el historial
        const infoJugador = await pool.query("SELECT nombre, rareza FROM jugadores WHERE id = $1", [jugador_id]);
        const checkOroNuevo = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);

        const nombreJugador = infoJugador.rows[0]?.nombre || "Desconocido";
        const rarezaJugador = infoJugador.rows[0]?.rareza || "comun";

        // 🟢 INYECCIÓN DEL FEED: Buscamos los nombres de usuario para registrar la transferencia
        const datosUsuarios = await pool.query(
            "SELECT id, username FROM usuarios WHERE id IN ($1, $2)",
            [vendedor_id, usuario_id]
        );
        
        let vendedorUsername = "Vendedor";
        let compradorUsername = "Comprador";

        datosUsuarios.rows.forEach(u => {
            if (u.id === usuario_id) compradorUsername = u.username;
            if (u.id === parseInt(vendedor_id)) vendedorUsername = u.username;
        });

        // Insertamos la fila en la tabla de registros comerciales globales
        await pool.query(
            `INSERT INTO historial_transferencias (vendedor_username, comprador_username, jugador_nombre, rareza, precio_oro)
             VALUES ($1, $2, $3, $4, $5)`,
            [vendedorUsername, compradorUsername, nombreJugador, rarezaJugador, precio_oro]
        );

        return res.json({ 
            ok: true, 
            jugador: nombreJugador,
            nuevoOro: checkOroNuevo.rows[0].monedas 
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ========================================================================
// 📈 FEED EN VIVO: ÚLTIMAS 5 TRANSFERENCIAS DEL MERCADO P2P
// ========================================================================
app.get('/api/mercado/historial', async (req, res) => {
    try {
        const query = `
            SELECT vendedor_username, comprador_username, jugador_nombre, rareza, precio_oro, fecha_registro,
                   EXTRACT(EPOCH FROM (NOW() - fecha_registro))::INT as segundos_atras
            FROM historial_transferencias
            ORDER BY fecha_registro DESC
            LIMIT 5;
        `;
        const result = await pool.query(query);
        res.json({ ok: true, historial: result.rows });
    } catch (err) {
        console.error("❌ Error al leer historial de transferencias:", err.message);
        res.status(500).json({ ok: false, error: "Error al recuperar el feed del mercado." });
    }
});

/* ========================================================================
   🎰 ENGINE QUINIELA COMBINADA (ROTATIVA Y ATÓMICA)
   ======================================================================== */
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

let partidosActivosQuiniela = [];

function rotarFixtureQuiniela() {
    const copia = [...BANCO_PARTIDOS_QUINIELA];
    const mezclados = copia.sort(() => 0.5 - Math.random());
    partidosActivosQuiniela = mezclados.slice(0, 3);
}

// Genera la terna inicial al prender el servidor
rotarFixtureQuiniela();

app.get('/api/timba/quiniela/partidos', (req, res) => {
    res.json({ ok: true, partidos: partidosActivosQuiniela });
});

app.post('/api/timba/quiniela', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    let { monto, elecciones } = req.body;

    try {
        monto = parseInt(monto);

        if (!monto || monto < 50) {
            return res.json({ ok: false, mensaje: "⚠️ El monto mínimo para la boleta es de 50 de Oro." });
        }

        const checkUser = await pool.query("SELECT monedas, ultimo_giro_timestamp, timbas_hoy FROM usuarios WHERE id = $1", [usuario_id]);
        if (checkUser.rows.length === 0) {
            return res.json({ ok: false, mensaje: "❌ Usuario no encontrado." });
        }

        const usuario = checkUser.rows[0];

        if (usuario.monedas < monto) {
            return res.json({ ok: false, mensaje: "❌ No tenés suficiente Oro in tu cuenta para esta jugada." });
        }

        let { timbasActuales } = calcularTimbasActuales(usuario);

        if (timbasActuales <= 0) {
            return res.json({ 
                ok: false, 
                mensaje: "❌ ¡Te quedaste sin energía para apostar en la quiniela! Esperá a que recargue el cronómetro. ⏱️" 
            });
        }

        const nuevasTimbasGuardadas = timbasActuales - 1;
        const ahora = new Date();

        // Guardamos una copia exacta de los partidos con los que el usuario jugó esta boleta
        // antes de tirarlos a la basura y rotar la cartelera
        const partidosDeEstaBoleta = [...partidosActivosQuiniela];

        await pool.query(
            `UPDATE usuarios SET monedas = monedas - $1, ultimo_giro_timestamp = $2, timbas_hoy = $3 WHERE id = $4`,
            [monto, ahora, nuevasTimbasGuardadas, usuario_id]
        );

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

        await pool.query(
            "INSERT INTO quiniela_apuestas (usuario_id, monto_apostado, predicciones, ganada, premio_entregado) VALUES ($1, $2, $3, $4, $5)",
            [usuario_id, monto, JSON.stringify(elecciones), boletaGanadora, premio]
        );

        const checkOroFinal = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);

        // 🔥 LA SOLUCIÓN: Forzamos la rotación inmediata acá en el servidor.
        // La próxima consulta que haga el frontend va a encontrar una terna nuevita de la tartera.
        rotarFixtureQuiniela();

        return res.json({
            ok: true,
            ganó: boletaGanadora,
            mensaje: mensaje,
            resultadosReales: reales,
            partidosSimulados: partidosDeEstaBoleta, // Le mandamos los que corresponden a la jugada real
            nuevoOro: checkOroFinal.rows[0].monedas
        });

    } catch (err) {
        console.error("❌ Error en la quiniela:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ========================================================================
// 🏅 ENDPOINTS SEGUROS PARA EL SISTEMA DE MISIONES DIARIAS (CONEXIÓN NEON)
// ========================================================================

// 1. OBTENER LAS MISIONES DIARIAS ACTUALES DEL JUGADOR (CON RESET DIARIO AUTOMÁTICO - FIX STRING PLANO)
app.get('/api/misiones/obtener', verificarToken, async (req, res) => {
    const usuarioId = req.usuarioLogueado.id; // Sincronizado con tu middleware real
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 🕵️‍♂️ 1. Control del tiempo real (GMT-3 para la Arena en Buenos Aires)
        const ahora = new Date();
        const opcionesFecha = { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' };
        const [mes, dia, anio] = ahora.toLocaleDateString('en-US', opcionesFecha).split('/');
        const fechaHoyString = `${anio}-${mes}-${dia}`; // Formato limpio YYYY-MM-DD sin interferencia de horas

        // 🔑 2. Chequeamos la marca del último reset directamente como formato texto desde PostgreSQL
        // 🛡️ Al usar TO_CHAR evitamos que JavaScript intente instanciar un Date y le reste 3 horas por desfase UTC
        const userCheck = await client.query(
            "SELECT TO_CHAR(ultimo_reset_misiones, 'YYYY-MM-DD') as ultimo_reset FROM usuarios WHERE id = $1",
            [usuarioId]
        );

        if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ ok: false, error: "Usuario no encontrado en la Arena." });
        }

        // Leemos la string plana pura del registro (Ej: '2026-06-29' o null)
        const fechaUltimoResetString = userCheck.rows[0].ultimo_reset;

        // ♻️ 3. EL DISPARADOR DEL RESET: Si nunca reseteó o si cambió la fecha del calendario local
        if (!fechaUltimoResetString || fechaUltimoResetString !== fechaHoyString) {
            
            // Ponemos a 0 el progreso de todas las misiones de tu tabla 'usuario_misiones'
            await client.query(`
                UPDATE usuario_misiones 
                SET progreso = 0, reclamada = FALSE, actualizado_en = NOW()
                WHERE usuario_id = $1
            `, [usuarioId]);

            // Guardamos la marca de hoy en el usuario para bloquear nuevos resets hasta mañana
            await client.query(`
                UPDATE usuarios 
                SET ultimo_reset_misiones = $1 
                WHERE id = $2
            `, [fechaHoyString, usuarioId]);

            console.log(`♻️ ¡Silbatazo de medianoche! Cartelera reseteada a 0 para el usuario ${usuarioId} (Fecha: ${fechaHoyString})`);
        }

        // 4. Traemos los datos frescos (Ya sea limpios o en progreso de hoy)
        const resultado = await client.query(
            "SELECT id, mision_id, descripcion, tipo, progreso, meta, recompensa, reclamada FROM usuario_misiones WHERE usuario_id = $1 ORDER BY mision_id ASC",
            [usuarioId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, misiones: resultado.rows });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en /misiones/obtener con reset dinámico:", err.message);
        res.status(500).json({ error: "Error en el servidor al cargar u optimizar misiones." });
    } finally {
        client.release();
    }
});

// 2. SINCRONIZAR PROGRESO DE MISIONES (REEMPLAZO DE TRACKEAR)
app.post('/api/misiones/trackear', verificarToken, async (req, res) => {
    try {
        const { tipo, cantidad } = req.body;
        const usuarioId = req.usuarioLogueado.id; // 🔥 Sincronizado con tu middleware real

        // 🛡️ Consulta Atómica en Postgres: Incrementa el progreso sin pasarse de la meta
        const queryUpdate = `
            UPDATE usuario_misiones 
            SET progreso = LEAST(progreso + $1, meta), actualizado_en = NOW()
            WHERE usuario_id = $2 AND tipo = $3 AND reclamada = FALSE;
        `;
        await pool.query(queryUpdate, [cantidad || 1, usuarioId, tipo]);

        // Traemos la lista actualizada completa para que el front redibuje los porcentajes
        const misionesActualizadas = await pool.query(
            "SELECT id, mision_id, descripcion, tipo, progreso, meta, recompensa, reclamada FROM usuario_misiones WHERE usuario_id = $1 ORDER BY mision_id ASC",
            [usuarioId]
        );

        // Retornamos el formato exacto que espera recibir el front en el .json()
        res.json({ ok: true, misiones: misionesActualizadas.rows });

    } catch (err) {
        console.error("❌ Error en /misiones/trackear:", err.message);
        res.status(500).json({ error: "Error al actualizar misiones en el servidor." });
    }
});

// 3. RECLAMAR EL PREMIO DE FORMA BLINDADA (REEMPLAZO DE RECLAMAR)
app.post('/api/misiones/reclamar', verificarToken, async (req, res) => {
    try {
        const { misionId } = req.body; // Viene el ID de la fila desde el botón del cliente
        const usuarioId = req.usuarioLogueado.id; // 🔥 Sincronizado con tu middleware real

        // 1. Buscamos la misión específica para verificar su estado en el Servidor
        const buscarMision = await pool.query(
            "SELECT * FROM usuario_misiones WHERE usuario_id = $1 AND id = $2",
            [usuarioId, misionId]
        );

        if (buscarMision.rows.length === 0) {
            return res.status(404).json({ error: "Misión no encontrada." });
        }
        
        const mision = buscarMision.rows[0];

        if (mision.progreso < mision.meta) {
            return res.status(400).json({ error: "Objetivo no cumplido todavía." });
        }
        if (mision.reclamada) {
            return res.status(400).json({ error: "Esta recompensa ya fue cobrada." });
        }

        // 2. Transacción Blindada: Marcamos como reclamada
        await pool.query(
            "UPDATE usuario_misiones SET reclamada = TRUE WHERE id = $1",
            [misionId]
        );

        // 3. 🔥 REGLA DE ORO AUTOMÁTICA: Sumamos las monedas directo a la tabla usuarios
        const queryOro = `
            UPDATE usuarios 
            SET monedas = monedas + $1 
            WHERE id = $2 
            RETURNING monedas;
        `;
        const resultadoUsuario = await pool.query(queryOro, [mision.recompensa, usuarioId]);
        const nuevoOro = resultadoUsuario.rows[0].monedas;

        // 4. Buscamos el estado final de todas las misiones para el cliente
        const misionesFinales = await pool.query(
            "SELECT id, mision_id, descripcion, tipo, progreso, meta, recompensa, reclamada FROM usuario_misiones WHERE usuario_id = $1 ORDER BY mision_id ASC",
            [usuarioId]
        );

        // Enviamos la respuesta limpia con el nuevo saldo de Oro calculado por Neon
        res.json({ 
            ok: true, 
            monedas: nuevoOro, 
            misiones: misionesFinales.rows 
        });

    } catch (err) {
        console.error("❌ Error en /misiones/reclamar:", err.message);
        res.status(500).json({ error: "Error al procesar el cobro en el servidor." });
    }
});

// ========================================================================
// 🎁 RECOMPENSAS DIARIAS: RECLAMO ATÓMICO EN ZONA HORARIA ARGENTINA (FIXED)
// ========================================================================
app.post('/api/usuarios/reclamar-diario', verificarToken, async (req, res) => {
    try {
        const usuarioId = req.usuarioLogueado.id;
        
        const queryUser = "SELECT monedas, racha_login, ultimo_login_timestamp FROM usuarios WHERE id = $1";
        const userRes = await pool.query(queryUser, [usuarioId]);
        
        if (userRes.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado." });
        
        const user = userRes.rows[0];
        const ahora = new Date();
        let rachaActual = user.racha_login || 0;
        let ultimoLogin = user.ultimo_login_timestamp;
        
        const premiosOro = { 1: 100, 2: 200, 3: 350, 4: 500, 5: 750, 6: 1000, 7: 2500 };

        // 🛡️ FORMATEADOR EN ESPAÑOL LATAM (Forzado a GMT-3 de Buenos Aires)
        const opcionesZona = { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' };
        
        // Formateamos "HOY" en base a la hora de Buenos Aires
        const [mesH, diaH, anioH] = ahora.toLocaleDateString('en-US', opcionesZona).split('/');
        const stringHoy = `${anioH}-${mesH}-${diaH}`; // Genera '2026-06-29' real local

        if (ultimoLogin) {
            const ultimaFecha = new Date(ultimoLogin);
            
            // Formateamos el "ÚLTIMO LOGIN" usando exactamente la misma regla GMT-3
            const [mesU, diaU, anioU] = ultimaFecha.toLocaleDateString('en-US', opcionesZona).split('/');
            const stringUltimo = `${anioU}-${mesU}-${diaU}`;
            
            // A. Si las strings locales coinciden, ya cobró hoy en Argentina
            if (stringHoy === stringUltimo) {
                return res.json({ 
                    ok: false, 
                    mensaje: `⏳ Ya reclamaste tu premio de hoy, crack. ¡Volvé mañana para avanzar al Día ${rachaActual === 7 ? 1 : rachaActual + 1}!`,
                    racha: rachaActual
                });
            }

            // B. Calculamos la distancia matemática real basada en las medianoches locales
            const fechaBaseHoy = new Date(stringHoy + "T00:00:00");
            const fechaBaseUltimo = new Date(stringUltimo + "T00:00:00");
            const diferenciaDias = Math.round((fechaBaseHoy - fechaBaseUltimo) / (1000 * 60 * 60 * 24));

            if (diferenciaDias === 1) {
                rachaActual = rachaActual >= 7 ? 1 : rachaActual + 1;
            } else {
                rachaActual = 1; // Racha rota por colgarse más de 24 horas de calendario
            }
        } else {
            rachaActual = 1; // Primer login de la cuenta
        }

        const premioOtorgado = premiosOro[rachaActual] || 100;
        let regaloSobre = (rachaActual === 7);

        // 2. Impacto atómico en Neon
        const queryUpdate = `
            UPDATE usuarios 
            SET monedas = monedas + $1, racha_login = $2, ultimo_login_timestamp = NOW() 
            WHERE id = $3 
            RETURNING monedas;
        `;
        const updateRes = await pool.query(queryUpdate, [premioOtorgado, rachaActual, usuarioId]);
        const nuevoOroTotal = updateRes.rows[0].monedas;

        res.json({
            ok: true,
            mensaje: `🎁 ¡DÍA ${rachaActual} COMPLETO! Se te acreditaron 🪙${premioOtorgado} de Oro.`,
            racha: rachaActual,
            monedas: nuevoOroTotal,
            regaloSobre: regaloSobre
        });

    } catch (err) {
        console.error("❌ Error en /usuarios/reclamar-diario:", err.message);
        res.status(500).json({ error: "Error interno al procesar recompensa diaria." });
    }
});

// ========================================================================
// 🦾 BOT COMERCIANTE: CARTELERA DE CONTRATOS CON ROTACIÓN SEMANAL
// ========================================================================

// 1️⃣ El Banco Central de Contratos (El pool grande de la Arena)
const POOL_GLOBAL_SBC = [
    { id: 101, titulo: "⚔️ DESAFÍO ALBICELESTE", descripcion: "Entregá 3 jugadores COMUNES de ARGENTINA.", requisitos: { cantidad: 3, rareza: "comun", pais: "argentina" }, recompensa: { tipo: "oro_directo", valor: 1500 } },
    { id: 102, titulo: "🇧🇷 JOGO BONITO TRADER", descripcion: "El Bot busca 2 cracks de rareza ÉPICA de BRASIL.", requisitos: { cantidad: 2, rareza: "epica", pais: "brasil" }, recompensa: { tipo: "oro_directo", valor: 3500 } },
    { id: 103, titulo: "🇪🇺 MURALLA EUROPEA", descripcion: "Sacrificá 3 jugadores RAROS nacidos en FRANCIA.", requisitos: { cantidad: 3, rareza: "rara", pais: "francia" }, recompensa: { tipo: "oro_directo", valor: 5000 } },
    { id: 104, titulo: "🦁 ORGULLO INGLÉS", descripcion: "Entregá 2 cracks de rareza LEGENDARIA nacidos en INGLATERRA.", requisitos: { cantidad: 2, rareza: "legendaria", pais: "inglaterra" }, recompensa: { tipo: "oro_directo", valor: 8000 } },
    { id: 105, titulo: "🇪🇸 FURIA ROJA DE INTERCAMBIO", descripcion: "El Bot exige 4 jugadores COMUNES nacidos en ESPAÑA.", requisitos: { cantidad: 4, rareza: "comun", pais: "españa" }, recompensa: { tipo: "oro_directo", valor: 2000 } },
    { id: 106, titulo: "🇮🇹 CANDADO AZZURRO", descripcion: "Sacrificá 2 jugadores RAROS nacidos en ITALIA.", requisitos: { cantidad: 2, rareza: "rara", pais: "italia" }, recompensa: { tipo: "oro_directo", valor: 4000 } }
];

// 🔄 FUNCIÓN MATEMÁTICA: Devuelve el número de semana del año calendario actual
function obtenerNumeroSemanaActual() {
    const ahora = new Date();
    const principioDeAño = new Date(ahora.getFullYear(), 0, 1);
    const milisegundosPasados = ahora - principioDeAño;
    const diasPasados = Math.floor(milisegundosPasados / (1000 * 60 * 60 * 24));
    return Math.ceil((diasPasados + principioDeAño.getDay() + 1) / 7);
}

// 🔄 FUNCIÓN FILTRADORA: Elige dinámicamente qué contratos mostrar esta semana
function obtenerContratosDeLaSemana() {
    const numeroSemana = obtenerNumeroSemanaActual();
    const cantidadAExhibir = 2; // Cuántos contratos querés activos en simultáneo
    
    const contratosRotativos = [];
    for (let i = 0; i < cantidadAExhibir; i++) {
        // La magia del residuo (%): va recorriendo el array de forma circular semana a semana
        const indiceCalculado = (numeroSemana + i) % POOL_GLOBAL_SBC.length;
        contratosRotativos.push(POOL_GLOBAL_SBC[indiceCalculado]);
    }
    return contratosRotativos;
}

// 2️⃣ Endpoint Actualizado: Devuelve solo los contratos que tocan esta semana
app.get('/api/contratos/activo', verificarToken, (req, res) => {
    const contratosActivos = obtenerContratosDeLaSemana();
    res.json({ ok: true, contratos: contratosActivos });
});

// 3️⃣ Endpoint Atómico de Procesamiento (Se mantiene dinámico y blindado)
app.post('/api/contratos/completar', verificarToken, async (req, res) => {
    const usuarioId = req.usuarioLogueado.id;
    const { contratoId, jugadorIds } = req.body;

    // 🛡️ IMPORTANTE: El usuario solo puede completar un contrato si está en la rotación activa actual
    const contratosPermitidosHoy = obtenerContratosDeLaSemana();
    const contratoElegido = contratosPermitidosHoy.find(c => c.id === Number(contratoId));
    
    if (!contratoElegido) {
        return res.status(404).json({ ok: false, mensaje: "❌ Este contrato no está disponible en la cartelera de esta semana." });
    }

    const reqConfig = contratoElegido.requisitos;

    if (!jugadorIds || !Array.isArray(jugadorIds) || jugadorIds.length !== reqConfig.cantidad) {
        return res.status(400).json({ ok: false, mensaje: `⚠️ Debés seleccionar exactamente ${reqConfig.cantidad} jugadores.` });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const jId of jugadorIds) {
            const queryJugador = "SELECT nombre, pais, rareza FROM jugadores WHERE id = $1";
            const jugRes = await client.query(queryJugador, [jId]);

            if (jugRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.json({ ok: false, mensaje: "❌ Uno de los jugadores no existe en la Arena." });
            }

            const j = jugRes.rows[0];
            if (j.rareza.toLowerCase() !== reqConfig.rareza.toLowerCase() || j.pais.toLowerCase() !== reqConfig.pais.toLowerCase()) {
                await client.query('ROLLBACK');
                return res.json({ ok: false, mensaje: `❌ ${j.nombre.toUpperCase()} no cumple los requisitos vigentes.` });
            }

            const queryProgreso = "SELECT cantidad FROM usuario_progreso WHERE usuario_id = $1 AND jugador_id = $2";
            const progRes = await client.query(queryProgreso, [usuarioId, jId]);
            const cantidadDisponible = progRes.rows[0]?.cantidad || 0;

            if (cantidadDisponible <= 1) {
                await client.query('ROLLBACK');
                return res.json({ ok: false, mensaje: `❌ No tenés copias REPETIDAS suficientes de ${j.nombre.toUpperCase()}.` });
            }
        }

        for (const jId of jugadorIds) {
            await client.query(`UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2`, [usuarioId, jId]);
        }

        const premioOro = contratoElegido.recompensa.valor;
        const userRes = await client.query(`UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2 RETURNING monedas`, [premioOro, usuarioId]);
        const nuevoOroTotal = userRes.rows[0].monedas;

        await client.query('COMMIT');
        res.json({ ok: true, nuevoOro: nuevoOroTotal, mensaje: `💪 ¡CONTRATO CERRADO! El Bot procesó la rotación y te acreditó 🪙 ${premioOro} de Oro.` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ ok: false, error: "Error interno en los servidores." });
    } finally {
        client.release();
    }
});

/* ========================================================================
   🚨 CONFIGURACIÓN Y ENDPOINT SEGURO DE ANUNCIOS GLOBAL
   ======================================================================== */
const CONFIG_ANUNCIO_SERVIDOR = {
    activo: true,       
    tipo: "video",      
    titulo: "¡ACTUALIZACIÓN DE TEMPORADA!",
    texto: "Prendete a los nuevos torneos en vivo. Calibramos el MiniMundial para que sea más justo, lanzamos el Mercado P2P y habilitamos la cartelera de objetivos diarios. ¡Mirá el video, crack!",
    urlImagen: "https://albumpe.onrender.com/assets/novedad.png", 
    urlVideo: "https://www.youtube.com/embed/Nl_tZ2StsSs",
    
    informe: {
        version: "v2.5.0-Arena",
        fecha: "Junio 2026",
        cambios: [
            "🏆 **Mini-Mundial Atómico:** Inscripciones gratuitas en el Draft. El Oro o cartas repetidas se debitan en Neon recién al presionar 'Iniciar', con cronogramas y líneas de tiempo precalculadas por el servidor.",
            "💸 **Mercado de Pases P2P:** Vitrina internacional activa. Las ofertas duran 24 horas y devuelven el cromo automáticamente si nadie compra.",
            "🎯 **Objetivos Diarios:** Añadida cartelera de misiones diarias con reinicio atómico sincronizado a la medianoche (GMT-3) y función estética para colapsar/ocultar el panel cuando quieras.",
            "🛡️ **Control de Rachas & Servidor:** Corregido el desfase ISO en el login diario forzando la hora local de Argentina para evitar bloqueos falsos al reclamar tu recompensa.",
            "📖 **Guía Actualizada:** Renovado el modal de reglas con las mecánicas del Bot Comerciante, contratos y el funcionamiento real de las arenas."
        ]
    }
};

app.get('/api/anuncio-actual', (req, res) => {
    // 🟢 Sincronizado dinámicamente con la configuración multimedia completa
    res.json(CONFIG_ANUNCIO_SERVIDOR);
});

/* ========================================================================
   🚀 INICIALIZACIÓN DEL SERVIDOR
   ======================================================================== */
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en la Nube / Red Local activo en puerto ${PORT}`);
});
