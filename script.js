const CATALOGO_EVENTOS_MUNDIAL = {
    // ==========================================
    // ⚽ PENALES
    // ==========================================
    penal_favor: {
        titulo: "🔥 ¡PENAL A FAVOR!",
        relato: "¡Falta durísima adentro del área! El árbitro mete silbatazo y señala el punto penal. ¡Momento de máxima tensión en el estadio!",
        opciones: [
            { texto: "💥 Romperle el arco al medio de un fustazo", exito: 0.75, okTexto: "¡GOOOL! Cañonazo violento al centro, el arquero voló a un costado.", badTexto: "¡Ufff! El remate reventó el travesaño y salió volando al lateral." },
            { texto: "🎯 Colocarla sutil contra el palo derecho", exito: 0.85, okTexto: "¡GOOOL! La acarició con la cara interna pegada al poste, inalcanzable.", badTexto: "¡La adivinó! El arquero voló como un gato y la desvió al córner." },
            { texto: "👑 Picarla con clase a lo Abreu (Panenka)", exito: 0.40, okTexto: "¡GOOOLAZO! Qué locura divina, la picó con una frialdad de Leyenda.", badTexto: "¡Papelón! Fue masita al medio y el arquero la embolsó sin moverse." }
        ]
    },
    atajar_penal: {
        titulo: "🚨 ¡PENAL EN CONTRA!",
        relato: "¡Peligro extremo! Tu defensor llegó tarde en el área chica. El rival acomoda el balón...",
        opciones: [
            { texto: "🧤 Volar decidido al palo izquierdo", exito: 0.50, okTexto: "¡MONUMENTAL! Volaste al poste izquierdo y la cacheteaste al córner con la punta de los dedos.", badTexto: "¡Gol del rival! Pateó fuerte y cruzado al ángulo opuesto." },
            { texto: "🧍 Quedarte parado esperando un remate al centro", exito: 0.40, okTexto: "¡ATAJASTE! Se la jugó a patear suave al medio y le adivinaste la intención.", badTexto: "¡Gol del rival! La abrió sutil contra el poste derecho mientras vos mirabas." }
        ]
    },

    // ==========================================
    // 📐 CÓRNERS & PELOTAS PARADAS
    // ==========================================
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
    tirolibre_indirecto_contra: {
        titulo: "⚠️ TIRO LIBRE INDIRECTO EN TU ÁREA",
        relato: "¡Insólito! Tu arquero retuvo la pelota de más y el juez cobra tiro libre indirecto a cinco metros del arco. ¡Toda tu selección se para abajo de los tres palos!",
        opciones: [
            { texto: "🧱 Salir disparado de la línea a bloquear el fustazo", exito: 0.60, okTexto: "¡HERÓICO! Tu central se tiró de cabeza e interceptó el bombazo con el pecho.", badTexto: "¡Gol del rival! El tiro pasó entre una marea de piernas y perforó la red." },
            { texto: "🧤 Confiar en los reflejos del arquero tapado", exito: 0.50, okTexto: "¡MILAGRO! Tu arquero reaccionó a puro reflejo y manoteó el balón en la línea.", badTexto: "¡Gol del rival! El toque corto descolocó a todos y la empujaron con facilidad." }
        ]
    },

    // ==========================================
    // ⚡ ATAQUES & JUGADAS COLECTIVAS
    // ==========================================
    contrataque_favor: {
        titulo: "⚡ CONTRATAQUE EXPLOSIVO",
        relato: "¡Robo letal en mitad de cancha! Quedaron tus 2 delanteros contra 1 solo defensor desesperado...",
        opciones: [
            { text: "🏃 Hacer la individual y eludir al arquero", exito: 0.60, okTexto: "¡GOOOL! Gambeta larga, desparramó al arquero por el piso y definió solo.", badTexto: "Se abrió demasiado al enganchar y el central llegó justo a trabarle el remate." },
            { texto: "🤝 Darle el pase atrás al compañero que entra libre", exito: 0.80, okTexto: "¡GOOOL! Pase milimétrico al medio para que el delantero la empuje a la red.", badTexto: "El pase fue muy exigido, rebotó en el talón del defensor y despejaron." }
        ]
    },
    mano_a_mano_extremo: {
        titulo: "🏃‍♂️ ¡MANO A MANO AGÓNICO!",
        relato: "¡Tu mediocampista filtró un pase tres dedos increíble! El delantero pica al vacío y queda solo, cara a cara frente al arquero rival...",
        opciones: [
            { texto: "👟 Definir cruzado con sutileza al segundo palo", exito: 0.70, okTexto: "¡GOOOL! Definió de manual abriendo el pie. ¡Fina estampa de goleador!", badTexto: "¡Se fue ancha! Intentó colocarla demasiado y la pelota besó el poste de afuera." },
            { texto: "🧤 Amagar un remate y gambetear al uno", exito: 0.60, okTexto: "¡GOOOLAZO! Dejó pintado al uno en el piso con un quiebre de cintura y definió caminando.", badTexto: "El golero rival leyó el amague, estiró los brazos y le arrebató el balón de los pies." },
            { texto: "🚀 Fusilar al primer poste con rabia", exito: 0.55, okTexto: "¡GOOOL! Le reventó las manos al portero. Un remate inapelable que infló la red.", badTexto: "El misil impactó de lleno en la parte externa del poste. ¡Se salvó el bot!" }
        ]
    },
    centro_a_la_olla: {
        titulo: "🪂 CENTRO A LA OLLA DE ÚLTIMO RECURSO",
        relato: "El reloj corre... Tu lateral proyectado manda un buscapiés aéreo a la marea de camisetas en el área penal.",
        opciones: [
            { texto: "🤸‍♀️ Ensayar una chilena espectacular", exito: 0.35, okTexto: "¡¡¡GOOOOLAZO DEL MUNDIAL!!! Hizo una pirueta mística en el aire y la clavó al ángulo de espaldas. ¡De pie todo el estadio!", badTexto: "No logró impactar bien la pelota y cayó de espalda de forma aparatosa. Saque de arco." },
            { texto: "🐂 Meter un frentazo potente anticipando con el físico", exito: 0.65, okTexto: "¡GOOOL! Se elevó como un titán, le ganó en el salto al central y la mandó a guardar abajo.", badTexto: "El cabezazo fue defectuoso y el guardameta desvió con los puños por arriba." }
        ]
    },

    // ==========================================
    // 🛡️ ACCIONES DEFENSIVAS EXTREMAS
    // ==========================================
    defensa_urgente: {
        titulo: "🚨 ¡ATAQUE PELIGROSO RIVAL!",
        relato: "El enganche robó la pelota y habilitó al extremo que entra solo por la banda derecha...",
        opciones: [
            { texto: "🛑 Mandar al central a barrerse con todo", exito: 0.65, okTexto: "¡FRENADO! Cruce perfecto abajo barriendo limpiamente la pelota al lateral.", badTexto: "Llegó tarde. El delantero metió un amague sutil y quedó mano a mano." },
            { texto: "🧤 Ordenar que el arquero achique rápido el ángulo", exito: 0.55, okTexto: "¡SALVADA! El uno achicó de forma monumental y tapó el mano a mano con el pecho.", badTexto: "El atacante la pinchó con una categoría enorme por encima de tu arquero. Gol." }
        ]
    },
    mano_a_mano_defensa: {
        titulo: "🧤 ¡MANO A MANO EN CONTRA!",
        relato: "¡Se rompió el offside! El delantero bot picó totalmente solo y se encamina hacia tu arco. ¡Tensión absoluta!",
        opciones: [
            { texto: "📐 Forzarlo a abrirse hacia la línea de fondo", exito: 0.65, okTexto: "¡EXCELENTE! Tu arquero lo arrastró hasta una zona sin ángulo y el tiro dio en la red exterior.", badTexto: "¡Gol del rival! Te amagó para adentro, se acomodó y definió suave al palo izquierdo." },
            { texto: "🧱 Cometer falta táctica al borde del área (Posible Roja)", exito: 0.70, okTexto: "¡SALVADO! Tu central lo derribó antes de entrar al área. Sacrificio heroico y tiro libre.", badTexto: "¡Gol del rival! Trató de derribarlo pero el atacante aguantó el embate y marcó igual." }
        ]
    },
    tiro_esquina_defensa: {
        titulo: "🧱 CÓRNER EN CONTRA BAJO PRESIÓN",
        relato: "El rival lanza un córner cerrado con rosca. Tu área chica es un hervidero de empujones.",
        opciones: [
            { texto: "🥊 Ordenar al arquero salir con los puños firmes", exito: 0.60, okTexto: "¡DESPEJADO! Tu portero se impuso en las alturas y voló el balón a zona segura.", badTexto: "¡Gol del rival! Salió en falso cazando moscas y el delantero cabeceó al arco vacío." },
            { texto: "🛡️ Hacer marca personal estricta al goleador bot", exito: 0.70, okTexto: "¡MARCADO! Tu defensor molestó lo suficiente al cabeceador para que su tiro salga desviado.", badTexto: "¡Gol del rival! Se desmarcó con un amague y metió un frentazo letal." }
        ]
    },

    // ==========================================
    // 🌍 FACTORES EXTERNOS Y CLIMÁTICOS (MÍSTICA)
    // ==========================================
    tormenta_inesperada: {
        titulo: "🌧️ DILUVIO EN LA ARENA",
        relato: "Se larga una lluvia torrencial. El césped está rapidísimo y el balón patina de forma incontrolable.",
        opciones: [
            { texto: "💨 Probar un tiro de media distancia buscando el rebote del arquero", exito: 0.55, okTexto: "¡GOOOL! Tu volante disparó rasante, el balón picó antes y se le escurrió de las manos al arquero rival.", badTexto: "El disparo salió sumamente desviado por culpa de la inestabilidad del terreno." },
            { texto: "🤝 Jugar pases cortos y seguros para cuidar la posesión", exito: 0.70, okTexto: "¡DOMINADO! Tu equipo movió la redonda de primera, durmiendo al rival y controlando el ritmo.", badTexto: "¡Contra fatal! Una entrega corta quedó muerta en un charco de agua y el bot recuperó." }
        ]
    },
    aliento_tribuna: {
        titulo: "🥁 ¡EMPUJE DE LA HINCHADA!",
        relato: "¡El estadio entero ruge cantando por tu selección! El aliento ensordecedor baja de las gradas...",
        opciones: [
            { texto: "🔥 Adelantar las líneas y presionar la salida rival", exito: 0.65, okTexto: "¡GOOOL! Forzaste el error del central rival, le robaste la redonda y la mandaste a guardar de primera.", badTexto: "La presión dejó un hueco enorme atrás y el bot metió una contra letal que terminó en gol." },
            { texto: "🧘 Guardar la calma y jugar con la desesperación del bot", exito: 0.75, okTexto: "¡CONTROLADO! El bot se desesperó ante los cantos, cometió faltas y recuperaste la compostura.", badTexto: "Te replegaste demasiado y el rival capitalizó un rebote en el área para marcar." }
        ]
    }
};
