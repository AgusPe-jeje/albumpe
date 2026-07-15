/* ========================================================================
   📦 REQUERIMIENTOS, CONFIGURACIONES INICIALES Y CACHÉ
   ======================================================================== */
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); 
const path = require('path');
const jwt = require('jsonwebtoken'); 

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: {
    rejectUnauthorized: false // Requisito obligatorio para conectar Render con Neon de forma segura
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_super_segura_para_la_arena';

app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ========================================================================
   🔄 ENDPOINT DE MANTENIMIENTO: ANTI-SLEEP (KEEP ALIVE)
   ======================================================================== */
app.get('/api/ping', (req, res) => {
    // Respuesta ultra liviana de 2 bytes para que el cron jamás sature el buffer
    res.status(200).send("OK");
});

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
        req.usuarioLogueado = verificado; 
        next();
    } catch (err) {
        return res.status(403).json({ ok: false, error: "❌ Sesión inválida o expirada. Volvé a loguearte." });
    }
};

/* ========================================================================
   🛠️ MIDDLEWARE: MODO MANTENIMIENTO / ACCESO SELECTIVO TESTERS
   ======================================================================== */
const MODO_MANTENIMIENTO = false; 
const TESTERS_PERMITIDOS = ["aguspe", "evepro"]; 

app.use((req, res, next) => {
    if (!MODO_MANTENIMIENTO) {
        return next();
    }

   // ⚡ EXCEPCIÓN INTEGRADA: Permitimos el ping técnico y los estáticos libres de logs
    if (req.path === '/api/ping') {
        return next();
    }

    if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html') || req.path.endsWith('.css') || req.path.endsWith('.js') || req.path.endsWith('.png') || req.path.endsWith('.jpg') || req.path.endsWith('.svg'))) {
        return next();
    }

    if (req.path.startsWith('/api/login')) {
        const { username } = req.body;
        if (username && TESTERS_PERMITIDOS.includes(username.trim().toLowerCase())) {
            return next();
        }
        return res.status(503).json({ 
            ok: false,
            error: "🚧 La Arena está en mantenimiento por reformas de infraestructura. ¡Volvé más tarde, pa! 🏗️" 
        });
    }

    if (req.path.startsWith('/api/registro')) {
        return res.status(503).json({ 
            ok: false,
            error: "🚧 La Arena está en mantenimiento. El registro de nuevas cuentas está cerrado por el momento." 
        });
    }

    if (
        req.path.startsWith('/api/anuncio-actual') || 
        req.path.startsWith('/api/logout') ||
        req.path.startsWith('/api/usuarios/opciones-avatar-inicial')
    ) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next();
    }

    try {
        const decodificado = jwt.verify(token, JWT_SECRET);
        if (decodificado && decodificado.username && TESTERS_PERMITIDOS.includes(decodificado.username.trim().toLowerCase())) {
            return next(); 
        }
    } catch (err) {
        console.warn("⚠️ Intento de bypass con token inválido en mantenimiento.");
    }

    return res.status(503).json({ 
        ok: false,
        mantenimiento: true, 
        error: "🚧 La Arena está en mantenimiento por reformas de infraestructura. Acceso exclusivo para Testers oficiales." 
    });
});

app.use(express.static(path.join(__dirname)));

/* ========================================================================
   📦 CONFIGURACIÓN, INICIALIZACIÓN Y CARGA DE BASE DE DATOS (NEON)
   ======================================================================== */
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
            ultima_timba_mundial TIMESTAMP WITH TIME ZONE DEFAULT NULL,
            ultimo_reset_misiones VARCHAR(10) DEFAULT NULL,
            racha_login INTEGER DEFAULT 0,
            ultimo_login_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NULL,
            foto_perfil_id INTEGER DEFAULT 1,
            cromo_destacado TEXT DEFAULT NULL,
            timbas_jugadas INTEGER DEFAULT 0, 
            timbas_ganadas_exacto INTEGER DEFAULT 0,
            timbas_ganadas_signo INTEGER DEFAULT 0
        )`);

        // 📸 1.5. Catálogo de Fotos de Perfil
        await pool.query(`CREATE TABLE IF NOT EXISTS fotos_perfil (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            ruta_jpg VARCHAR(255) NOT NULL
        )`);

        // 🔏 1.6. Tabla Intermedia de Posesión de Avatares
        await pool.query(`CREATE TABLE IF NOT EXISTS usuario_fotos_perfil (
            usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
            foto_id INTEGER REFERENCES fotos_perfil(id) ON DELETE CASCADE,
            PRIMARY KEY (usuario_id, foto_id)
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

        // 4.5. Tabla de Historial Comercial Global
        await pool.query(`CREATE TABLE IF NOT EXISTS historial_transferencias (
            id SERIAL PRIMARY KEY,
            vendedor_username VARCHAR(50) NOT NULL,
            comprador_username VARCHAR(50) NOT NULL,
            jugador_nombre VARCHAR(100) NOT NULL,
            rareza VARCHAR(20) NOT NULL,
            precio_oro INTEGER NOT NULL,
            fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`);

        // 7. Tabla de Control de Resets de Lunes (🔥 ¡FALTABA ESTA FILA EN TU BACKEND!)
        await pool.query(`CREATE TABLE IF NOT EXISTS registro_resets_semanales (
            fecha_reset VARCHAR(10) PRIMARY KEY
        )`);

        // 8. Tabla de Control de Objetivos Diarios
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

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usuario_misiones_uid ON usuario_misiones(usuario_id)`);

        console.log('Stadium Init: 🏟️ Todas las tablas de la Arena Online inicializadas con éxito en Neon.');

        // SEED DIAL: CARGA DE AVATARES DE PERFIL
        const checkFotos = await pool.query("SELECT COUNT(*) as count FROM fotos_perfil");
        if (parseInt(checkFotos.rows[0].count) === 0) {
            const listaFotosPerfil = [
                ['Alemania', 'fotos/_alemania.jpg'], ['Argentina', 'fotos/_argentina.jpg'],
                ['Argentina', 'fotos/_argentina2.jpg'], ['Brasil', 'fotos/_brasil.jpg'],
                ['Canada', 'fotos/_canada.jpg'], ['Colombia', 'fotos/_colombia.jpg'],
                ['Croacia', 'fotos/_croacia.jpg'], ['Ecuador', 'fotos/_ecuador.jpg'],
                ['España', 'fotos/_españa.jpg'], ['Paises Bajos', 'fotos/_holanda.jpg'],
                ['Inglaterra', 'fotos/_inglaterra.jpg'], ['Mexico', 'fotos/_mexico.jpg'],
                ['Mexico', 'fotos/_mexico1.jpg'], ['Uruguay', 'fotos/_uruguay.jpg'],
                ['Jugadores Colombia', 'fotos/juadorescolombia.jpg'], ['Jugadores Ecuador', 'fotos/juagadoresecuador.jpg'],
                ['Jugadores Paises Bajos', 'fotos/juagorespaisesbajos.jpg'], ['Jugadores Ghana', 'fotos/jugadores_ghana.jpg'],
                ['Jugadores Argentina', 'fotos/jugadoresargentina.jpg'], ['Jugadores Brasil', 'fotos/jugadoresbrasil.jpg'],
                ['Jugadores España', 'fotos/jugadoresespaña.jpg'], ['Jugadores Francia', 'fotos/jugadoresfrancia.jpg'],
                ['Jugadores Marruecos', 'fotos/jugadoresmarruecos.jpg'], ['Jugadores Mexico', 'fotos/jugadoresmexico.jpg'],
                ['Jugadores Portugal', 'fotos/jugadoresportugal.jpg']
            ];

            for (const fp of listaFotosPerfil) {
                await pool.query("INSERT INTO fotos_perfil (nombre, ruta_jpg) VALUES ($1, $2)", [fp[0], fp[1]]);
            }
            console.log(`📸 [AVATARES] Catálogo de ${listaFotosPerfil.length} banderas inicializado.`);
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
        const userCheck = await pool.query("SELECT * FROM usuarios WHERE username = $1", [username.trim()]);
          
        if (userCheck.rows.length === 0) {
             return res.status(400).json({ error: "❌ El usuario no existe. ¡Registrate primero!" });
        }

        const user = userCheck.rows[0];
        
        if (user.password === password) {
             console.log(`🔑 [LOGIN] El usuario "${username}" ingresó a la Arena.`);
             
             const queryVerificarMisionesLogin = `
                 INSERT INTO usuario_misiones (usuario_id, mision_id, descripcion, tipo, meta, recompensa)
                 VALUES 
                     ($1, 1, 'Abrir 3 sobres de cualquier rareza en la Tienda', 'sobres', 3, 250),
                     ($1, 2, 'Firmar un contrato de intercambio con el Bot Comerciante', 'trade', 1, 400),
                     ($1, 3, 'Alinear tus cromos y disputar un cruce en el MiniMundial', 'mundial', 1, 300)
                 ON CONFLICT (usuario_id, mision_id) DO NOTHING;
             `;
             await pool.query(queryVerificarMisionesLogin, [user.id]);

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
                return res.status(400).json({ error: "❌ Límite excedido: Ya se creó una cuenta desde esta conexión." });
            }
        }

        const nuevoUsuario = await pool.query(
            "INSERT INTO usuarios (username, password, ip_registro) VALUES ($1, $2, $3) RETURNING *", 
            [username.trim().toLowerCase(), password, ipCliente]
        );
        
        const nuevoUsuarioId = nuevoUsuario.rows[0].id;

        const queryMisionesIniciales = `
            INSERT INTO usuario_misiones (usuario_id, mision_id, descripcion, tipo, meta, recompensa)
            VALUES 
                ($1, 1, 'Abrir 3 sobres de cualquier rareza en la Tienda', 'sobres', 3, 250),
                ($1, 2, 'Firmar un contrato de intercambio con el Bot Comerciante', 'trade', 1, 400),
                ($1, 3, 'Alinear tus cromos y disputar un cruce en el MiniMundial', 'mundial', 1, 300)
            ON CONFLICT (usuario_id, mision_id) DO UPDATE 
            SET progreso = 0, reclamada = FALSE, actualizado_en = CURRENT_TIMESTAMP;
        `;
        
        await pool.query(queryMisionesIniciales, [nuevoUsuarioId]);

        await pool.query(
            "INSERT INTO usuario_fotos_perfil (usuario_id, foto_id) VALUES ($1, 1) ON CONFLICT DO NOTHING",
            [nuevoUsuarioId]
        );

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
    res.json({ success: true, mensaje: "Sesión cerrada en el servidor" });
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

    let costo = 250; let probLegendaria = 0.015; let probEpica = 0.10; let probRara = 0.25;        

    if (tipoCofre === 'plata') {
        costo = 100; probLegendaria = 0.001; probEpica = 0.03; probRara = 0.15;    
    } 
    else if (tipoCofre === 'legendario') {
        costo = 500; probLegendaria = 0.08; probEpica = 0.30; probRara = 0.40;    
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

            if (rand < probLegendaria) rarezaElegida = 'legendaria';
            else if (rand < probLegendaria + probEpica) rarezaElegida = 'epica';
            else if (rand < probLegendaria + probEpica + probRara) rarezaElegida = 'rara'; 

            let poolFiltrado = todosLosJugadores.filter(j => j.rareza === rarezaElegida);
            if (poolFiltrado.length === 0) poolFiltrado = todosLosJugadores.filter(j => j.rareza === 'comun');
            
            let elegido = poolFiltrado[Math.floor(Math.random() * poolFiltrado.length)];
            sobreAbierto.push({ ...elegido });
        }

        let reembolsoAvatar = 0;
        const PROBABILIDAD_AVATAR = 0.10; 
        
        if (Math.random() < PROBABILIDAD_AVATAR) {
            const fotoAzarQuery = await pool.query("SELECT id, nombre, ruta_jpg FROM fotos_perfil ORDER BY RANDOM() LIMIT 1");
            if (fotoAzarQuery.rows.length > 0) {
                const avatarGanado = fotoAzarQuery.rows[0];
                const yaLaTiene = await pool.query("SELECT 1 FROM usuario_fotos_perfil WHERE usuario_id = $1 AND foto_id = $2", [usuario_id, avatarGanado.id]);

                let esRepetido = false;
                if (yaLaTiene.rows.length === 0) {
                    await pool.query("INSERT INTO usuario_fotos_perfil (usuario_id, foto_id) VALUES ($1, $2)", [usuario_id, avatarGanado.id]);
                } else {
                    esRepetido = true; reembolsoAvatar = 100; 
                }

                sobreAbierto.push({
                    id: `avatar_${avatarGanado.id}`, 
                    nombre: avatarGanado.nombre,
                    foto: avatarGanado.ruta_jpg,
                    posicion: "AVATAR", 
                    rareza: "legendaria", 
                    es_foto_perfil: true, 
                    es_repetido_avatar: esRepetido,
                    obtenido: esRepetido ? 1 : 0
                });
            }
        }

        const nuevoOro = usuario.monedas - costo + reembolsoAvatar;
        await pool.query("UPDATE usuarios SET monedas = $1 WHERE id = $2", [nuevoOro, usuario_id]);

        for (let jugador of sobreAbierto) {
            if (jugador.es_foto_perfil) continue;

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
        console.error("❌ Error en pack opening mixto:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

/* ========================================================================
   ⚽ MODULO DE PENALES (SISTEMA DE ENERGÍA POR HORA)
   ======================================================================== */
const MAX_TIROS = 10;
const MILISEGUNDOS_POR_TIRO = 6 * 60 * 1000; 

function calcularTirosActuales(usuario) {
    const ahora = new Date();
    if (!usuario.ultimo_tiro_timestamp) return { tirosActuales: MAX_TIROS, tiempoParaSiguiente: 0 };

    const ultimoTiro = new Date(usuario.ultimo_tiro_timestamp);
    const tiempoTranscurrido = ahora - ultimoTiro;
    const tirosRegenerados = Math.floor(tiempoTranscurrido / MILISEGUNDOS_POR_TIRO);
    let tirosActuales = usuario.tiros_hoy + tirosRegenerados;

    if (tirosActuales >= MAX_TIROS) return { tirosActuales: MAX_TIROS, tiempoParaSiguiente: 0 };

    return { tirosActuales, tiempoParaSiguiente: MILISEGUNDOS_POR_TIRO - (tiempoTranscurrido % MILISEGUNDOS_POR_TIRO) };
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
            return res.json({ ok: false, error_limite: true, mensaje: "❌ ¡Te quedaste sin energía! Esperá a que se recupere un tiro. ⏱️" });
        }

        const nuevosTirosGuardados = tirosActuales - 1;
        let monedasGanadas = gano ? 100 : 0; let puntosGanados = gano ? 15 : 0;

        const nuevasMonedas = usuario.monedas + monedasGanadas;
        const nuevosPuntos = usuario.puntos_ranking + puntosGanados;

        await pool.query(
            `UPDATE usuarios SET monedas = $1, puntos_ranking = $2, ultimo_tiro_timestamp = $3, tiros_hoy = $4 WHERE id = $5`,
            [nuevasMonedas, nuevosPuntos, ahora, nuevosTirosGuardados, usuario_id]
        );
        
        return res.json({
            success: true,
            tiros_restantes: nuevosTirosGuardados,
            siguienteIn: nuevosTirosGuardados >= MAX_TIROS ? 0 : MILISEGUNDOS_POR_TIRO,
            datos: { monedas: nuevasMonedas, puntos_ranking: nuevosPuntos }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/ranking', async (req, res) => {
    try {
        const result = await pool.query("SELECT id, username, puntos_ranking FROM usuarios ORDER BY puntos_ranking DESC LIMIT 10");
        return res.json({ ranking: result.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/ranking-mundiales', async (req, res) => {
    try {
        const result = await pool.query("SELECT id, username, copas_mundiales FROM usuarios WHERE copas_mundiales > 0 ORDER BY copas_mundiales DESC, puntos_ranking DESC LIMIT 10");
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
    if (!usuario.ultimo_giro_timestamp) return { timbasActuales: MAX_TIMBAS, tiempoParaSiguienteTimba: 0 };

    const ultimoGiro = new Date(usuario.ultimo_giro_timestamp);
    const tiempoTranscurrido = ahora - ultimoGiro;
    const timbasRegeneradas = Math.floor(tiempoTranscurrido / MILISEGUNDOS_POR_TIMBA);
    let timbasActuales = usuario.timbas_hoy + timbasRegeneradas;

    if (timbasActuales >= MAX_TIMBAS) return { timbasActuales: MAX_TIMBAS, tiempoParaSiguienteTimba: 0 };

    return { timbasActuales, tiempoParaSiguienteTimba: MILISEGUNDOS_POR_TIMBA - (tiempoTranscurrido % MILISEGUNDOS_POR_TIMBA) };
}

const apuestasActivasServidor = {};

function generarGolesServidor() {
    const r = Math.random();
    if (r < 0.08) return 0;  
    if (r < 0.38) return 1;  
    if (r < 0.68) return 2;  
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
            const progCheck = await pool.query("SELECT cantidad FROM usuario_progreso WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugadorIdApostado]);
            if (progCheck.rows.length === 0 || progCheck.rows[0].cantidad <= 1) {
                return res.json({ ok: false, mensaje: "❌ No tenés stock de repetidas de ese cromo para apostar." });
            }
        }

        let { timbasActuales } = calcularTimbasActuales(usuario);
        if (timbasActuales <= 0) {
            return res.json({ ok: false, error_limite: true, mensaje: "❌ ¡Te quedaste sin energía para apostar! Esperá a que recargue el cronómetro. ⏱️" });
        }

        const nuevasTimbasGuardadas = timbasActuales - 1;
        await pool.query(`UPDATE usuarios SET ultimo_giro_timestamp = NOW(), timbas_hoy = $1 WHERE id = $2`, [nuevasTimbasGuardadas, usuario_id]);

        const golesLReal = generarGolesServidor(); const golesVReal = generarGolesServidor();
        const labelReal = `${golesLReal} - ${golesVReal}`;

        const ruletaCasilleros = Array(6).fill(null);
        const combinacionesUsadas = new Set([labelReal]);
        const casilleroGanadorAzar = Math.floor(Math.random() * 6);
        
        ruletaCasilleros[casilleroGanadorAzar] = { label: labelReal, tipo: 'exacto', idOpcion: casilleroGanadorAzar };

        function crearMarcadorRuleta() {
            const r = Math.random();
            if (r < 0.12) return { l: 0, v: 0 }; 
            if (r < 0.38) return { l: Math.floor(Math.random() * 3) + 1, v: Math.floor(Math.random() * 2) };
            if (r < 0.64) return { l: Math.floor(Math.random() * 2), v: Math.floor(Math.random() * 3) + 1 };
            if (r < 0.82) return { l: Math.floor(Math.random() * 2) + 2, v: Math.floor(Math.random() * 2) + 2 };
            return { l: Math.floor(Math.random() * 3) + 3, v: Math.floor(Math.random() * 3) };
        }

        for (let i = 0; i < 6; i++) {
            if (i === casilleroGanadorAzar) continue;
            let safeBucle = 0; let asignado = false;

            while (!asignado && safeBucle < 150) {
                safeBucle++;
                const marcador = crearMarcadorRuleta(); const combo = `${marcador.l} - ${marcador.v}`;
                if (!combinacionesUsadas.has(combo)) {
                    combinacionesUsadas.add(combo);
                    ruletaCasilleros[i] = { label: combo, tipo: 'ruido', idOpcion: i };
                    asignado = true;
                }
            }
            if (!ruletaCasilleros[i]) {
                ruletaCasilleros[i] = { label: `${golesLReal + i + 1} - ${golesVReal + i}`, tipo: 'ruido', idOpcion: i };
            }
        }

        const poolParaCliente = ruletaCasilleros.map(slot => ({ idOpcion: slot.idOpcion, label: slot.label }));
        apuestasActivasServidor[usuario_id] = { golesLReal, golesVReal, tipoApuesta, montoApuesta, jugadorIdApostado, mapeoOpciones: ruletaCasilleros };

        return res.json({ 
            ok: true, 
            opciones: poolParaCliente,
            timbas_restantes: nuevasTimbasGuardadas,
            siguienteIn: nuevasTimbasGuardadas >= MAX_TIMBAS ? 0 : MILISEGUNDOS_POR_TIMBA
        });
    } catch (err) {
        return res.status(500).json({ ok: false, mensaje: "Error en el servidor al preparar la ruleta." });
    }
});

app.post('/api/timba/procesar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { idOpcionElegida } = req.body;
    const apuesta = apuestasActivasServidor[usuario_id];

    if (!apuesta) return res.status(400).json({ ok: false, mensaje: "No hay una apuesta activa preparada." });

    const { golesLReal, golesVReal, tipoApuesta, montoApuesta, jugadorIdApostado, mapeoOpciones } = apuesta;
    const opcionElegida = mapeoOpciones.find(o => o.idOpcion === parseInt(idOpcionElegida)) || mapeoOpciones[idOpcionElegida];

    if (!opcionElegida) return res.status(400).json({ ok: false, mensaje: "Opción de apuesta inválida o alterada." });

    const labelReal = `${golesLReal} - ${golesVReal}`;
    const signoReal = golesLReal > golesVReal ? 'L' : (golesLReal < golesVReal ? 'V' : 'E');
    const [golesLElegidos, golesVElegidos] = opcionElegida.label.split(' - ').map(Number);
    const signoElegido = golesLElegidos > golesVElegidos ? 'L' : (golesLElegidos < golesVElegidos ? 'V' : 'E');

    let tipoDictamen = (opcionElegida.label === labelReal) ? 'exacto' : ((signoElegido === signoReal) ? 'signo' : 'error');
    let balanceMonedas = 0; let puntosAsignados = 0; let mensajeResultado = "";

    try {
        if (tipoApuesta === "monedas") {
            if (tipoDictamen === 'exacto') {
                balanceMonedas = montoApuesta * 3; puntosAsignados = 20;
                mensajeResultado = `¡QUÉ ANIMAL! Acertaste el resultado exacto (${golesLReal}-${golesVReal}).\nGanaste: ${balanceMonedas} monedas.`;
            } else if (tipoDictamen === 'signo') {
                balanceMonedas = Math.round(montoApuesta * 0.5);
                mensajeResultado = `¡BIEN AHÍ! Acertaste el ganador (${opcionElegida.label}). El resultado fue ${golesLReal}-${golesVReal}.\nGanaste: ${balanceMonedas} monedas.`;
            } else {
                balanceMonedas = -montoApuesta;
                mensajeResultado = `¡ERRASTE! El partido terminó ${golesLReal}-${golesVReal} y elegiste ${opcionElegida.label}.\nPerdiste: ${montoApuesta} monedas.`;
            }
            await pool.query("UPDATE usuarios SET monedas = monedas + $1, puntos_ranking = puntos_ranking + $2 WHERE id = $3", [balanceMonedas, puntosAsignados, usuario_id]);
        } else {
            const cardQuery = await pool.query("SELECT nombre, rareza FROM jugadores WHERE id = $1", [jugadorIdApostado]);
            const cromoApostado = cardQuery.rows[0]; const rarezaOriginal = cromoApostado.rareza.toLowerCase();

            if (tipoDictamen === 'exacto' || tipoDictamen === 'signo') {
                await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugadorIdApostado]);
                
                if (rarezaOriginal === "legendaria") {
                    let oroPremio = (tipoDictamen === 'exacto') ? 2500 : 1000; puntosAsignados = (tipoDictamen === 'exacto') ? 40 : 20;
                    await pool.query("UPDATE usuarios SET monedas = monedas + $1, puntos_ranking = puntos_ranking + $2 WHERE id = $3", [oroPremio, puntosAsignados, usuario_id]);
                    mensajeResultado = (tipoDictamen === 'exacto') ? `👑 ¡DIOS SANTO! Clavaste el resultado con tu Legendario.\n\n💰 ¡Cobrás 🪙2.500 MONEDAS!` : `💰 ¡BIEN AHÍ! Acertaste el ganador con tu Legendario.\n\n🎁 ¡Te llevás 🪙1.000 monedas!`;
                } else {
                    let rarezaPremio = rarezaOriginal;
                    if (tipoDictamen === 'exacto') {
                        if (rarezaOriginal === "comun") rarezaPremio = "rara";
                        else if (rarezaOriginal === "rara") rarezaPremio = "epica";
                        else if (rarezaOriginal === "epica") rarezaPremio = "legendaria";
                    }

                    const poolPremio = await pool.query("SELECT id, nombre, rareza FROM jugadores WHERE rareza = $1 ORDER BY RANDOM() LIMIT 1", [rarezaPremio]);
                    const cromoGanado = poolPremio.rows[0];

                    await pool.query(`INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1) ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad`, [usuario_id, cromoGanado.id]);

                    puntosAsignados = (tipoDictamen === 'exacto') ? 30 : 15;
                    await pool.query(`UPDATE usuarios SET monedas = monedas + $1, puntos_ranking = puntos_ranking + $2, timbas_jugadas = timbas_jugadas + 1, timbas_ganadas_exacto = timbas_ganadas_exacto + $3, timbas_ganadas_signo = timbas_ganadas_signo + $4 WHERE id = $5`, [0, puntosAsignados, (tipoDictamen === 'exacto' ? 1 : 0), (tipoDictamen === 'signo' ? 1 : 0), usuario_id]);

                    mensajeResultado = (tipoDictamen === 'exacto') ? `🔥 ¡PRO DISPARO! Acertaste el exacto (${golesLReal}-${golesVReal}).\n🎁 ¡EVOLUCIÓN! Te ganaste un cromo SUPERIOR: ${cromoGanado.nombre.toUpperCase()}` : `⚽ ¡GOOOL! Acertaste el ganador.\n🃏 La banca te devuelve otro cromo: ${cromoGanado.nombre.toUpperCase()}`;
                }
            } else {
                await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugadorIdApostado]);
                mensajeResultado = `❌ ¡CROMO PERDIDO! El partido terminó ${golesLReal}-${golesVReal}.\nPerdiste 1 copia de ${cromoApostado.nombre.toUpperCase()}.`;
            }
        }

        const userCheck = await pool.query("SELECT monedas, puntos_ranking FROM usuarios WHERE id = $1", [usuario_id]);
        delete apuestasActivasServidor[usuario_id];

        return res.json({ ok: true, mensajeResultado, golesLReal, golesVReal, datos: userCheck.rows[0] });
    } catch (err) {
        return res.status(500).json({ ok: false, mensaje: "Error en DB al procesar tu jugada." });
    }
});

/* ========================================================================
   🏆 MÓDULO MINIMUNDIAL (SINGLE PLAYER / BOTS / COOLDOWNS ATÓMICOS)
   ======================================================================== */
const COOLDOWN_MUNDIAL_MS = 3 * 60 * 60 * 1000; 
const VALOR_STATS_RAREZA = { 'comun': 60, 'rara': 75, 'epica': 85, 'legendaria': 96 };

function mezclarArray(arr) { return arr.sort(() => Math.random() - 0.5); }

const SELECCIONES_BOTS = [
    "Francia", "Brasil", "Alemania", "España", "Italia", "Inglaterra", 
    "Países Bajos", "Portugal", "Uruguay", "Croacia", "Bélgica", "Marruecos", 
    "Japón", "Senegal", "Estados Unidos", "Colombia", "México", "Argentina",
    "Ecuador", "Perú", "Chile", "Paraguay", "Venezuela", "Canadá", "Costa Rica",
    "Nigeria", "Egipto", "Argelia", "Túnez", "Ghana", "Corea del Sur", "Australia",
    "Arabia Saudita", "Irán", "Suiza", "Dinamarca", "Suecia", "Polonia", "Ucrania", "Austria"
];

app.get('/api/mundial/estado', verificarToken, async (req, res) => {
    const usuarioId = req.usuarioLogueado.id; 
    const client = await pool.connect();
    try {
        // 🛠️ FIX: Cambiamos "ultimo_mundial_timestamp" por el nombre real de tu columna: "ultima_timba_mundial"
        const userCheck = await client.query("SELECT copas_mundiales, ultima_timba_mundial FROM usuarios WHERE id = $1", [usuarioId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ ok: false, error: "Usuario inexistente." });

        const user = userCheck.rows[0]; 
        const ahora = new Date(); 
        let tiempoRestante = 0;

        const cooldownLimite = typeof COOLDOWN_MUNDIAL_MS !== 'undefined' ? COOLDOWN_MUNDIAL_MS : (4 * 60 * 60 * 1000);

        // 🛠️ FIX: Usamos el campo correcto aquí también
        if (user.ultima_timba_mundial) {
            const fechaDb = new Date(user.ultima_timba_mundial);
            
            if (!isNaN(fechaDb.getTime())) {
                const transcurrido = ahora.getTime() - fechaDb.getTime();
                if (transcurrido < cooldownLimite) {
                    tiempoRestante = cooldownLimite - transcurrido;
                }
            }
        }

        return res.json({ 
            ok: true, 
            copas: Number(user.copas_mundiales) || 0, 
            milisegundosRestantes: Math.floor(tiempoRestante) 
        });
    } catch (err) {
        console.error("❌ Error interno en /api/mundial/estado:", err);
        return res.status(500).json({ ok: false, error: "Error de sincronización en el servidor." });
    } finally { 
        client.release(); 
    }
});
app.post('/api/mundial/preparar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userCheck = await client.query("SELECT monedas, ultima_timba_mundial FROM usuarios WHERE id = $1 FOR UPDATE", [usuario_id]);
        if (userCheck.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, mensaje: "Usuario inválido." }); }

        const usuario = userCheck.rows[0];
        if (usuario.ultima_timba_mundial && (new Date() - new Date(usuario.ultima_timba_mundial) < COOLDOWN_MUNDIAL_MS)) {
            await client.query('ROLLBACK'); return res.json({ ok: false, elVestuarioEstaCerrado: true, mensaje: `⏳ Cooldown activo en el vestuario.` });
        }

        if (usuario.monedas < 1500) { await client.query('ROLLBACK'); return res.json({ ok: false, mensaje: "🪙 Se necesitan 1.500 monedas para la inscripción." }); }

        const paisesValidosQuery = await client.query(`SELECT j.pais FROM usuario_progreso up JOIN jugadores j ON up.jugador_id = j.id WHERE up.usuario_id = $1 AND up.cantidad > 0 GROUP BY j.pais HAVING COUNT(j.id) >= 3`, [usuario_id]);
        const paisesCandidatos = paisesValidosQuery.rows.map(r => r.pais);

        if (paisesCandidatos.length === 0) { await client.query('ROLLBACK'); return res.json({ ok: false, mensaje: "❌ Necesitás al menos 3 jugadores del mismo país desbloqueados." }); }

        const nuevoOro = usuario.monedas - 1500;
        await client.query("UPDATE usuarios SET monedas = $1, ultima_timba_mundial = NOW() WHERE id = $2", [nuevoOro, usuario_id]);

        const ternaFiltrada = mezclarArray([...paisesCandidatos]).slice(0, 3);
        let rivalClasificacion = SELECCIONES_BOTS[Math.floor(Math.random() * SELECCIONES_BOTS.length)];
        while (ternaFiltrada.includes(rivalClasificacion)) { rivalClasificacion = SELECCIONES_BOTS[Math.floor(Math.random() * SELECCIONES_BOTS.length)]; }

        await client.query('COMMIT');
        return res.json({ ok: true, terna: ternaFiltrada, rivalClasificacion, monedasActualizadas: nuevoOro });
    } catch (err) { await client.query('ROLLBACK'); return res.status(500).json({ ok: false, error: err.message }); } finally { client.release(); }
});

app.post('/api/mundial/jugar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { seleccionElegida, jugadorIds } = req.body;

    if (!jugadorIds || jugadorIds.length !== 3) return res.status(400).json({ ok: false, mensaje: "Alineá exactamente 3 jugadores." });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const jCheck = await client.query("SELECT j.rareza FROM usuario_progreso up JOIN jugadores j ON up.jugador_id = j.id WHERE up.usuario_id = $1 AND up.jugador_id = ANY($2) AND up.cantidad > 0", [usuario_id, jugadorIds]);

        if (jCheck.rows.length !== 3) { 
            await client.query('ROLLBACK'); 
            return res.json({ ok: false, mensaje: "❌ Error: Jugadores no disponibles en tu plantel." }); 
        }

        const promedio = jCheck.rows.reduce((acc, row) => acc + VALOR_STATS_RAREZA[row.rareza.toLowerCase()], 0) / 3;
        let estrellas = (promedio >= 90) ? 5 : ((promedio >= 79) ? 4 : ((promedio >= 70) ? 3 : ((promedio >= 62) ? 2 : 1)));

        // 🔥 DIFFICULTY BALANCE: Dificultad real escalada
        let chanceVictoriaGrupo = { 1: 0.15, 2: 0.35, 3: 0.55, 4: 0.75, 5: 0.90 }[estrellas] || 0.50;

        let botsDisponibles = mezclarArray(SELECCIONES_BOTS.filter(s => s !== seleccionElegida));
        const [rivalGrupo1, rivalGrupo2, rivalGrupo3] = botsDisponibles;
        const integrantesGrupo = [seleccionElegida, rivalGrupo1, rivalGrupo2, rivalGrupo3];

        function generarMinutosGolesFútbol(cantidad) {
            let minutos = [];
            while(minutos.length < cantidad) {
                let min = Math.floor(Math.random() * 29) * 3 + 3;
                if (!minutos.includes(min) && min !== 45 && min !== 90) minutos.push(min);
            }
            return minutos.sort((a, b) => a - b);
        }

        // ⚽ SIMULACIÓN CALIBRADA: Resultados más cerrados y realistas para fase de grupos
        function simularMatchCompleto(eq1, eq2, esUsuario) {
            const distribucionGoles = [0, 0, 1, 1, 2, 3];
            let g1 = distribucionGoles[Math.floor(Math.random() * distribucionGoles.length)];
            let g2 = distribucionGoles[Math.floor(Math.random() * distribucionGoles.length)];
            
            if (esUsuario) {
                if (Math.random() <= chanceVictoriaGrupo) {
                    if (g1 <= g2) g1 = g2 + 1;
                } else {
                    if (g1 > g2) {
                        g2 = Math.random() <= 0.40 ? g1 : g1 + 1;
                    }
                }
            }
            return { goles1: g1, goles2: g2, minutosEq1: generarMinutosGolesFútbol(g1), minutosEq2: generarMinutosGolesFútbol(g2) };
        }

        // GRUPOS: Fecha 1, 2 y 3
        let f1_m1 = simularMatchCompleto(seleccionElegida, rivalGrupo1, true);
        let f1_m2 = simularMatchCompleto(rivalGrupo2, rivalGrupo3, false);
        let bitacoraGrupo = [{ 
            fecha: 1, 
            local: seleccionElegida, visitante: rivalGrupo1, gL: f1_m1.goles1, gV: f1_m1.goles2, minutosL: f1_m1.minutosEq1, minutosV: f1_m1.minutosEq2, 
            botL: rivalGrupo2, botV: rivalGrupo3, gBL: f1_m2.goles1, gBV: f1_m2.goles2, minutosBL: f1_m2.minutosEq1, minutosBV: f1_m2.minutosEq2 
        }];

        let f2_m1 = simularMatchCompleto(seleccionElegida, rivalGrupo2, true);
        let f2_m2 = simularMatchCompleto(rivalGrupo1, rivalGrupo3, false);
        bitacoraGrupo.push({ 
            fecha: 2, 
            local: seleccionElegida, visitante: rivalGrupo2, gL: f2_m1.goles1, gV: f2_m1.goles2, minutosL: f2_m1.minutosEq1, minutosV: f2_m1.minutosEq2, 
            botL: rivalGrupo1, botV: rivalGrupo3, gBL: f2_m2.goles1, gBV: f2_m2.goles2, minutosBL: f2_m2.minutosEq1, minutosBV: f2_m2.minutosEq2 
        });

        let f3_m1 = simularMatchCompleto(seleccionElegida, rivalGrupo3, true);
        let f3_m2 = simularMatchCompleto(rivalGrupo1, rivalGrupo2, false);
        bitacoraGrupo.push({ 
            fecha: 3, 
            local: seleccionElegida, visitante: rivalGrupo3, gL: f3_m1.goles1, gV: f3_m1.goles2, minutosL: f3_m1.minutosEq1, minutosV: f3_m1.minutosEq2, 
            botL: rivalGrupo1, botV: rivalGrupo2, gBL: f3_m2.goles1, gBV: f3_m2.goles2, minutosBL: f3_m2.minutosEq1, minutosBV: f3_m2.minutosEq2 
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
            let difA = a.gf - a.gc;
            let difB = b.gf - b.gc;
            if (difB !== difA) return difB - difA;
            return b.gf - a.gf;
        });

        let posicionUsuario = tablaOrdenada.findIndex(r => r.pais === seleccionElegida) + 1;
        let clasificaALlaves = posicionUsuario <= 2; 

        let bitacoraPlayoffs = []; 
        let campeon = false; // El campeon de playoffs ahora se decidirá post-torneo en la UI o en llamadas dinámicas
        let faseAlcanzada = "Fase de Grupos";

        // 🏆 PLAYOFFS DE CÁLCULO DINÁMICO:
        // El servidor propone la base neutra de goles de cada partido y sus minutos,
        // pero la victoria real la decretará el transcurso del partido vivo en el frontend.
        if (clasificaALlaves) {
            const llaves = [
                { ronda: "Octavos de Final", rival: botsDisponibles[3] }, 
                { ronda: "Cuartos de Final", rival: botsDisponibles[4] },
                { ronda: "Semifinal", rival: botsDisponibles[5] }, 
                { ronda: "Gran Final del Mundo", rival: botsDisponibles[6] }
            ];
            
            for (let llave of llaves) {
                faseAlcanzada = llave.ronda;
                
                // Generamos un caudal de goles base cerrado pero equilibrado (de 0 a 2 goles)
                let gTu = Math.floor(Math.random() * 3); 
                let gRiv = Math.floor(Math.random() * 3); 
                
                bitacoraPlayoffs.push({ 
                    ronda: llave.ronda, 
                    rival: llave.rival, 
                    gL: gTu, 
                    gV: gRiv, 
                    minutosL: generarMinutosGolesFútbol(gTu), 
                    minutosV: generarMinutosGolesFútbol(gRiv) 
                });
            }
        }

        const ahora = new Date();
        // NOTA: Como la copa_mundial se reclama tras ganar la final de verdad en vivo, 
        // actualizamos la marca de timba del mundial para controlar enfriamientos de forma normal.
        await client.query("UPDATE usuarios SET ultima_timba_mundial = $1 WHERE id = $2", [ahora, usuario_id]);

        const userFinal = await client.query("SELECT monedas, puntos_ranking, copas_mundiales, torneos_ganados FROM usuarios WHERE id = $1", [usuario_id]);
        await client.query('COMMIT');

        return res.json({ 
            ok: true, 
            progreso: { 
                integrantesGrupo, 
                bitacoraGrupo, 
                clasifico: clasificaALlaves, 
                posicionFinalGrupo: posicionUsuario, 
                campeon, 
                faseAlcanzada, 
                bitacoraPlayoffs 
            }, 
            datosActualizados: userFinal.rows[0] 
        });
    } catch (err) { 
        await client.query('ROLLBACK'); 
        console.error("❌ Error estructural en /api/mundial/jugar:", err);
        return res.status(500).json({ ok: false, error: "Fallo estructural en la Arena." }); 
    } finally { 
        client.release(); 
    }
});

// =========================================================================
// 🎁 ENDPOINT SEGURO PARA ACREDITAR LA COPA GANADA EN CALIENTE
// =========================================================================
app.post('/api/mundial/reclamar-copa', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Le sumamos las 5000 monedas, la copa, el torneo ganado y los 50 pts de ranking de una sola vez
        await client.query(`
            UPDATE usuarios 
            SET monedas = monedas + 5000, 
                copas_mundiales = copas_mundiales + 1, 
                torneos_ganados = torneos_ganados + 1,
                puntos_ranking = puntos_ranking + 50
            WHERE id = $1`, [usuario_id]);

        const userFinal = await client.query("SELECT monedas, puntos_ranking, copas_mundiales, torneos_ganados FROM usuarios WHERE id = $1", [usuario_id]);
        await client.query('COMMIT');

        return res.json({ success: true, datosActualizados: userFinal.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error acreditando copa:", err);
        return res.status(500).json({ success: false, error: "No se pudo acreditar el premio." });
    } finally {
        client.release();
    }
});

/* ========================================================================
   🃏 BOT COMERCIANTE MUTADO: ESCALERA DE RAREZAS + EVENTOS ULTRA RAROS
   ======================================================================== */
app.post('/api/album/comerciar-bot', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id;
    const { jugadorIdsASacar } = req.body; 

    if (!jugadorIdsASacar || jugadorIdsASacar.length !== 3) return res.status(400).json({ ok: false, mensaje: "El Bot exige exactamente 3 cartas." });

    try {
        const conteoSolicitado = {}; jugadorIdsASacar.forEach(id => { conteoSolicitado[id] = (conteoSolicitado[id] || 0) + 1; });
        const cartasInfo = await pool.query(`SELECT up.jugador_id, up.cantidad, j.rareza FROM usuario_progreso up JOIN jugadores j ON up.jugador_id = j.id WHERE up.usuario_id = $1 AND up.jugador_id = ANY($2)`, [usuario_id, jugadorIdsASacar]);

        if (cartasInfo.rows.length === 0) return res.json({ ok: false, mensaje: "❌ No se encontraron los cromos en tu inventario." });

        for (let row of cartasInfo.rows) {
            if (row.cantidad - conteoSolicitado[row.jugador_id] < 1) return res.json({ ok: false, mensaje: "❌ No tenés repetidas suficientes." });
        }

        const rarezaBase = cartasInfo.rows[0].rareza.toLowerCase();
        if (!cartasInfo.rows.every(row => row.rareza.toLowerCase() === rarezaBase)) return res.json({ ok: false, mensaje: "❌ Deben ser de la misma rareza." });

        let rarezaRecompensa = (rarezaBase === "comun") ? "rara" : ((rarezaBase === "rara") ? "epica" : "legendaria");

        for (let jId of jugadorIdsASacar) { await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jId]); }

        const lootBot = await pool.query("SELECT id, nombre, rareza FROM jugadores WHERE rareza = $1 ORDER BY RANDOM() LIMIT 1", [rarezaRecompensa]);
        const cartaPremio = lootBot.rows[0];

        await pool.query(`INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1) ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad`, [usuario_id, cartaPremio.id]);

        let eventoActivado = null;
        if ((rarezaBase === "epica" || rarezaBase === "legendaria") && Math.random() <= 0.08) {
            if (Math.random() < 0.50) {
                await pool.query("UPDATE usuarios SET tiros_hoy = 10 WHERE id = $1", [usuario_id]);
                eventoActivado = "⚡ ¡EL BOT SE COPÓ! Tenés 10 penales disponibles al toque.";
            } else {
                await pool.query("UPDATE usuarios SET ultima_timba_mundial = NOW() - INTERVAL '4 hours' WHERE id = $1", [usuario_id]);
                eventoActivado = "⏳ ¡CONTRABANDO TÁCTICO! El Bot alteró los papeles del vestuario. ¡Mundial disponible YA!";
            }
        }

        return res.json({ ok: true, mensaje: `🤝 ¡Trato hecho!`, cartaGanada: { id: cartaPremio.id, nombre: cartaPremio.nombre, rareza: cartaPremio.rareza.toUpperCase() }, eventoEspecial: eventoActivado });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/* ========================================================================
   💸 ENGINE MERCADO DE PASES INTER-JUGADORES (P2P)
   ======================================================================== */
app.post('/api/mercado/publicar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id; const { jugador_id, precio } = req.body;
    try {
        const checkStock = await pool.query("SELECT cantidad FROM usuario_progreso WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugador_id]);
        if (checkStock.rows.length === 0 || checkStock.rows[0].cantidad <= 1) return res.json({ ok: false, mensaje: "❌ Sin stock repetido." });

        await pool.query("UPDATE usuario_progreso SET cantidad = cantidad - 1 WHERE usuario_id = $1 AND jugador_id = $2", [usuario_id, jugador_id]);
        await pool.query("INSERT INTO mercado_pases (vendedor_id, jugador_id, precio_oro) VALUES ($1, $2, $3)", [usuario_id, jugador_id, precio]);
        return res.json({ ok: true, mensaje: "Carta publicada con éxito." });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/mercado/ofertas', async (req, res) => {
    try {
        const ofertas = await pool.query(`SELECT m.id, m.precio_oro, m.vendedor_id, j.nombre, j.rareza, j.bandera, u.username AS nombre_vendedor, EXTRACT(EPOCH FROM (m.fecha_publicacion + INTERVAL '1 day' - NOW())) AS segundos_restantes FROM mercado_pases m JOIN jugadores j ON m.jugador_id = j.id JOIN usuarios u ON m.vendedor_id = u.id WHERE m.fecha_publicacion >= NOW() - INTERVAL '1 day' ORDER BY m.fecha_publicacion DESC`);
        return res.json({ ok: true, ofertas: ofertas.rows });
    } catch (err) { return res.json({ ok: false, error: err.message }); }
});

setInterval(async () => {
    try {
        const vencidas = await pool.query("SELECT id, vendedor_id, jugador_id FROM mercado_pases WHERE fecha_publicacion < NOW() - INTERVAL '1 day'");
        if (vencidas.rows.length > 0) {
            for (let oferta of vencidas.rows) {
                await pool.query(`INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1) ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad`, [oferta.vendedor_id, oferta.jugador_id]);
                await pool.query("DELETE FROM mercado_pases WHERE id = $1", [oferta.id]);
            }
        }
    } catch (err) { console.error("❌ Error en limpiador:", err.message); }
}, 15 * 60 * 1000); 

app.post('/api/mercado/comprar', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id; const { oferta_id } = req.body; 
    try {
        const buscarOferta = await pool.query("SELECT vendedor_id, jugador_id, precio_oro FROM mercado_pases WHERE id = $1", [oferta_id]);
        if (buscarOferta.rows.length === 0) return res.json({ ok: false, mensaje: "❌ Oferta no disponible." });

        const { vendedor_id, jugador_id, precio_oro } = buscarOferta.rows[0];
        if (parseInt(vendedor_id) === usuario_id) return res.json({ ok: false, mensaje: "❌ No podés comprar tu post." });

        const checkOro = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);
        if (checkOro.rows.length === 0 || checkOro.rows[0].monedas < precio_oro) return res.json({ ok: false, mensaje: "❌ Oro insuficiente." });

        await pool.query("UPDATE usuarios SET monedas = monedas - $1 WHERE id = $2", [precio_oro, usuario_id]);
        await pool.query("UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2", [precio_oro, vendedor_id]);
        await pool.query(`INSERT INTO usuario_progreso (usuario_id, jugador_id, cantidad) VALUES ($1, $2, 1) ON CONFLICT (usuario_id, jugador_id) DO UPDATE SET cantidad = usuario_progreso.cantidad + EXCLUDED.cantidad`, [usuario_id, jugador_id]);
        await pool.query("DELETE FROM mercado_pases WHERE id = $1", [oferta_id]);

        const infoJugador = await pool.query("SELECT nombre, rareza FROM jugadores WHERE id = $1", [jugador_id]);
        const checkOroNuevo = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);
        const datosUsuarios = await pool.query("SELECT id, username FROM usuarios WHERE id IN ($1, $2)", [vendedor_id, usuario_id]);
        
        let vend = "Vendedor"; let comp = "Comprador";
        datosUsuarios.rows.forEach(u => { if (u.id === usuario_id) comp = u.username; if (u.id === parseInt(vendedor_id)) vend = u.username; });

        await pool.query(`INSERT INTO historial_transferencias (vendedor_username, comprador_username, jugador_nombre, rareza, precio_oro) VALUES ($1, $2, $3, $4, $5)`, [vend, comp, infoJugador.rows[0]?.nombre, infoJugador.rows[0]?.rareza, precio_oro]);

        return res.json({ ok: true, jugador: infoJugador.rows[0]?.nombre, nuevoOro: checkOroNuevo.rows[0].monedas });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/mercado/historial', async (req, res) => {
    try {
        const result = await pool.query(`SELECT vendedor_username, comprador_username, jugador_nombre, rareza, precio_oro, fecha_registro, EXTRACT(EPOCH FROM (NOW() - fecha_registro))::INT as segundos_atras FROM historial_transferencias ORDER BY fecha_registro DESC LIMIT 5`);
        res.json({ ok: true, historial: result.rows });
    } catch (err) { res.status(500).json({ ok: false, error: "Error en el feed." }); }
});

/* ========================================================================
   🎰 ENGINE QUINIELA COMBINADA
   ======================================================================== */
const BANCO_PARTIDOS_QUINIELA = [
    { local: "BOCA", visitante: "RIVER", emoji: "🔥" }, { local: "REAL MADRID", visitante: "BARCELONA", emoji: "👑" },
    { local: "MANCHESTER CITY", visitante: "ARSENAL", emoji: "🦈" }, { local: "RACING", visitante: "INDEPENDIENTE", emoji: "🎓" },
    { local: "MILAN", visitante: "INTER", emoji: "⚔️" }, { local: "FLAMENGO", visitante: "PALMEIRAS", emoji: "🇧🇷" },
    { local: "LIVERPOOL", visitante: "MAN. UNITED", emoji: "🏴" }, { local: "HURACÁN", visitante: "SAN LORENZO", emoji: "🎈" },
    { local: "BAYERN MUNICH", visitante: "DORTMUND", emoji: "🇩🇪" }, { local: "JUVENTUS", visitante: "ROMA", emoji: "🇮🇹" }
];
let partidosActivosQuiniela = [];
function rotarFixtureQuiniela() { partidosActivosQuiniela = [...BANCO_PARTIDOS_QUINIELA].sort(() => 0.5 - Math.random()).slice(0, 3); }
rotarFixtureQuiniela();

app.get('/api/timba/quiniela/partidos', (req, res) => { res.json({ ok: true, partidos: partidosActivosQuiniela }); });

app.post('/api/timba/quiniela', verificarToken, async (req, res) => {
    const usuario_id = req.usuarioLogueado.id; let { monto, elecciones } = req.body;
    try {
        monto = parseInt(monto);
        if (!monto || monto < 50) return res.json({ ok: false, mensaje: "⚠️ Mínimo 50 de Oro." });

        const checkUser = await pool.query("SELECT monedas, ultimo_giro_timestamp, timbas_hoy FROM usuarios WHERE id = $1", [usuario_id]);
        if (checkUser.rows.length === 0) return res.json({ ok: false, mensaje: "❌ Usuario no encontrado." });

        const usuario = checkUser.rows[0];
        if (usuario.monedas < monto) return res.json({ ok: false, mensaje: "❌ Oro insuficiente." });

        let { timbasActuales } = calcularTimbasActuales(usuario);
        if (timbasActuales <= 0) return res.json({ ok: false, mensaje: "❌ ¡Sin energía en la banca! ⏱️" });

        const partidosDeEstaBoleta = [...partidosActivosQuiniela];
        await pool.query(`UPDATE usuarios SET monedas = monedas - $1, ultimo_giro_timestamp = $2, timbas_hoy = $3 WHERE id = $4`, [monto, new Date(), timbasActuales - 1, usuario_id]);

        const op = ['L', 'E', 'V']; const reales = { p1: op[Math.floor(Math.random() * 3)], p2: op[Math.floor(Math.random() * 3)], p3: op[Math.floor(Math.random() * 3)] };
        const boletaGanadora = (elecciones.p1 === reales.p1 && elecciones.p2 === reales.p2 && elecciones.p3 === reales.p3);
        let premio = boletaGanadora ? monto * 10 : 0;

        if (boletaGanadora) await pool.query("UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2", [premio, usuario_id]);

        await pool.query("INSERT INTO quiniela_apuestas (usuario_id, monto_apostado, predicciones, ganada, premio_entregado) VALUES ($1, $2, $3, $4, $5)", [usuario_id, monto, JSON.stringify(elecciones), boletaGanadora, premio]);
        const checkOroFinal = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuario_id]);
        rotarFixtureQuiniela();

        return res.json({ ok: true, ganó: boletaGanadora, mensaje: boletaGanadora ? `🔥 ¡QUINIELA GANADA! 🪙${premio}` : "❌ Boleta fallida.", resultadosReales: reales, partidosSimulados: partidosDeEstaBoleta, nuevoOro: checkOroFinal.rows[0].monedas });
    } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
});

/* ========================================================================
   🎯 SISTEMA DE MISIONES DIARIAS
   ======================================================================== */
const POOL_MISIONES_DISPONIBLES = [
    { descripcion: "Abre 3 sobres de cualquier tipo en la tienda", tipo: "sobres", meta: 3, recompensa: 150 },
    { descripcion: "Abre 7 sobres para expandir tu plantel", tipo: "sobres", meta: 7, recompensa: 300 },
    { descripcion: "Ganá 5 tandas de penales contra la IA", tipo: "penales", meta: 5, recompensa: 200 },
    { descripcion: "Anotá 10 goles en total pateando penales", tipo: "goles_penales", meta: 10, recompensa: 150 },
    { descripcion: "Conseguí 3 jugadores de rareza Rara o superior", tipo: "jugadores_raros", meta: 3, recompensa: 250 },
    { descripcion: "Desbloqueá 5 jugadores Comunes nuevos", tipo: "jugadores_comunes", meta: 5, recompensa: 150 },
    { descripcion: "Llegá a acumular 1,000 monedas de Oro en total", tipo: "acumular_oro", meta: 1000, recompensa: 200 },
    { descripcion: "Jugá 3 partidos del Mundial", tipo: "mundial_partidos", meta: 3, recompensa: 200 },
    { descripcion: "Hacé 2 intercambios (trades) de cromos repetidos", tipo: "trades", meta: 2, recompensa: 150 }
];

app.get('/api/misiones/obtener', verificarToken, async (req, res) => {
    const usuarioId = req.usuarioLogueado.id; const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const ahora = new Date(); const opcionesFecha = { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' };
        const [mes, dia, anio] = ahora.toLocaleDateString('en-US', opcionesFecha).split('/'); const fechaHoyString = `${anio}-${mes}-${dia}`;

        const userCheck = await client.query("SELECT TO_CHAR(ultimo_reset_misiones, 'YYYY-MM-DD') as ultimo_reset FROM usuarios WHERE id = $1", [usuarioId]);
        if (userCheck.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, error: "Usuario no encontrado." }); }

        const chequeoFilasFisicas = await client.query("SELECT COUNT(*) FROM usuario_misiones WHERE usuario_id = $1", [usuarioId]);
        if (!userCheck.rows[0].ultimo_reset || userCheck.rows[0].ultimo_reset !== fechaHoyString || parseInt(chequeoFilasFisicas.rows[0].count) === 0) {
            await client.query("DELETE FROM usuario_misiones WHERE usuario_id = $1", [usuarioId]);
            const misionesSeleccionadas = [...POOL_MISIONES_DISPONIBLES].sort(() => 0.5 - Math.random()).slice(0, 3);

            for (let index = 0; index < misionesSeleccionadas.length; index++) {
                const m = misionesSeleccionadas[index];
                await client.query(`INSERT INTO usuario_misiones (usuario_id, mision_id, descripcion, tipo, progreso, meta, recompensa, reclamada, actualizado_en) VALUES ($1, $2, $3, $4, 0, $5, $6, FALSE, $7)`, [usuarioId, index + 1, m.descripcion, m.tipo, m.meta, m.recompensa, fechaHoyString]);
            }
            await client.query("UPDATE usuarios SET ultimo_reset_misiones = $1 WHERE id = $2", [fechaHoyString, usuarioId]);
        }

        const resultado = await client.query("SELECT id, mision_id, descripcion, tipo, progreso, meta, recompensa, reclamada FROM usuario_misiones WHERE usuario_id = $1 ORDER BY mision_id ASC", [usuarioId]);
        await client.query('COMMIT'); res.json({ ok: true, misiones: resultado.rows });
    } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: "Error interno en misiones." }); } finally { client.release(); }
});

app.post('/api/misiones/trackear', verificarToken, async (req, res) => {
    try {
        const { tipo, cantidad } = req.body; const usuarioId = req.usuarioLogueado.id;
        await pool.query(`UPDATE usuario_misiones SET progreso = LEAST(progreso + $1, meta), actualizado_en = NOW() WHERE usuario_id = $2 AND tipo = $3 AND reclamada = FALSE;`, [cantidad || 1, usuarioId, tipo]);
        const misionesActualizadas = await pool.query("SELECT id, mision_id, descripcion, tipo, progreso, meta, recompensa, reclamada FROM usuario_misiones WHERE usuario_id = $1 ORDER BY mision_id ASC", [usuarioId]);
        res.json({ ok: true, misiones: misionesActualizadas.rows });
    } catch (err) { res.status(500).json({ error: "Error al actualizar misiones." }); }
});

app.post('/api/misiones/reclamar', verificarToken, async (req, res) => {
    try {
        const { misionId } = req.body; const usuarioId = req.usuarioLogueado.id;
        const buscarMision = await pool.query("SELECT * FROM usuario_misiones WHERE usuario_id = $1 AND id = $2", [usuarioId, misionId]);

        if (buscarMision.rows.length === 0) return res.status(404).json({ error: "Misión no encontrada." });
        const mision = buscarMision.rows[0];

        if (mision.progreso < mision.meta || mision.reclamada) return res.status(400).json({ error: "No apta para cobro." });

        await pool.query("UPDATE usuario_misiones SET reclamada = TRUE WHERE id = $1", [misionId]);
        const resultadoUsuario = await pool.query(`UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2 RETURNING monedas;`, [mision.recompensa, usuarioId]);
        const misionesFinales = await pool.query("SELECT id, mision_id, descripcion, tipo, progreso, meta, recompensa, reclamada FROM usuario_misiones WHERE usuario_id = $1 ORDER BY mision_id ASC", [usuarioId]);

        res.json({ ok: true, monedas: resultadoUsuario.rows[0].monedas, misiones: misionesFinales.rows });
    } catch (err) { res.status(500).json({ error: "Error en cobro de misiones." }); }
});

// ========================================================================
// 🦾 BOT COMERCIANTE: POOL DE CONTRATOS EXPANDIDO Y VIGENTE
// ========================================================================
const POOL_GLOBAL_SBC = [
    // 🇦🇷 ARGENTINA (Fácil de completar con duplicados comunes y raros)
    { id: 101, titulo: "⚔️ DESAFÍO ALBICELESTE", descripcion: "Entregá 3 jugadores COMUNES de ARGENTINA.", requisitos: { cantidad: 3, rareza: "comun", pais: "argentina" }, recompensa: { tipo: "oro_directo", valor: 1500 } },
    { id: 107, titulo: "🔥 POTENCIA DE LIGA LOCAL", descripcion: "El Bot busca 2 cartas RARAS nacidas en ARGENTINA.", requisitos: { cantidad: 2, rareza: "rara", pais: "argentina" }, recompensa: { tipo: "oro_directo", valor: 2500 } },

    // 🇧🇷 BRASIL (Ideal para quemar esas copas épicas o armar economías)
    { id: 102, titulo: "🇧🇷 JOGO BONITO TRADER", descripcion: "El Bot busca 2 cracks de rareza ÉPICA de BRASIL.", requisitos: { cantidad: 2, rareza: "epica", pais: "brasil" }, recompensa: { tipo: "oro_directo", valor: 3500 } },
    { id: 108, titulo: "🌴 SAMBA DE INTERCAMBIO", descripcion: "Sacrificá 3 cartas COMUNES nacidas en BRASIL.", requisitos: { cantidad: 3, rareza: "comun", pais: "brasil" }, recompensa: { tipo: "oro_directo", valor: 1200 } },

    // 🇫🇷 FRANCIA (Consistente para balancear con cartas intermedias y tops)
    { id: 103, titulo: "🇪🇺 MURALLA EUROPEA", descripcion: "Sacrificá 3 jugadores RAROS nacidos en FRANCIA.", requisitos: { cantidad: 3, rareza: "rara", pais: "francia" }, recompensa: { tipo: "oro_directo", valor: 5000 } },
    { id: 109, titulo: "🐓 GALOS DE ÉLITE", descripcion: "El Bot exige 2 estrellas de rareza ÉPICA de FRANCIA.", requisitos: { cantidad: 2, rareza: "epica", pais: "francia" }, recompensa: { tipo: "oro_directo", valor: 4200 } },

    // 🏴󠁧󠁢󠁥󠁮󠁧󠁿 INGLATERRA (Recompensas pesadas para el end-game)
    { id: 104, titulo: "🦁 ORGULLO INGLÉS", descripcion: "Entregá 2 cracks de rareza LEGENDARIA nacidos en INGLATERRA.", requisitos: { cantidad: 2, rareza: "legendaria", pais: "inglaterra" }, recompensa: { tipo: "oro_directo", valor: 8000 } },
    { id: 110, titulo: "🛡️ ACADEMIA DE LONDRES", descripcion: "Buscamos 3 cartas RARAS nacidas en INGLATERRA.", requisitos: { cantidad: 3, rareza: "rara", pais: "inglaterra" }, recompensa: { tipo: "oro_directo", valor: 3800 } },

    // 🇪🇸 ESPAÑA (Alineado a tus cartas reales en la Arena)
    { id: 105, titulo: "🇪🇸 FURIA ROJA DE INTERCAMBIO", descripcion: "El Bot exige 3 jugadores RAROS nacidos en ESPAÑA.", requisitos: { cantidad: 3, rareza: "rara", pais: "españa" }, recompensa: { tipo: "oro_directo", valor: 3000 } },
    { id: 111, titulo: "🪄 TOQUE MEDITERRÁNEO", descripcion: "Entregá 2 jugadores COMUNES nacidos en ESPAÑA.", requisitos: { cantidad: 2, rareza: "comun", pais: "españa" }, recompensa: { tipo: "oro_directo", valor: 1000 } },

    // 🇮🇹 ITALIA (Ajustado a tus bases de datos para que sea 100% posible)
    { id: 106, titulo: "🇮🇹 CANDADO AZZURRO", descripcion: "Sacrificá 3 jugadores COMUNES nacidos en ITALIA.", requisitos: { cantidad: 3, remove: "comun", pais: "italia" }, requisitos: { cantidad: 3, rareza: "comun", pais: "italia" }, recompensa: { tipo: "oro_directo", valor: 1400 } },
    { id: 112, titulo: "🏛️ GLADIADORES PREMIUM", descripcion: "El comerciante busca 2 cartas RARAS nacidas en ITALIA.", requisitos: { cantidad: 2, rareza: "rara", pais: "italia" }, recompensa: { tipo: "oro_directo", valor: 2800 } }
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

// 3️⃣ Endpoint Atómico de Procesamiento (Corregido contra explotación de duplicados)
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

    // Mapeamos cuántas copias de cada ID quiere entregar (Evita bugs si manda el mismo ID repetido varias veces)
    const mapaConteoPases = {};
    jugadorIds.forEach(id => {
        mapaConteoPases[id] = (mapaConteoPases[id] || 0) + 1;
    });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Procesamos la verificación sobre el mapa agrupado de IDs únicos
        for (const [jId, cantidadAEntregar] of Object.entries(mapaConteoPases)) {
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

            // La cantidad restante después de entregar NO puede ser menor a 1 (para retener la carta base en el álbum)
            if (cantidadDisponible - cantidadAEntregar < 1) {
                await client.query('ROLLBACK');
                return res.json({ ok: false, mensaje: `❌ No tenés copias REPETIDAS suficientes de ${j.nombre.toUpperCase()} para cubrir la planilla.` });
            }
        }

        // Si todas las validaciones pasaron, descontamos las unidades reales indicadas en el conteo
        for (const [jId, cantidadAEntregar] of Object.entries(mapaConteoPases)) {
            await client.query(
                `UPDATE usuario_progreso SET cantidad = cantidad - $1 WHERE usuario_id = $2 AND jugador_id = $3`, 
                [cantidadAEntregar, usuarioId, jId]
            );
        }

        const premioOro = contratoElegido.recompensa.valor;
        const userRes = await client.query(`UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2 RETURNING monedas`, [premioOro, usuarioId]);
        const nuevoOroTotal = userRes.rows[0].monedas;

        await client.query('COMMIT');
        res.json({ ok: true, nuevoOro: nuevoOroTotal, mensaje: `💪 ¡CONTRATO CERRADO! El Bot procesó la rotación y te acreditó 🪙 ${premioOro} de Oro.` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error interno en la transacción de contratos:", err);
        res.status(500).json({ ok: false, error: "Error interno en los servidores." });
    } finally {
        client.release();
    }
});

/* ========================================================================
   🎁 RECOMPENSAS DIARIAS (ZONA HORARIA BSAS)
   ======================================================================== */
app.post('/api/usuarios/reclamar-diario', verificarToken, async (req, res) => {
    try {
        const usuarioId = req.usuarioLogueado.id;
        const userRes = await pool.query("SELECT monedas, racha_login, ultimo_login_timestamp FROM usuarios WHERE id = $1", [usuarioId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado." });
        
        const user = userRes.rows[0]; const ahora = new Date(); let rachaActual = user.racha_login || 0;
        const premiosOro = { 1: 100, 2: 200, 3: 350, 4: 500, 5: 750, 6: 1000, 7: 2500 };
        const opcionesZona = { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' };
        
        const [mesH, diaH, anioH] = ahora.toLocaleDateString('en-US', opcionesZona).split('/'); const stringHoy = `${anioH}-${mesH}-${diaH}`;

        if (user.ultimo_login_timestamp) {
            const [mesU, diaU, anioU] = new Date(user.ultimo_login_timestamp).toLocaleDateString('en-US', opcionesZona).split('/');
            const stringUltimo = `${anioU}-${mesU}-${diaU}`;
            
            if (stringHoy === stringUltimo) return res.json({ ok: false, mensaje: `⏳ Ya reclamaste tu premio diario.`, racha: rachaActual });
            rachaActual = (Math.round((new Date(stringHoy) - new Date(stringUltimo)) / 86400000) === 1) ? (rachaActual >= 7 ? 1 : rachaActual + 1) : 1;
        } else { rachaActual = 1; }

        const premioOtorgado = premiosOro[rachaActual] || 100;
        const updateRes = await pool.query(`UPDATE usuarios SET monedas = monedas + $1, racha_login = $2, ultimo_login_timestamp = NOW() WHERE id = $3 RETURNING monedas;`, [premioOtorgado, rachaActual, usuarioId]);

        res.json({ ok: true, mensaje: `🎁 ¡DÍA ${rachaActual} RECLAMADO! 🪙${premioOtorgado}`, racha: rachaActual, monedas: updateRes.rows[0].monedas, regaloSobre: (rachaActual === 7) });
    } catch (err) { res.status(500).json({ error: "Error en premio diario." }); }
});

/* ========================================================================
   ⚙️ ENDPOINT DE PERFILES DE LA ARENA (MANTENIMIENTO DE CROMOS INSIGNIA)
   ======================================================================== */
app.get('/api/usuarios/perfil/:usuarioId', async (req, res) => {
    const { usuarioId } = req.params;
    try {
        const perfilQuery = `
            SELECT u.id, u.username AS nombre_usuario, u.monedas, u.puntos_ranking, u.timbas_jugadas, u.timbas_ganadas_exacto, u.timbas_ganadas_signo, u.eligio_avatar, u.cromo_destacado, u.copas_mundiales, u.penales_jugados, u.penales_ganados, u.torneos_ganados, u.ranking_semanal_top1, COALESCE(fp.ruta_jpg, 'fotos/_defecto.jpg') AS foto_perfil, 
            COALESCE(COUNT(CASE WHEN j.rareza = 'comun' AND up.cantidad > 0 THEN 1 END), 0) AS comunes, 
            COALESCE(COUNT(CASE WHEN j.rareza = 'rara' AND up.cantidad > 0 THEN 1 END), 0) AS raras, 
            COALESCE(COUNT(CASE WHEN j.rareza = 'epica' AND up.cantidad > 0 THEN 1 END), 0) AS epicas, 
            COALESCE(COUNT(CASE WHEN j.rareza = 'legendaria' AND up.cantidad > 0 THEN 1 END), 0) AS legendarias, 
            COALESCE(ROUND((COUNT(CASE WHEN up.cantidad > 0 THEN 1 END)::NUMERIC / COALESCE((SELECT COUNT(*) FROM jugadores), 1)::NUMERIC) * 100, 2), 0) AS porcentaje_album 
            FROM usuarios u 
            LEFT JOIN fotos_perfil fp ON u.foto_perfil_id = fp.id 
            LEFT JOIN usuario_progreso up ON u.id = up.usuario_id 
            LEFT JOIN jugadores j ON up.jugador_id = j.id 
            WHERE u.id = $1 
            GROUP BY u.id, u.username, u.monedas, u.puntos_ranking, u.timbas_jugadas, u.timbas_ganadas_exacto, u.timbas_ganadas_signo, u.eligio_avatar, u.cromo_destacado, u.copas_mundiales, u.penales_jugados, u.penales_ganados, u.torneos_ganados, u.ranking_semanal_top1, fp.ruta_jpg;`;

        const result = await pool.query(perfilQuery, [usuarioId]);
        if (result.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "El competidor no existe." });

        const datos = result.rows[0];

        // 🧠 Lógica para calcular la selección favorita (La que más pases tiene en posesión en usuario_progreso)
        const seleccionFavQuery = `
            SELECT j.pais, COUNT(*) as cantidad_cromos
            FROM usuario_progreso up
            JOIN jugadores j ON up.jugador_id = j.id
            WHERE up.usuario_id = $1 AND up.cantidad > 0
            GROUP BY j.pais
            ORDER BY cantidad_cromos DESC
            LIMIT 1
        `;
        const favResult = await pool.query(seleccionFavQuery, [usuarioId]);
        const seleccionFavorita = favResult.rows.length > 0 ? favResult.rows[0].pais.toUpperCase() : "NINGUNA";

        return res.json({
            ok: true,
            perfil: {
                id: datos.id, 
                nombre: datos.nombre_usuario, 
                monedas: datos.monedas, 
                eligio_avatar: datos.eligio_avatar, 
                puntosRanking: datos.puntos_ranking, 
                foto: datos.foto_perfil, 
                cromo_destacado: datos.cromo_destacado,
                torneosGanados: parseInt(datos.torneos_ganados || 0),
                top1Semanales: parseInt(datos.ranking_semanal_top1 || 0),
                seleccionTop: seleccionFavorita,
                copas_mundiales: parseInt(datos.copas_mundiales || 0),
                copasMundiales: parseInt(datos.copas_mundiales || 0),

                // 🎯 NUEVO: Mapeo de estadísticas de timba
                estadisticasTimba: {
                    jugadas: parseInt(datos.timbas_jugadas || 0),
                    ganadasExacto: parseInt(datos.timbas_ganadas_exacto || 0),
                    ganadasSigno: parseInt(datos.timbas_ganadas_signo || 0)
                },

                estadisticasAlbum: { 
                    comunes: parseInt(datos.comunes || 0), 
                    raras: parseInt(datos.raras || 0), 
                    epicas: parseInt(datos.epicas || 0), 
                    legendarias: parseInt(datos.legendarias || 0), 
                    porcentajeCompletado: parseFloat(datos.porcentaje_album) || 0 
                },
                estadisticasPenales: {
                    jugadas: parseInt(datos.penales_jugados || 0),
                    ganadas: parseInt(datos.penales_ganados || 0)
                }
            }
        });
    } catch (err) { 
        console.error("❌ Error al cargar perfil expandido:", err);
        res.status(500).json({ ok: false, mensaje: "Error al cargar perfil." }); 
    }
});

app.post('/api/usuarios/registrar-penal', verificarToken, async (req, res) => {
    const { ganoPartido } = req.body; // true o false según el resultado del minijuego
    const usuarioId = req.usuarioLogueado.id;

    try {
        const incrementoGanado = ganoPartido ? 1 : 0;
        
        await pool.query(
            `UPDATE usuarios 
             SET penales_jugados = penales_jugados + 1, 
                 penales_ganados = penales_ganados + $1 
             WHERE id = $2`,
            [incrementoGanado, usuarioId]
        );

        res.json({ ok: true, mensaje: "⚽ Historial de penales actualizado." });
    } catch (err) {
        console.error("❌ Error al registrar penal:", err);
        res.status(500).json({ ok: false, error: "Error de servidor." });
    }
});

app.get('/api/fotos-perfil/mis-avatares', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(`SELECT fp.id, fp.nombre, fp.ruta_jpg, CASE WHEN ufp.foto_id IS NOT NULL THEN true ELSE false END AS desbloqueada FROM fotos_perfil fp LEFT JOIN usuario_fotos_perfil ufp ON fp.id = ufp.foto_id AND ufp.usuario_id = $1 ORDER BY fp.id ASC;`, [req.usuarioLogueado.id]);
        res.json({ ok: true, catalogo: result.rows });
    } catch (err) { res.status(500).json({ error: "Error en catálogo." }); }
});

app.put('/api/usuarios/cambiar-foto', verificarToken, async (req, res) => {
    try {
        const verif = await pool.query("SELECT 1 FROM usuario_fotos_perfil WHERE usuario_id = $1 AND foto_id = $2", [req.usuarioLogueado.id, req.body.fotoId]);
        if (verif.rows.length === 0) return res.status(403).json({ ok: false, mensaje: "❌ Avatar bloqueado." });

        await pool.query("UPDATE usuarios SET foto_perfil_id = $1 WHERE id = $2", [req.body.fotoId, req.usuarioLogueado.id]);
        return res.json({ ok: true, mensaje: "📸 ¡Avatar equipado!" });
    } catch (err) { res.status(500).json({ error: "Error en actualización." }); }
});

app.get('/api/usuarios/opciones-avatar-inicial', verificarToken, async (req, res) => {
    try {
        const check = await pool.query("SELECT eligio_avatar FROM usuarios WHERE id = $1", [req.usuarioLogueado.id]);
        if (check.rows[0].eligio_avatar) return res.status(403).json({ ok: false, mensaje: "❌ Ya elegiste avatar inicial." });

        const result = await pool.query(`SELECT id, nombre, ruta_jpg FROM fotos_perfil ORDER BY RANDOM() LIMIT 3;`);
        return res.json({ ok: true, opciones: result.rows });
    } catch (err) { return res.status(500).json({ ok: false, mensaje: "Error al generar opciones." }); }
});

app.put('/api/usuarios/seleccionar-avatar-inicial', verificarToken, async (req, res) => {
    try {
        await pool.query("UPDATE usuarios SET foto_perfil_id = $1, eligio_avatar = TRUE WHERE id = $2", [req.body.fotoId, req.usuarioLogueado.id]);
        await pool.query("INSERT INTO usuario_fotos_perfil (usuario_id, foto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.usuarioLogueado.id, req.body.fotoId]);
        return res.json({ ok: true, mensaje: "📸 Avatar inicial asignado." });
    } catch (err) { return res.status(500).json({ ok: false, mensaje: "Error al asignar avatar." }); }
});

app.post('/api/usuarios/destacar-cromo', verificarToken, async (req, res) => {
    const { fotoUrl } = req.body;

    // Validamos que venga la URL/Ruta, que es lo único que Neon necesita registrar
    if (!fotoUrl) {
        return res.status(400).json({ ok: false, mensaje: "⚠️ Falta la URL de la foto del cromo." });
    }

    try {
        // Guardamos estrictamente la cadena de texto plana (ej: 'fotos/aus_degenek.jpg')
        await pool.query(
            'UPDATE usuarios SET cromo_destacado = $1 WHERE id = $2', 
            [fotoUrl, req.usuarioLogueado.id]
        );

        res.json({ 
            ok: true, 
            mensaje: "🌟 ¡Cromo lucido en la vitrina!",
            cromo_destacado: fotoUrl
        });

    } catch (err) { 
        console.error("Error en servidor al destacar cromo:", err);
        res.status(500).json({ ok: false, error: "Error de servidor al guardar en la base de datos." }); 
    }
});

/* ========================================================================
   ✍️ ENDPOINTS SEGUROS PARA EL LIBRO DE FIRMAS
   ======================================================================== */
function validarTextoFirmaSeguro(texto) {
    const limpio = (texto || '').trim();
    if (!limpio || limpio.length > 140) return { valido: false, error: "Firma inválida o supera los 140 caracteres." };
    if (/<[^>]*>/g.test(limpio)) return { valido: false, error: "❌ Inyección HTML desestimada." };
    if (/(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|edu|gov|co|ar)\b)/i.test(limpio)) return { valido: false, error: "❌ No se admiten enlaces." };
    return { valido: true, texto: limpio };
}

app.get('/api/firmas/:perfilId', async (req, res) => {
    const { perfilId } = req.params;
    if (!perfilId || perfilId === 'null' || perfilId === 'undefined') return res.json({ ok: true, firmas: [] });
    try {
        const result = await pool.query(`SELECT f.id, f.autor_id, f.mensaje, f.creado_en, f.editado_en, u.username FROM usuario_firmas f JOIN usuarios u ON f.autor_id = u.id WHERE f.perfil_id = $1 ORDER BY f.creado_en DESC;`, [perfilId]);
        return res.json({ ok: true, firmas: result.rows });
    } catch (err) { return res.status(500).json({ error: "Error al cargar libro." }); }
});

app.post('/api/firmas/crear', verificarToken, async (req, res) => {
    const autor_id = req.usuarioLogueado.id; const { perfilId, mensaje } = req.body;
    const val = validarTextoFirmaSeguro(mensaje);
    if (!val.valido) return res.status(400).json({ error: val.error });
    if (parseInt(perfilId) === autor_id) return res.status(400).json({ error: "No podés firmar tu perfil." });

    try {
        await pool.query(`INSERT INTO usuario_firmas (perfil_id, autor_id, mensaje, creado_en) VALUES ($1, $2, $3, NOW())`, [perfilId, autor_id, val.texto]);
        return res.json({ ok: true, mensaje: "¡Perfil firmado!" });
    } catch (err) { return res.status(500).json({ error: "Error al procesar firma." }); }
});

app.put('/api/firmas/editar', verificarToken, async (req, res) => {
    const val = validarTextoFirmaSeguro(req.body.nuevoMensaje);
    if (!val.valido) return res.status(400).json({ error: val.error });
    try {
        await pool.query(`UPDATE usuario_firmas SET mensaje = $1, editado_en = NOW() WHERE id = $2 AND autor_id = $3`, [val.texto, req.body.firmaId, req.usuarioLogueado.id]);
        return res.json({ ok: true, mensaje: "Firma modificada." });
    } catch (err) { return res.status(500).json({ error: "Error al editar." }); }
});

app.delete('/api/firmas/borrar/:firmaId', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM usuario_firmas WHERE id = $1 AND autor_id = $2 RETURNING id;`, [req.params.firmaId, req.usuarioLogueado.id]);
        if (result.rows.length === 0) return res.status(403).json({ error: "No sos el autor." });
        return res.json({ ok: true, mensaje: "Firma eliminada." });
    } catch (err) { return res.status(500).json({ error: "Error al eliminar." }); }
});

/* ========================================================================
   🏆 MOTOR AUTOMÁTICO: RECOMPENSAS Y RESET SEMANAL DE RANKINGS (LUNES 00:00)
   ======================================================================== */
async function procesarResetSemanalRankings() {
    const client = await pool.connect();
    try {
        const ahora = new Date();
        const formatterDia = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' });
        const formatterFecha = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
        
        const diaSemana = formatterDia.format(ahora); 
        const [mes, dia, anio] = formatterFecha.format(ahora).split('/'); const fechaHoyString = `${anio}-${mes}-${dia}`;

        if (diaSemana !== 'Mon') return;

        await client.query('BEGIN');
        const verificarReset = await client.query("SELECT 1 FROM registro_resets_semanales WHERE fecha_reset = $1", [fechaHoyString]);
        if (verificarReset.rows.length > 0) { await client.query('ROLLBACK'); return; }

        console.log(`🚧 ¡Arrancando Reset Semanal de Rankings para la fecha ${fechaHoyString}!`);

        const topMundial = await client.query("SELECT id FROM usuarios WHERE copas_mundiales > 0 ORDER BY copas_mundiales DESC, id ASC LIMIT 3");
        if (topMundial.rows.length > 0) {
            if (topMundial.rows[0]) await client.query("UPDATE usuarios SET monedas = monedas + 2500 WHERE id = $1", [topMundial.rows[0].id]);
            if (topMundial.rows[1]) await client.query("UPDATE usuarios SET monedas = monedas + 1000 WHERE id = $1", [topMundial.rows[1].id]);
            if (topMundial.rows[2]) await client.query("UPDATE usuarios SET monedas = monedas + 500 WHERE id = $1", [topMundial.rows[2].id]);
        }

        const topPenales = await client.query("SELECT id FROM usuarios WHERE puntos_ranking > 0 ORDER BY puntos_ranking DESC, id ASC LIMIT 3");
        if (topPenales.rows.length > 0) {
            if (topPenales.rows[0]) await client.query("UPDATE usuarios SET monedas = monedas + 2500 WHERE id = $1", [topPenales.rows[0].id]);
            if (topPenales.rows[1]) await client.query("UPDATE usuarios SET monedas = monedas + 1000 WHERE id = $1", [topPenales.rows[1].id]);
            if (topPenales.rows[2]) await client.query("UPDATE usuarios SET monedas = monedas + 500 WHERE id = $1", [topPenales.rows[2].id]);
        }

        await client.query("UPDATE usuarios SET copas_mundiales = 0, puntos_ranking = 0");
        await client.query("INSERT INTO registro_resets_semanales (fecha_reset) VALUES ($1)", [fechaHoyString]);

        await client.query('COMMIT');
        console.log("🏆 ¡Reset completado con éxito! Monedas depositadas al Top 3 y marcadores vueltos a cero.");
    } catch (err) { await client.query('ROLLBACK'); console.error("❌ Error crítico en reset semanal:", err.message); } finally { client.release(); }
}

app.get('/api/ranking/campeones-historicos', verificarToken, async (req, res) => {
    try {
        // Obtenemos el TOP 3 del ranking semanal justo antes de que se limpie, o el top actual guardado
        // (Asegurate de que filtre por puntos_ranking de mayor a menor)
        const query = `
            SELECT username AS nombre, puntos_ranking 
            FROM usuarios 
            WHERE puntos_ranking > 0 
            ORDER BY puntos_ranking DESC 
            LIMIT 3
        `;
        const { rows } = await pool.query(query);

        // Mapeamos los premios dinámicos por puesto
        const premios = [5000, 2500, 1000]; // Oro para 1ro, 2do y 3ro
        const campeonesProcesados = rows.map((r, idx) => ({
            nombre: r.nombre,
            puntos: r.puntos_ranking,
            premio_oro: premios[idx] || 500
        }));

        return res.json({ success: true, campeones: campeonesProcesados });
    } catch (err) {
        console.error("❌ Error trayendo campeones del reset:", err);
        return res.status(500).json({ success: false, error: "Error de base de datos" });
    }
});

/* ========================================================================
   🚨 CONFIGURACIÓN Y ENDPOINT SEGURO DE ANUNCIOS GLOBAL (TEMPORADA 2.0)
   ======================================================================== */
const CONFIG_ANUNCIO_SERVIDOR = {
    activo: true, 
    tipo: "video", 
    titulo: "⚡ ¡BIENVENIDOS A LA ARENA TEMPORADA 2.0! ⚡",
    texto: "¡Se pudrió todo, pa! Reiniciamos la Arena por completo para arrancar la nueva temporada oficial desde 0. Prepará tus mejores tiros, completá los objetivos del día y salí a dominar el mercado de pases. ¡Mirá los detalles en el video!",
    urlImagen: "https://albumpe.onrender.com/assets/novedad.png", 
    urlVideo: "https://www.youtube.com/embed/MWeL2xmV6tU",
    informe: {
        version: "v2.5.0-Arena", 
        fecha: "Julio 2026",
        cambios: [
            "🔥 **Gran Reinicio de Temporada:** ¡Cuentas limpias y todos arrancan desde cero! Volvimos a las 200 monedas base para ver quién es el verdadero rey de la Arena en igualdad de condiciones.",
            "📊 **Nuevo HUD de Rendimiento:** Ahora podés mirar tus estadísticas reales en vivo dentro del sector de Penales. ¡Hacé un seguimiento de tu efectividad y lucí tu racha de los últimos 5 partidos con esferas neón!",
            "🎯 **Misiones Diarias Renovadas:** Una cartelera con 3 objetivos que cambian cada medianoche para juntar Oro extra al toque abriendo sobres, tradeando o jugando el Mundial.",
            "💸 **Mercado de Pases Activo:** Comprá y vendé tus cartas repetidas con otros jugadores reales en una vitrina internacional de 24 horas. ¡Si nadie la compra, tu carta vuelve sola a casa!",
            "🛡️ **Sistema de Recompensas Seguro:** Corregimos los bugs de horarios al reclamar el premio diario. Ahora tu racha se registra al instante y sin bloqueos raros según la hora de Argentina."
        ]
    }
};

app.get('/api/anuncio-actual', (req, res) => { res.json(CONFIG_ANUNCIO_SERVIDOR); });

setInterval(procesarResetSemanalRankings, 1000 * 60 * 60);
setTimeout(procesarResetSemanalRankings, 5000);

// ========================================================================
// ⚔️ MÓDULO MULTIJUGADOR: DRAFT ALEATORIO POR TERNA Y SELECCIONES ÚNICAS
// ========================================================================
function inicializarModuloMultijugador(io, pool) {
    const salasActivas = {}; 

    const LISTA_SELECCIONES = [
        "Argentina", "Brasil", "Francia", "Alemania", "España", "Italia", "Inglaterra", "Países Bajos", 
        "Portugal", "Uruguay", "Bélgica", "Croacia", "Japón", "Marruecos", "Senegal", "EEUU"
    ];

    // 🎲 Función Auxiliar: Filtra países con +3 cartas y saca 3 al azar bloqueando las ocupadas
    function calcularTernaDraft(albumJugador, seleccionesOcupadas) {
        const mapeoPaises = {};
        
        // Contamos cuántas cartas tiene el jugador de cada país
        albumJugador.forEach(c => {
            if (c.obtenido > 0 && c.pais) {
                if (!mapeoPaises[c.pais]) mapeoPaises[c.pais] = 0;
                mapeoPaises[c.pais]++;
            }
        });

        // El país sirve si tiene 3 o más naipes pegados Y nadie lo eligió en el lobby todavía
        const aptosLibres = Object.keys(mapeoPaises).filter(pais => {
            return mapeoPaises[pais] >= 3 && !seleccionesOcupadas.includes(pais);
        });

        // Mezclamos la terna con un shuffle rápido y recortamos máximo 3
        return aptosLibres.sort(() => Math.random() - 0.5).slice(0, 3);
    }

    io.on('connection', (socket) => {
        console.log(`📡 Conexión WebSocket en el Mundial: ${socket.id}`);

        socket.on('pedirSalasPublicas', () => {
            socket.emit('listaSalasPublicas', obtenerSalasPublicas(salasActivas));
        });

        // 🆕 CREAR SALA CON INYECCIÓN DE TERNA INICIAL
        socket.on('crearSalaTorneo', async ({ usuarioId, username, esPrivada, contrasenia, apuestaOro, albumCompletoJugador }) => {
            try {
                const oroApuesta = parseInt(apuestaOro) || 0;

                const userCheck = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuarioId]);
                if (userCheck.rows.length === 0 || userCheck.rows[0].monedas < oroApuesta) {
                    return socket.emit('errorPvp', { mensaje: "❌ Fondos insuficientes para abrir esta apuesta." });
                }

                // Calculamos sus 3 opciones al azar (vacío porque es el primero de la sala)
                const opcionesDraft = calcularTernaDraft(albumCompletoJugador || [], []);
                if (opcionesDraft.length === 0) {
                    return socket.emit('errorPvp', { mensaje: "❌ No tenés ningún país con al menos 3 cartas desbloqueadas en tu álbum." });
                }

                await pool.query("UPDATE usuarios SET monedas = monedas - $1 WHERE id = $2", [oroApuesta, usuarioId]);

                const tokenUnico = "MUNDO_" + Math.random().toString(36).substring(2, 7).toUpperCase();
                const salaNombre = `sala_${tokenUnico}`;
                
                const nuevaSalaDB = await pool.query(
                    "INSERT INTO salas_multijugador (sala_token, creador_id, estado) VALUES ($1, $2, 'ESPERANDO') RETURNING id",
                    [tokenUnico, usuarioId]
                );

                socket.join(salaNombre);

                salasActivas[salaNombre] = {
                    dbId: nuevaSalaDB.rows[0].id,
                    token: tokenUnico,
                    apuestaOro: oroApuesta,
                    esPrivada: esPrivada || false,
                    contrasenia: contrasenia || "",
                    estado: "LOBBY", 
                    pozoTotal: oroApuesta,
                    faseActual: "octavos",
                    partidoIndiceActual: 0, 
                    jugadores: [{
                        usuarioId,
                        username,
                        socketId: socket.id,
                        seleccion: null, 
                        estrellasPlantel: 1, 
                        esBot: false,
                        draftConfirmado: false
                    }],
                    fixture: null
                };

                // Enviamos las 3 opciones calculadas nativamente a su pantalla
                socket.emit('salaCreadaExito', { salaToken: tokenUnico, apuestaOro: oroApuesta, opcionesDraft });
                if (!esPrivada) io.emit('listaSalasPublicas', obtenerSalasPublicas(salasActivas));

            } catch (err) {
                console.error("❌ Error al crear Sala Mundial:", err.message);
                socket.emit('errorPvp', { mensaje: "Fallo al procesar la reserva de oro." });
            }
        });

        // 🔑 UNIRSE A SALA BLOQUEANDO REPETIDOS
        socket.on('unirseSalaTorneo', async ({ salaToken, contrasenia, usuarioId, username, albumCompletoJugador }) => {
            const salaNombre = `sala_${salaToken}`;
            const sala = salasActivas[salaNombre];

            if (!sala) return socket.emit('errorPvp', { mensaje: "La sala del torneo no existe." });
            if (sala.jugadores.length >= 16) return socket.emit('errorPvp', { mensaje: "El torneo mundialista ya está lleno." });
            if (sala.estado !== "LOBBY") return socket.emit('errorPvp', { mensaje: "El torneo ya inició." });

            if (sala.esPrivada && sala.contrasenia !== contrasenia) {
                return socket.emit('errorPvp', { mensaje: "🔐 Contraseña incorrecta." });
            }

            try {
                const userCheck = await pool.query("SELECT monedas FROM usuarios WHERE id = $1", [usuarioId]);
                if (userCheck.rows.length === 0 || userCheck.rows[0].monedas < sala.apuestaOro) {
                    return socket.emit('errorPvp', { mensaje: "❌ No tenés suficiente Oro para abonar la inscripción a este torneo." });
                }

                // Scaneamos qué países ya confirmaron los otros técnicos reales de la sala
                const seleccionesOcupadas = sala.jugadores.map(j => j.seleccion).filter(Boolean);
                
                // Calculamos su terna bloqueando las que ya están reservadas
                const opcionesDraft = calcularTernaDraft(albumCompletoJugador || [], seleccionesOcupadas);
                if (opcionesDraft.length === 0) {
                    return socket.emit('errorPvp', { mensaje: "❌ No te quedan opciones libres. Las selecciones de tu álbum ya están ocupadas por otros rivales en esta sala." });
                }

                await pool.query("UPDATE usuarios SET monedas = monedas - $1 WHERE id = $2", [sala.apuestaOro, usuarioId]);
                sala.pozoTotal += sala.apuestaOro;

                socket.join(salaNombre);

                const nuevoJugador = {
                    usuarioId,
                    username,
                    socketId: socket.id,
                    seleccion: null,
                    estrellasPlantel: 1,
                    esBot: false,
                    draftConfirmado: false
                };

                sala.jugadores.push(nuevoJugador);

                socket.emit('unionExitosaTorneo', { 
                    salaToken, 
                    salaInfo: { apuestaOro: sala.apuestaOro, pozoTotal: sala.pozoTotal },
                    opcionesDraft
                });

                io.to(salaNombre).emit('jugadorSeUnioLobby', { 
                    jugadores: sala.jugadores.map(j => ({ username: j.username, seleccion: j.seleccion || "Eligiendo..." })) 
                });

            } catch (err) {
                console.error("❌ Error al unirse al Torneo:", err.message);
                socket.emit('errorPvp', { mensaje: "Error de sincronización con el banco de oro." });
            }
        });

        socket.on('confirmarDraftJugador', ({ salaToken, seleccionElegida, estrellas }) => {
            const salaNombre = `sala_${salaToken}`;
            const sala = salasActivas[salaNombre];
            if (!sala) return;

            const jugador = sala.jugadores.find(j => j.socketId === socket.id);
            if (jugador) {
                jugador.seleccion = seleccionElegida;
                jugador.estrellasPlantel = parseInt(estrellas) || 1;
                jugador.draftConfirmado = true;
                console.log(`🎮 Draft Confirmado por ${jugador.username}: ${seleccionElegida} (⭐${jugador.estrellasPlantel})`);
            }

            io.to(salaNombre).emit('jugadorSeUnioLobby', { 
                jugadores: sala.jugadores.map(j => ({ username: j.username, seleccion: j.seleccion || "Eligiendo..." })) 
            });
        });

        socket.on('lanzarMinimundial', async ({ salaToken }) => {
            const salaNombre = `sala_${salaToken}`;
            const sala = salasActivas[salaNombre];
            if (!sala) return;

            let botCount = 1;
            while (sala.jugadores.length < 16) {
                const usadas = sala.jugadores.map(j => j.seleccion).filter(Boolean);
                const disponibles = LISTA_SELECCIONES.filter(s => !usadas.includes(s));
                const seleccionBot = disponibles.length > 0 ? disponibles[0] : "Sorpresa FC";

                sala.jugadores.push({
                    usuarioId: `BOT_${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
                    username: `Bot IA ${botCount++}`,
                    socketId: null,
                    seleccion: seleccionBot,
                    estrellasPlantel: Math.floor(Math.random() * 3) + 3, 
                    esBot: true,
                    draftConfirmado: true
                });
            }

            sala.jugadores.forEach(j => {
                if (!j.draftConfirmado) {
                    const usadas = sala.jugadores.map(x => x.seleccion).filter(Boolean);
                    const disponibles = LISTA_SELECCIONES.filter(s => !usadas.includes(s));
                    j.seleccion = disponibles.length > 0 ? disponibles[0] : "Invitado FC";
                    j.draftConfirmado = true;
                }
            });

            sala.estado = "JUGANDO";
            sala.faseActual = "octavos";
            sala.partidoIndiceActual = 0; 
            
            await pool.query("UPDATE salas_multijugador SET estado = 'JUGANDO' WHERE id = $1", [sala.dbId]);

            sala.fixture = armarCrucesOctavos(sala.jugadores);

            io.to(salaNombre).emit('mundialComenzado', { fixture: sala.fixture, pozoTotal: sala.pozoTotal });
            simularPartidoIndividual(salaNombre, io, pool);
        });

        socket.on('disconnect', () => {
            for (const salaNombre in salasActivas) {
                const sala = salasActivas[salaNombre];
                const index = sala.jugadores.findIndex(j => j.socketId === socket.id);
                if (index !== -1) {
                    const desertor = sala.jugadores[index];
                    if (sala.estado === "LOBBY") {
                        sala.jugadores.splice(index, 1);
                        io.to(salaNombre).emit('jugadorSeUnioLobby', { jugadores: sala.jugadores.map(j => ({username: j.username, seleccion: j.seleccion || "Eligiendo..."})) });
                    } else {
                        desertor.estrellasPlantel = 0;
                        desertor.socketId = null;
                    }
                    break;
                }
            }
        });
    });

    // ========================================================================
    // 📺 SIMULACIÓN INDIVIDUAL (PARTIDO POR PARTIDO SECUENCIAL)
    // ========================================================================
    function simularPartidoIndividual(salaNombre, io, pool) {
        const sala = salasActivas[salaNombre];
        if (!sala || sala.estado !== "JUGANDO") return;

        const fase = sala.faseActual;
        const partidosDeFase = sala.fixture[fase];
        const idx = sala.partidoIndiceActual;

        if (idx >= partidosDeFase.length) {
            avanzarDeFaseMundial(salaNombre, io, pool);
            return;
        }

        const cruce = partidosDeFase[idx];
        let min = 0;

        io.to(salaNombre).emit('partidoEnFocoVivido', {
            fase: fase.toUpperCase(),
            partidoNumero: idx + 1,
            totalPartidos: partidosDeFase.length,
            local: { username: cruce.local.username, seleccion: cruce.local.seleccion, usuarioId: cruce.local.usuarioId },
            visitante: { username: cruce.visitante.username, seleccion: cruce.visitante.seleccion, usuarioId: cruce.visitante.usuarioId }
        });

        const timerPartido = setInterval(() => {
            min += 15;

            const fuerzaLocal = cruce.local.estrellasPlantel || 1;
            const fuerzaVisitante = cruce.visitante.estrellasPlantel || 1;

            if (Math.random() * 100 < (fuerzaLocal * 7)) cruce.golesLocal++;
            if (Math.random() * 100 < (fuerzaVisitante * 7)) cruce.golesVisitante++;

            io.to(salaNombre).emit('tickMinutoIndividual', {
                minuto: min,
                golesLocal: cruce.golesLocal,
                golesVisitante: cruce.golesVisitante,
                fixture: sala.fixture
            });

            if (min >= 90) {
                clearInterval(timerPartido);

                if (cruce.golesLocal === cruce.golesVisitante) {
                    if (Math.random() > 0.5) cruce.golesLocal++; else cruce.golesVisitante++;
                }

                cruce.terminado = true;
                cruce.ganador = cruce.golesLocal > cruce.golesVisitante ? cruce.local : cruce.visitante;

                io.to(salaNombre).emit('partidoIndividualConcluido', { fixture: sala.fixture });

                setTimeout(() => {
                    sala.partidoIndiceActual++;
                    simularPartidoIndividual(salaNombre, io, pool);
                }, 3000);
            }
        }, 1000); 
    }

    function avanzarDeFaseMundial(salaNombre, io, pool) {
        const sala = salasActivas[salaNombre];
        if (!sala) return;

        if (sala.faseActual === "octavos") {
            sala.faseActual = "cuartos";
            const ganadores = sala.fixture.octavos.map(c => c.ganador);
            for (let i = 0; i < 8; i += 2) sala.fixture.cuartos.push({ local: ganadores[i], visitante: ganadores[i+1], golesLocal: 0, golesVisitante: 0, terminado: false, ganador: null });
        } else if (sala.faseActual === "cuartos") {
            sala.faseActual = "semi";
            const ganadores = sala.fixture.cuartos.map(c => c.ganador);
            for (let i = 0; i < 4; i += 2) sala.fixture.semi.push({ local: ganadores[i], visitante: ganadores[i+1], golesLocal: 0, golesVisitante: 0, terminado: false, ganador: null });
        } else if (sala.faseActual === "semi") {
            sala.faseActual = "final";
            const ganadores = sala.fixture.semi.map(c => c.ganador);
            sala.fixture.final.push({ local: ganadores[0], visitante: ganadores[1], golesLocal: 0, golesVisitante: 0, terminado: false, ganador: null });
        } else if (sala.faseActual === "final") {
            finalizarTorneoCompleto(salaNombre, io, pool);
            return;
        }

        sala.partidoIndiceActual = 0; 
        io.to(salaNombre).emit('nuevaFaseAlcanzada', { fase: sala.faseActual.toUpperCase(), fixture: sala.fixture });
        
        setTimeout(() => {
            simularPartidoIndividual(salaNombre, io, pool);
        }, 4000);
    }

    function obtenerSalasPublicas(salas) {
        return Object.values(salas)
            .filter(s => !s.esPrivada && s.estado === "LOBBY")
            .map(s => ({ token: s.token, creador: s.jugadores[0].username, apuesta: s.apuestaOro, cupos: s.jugadores.length }));
    }

    function armarCrucesOctavos(jugadores) {
        const mezclados = [...jugadores].sort(() => Math.random() - 0.5);
        const octavos = [];
        for (let i = 0; i < 16; i += 2) {
            octavos.push({ local: mezclados[i], visitante: mezclados[i+1], golesLocal: 0, golesVisitante: 0, terminado: false, ganador: null });
        }
        return { octavos, cuartos: [], semi: [], final: [], campeon: null };
    }

    async function finalizarTorneoCompleto(salaNombre, io, pool) {
        const sala = salasActivas[salaNombre];
        if (!sala) return;

        const campeon = sala.fixture.final[0].ganador;
        sala.fixture.campeon = campeon;

        let mensajeDestacado = `🏆 ¡EL MUNDIAL TERMINÓ! Campeón del Mundo: ${campeon.seleccion.toUpperCase()} (${campeon.username})`;

        try {
            if (!campeon.esBot) {
                await pool.query("UPDATE usuarios SET monedas = monedas + $1 WHERE id = $2", [sala.pozoTotal, campeon.usuarioId]);
                mensajeDestacado += ` y se lleva el pozo de 💰 ${sala.pozoTotal} monedas de oro!`;
            } else {
                mensajeDestacado += `. ¡La IA se impuso y el pozo de 💰 ${sala.pozoTotal} monedas quedó congelado en la casa!`;
            }

            await pool.query("UPDATE salas_multijugador SET estado = 'FINALIZADO' WHERE id = $1", [sala.dbId]);
            io.to(salaNombre).emit('mundialFinalizadoCompleto', { ganadorId: campeon.usuarioId, username: campeon.username, mensaje: mensajeDestacado, fixture: sala.fixture });
        } catch (err) {
            console.error("❌ Error al cerrar premios del Mundial:", err.message);
        } finally {
            delete salasActivas[salaNombre];
        }
    }
}


/* ========================================================================
   🚀 INICIALIZACIÓN FINAL DEL SERVIDOR (Esto va ABAJO DE TODO)
   ======================================================================== */
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Llamamos al módulo pasándole las instancias que acabamos de crear arriba
inicializarModuloMultijugador(io, pool);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en la Nube con Socket.io activo en puerto ${PORT}`);
});
