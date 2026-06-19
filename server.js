const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // ✨ Migrado a PostgreSQL para Neon
const path = require('path');

const app = express();
// ✨ Clave para leer la IP real del cliente detrás del proxy de Render
app.set('trust proxy', true);

// ✨ Render asigna el puerto dinámicamente; si no encuentra, usa el 3000
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ========================================================================
   🛠️ CONFIGURACIÓN DE MODO MANTENIMIENTO / MODO SOLO YO
   ======================================================================== */
// 🚨 Pasalo a true para cerrar el juego y quedarte probando vos solo.
// Cuando quieras volver a jugar con los pibes, lo pasás a false.
const MODO_MANTENIMIENTO = true; 

app.use((req, res, next) => {
    // Si el mantenimiento está apagado, el juego fluye normal para todos
    if (!MODO_MANTENIMIENTO) {
        return next();
    }

    // Permitimos descargar siempre los archivos estáticos de la interfaz
    if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html') || req.path.endsWith('.css') || req.path.endsWith('.js') || req.path.endsWith('.png'))) {
        return next();
    }

    // Capturamos el username de las peticiones de autenticación
    const { username } = req.body;

    // ✨ CONTROL DE ACCESO: Si es tu cuenta, te deja pasar sin trabas
    if (username && username.toLowerCase() === "agustin") {
        return next();
    }

    // Para el login o registro de cualquiera que NO seas vos, rebota de una
    if (req.path.startsWith('/api/login') || req.path.startsWith('/api/registro')) {
        return res.status(503).json({ 
            error: "🛠️ La Arena está en mantenimiento por reformas de infraestructura. ¡Volvé más tarde!" 
        });
    }

    // Para el resto de las llamadas internas de la API (cofres, penales, timba),
    // si un usuario común ya tenía la sesión abierta de antes, lo frena acá también.
    // (A vos te deja fluir porque tus llamadas de juego no van a pasar por las rutas de login/registro bloqueadas)
    next();
});

/* ========================================================================
   📦 CONFIGURACIÓN Y CONEXIÓN DE BASE DE DATOS (POSTGRESQL - NEON)
   ======================================================================== */
// Se conecta usando la variable de entorno segura que vas a setear en Render
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
        // 1. Tabla de Usuarios (Actualizada con TIMESTAMP y columna ip_registro)
        await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password TEXT NOT NULL,
            monedas INTEGER DEFAULT 200,
            puntos_ranking INTEGER DEFAULT 0,
            ultimo_tiro_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            tiros_hoy INTEGER DEFAULT 10,
            ip_registro VARCHAR(45) DEFAULT ''
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

        // Verificamos si la tabla de jugadores está vacía para meter la lista inicial
        const checkJugadores = await pool.query("SELECT COUNT(*) as count FROM jugadores");
        if (parseInt(checkJugadores.rows[0].count) === 0) {
            const granListaJugadores = [
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

// Ejecutamos la inicialización de tablas asíncrona
inicializarTablas();

/* ========================================================================
   👤 ENDPOINTS DE AUTENTICACIÓN Y SISTEMA DE USUARIOS REFORMADO
   ======================================================================== */

// 1. INICIAR SESIÓN (Solo entra si ya existe y coincide la clave)
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

// 2. CREAR USUARIO (Con restricción estricta de una cuenta por IP)
app.post('/api/registro', async (req, res) => {
    const { username, password } = req.body;
    const ipCliente = req.ip; // Captura la IP del dispositivo o router

    try {
        // A. Verificamos si ya existe alguien con ese nombre
        const userCheck = await pool.query("SELECT * FROM usuarios WHERE username = $1", [username]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "❌ Ese nombre de usuario ya está ocupado." });
        }

        // B. Verificamos si esa IP ya registró una cuenta anteriormente
        if (ipCliente && ipCliente !== '::1' && ipCliente !== '127.0.0.1') {
            const ipCheck = await pool.query("SELECT * FROM usuarios WHERE ip_registro = $1", [ipCliente]);
            if (ipCheck.rows.length > 0) {
                return res.status(400).json({ error: "❌ Límite excedido: Ya se creó una cuenta desde esta conexión a Internet." });
            }
        }

        // C. Si está libre el nombre y la IP, creamos la cuenta guardando su IP
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

    let costo = 250;
    let probLegendaria = 0.05; 
    let probEpica = 0.15;      
    let probEspecial = 0.30;   

    if (tipoCofre === 'plata') {
        costo = 100;
        probLegendaria = 0.005; 
        probEpica = 0.05;       
        probEspecial = 0.20;    
    } else if (tipoCofre === 'legendario') {
        costo = 500;
        probLegendaria = 0.25;  
        probEpica = 0.40;       
        probEspecial = 0.35;    
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
        for (let i = 0; i < 3; i++) {
            let rand = Math.random();
            let rarezaElegida = 'comun';

            if (rand < probLegendaria) rarezaElegida = 'legendaria';
            else if (rand < probLegendaria + probEpica) rarezaElegida = 'epica';
            else if (rand < probLegendaria + probEpica + probEspecial) rarezaElegida = 'especial';

            let poolFiltrado = todosLosJugadores.filter(j => j.rareza === rarezaElegida);
            if (poolFiltrado.length === 0) poolFiltrado = todosLosJugadores.filter(j => j.rareza === 'comun');
            
            let elegido = poolFiltrado[Math.floor(Math.random() * poolFiltrado.length)];
            sobreAbierto.push({ ...elegido });
        }

        const nuevoOro = usuario.monedas - costo;
        await pool.query("UPDATE usuarios SET monedas = $1 WHERE id = $2", [nuevoOro, usuario_id]);

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
   ⚽ ENDPOINTS DEL MÓDULO DE PENALES (SISTEMA DE ENERGÍA POR HORA)
   ======================================================================== */
const MAX_TIROS = 10;
const MILISEGUNDOS_POR_TIRO = 6 * 60 * 1000; // ⏱️ 1 Hora en milisegundos

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

/* ========================================================================
   🎰 MÓDULO DE LA TIMBA SEGURO E INHACKEABLE
   ======================================================================== */
const apuestasActivasServidor = {};

function generarGolesServidor() {
    const r = Math.random();
    if (r < 0.25) return 0;
    if (r < 0.55) return 1;
    if (r < 0.80) return 2;
    if (r < 0.93) return 3;
    return Math.floor(Math.random() * 3) + 4;
}

app.post('/api/timba/preparar', (req, res) => {
    const { usuario_id, montoApuesta } = req.body;
    
    if (!usuario_id || !montoApuesta || montoApuesta <= 0) {
        return res.status(400).json({ ok: false, mensaje: "Datos inválidos." });
    }

    const golesLReal = generarGolesServidor();
    const golesVReal = generarGolesServidor();
    const signoReal = golesLReal > golesVReal ? 'L' : (golesLReal < golesVReal ? 'V' : 'E');

    const combinacionesUsadas = new Set();
    combinacionesUsadas.add(`${golesLReal}-${golesVReal}`);

    const poolOpciones = [
        { label: `${golesLReal} - ${golesVReal}`, tipo: 'exacto' }
    ];

    for (let i = 0; i < 2; i++) {
        let glSigno = generarGolesServidor();
        let gvSigno = generarGolesServidor();
        let combo = `${glSigno}-${gvSigno}`;
        let signoOpc = glSigno > gvSigno ? 'L' : (glSigno < gvSigno ? 'V' : 'E');
        let intentos = 0;

        while ((combinacionesUsadas.has(combo) || signoOpc !== signoReal) && intentos < 30) {
            glSigno = generarGolesServidor();
            gvSigno = generarGolesServidor();
            if (intentos > 15) {
                if (signoReal === 'L') { glSigno = golesLReal + 1; gvSigno = golesVReal; }
                else if (signoReal === 'V') { glSigno = golesLReal; gvSigno = golesVReal + 1; }
                else { glSigno = golesLReal + 1; gvSigno = golesVReal + 1; }
            }
            combo = `${glSigno}-${gvSigno}`;
            signoOpc = glSigno > gvSigno ? 'L' : (glSigno < gvSigno ? 'V' : 'E');
            intentos++;
        }
        combinacionesUsadas.add(combo);
        poolOpciones.push({ label: `${glSigno} - ${gvSigno}`, tipo: 'signo' });
    }

    for (let i = 0; i < 3; i++) {
        let glErr = generarGolesServidor();
        let gvErr = generarGolesServidor();
        let combo = `${glErr}-${gvErr}`;
        let signoOpc = glErr > gvErr ? 'L' : (glErr < gvErr ? 'V' : 'E');
        let intentos = 0;

        while ((combinacionesUsadas.has(combo) || signoOpc === signoReal) && intentos < 30) {
            glErr = generarGolesServidor();
            gvErr = generarGolesServidor();
            if (intentos > 15) {
                if (signoReal === 'L' || signoReal === 'E') { glErr = 0; gvErr = i + 1; } 
                else { glErr = i + 1; gvErr = 0; }
            }
            combo = `${glErr}-${gvErr}`;
            signoOpc = glErr > gvErr ? 'L' : (glErr < gvErr ? 'V' : 'E');
            intentos++;
        }
        combinacionesUsadas.add(combo);
        poolOpciones.push({ label: `${glErr} - ${gvErr}`, tipo: 'error' });
    }

    const poolParaCliente = poolOpciones.map((opc, index) => ({
        idOpcion: index,
        label: opc.label
    })).sort(() => Math.random() - 0.5);

    apuestasActivasServidor[usuario_id] = {
        golesLReal,
        golesVReal,
        montoApuesta,
        mapeoOpciones: poolOpciones
    };

    res.json({ ok: true, opciones: poolParaCliente });
});

app.post('/api/timba/procesar', async (req, res) => {
    const { usuario_id, idOpcionElegida } = req.body;
    const apuesta = apuestasActivasServidor[usuario_id];

    if (!apuesta) {
        return res.status(400).json({ ok: false, mensaje: "No hay una apuesta activa preparada para este jugador." });
    }

    const { golesLReal, golesVReal, montoApuesta, mapeoOpciones } = apuesta;
    const opcionReal = mapeoOpciones[idOpcionElegida];

    let balanceMonedas = 0;
    let mensajeResultado = "";
    let puntosAsignados = 0;

    if (opcionReal.tipo === 'exacto') {
        balanceMonedas = montoApuesta * 3;
        puntosAsignados = 20;
        mensajeResultado = `¡QUÉ ANIMAL! Elegiste el resultado exacto (${golesLReal}-${golesVReal}).\nGanaste: ${montoApuesta * 3} monedas (Total devuelto: ${montoApuesta * 4})`;
    } else if (opcionReal.tipo === 'signo') {
        balanceMonedas = Math.round(montoApuesta * 0.5);
        mensajeResultado = `¡BIEN AHÍ! Acertaste el ganador/empate (Elegiste ${opcionReal.label}). El resultado real fue ${golesLReal}-${golesVReal}.\nGanaste: ${balanceMonedas} monedas (Total devuelto: ${montoApuesta + balanceMonedas})`;
    } else {
        balanceMonedas = -montoApuesta;
        mensajeResultado = `¡ERRASTE! El partido terminó ${golesLReal}-${golesVReal} y vos elegiste ${opcionReal.label}.\nPerdiste: ${montoApuesta} monedas.`;
    }

    try {
        await pool.query(
            `UPDATE usuarios SET monedas = monedas + $1, puntos_ranking = puntos_ranking + $2 WHERE id = $3`, 
            [balanceMonedas, puntosAsignados, usuario_id]
        );
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
        return res.status(500).json({ ok: false, mensaje: "Error en DB." });
    }
});

/* ========================================================================
   🚀 INICIALIZACIÓN DEL SERVIDOR
   ======================================================================== */
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en la Nube / Red Local activo en puerto ${PORT}`);
});