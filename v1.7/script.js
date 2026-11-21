// ==========================================
// CROSSPLAY ZONE - PWA + Auth + Perfil Social + Admin + Eventos JSON
// ==========================================

// ---------- PWA (INSTALACIÓN DESDE MENÚ) ----------
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#btnInstallPWA_menu').show();
});

function instalarApp(e) {
  if (e) e.preventDefault();
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        $('#btnInstallPWA_menu').hide();
      }
      deferredPrompt = null;
    });
  } else {
    alert("Para instalar la app, abre esta página en Chrome desde tu celular y selecciona 'Agregar a la pantalla de inicio'.");
  }
}

$('#btnInstallPWA_menu').on('click', instalarApp);

if (window.matchMedia('(display-mode: standalone)').matches) {
  $('#btnInstallPWA_menu').hide();
}

// ---------- REGISTRO DEL SERVICE WORKER ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(registration => {
        console.log('Service Worker registrado con éxito:', registration.scope);
      })
      .catch(error => {
        console.log('Error al registrar el Service Worker:', error);
      });
  });
}

// ==========================================
// LÓGICA DE LA APLICACIÓN (JQUERY)
// ==========================================
$(document).ready(function() {

  // ---------- CONFIGURACIÓN ----------
  const HORAS_INICIO = ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
  const MAX_HORAS = 5;
  const MAX_DIAS_ADELANTE = 60;
  const MS_HORA = 3600000;
  const SOLO_LETRAS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
  const CLAVE_ALMACEN = 'cyberzone-reservas-v1';
  const CLAVE_EVENTOS_JSON = 'crossplay-eventos-json-v1';
  const CLAVE_ESTADOS_MAQ = 'crossplay-estados-maquinas-v1';
  const CLAVE_BLACKLIST = 'crossplay-admin-blacklist-v1';
  const CLAVE_SESION_LOCAL = 'crossplay-sesion-usuario-v1';
  const CLAVE_USUARIOS_LOCAL = 'crossplay-usuarios-registrados-v1';
  const CLAVE_PERFILES = 'crossplay-perfiles-sociales-v1';
  const AVATAR_DEFAULT = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

  // Agrega aquí tu correo real para que tenga rol ADMIN al iniciar sesión
  const CORREOS_ADMIN = [
    'nicovillegasherrera@gmail.com',
    'admin@crossplay.bo'
  ];

  // Blacklist inicial: correos bloqueados para entrar como admin
  const BLACKLIST_INICIAL = [
    'usuario@crossplay.bo',
    'jugador@crossplay.bo',
    'invitado@crossplay.bo'
  ];

  // Cliente Supabase para Auth (los eventos NO se guardan en Supabase, solo en eventos.json)
  const SUPABASE_URL = 'https://awnsrfhwvmnzauekxevg.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_Q0GZxsl-iNK25mEF2ZODBQ_INEWa-PU';
  const supabaseClient = (window.supabase && SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('TU-PROYECTO') && SUPABASE_ANON_KEY !== 'TU_SUPABASE_ANON_KEY')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const DIAS_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // ---------- SANEAMIENTO (DOMPurify) ----------
  function limpiarHTML(html) {
    if (window.DOMPurify) return DOMPurify.sanitize(html);
    return $('<div>').text(html).html();
  }
  function pintar($el, html) {
    $el.html(limpiarHTML(html));
    return $el;
  }

  // ---------- AYUDAS DE FECHA ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function claveFecha(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fechaDesdeClave(k) { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function construirFecha(k, hora) {
    const p = k.split('-').map(Number);
    const h = hora.split(':').map(Number);
    return new Date(p[0], p[1] - 1, p[2], h[0], h[1] || 0, 0, 0);
  }
  function inicioDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function sumarDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function indiceSemana(d) { return (d.getDay() + 6) % 7; }
  function inicioSemana(d) { return sumarDias(inicioDia(d), -indiceSemana(d)); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function textoDia(k) { const d = fechaDesdeClave(k); return DIAS_LARGO[indiceSemana(d)] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function etiquetaCorta(k) {
    const hoy = new Date();
    if (k === claveFecha(hoy)) return 'Hoy';
    if (k === claveFecha(sumarDias(hoy, 1))) return 'Mañana';
    const d = fechaDesdeClave(k);
    return DIAS_CORTO[indiceSemana(d)] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3);
  }
  function limites() { const min = inicioDia(new Date()); return { min: min, max: sumarDias(min, MAX_DIAS_ADELANTE) }; }
  function fechaPermitida(d) { const l = limites(); return d >= l.min && d <= l.max; }
  function fechaValida(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k || '') && fechaPermitida(fechaDesdeClave(k)); }
  function formatoDuracion(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
    if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
    if (h > 0) return h + 'h ' + m + 'm ' + seg + 's';
    return m + 'm ' + seg + 's';
  }

  // ---------- DATOS ----------
  const db = {
    pc: {
      nombre: "PC Gamer",
      maquinas: [
        { id: "pc-1", nombre: "PC-001", precio: 15, img: "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400" },
        { id: "pc-2", nombre: "PC-002", precio: 15, img: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=400" },
        { id: "pc-3", nombre: "PC-003", precio: 20, img: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400" },
        { id: "pc-4", nombre: "PC-004", precio: 20, img: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=400" }
      ]
    },
    play: {
      nombre: "PlayStation",
      maquinas: [
        { id: "ps5-1", nombre: "PS-01", precio: 20, img: "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=400" },
        { id: "ps5-2", nombre: "PS-02", precio: 20, img: "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=400" },
        { id: "ps4-1", nombre: "PS-03", precio: 15, img: "https://images.unsplash.com/photo-1507457379470-08b800bebc67?w=400" },
        { id: "ps4-2", nombre: "PS-04", precio: 15, img: "https://images.unsplash.com/photo-1507457379470-08b800bebc67?w=400" }
      ]
    },
    arcade: {
      nombre: "Arcade",
      maquinas: [
        { id: "arc-1", nombre: "ARC-01", precio: 10, img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400" },
        { id: "arc-2", nombre: "ARC-02", precio: 12, img: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=400" },
        { id: "arc-3", nombre: "ARC-03", precio: 10, img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400" },
        { id: "arc-4", nombre: "ARC-04", precio: 12, img: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=400" }
      ]
    },
    catalogo: {
      nombre: "Catálogo",
      juegos: [
        { nombre: "Fortnite", genero: "battle", plataforma: "pc", img: "https://cdn.cloudflare.steamstatic.com/steam/apps/1517290/header.jpg" },
        { nombre: "Valorant", genero: "fps", plataforma: "pc", img: "https://cdn.cloudflare.steamstatic.com/steam/apps/1172470/header.jpg" },
        { nombre: "Minecraft", genero: "rpg", plataforma: "pc", img: "https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg" },
        { nombre: "League of Legends", genero: "moba", plataforma: "pc", img: "https://cdn.cloudflare.steamstatic.com/steam/apps/1269260/header.jpg" },
        { nombre: "God of War", genero: "accion", plataforma: "ps4/ps5", img: "https://cdn.cloudflare.steamstatic.com/steam/apps/2322010/header.jpg" },
        { nombre: "Spider-Man 2", genero: "accion", plataforma: "ps5", img: "https://cdn.cloudflare.steamstatic.com/steam/apps/2651280/header.jpg" },
        { nombre: "EA FC 24", genero: "deportes", plataforma: "ps4/ps5", img: "https://cdn.cloudflare.steamstatic.com/steam/apps/2195250/header.jpg" },
        { nombre: "Street Fighter 6", genero: "accion", plataforma: "arcade", img: "https://cdn.cloudflare.steamstatic.com/steam/apps/1364780/header.jpg" }
      ]
    },
    snacks: {
      nombre: "Snacks",
      items: [
        { id: "snk-1", nombre: "Hamburguesa Clásica", precio: 25, desc: "Carne, queso cheddar, lechuga, tomate y papas", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400" },
        { id: "snk-2", nombre: "Hamburguesa Doble Bacon", precio: 35, desc: "Doble carne, tocino crocante y salsa especial", img: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400" },
        { id: "snk-3", nombre: "Pizza Pepperoni (Porción)", precio: 18, desc: "Masa artesanal, mozzarella y pepperoni", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400" },
        { id: "snk-4", nombre: "Pizza Suprema Familiar", precio: 65, desc: "8 porciones con carnes, pimentón y aceitunas", img: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400" },
        { id: "snk-5", nombre: "Papas Fritas con Cheddar", precio: 16, desc: "Crocantes con queso fundido y tocino picado", img: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400" },
        { id: "snk-6", nombre: "Hot Dog Especial", precio: 15, desc: "Salchicha jumbo, papas hilo y salsas de la casa", img: "https://images.unsplash.com/photo-1619740455993-9e612b1af08a?w=400" },
        { id: "snk-7", nombre: "Alitas BBQ (6 pzas)", precio: 28, desc: "Bañadas en salsa barbacoa o picante", img: "https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=400" },
        { id: "snk-8", nombre: "Nachos con Queso", precio: 20, desc: "Totopos, queso cheddar, jalapeños y salsa", img: "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=400" }
      ]
    }
  };

  function todasLasMaquinas() {
    const lista = [];
    ['pc', 'play', 'arcade'].forEach(zona => {
      if (db[zona] && db[zona].maquinas) {
        db[zona].maquinas.forEach(m => lista.push({ ...m, zona, zonaNombre: db[zona].nombre }));
      }
    });
    return lista;
  }

  // ---------- PERSISTENCIA DE EVENTOS EN .JSON (LOCAL, SIN SUPABASE) ----------
  function cargarEventosJson() {
    try {
      const raw = localStorage.getItem(CLAVE_EVENTOS_JSON);
      if (!raw) return { proyecto: 'Crossplay Zone', moneda: 'BOB', actualizacion: new Date().toISOString(), eventos: [] };
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.eventos)) return parsed;
    } catch (e) {}
    return { proyecto: 'Crossplay Zone', moneda: 'BOB', actualizacion: new Date().toISOString(), eventos: [] };
  }

  let dataEventosJson = cargarEventosJson();

  function guardarEventosJson() {
    dataEventosJson.actualizacion = new Date().toISOString();
    try {
      localStorage.setItem(CLAVE_EVENTOS_JSON, JSON.stringify(dataEventosJson));
    } catch (e) {}
  }

  async function sincronizarDesdeArchivoJson() {
    try {
      const resp = await fetch('eventos.json', { cache: 'no-store' });
      if (!resp.ok) return;
      const jsonArchivo = await resp.json();
      if (jsonArchivo && Array.isArray(jsonArchivo.eventos)) {
        const idsLocales = new Set(dataEventosJson.eventos.map(e => e.id));
        const nuevosDesdeArchivo = jsonArchivo.eventos.filter(e => !idsLocales.has(e.id));
        if (nuevosDesdeArchivo.length > 0) {
          dataEventosJson.eventos = [...dataEventosJson.eventos, ...nuevosDesdeArchivo]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          guardarEventosJson();
          renderAdminDashboard();
        }
      }
    } catch (e) {
      console.warn('No se pudo leer eventos.json:', e);
    }
  }

  function registrarEventoJson(tipo, detalle, actor = 'Usuario') {
    const nuevoEvento = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      tipo,
      actor,
      detalle
    };
    dataEventosJson.eventos.unshift(nuevoEvento);
    guardarEventosJson();
    renderAdminDashboard();
  }

  function descargarArchivoEventosJson() {
    const contenido = JSON.stringify(dataEventosJson, null, 2);
    const blob = new Blob([contenido], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eventos.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    registrarEventoJson('EXPORTAR_JSON', 'Archivo eventos.json descargado desde el Dashboard Admin', adminActual ? adminActual.nombre : 'Admin');
  }

  // ---------- ESTADOS DE MÁQUINAS (MANTENIMIENTO / OPERATIVO) ----------
  function cargarEstadosMaquinas() {
    try {
      const raw = localStorage.getItem(CLAVE_ESTADOS_MAQ);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  let estadosMaquinas = cargarEstadosMaquinas();

  function guardarEstadosMaquinas() {
    try {
      localStorage.setItem(CLAVE_ESTADOS_MAQ, JSON.stringify(estadosMaquinas));
    } catch (e) {}
  }

  function esMantenimiento(maquinaId) {
    return estadosMaquinas[maquinaId] && estadosMaquinas[maquinaId].estado === 'MANTENIMIENTO';
  }

  // ---------- BLACKLIST ADMIN ----------
  function cargarBlacklist() {
    try {
      const raw = localStorage.getItem(CLAVE_BLACKLIST);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) {}
    return [...BLACKLIST_INICIAL];
  }
  let blacklistAdmin = cargarBlacklist();

  function guardarBlacklist() {
    try {
      localStorage.setItem(CLAVE_BLACKLIST, JSON.stringify(blacklistAdmin));
    } catch (e) {}
  }

  // ---------- PERFILES SOCIALES (USUARIO Y ADMIN) ----------
  function cargarPerfiles() {
    try {
      const raw = localStorage.getItem(CLAVE_PERFILES);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  let perfilesSociales = cargarPerfiles();

  function guardarPerfiles() {
    try {
      localStorage.setItem(CLAVE_PERFILES, JSON.stringify(perfilesSociales));
    } catch (e) {}
  }

  function obtenerPerfilDe(usuario) {
    if (!usuario || !usuario.email) {
      return { nombre: 'Jugador', tag: '@jugador', bio: '', avatar: AVATAR_DEFAULT };
    }
    const key = usuario.email.toLowerCase();
    const baseTag = '@' + key.split('@')[0].replace(/[^a-z0-9_]/gi, '_');
    const actual = perfilesSociales[key] || {};
    return {
      nombre: actual.nombre || usuario.nombre || key.split('@')[0],
      tag: actual.tag || baseTag,
      bio: actual.bio !== undefined ? actual.bio : (usuario.rol === 'admin' ? 'Administrador de Crossplay Zone · Gestión de zonas y máquinas.' : 'Jugador en Crossplay Zone.'),
      avatar: actual.avatar || AVATAR_DEFAULT
    };
  }

  // ---------- AUTENTICACIÓN Y ROLES (USER vs ADMIN) ----------
  let usuarioActual = null; // { email, nombre, rol: 'admin' | 'user' }
  let adminActual = null;

  function esCorreoEnBlacklist(email) {
    return blacklistAdmin.some(b => b.toLowerCase() === String(email || '').trim().toLowerCase());
  }

  function determinarRol(email, metadata = {}) {
    const limpio = String(email || '').trim().toLowerCase();
    if (esCorreoEnBlacklist(limpio)) return 'user';
    if (metadata && metadata.role === 'admin') return 'admin';
    if (CORREOS_ADMIN.some(c => c.toLowerCase() === limpio)) return 'admin';
    return 'user';
  }

  function aplicarEstadoSesionUI() {
    const logueado = !!usuarioActual;
    const esAdmin = logueado && usuarioActual.rol === 'admin';
    adminActual = esAdmin ? usuarioActual : null;

    // Usuarios normales nunca ven botones ni accesos de Admin
    $('.solo-admin').toggle(esAdmin);

    // Opciones de Iniciar Sesión / Cerrar Sesión
    $('#btnAbrirAuth, #menuBtnAuth').toggle(!logueado);
    $('#btnCerrarSesion, #menuBtnLogout').toggle(logueado);

    if (logueado) {
      const perfil = obtenerPerfilDe(usuarioActual);
      usuarioActual.nombre = perfil.nombre;
      $('#navUsuarioInfo')
        .text((esAdmin ? '🛡️ ' : '👤 ') + perfil.nombre)
        .show();
    } else {
      $('#navUsuarioInfo').hide().text('');
      if ($('#adminDashboardContainer').is(':visible') || $('#perfilContainer').is(':visible')) {
        irAInicio();
      }
    }
  }

  function abrirModalAuth(modo = 'login') {
    marcarError($('#loginEmail'), $('#errorLogin'), false);
    marcarError($('#regEmail'), $('#errorRegistro'), false);
    if (modo === 'registro') {
      $('#tabRegistro').addClass('filtros__pestana--activa');
      $('#tabLogin').removeClass('filtros__pestana--activa');
      $('#formLogin').hide();
      $('#formRegistro').show();
    } else {
      $('#tabLogin').addClass('filtros__pestana--activa');
      $('#tabRegistro').removeClass('filtros__pestana--activa');
      $('#formRegistro').hide();
      $('#formLogin').show();
    }
    abrirModal('#modalAuth');
  }

  async function inicializarSesion() {
    if (supabaseClient) {
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session && data.session.user) {
        const u = data.session.user;
        const rol = determinarRol(u.email, u.user_metadata);
        usuarioActual = {
          email: u.email,
          nombre: (u.user_metadata && u.user_metadata.nombre) || u.email.split('@')[0],
          rol
        };
        aplicarEstadoSesionUI();
        return;
      }
    }

    try {
      const guardada = JSON.parse(localStorage.getItem(CLAVE_SESION_LOCAL) || 'null');
      if (guardada && guardada.email) {
        guardada.rol = determinarRol(guardada.email, { role: guardada.rol });
        usuarioActual = guardada;
      }
    } catch (e) {}

    aplicarEstadoSesionUI();

    if (!usuarioActual) {
      abrirModalAuth('login');
    }
  }

  $('#tabLogin').on('click', () => abrirModalAuth('login'));
  $('#tabRegistro').on('click', () => abrirModalAuth('registro'));
  $('#btnAbrirAuth, #menuBtnAuth').on('click', function(e) {
    e.preventDefault();
    $('#mobileMenu').removeClass('menu--activo');
    abrirModalAuth('login');
  });
  $('#closeModalAuth, #btnCancelarAuth1, #btnCancelarAuth2').on('click', () => cerrarModal('#modalAuth'));

  // Crear Cuenta
  $('#formRegistro').on('submit', async function(e) {
    e.preventDefault();
    const nombre = $('#regNombre').val().trim();
    const email = $('#regEmail').val().trim().toLowerCase();
    const password = $('#regPassword').val();

    if (!nombre || !email || password.length < 6) {
      marcarError($('#regEmail'), $('#errorRegistro'), true, 'Completa todos los campos (contraseña mín. 6 caracteres).');
      return;
    }

    const rol = determinarRol(email);

    if (supabaseClient) {
      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { nombre, role: rol } }
      });
      if (error) {
        marcarError($('#regEmail'), $('#errorRegistro'), true, error.message);
        return;
      }
      usuarioActual = { email, nombre, rol };
    } else {
      let usuarios = [];
      try { usuarios = JSON.parse(localStorage.getItem(CLAVE_USUARIOS_LOCAL) || '[]'); } catch (err) {}
      if (usuarios.some(u => u.email === email)) {
        marcarError($('#regEmail'), $('#errorRegistro'), true, 'Este correo ya está registrado. Inicia sesión.');
        return;
      }
      usuarios.push({ nombre, email, password, rol });
      localStorage.setItem(CLAVE_USUARIOS_LOCAL, JSON.stringify(usuarios));
      usuarioActual = { email, nombre, rol };
      localStorage.setItem(CLAVE_SESION_LOCAL, JSON.stringify(usuarioActual));
    }

    if (!perfilesSociales[email]) {
      perfilesSociales[email] = {
        nombre,
        tag: '@' + email.split('@')[0].replace(/[^a-z0-9_]/gi, '_'),
        bio: rol === 'admin' ? 'Administrador de Crossplay Zone.' : 'Nuevo jugador en Crossplay Zone.',
        avatar: AVATAR_DEFAULT
      };
      guardarPerfiles();
    }

    aplicarEstadoSesionUI();
    cerrarModal('#modalAuth');
    registrarEventoJson('REGISTRO_USUARIO', `Nueva cuenta creada: ${email} (rol: ${rol})`, nombre);
    mostrarToast('Cuenta creada', `Bienvenido ${nombre}`, false);
  });

  // Iniciar Sesión
  $('#formLogin').on('submit', async function(e) {
    e.preventDefault();
    const email = $('#loginEmail').val().trim().toLowerCase();
    const password = $('#loginPassword').val();

    if (supabaseClient) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        marcarError($('#loginEmail'), $('#errorLogin'), true, 'Credenciales incorrectas: ' + error.message);
        registrarEventoJson('LOGIN_FALLIDO', `Intento fallido de inicio de sesión para ${email}`, email);
        return;
      }
      const u = data.session.user;
      const rol = determinarRol(u.email, u.user_metadata);
      usuarioActual = {
        email: u.email,
        nombre: (u.user_metadata && u.user_metadata.nombre) || u.email.split('@')[0],
        rol
      };
    } else {
      let usuarios = [];
      try { usuarios = JSON.parse(localStorage.getItem(CLAVE_USUARIOS_LOCAL) || '[]'); } catch (err) {}
      const encontrado = usuarios.find(u => u.email === email && u.password === password);
      if (!encontrado) {
        marcarError($('#loginEmail'), $('#errorLogin'), true, 'Correo o contraseña incorrectos, o cuenta no registrada.');
        registrarEventoJson('LOGIN_FALLIDO', `Intento fallido de inicio de sesión para ${email}`, email);
        return;
      }
      usuarioActual = {
        email: encontrado.email,
        nombre: encontrado.nombre,
        rol: determinarRol(encontrado.email, { role: encontrado.rol })
      };
      localStorage.setItem(CLAVE_SESION_LOCAL, JSON.stringify(usuarioActual));
    }

    aplicarEstadoSesionUI();
    cerrarModal('#modalAuth');
    registrarEventoJson(
      usuarioActual.rol === 'admin' ? 'LOGIN_ADMIN' : 'LOGIN_USUARIO',
      `Inició sesión (${usuarioActual.email}) con rol ${usuarioActual.rol}`,
      usuarioActual.nombre
    );
    mostrarToast('Sesión iniciada', `Hola, ${usuarioActual.nombre}`, false);
  });

  // Cerrar Sesión
  async function cerrarSesionUsuario(e) {
    if (e) e.preventDefault();
    $('#mobileMenu').removeClass('menu--activo');
    const actor = usuarioActual ? usuarioActual.nombre : 'Usuario';
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    localStorage.removeItem(CLAVE_SESION_LOCAL);
    usuarioActual = null;
    adminActual = null;
    aplicarEstadoSesionUI();
    registrarEventoJson('LOGOUT', 'Cerró sesión en Crossplay Zone', actor);
    mostrarToast('Sesión cerrada', 'Has salido de tu cuenta.', false);
    abrirModalAuth('login');
  }

  $('#btnCerrarSesion, #menuBtnLogout').on('click', cerrarSesionUsuario);

  // ---------- PERSISTENCIA DE RESERVAS ----------
  function guardarReservas() {
    try {
      const plano = reservas.map(r => Object.assign({}, r, { startDate: r.startDate.getTime(), endDate: r.endDate.getTime() }));
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(plano));
    } catch (e) { /* almacenamiento no disponible */ }
  }
  function cargarReservas() {
    try {
      const raw = localStorage.getItem(CLAVE_ALMACEN);
      if (!raw) return [];
      const hoy = inicioDia(new Date());
      const ahora = new Date();
      return JSON.parse(raw).map(r => {
        r.startDate = new Date(r.startDate);
        r.endDate = new Date(r.endDate);
        return r;
      }).filter(r =>
        typeof r.maquinaId === 'string' && typeof r.persona === 'string' &&
        !isNaN(r.startDate) && !isNaN(r.endDate) && r.endDate >= hoy
      ).map(r => {
        r.claveFecha = claveFecha(r.startDate);
        r.iniciada = r.startDate <= ahora;
        r.liberada = r.endDate <= ahora;
        return r;
      });
    } catch (e) { return []; }
  }

  // ---------- ESTADO ----------
  let currentPlatform = 'pc';
  let reservas = cargarReservas();
  let maquinaSeleccionada = null;
  let currentGenre = 'all';
  let modalTimerInterval = null;
  let tiempoRestante = 60;
  let fechaSeleccionada = claveFecha(new Date());
  let semanaInicio = inicioSemana(new Date());
  let diaActual = claveFecha(new Date());

  // ---------- DISPONIBILIDAD ----------
  function haySolape(maquinaId, inicio, fin) {
    return reservas.some(r => r.maquinaId === maquinaId && inicio < r.endDate && fin > r.startDate);
  }
  function estadoHora(maquinaId, clave, hora, horas) {
    if (esMantenimiento(maquinaId)) return 'mantenimiento';
    const inicio = construirFecha(clave, hora);
    if (inicio.getTime() + MS_HORA <= Date.now()) return 'pasada';
    if (maquinaSeleccionada && maquinaSeleccionada.type === 'snacks') return 'libre';
    const fin = new Date(inicio.getTime() + (horas || 1) * MS_HORA);
    if (haySolape(maquinaId, inicio, fin)) return 'ocupada';
    return 'libre';
  }
  function idsZona() {
    const z = db[currentPlatform];
    return z && z.maquinas ? z.maquinas.map(m => m.id) : [];
  }
  function reservasDelDia(clave) {
    const ids = idsZona();
    return reservas.filter(r => r.claveFecha === clave && ids.indexOf(r.maquinaId) !== -1)
      .sort((a, b) => a.startDate - b.startDate);
  }
  function refrescarTodo() {
    if (currentPlatform !== 'catalogo' && currentPlatform !== 'snacks') renderMaquinas();
    renderPerfil();
    renderAdminDashboard();
  }

  // ---------- UTILIDADES DE UI ----------
  function abrirModal(sel) { $(sel).fadeIn(200); }
  function cerrarModal(sel) { $(sel).fadeOut(200); }
  function marcarError($control, $mensaje, activo, texto) {
    $control.toggleClass('campo__control--error', activo);
    $mensaje.toggleClass('campo__error--visible', activo);
    if (activo && texto) $mensaje.text(texto);
  }
  function mostrarToast(titulo, mensaje, isError) {
    const $toast = $('#toastAlert');
    $toast.toggleClass('aviso--error', !!isError);
    $('#toastTitle').text(titulo); $('#toastMsg').text(mensaje); $('#toastIcon').text(isError ? '✕' : '✓');
    $toast.stop(true, true).slideDown(200);
    setTimeout(() => { $toast.fadeOut(200); }, 3000);
  }

  // ---------- TEMPORIZADORES (cada segundo) ----------
  setInterval(() => {
    const k = claveFecha(new Date());
    if (k !== diaActual) {
      diaActual = k;
      if (currentPlatform !== 'catalogo' && currentPlatform !== 'snacks') renderMaquinas();
    }
    actualizarEstadoMaquinasYTimers();
  }, 1000);

  // ---------- NAVEGACIÓN ----------
  function ocultarVistasPrincipales() {
    $('#mainSelector').hide();
    $('#dashboardContainer').hide();
    $('#perfilContainer').hide();
    $('#adminDashboardContainer').hide();
  }

  function irAInicio() {
    ocultarVistasPrincipales();
    $('#mainSelector').fadeIn(200);
    marcarNavInferior('inicio');
  }

  function entrarAZona(platform) {
    ocultarVistasPrincipales();
    currentPlatform = platform;
    currentGenre = 'all';
    renderPlatform(currentPlatform);
    $('#dashboardContainer').fadeIn(200);
    $('#scrollPanel').scrollTop(0);
    marcarNavInferior(platform);
  }

  function mostrarPerfil() {
    if (!usuarioActual) {
      abrirModalAuth('login');
      return;
    }
    ocultarVistasPrincipales();
    $('#perfilContainer').fadeIn(200);
    renderPerfil();
  }

  function marcarNavInferior(seccion) {
    $('#navInferior .nav-inferior__boton').removeClass('nav-inferior__boton--activa');
    $('#navInferior .nav-inferior__boton[data-seccion="' + seccion + '"]').addClass('nav-inferior__boton--activa');
  }

  $('.selector__tarjeta').click(function() { entrarAZona($(this).data('platform')); });
  $('.selector__tarjeta').on('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $(this).trigger('click'); }
  });

  $('#brandHome').click(function(e) {
    e.preventDefault();
    irAInicio();
  });

  $('#hamburger').click(function(e) {
    e.stopPropagation();
    $('#mobileMenu').toggleClass('menu--activo');
  });
  $(document).click(function(e) {
    if (!$(e.target).closest('#mobileMenu, #hamburger').length) $('#mobileMenu').removeClass('menu--activo');
  });

  $('#mobileMenu').on('click', '.menu__enlace[data-section]', function(e) {
    e.preventDefault();
    const seccion = $(this).data('section');
    $('#mobileMenu').removeClass('menu--activo');
    if (seccion === 'inicio') {
      irAInicio();
    } else {
      entrarAZona(seccion);
    }
  });

  $('#menuOpenPerfil').on('click', function(e) {
    e.preventDefault();
    $('#mobileMenu').removeClass('menu--activo');
    mostrarPerfil();
  });

  $('#btnVolverDePerfil').on('click', function() {
    irAInicio();
  });

  $('#btnPerfilIrAdmin').on('click', function() {
    mostrarAdminDashboard();
  });

  $('#navInferior').on('click', '.nav-inferior__boton', function() {
    const seccion = $(this).data('seccion');
    if (seccion === 'inicio') {
      irAInicio();
    } else {
      entrarAZona(seccion);
    }
  });

  // ---------- RENDERIZADO DE PERFIL SOCIAL + RESERVAS DEL USUARIO ----------
  function reservasDelUsuarioActual() {
    if (!usuarioActual) return [];
    const emailActual = usuarioActual.email.toLowerCase();
    return reservas.filter(r => (r.ownerEmail && r.ownerEmail.toLowerCase() === emailActual) || (!r.ownerEmail && r.persona === usuarioActual.nombre));
  }

  function renderPerfil() {
    if (!usuarioActual || !$('#perfilContainer').is(':visible')) return;
    const perfil = obtenerPerfilDe(usuarioActual);
    const esAdmin = usuarioActual.rol === 'admin';
    const misReservas = reservasDelUsuarioActual().sort((a, b) => a.startDate - b.startDate);
    const gastoTotal = misReservas.reduce((acc, r) => acc + (r.totalBOB || 0), 0);

    const avatarSrc = (perfil.avatar && /^https?:\/\//i.test(perfil.avatar)) ? perfil.avatar : AVATAR_DEFAULT;
    $('#perfilAvatarImg').attr('src', avatarSrc);
    $('#perfilNombreDisplay').text(perfil.nombre);
    $('#perfilTagDisplay').text(perfil.tag.startsWith('@') ? perfil.tag : '@' + perfil.tag);
    $('#perfilBioDisplay').text(perfil.bio || 'Sin biografía aún.');
    $('#perfilRolBadge')
      .text(esAdmin ? 'ADMINISTRADOR' : 'USUARIO')
      .toggleClass('perfil-badge-rol--admin', esAdmin)
      .toggleClass('perfil-badge-rol--user', !esAdmin);

    $('#editPerfilNombre').val(perfil.nombre);
    $('#editPerfilTag').val(perfil.tag);
    $('#editPerfilAvatar').val(perfil.avatar === AVATAR_DEFAULT ? '' : perfil.avatar);
    $('#editPerfilBio').val(perfil.bio);

    pintar($('#perfilStats'), `
      <div class="admin-stat"><div class="admin-stat__valor">${misReservas.length}</div><div class="admin-stat__etiqueta">Mis Reservas</div></div>
      <div class="admin-stat"><div class="admin-stat__valor" style="color:var(--cyan);">BOB ${gastoTotal}</div><div class="admin-stat__etiqueta">Total en Reservas</div></div>
      <div class="admin-stat"><div class="admin-stat__valor" style="color:var(--yellow);">${esAdmin ? 'ADMIN' : 'USER'}</div><div class="admin-stat__etiqueta">Tipo de Cuenta</div></div>
    `);

    if (misReservas.length === 0) {
      pintar($('#perfilReservasLista'), '<p class="bitacora__vacio">Aún no tienes reservas guardadas en tu perfil.</p>');
      return;
    }

    const html = misReservas.map(res => {
      const cantidad = Math.round((res.endDate - res.startDate) / MS_HORA);
      const esSnack = res.tipo === 'snacks' || (res.maquinaId && res.maquinaId.startsWith('snk-'));
      const endStr = pad(res.endDate.getHours()) + ':' + pad(res.endDate.getMinutes());
      const controlesTxt = (!esSnack && res.controles > 1) ? `<br>🎮 ${res.controles} Controles (+BOB ${res.extraControles})` : '';
      const horarioTxt = esSnack
        ? `⏰ Entrega: ${res.horaInicio} (${cantidad} ud.)`
        : `⏰ ${res.horaInicio} a ${endStr} (${cantidad}h)`;

      return `
        <article class="reserva-perfil-item">
          <div class="reserva-perfil-item__cabecera">
            <h4 class="reserva-perfil-item__titulo">${esSnack ? '🍔 ' : '🖥️ '}${res.maquinaNombre}</h4>
            <button type="button" class="btn-mini btn-mini--rojo btn-cancelar-reserva-perfil" data-id="${res.id}">Cancelar</button>
          </div>
          <div class="reserva-perfil-item__detalles">
            👤 A nombre de: <strong>${res.persona}</strong><br>
            📅 ${etiquetaCorta(res.claveFecha)} (${res.claveFecha}) · ${horarioTxt}
            ${res.totalBOB ? `<br>💵 Total: <strong>BOB ${res.totalBOB}</strong>` : ''}
            ${controlesTxt}
          </div>
          <div class="reserva-perfil-item__estado" data-temporizador="${res.id}">Calculando...</div>
        </article>
      `;
    }).join('');

    pintar($('#perfilReservasLista'), html);
    actualizarEstadoMaquinasYTimers();
  }

  $('#formEditarPerfil').on('submit', function(e) {
    e.preventDefault();
    if (!usuarioActual) return;
    const nombre = $('#editPerfilNombre').val().trim();
    let tag = $('#editPerfilTag').val().trim();
    const avatar = $('#editPerfilAvatar').val().trim();
    const bio = $('#editPerfilBio').val().trim();

    if (!nombre) {
      mostrarToast('Campo requerido', 'El nombre visible no puede estar vacío.', true);
      return;
    }
    if (tag && !tag.startsWith('@')) tag = '@' + tag;
    if (!tag) tag = '@' + usuarioActual.email.split('@')[0].replace(/[^a-z0-9_]/gi, '_');

    const key = usuarioActual.email.toLowerCase();
    perfilesSociales[key] = {
      nombre,
      tag,
      avatar: avatar || AVATAR_DEFAULT,
      bio
    };
    guardarPerfiles();

    usuarioActual.nombre = nombre;
    try {
      const guardada = JSON.parse(localStorage.getItem(CLAVE_SESION_LOCAL) || 'null');
      if (guardada) {
        guardada.nombre = nombre;
        localStorage.setItem(CLAVE_SESION_LOCAL, JSON.stringify(guardada));
      }
    } catch (err) {}

    aplicarEstadoSesionUI();
    renderPerfil();
    registrarEventoJson('ACTUALIZAR_PERFIL', `Actualizó su perfil (${nombre}, ${tag})`, nombre);
    mostrarToast('Perfil actualizado', 'Tus cambios se guardaron.', false);
  });

  $(document).on('click', '.btn-cancelar-reserva-perfil', function() {
    const id = Number($(this).attr('data-id'));
    const encontrada = reservas.find(r => r.id === id);
    reservas = reservas.filter(r => r.id !== id);
    guardarReservas();
    if (encontrada) {
      registrarEventoJson('CANCELAR_RESERVA', `Canceló reserva de ${encontrada.maquinaNombre} (${encontrada.claveFecha} ${encontrada.horaInicio}) desde su perfil`, encontrada.persona);
    }
    refrescarTodo();
    mostrarToast("Reserva cancelada", "Se eliminó de tus reservas.", true);
  });

  // ---------- DASHBOARD ADMIN (SOLO ACCESIBLE SI ROL === 'admin') ----------
  function mostrarAdminDashboard() {
    if (!adminActual || adminActual.rol !== 'admin') {
      mostrarToast('Acceso denegado', 'No tienes permisos de administrador.', true);
      return;
    }
    ocultarVistasPrincipales();
    $('#adminDashboardContainer').fadeIn(200);
    renderAdminDashboard();
  }

  $('#btnOpenAdmin, #menuOpenAdmin').on('click', function(e) {
    e.preventDefault();
    $('#mobileMenu').removeClass('menu--activo');
    mostrarAdminDashboard();
  });

  $('#btnVolverDeAdmin').on('click', function() {
    irAInicio();
  });

  // Liberar máquina antes de tiempo (desde Dashboard Admin)
  $(document).on('click', '.btn-liberar-anticipada', function() {
    if (!adminActual) return;
    const id = Number($(this).attr('data-id'));
    const res = reservas.find(r => r.id === id);
    if (!res) return;

    const ahora = new Date();
    const horaAnteriorFin = pad(res.endDate.getHours()) + ':' + pad(res.endDate.getMinutes());
    res.endDate = ahora;
    res.liberada = true;
    res.iniciada = true;
    guardarReservas();
    refrescarTodo();

    const detalle = `Máquina/reserva "${res.maquinaNombre}" de ${res.persona} liberada antes de tiempo (fin programado: ${horaAnteriorFin}).`;
    registrarEventoJson('LIBERACION_ANTICIPADA', detalle, adminActual.nombre);
    mostrarToast('Máquina Liberada', `${res.maquinaNombre} liberada antes de tiempo.`, false);
  });

  // Cambiar estado de máquina / poner en mantenimiento
  $(document).on('click', '.btn-estado-maquina', function() {
    if (!adminActual) return;
    const maqId = $(this).attr('data-id');
    const maqNombre = $(this).attr('data-nombre');
    const nuevoEstado = $(this).attr('data-estado');
    const nota = ($('#adminNotaEstado').val() || '').trim();

    estadosMaquinas[maqId] = {
      estado: nuevoEstado,
      nota: nota || (nuevoEstado === 'MANTENIMIENTO' ? 'En mantenimiento técnico' : 'Operativa'),
      actualizadoEn: new Date().toISOString()
    };
    guardarEstadosMaquinas();
    refrescarTodo();

    registrarEventoJson(
      'ESTADO_MAQUINA',
      `${maqNombre} (${maqId}) pasó a ${nuevoEstado}${nota ? ' · Nota: ' + nota : ''}`,
      adminActual.nombre
    );
    mostrarToast('Estado Actualizado', `${maqNombre}: ${nuevoEstado}`, false);
  });

  // Agregar / quitar de Blacklist
  $('#formBlacklist').on('submit', function(e) {
    e.preventDefault();
    if (!adminActual) return;
    const entrada = $('#inputBlacklist').val().trim().toLowerCase();
    if (!entrada) return;

    if (CORREOS_ADMIN.some(c => c.toLowerCase() === entrada)) {
      mostrarToast('Acción bloqueada', 'No puedes poner en blacklist a un admin principal.', true);
      return;
    }

    if (!blacklistAdmin.some(x => x.toLowerCase() === entrada)) {
      blacklistAdmin.push(entrada);
      guardarBlacklist();
      registrarEventoJson('BLACKLIST_AGREGAR', `Se añadió "${entrada}" a la blacklist de admin`, adminActual.nombre);
      mostrarToast('Blacklist Actualizada', `"${entrada}" bloqueado para rol admin.`, false);
    }
    $('#inputBlacklist').val('');
    renderAdminDashboard();
  });

  $(document).on('click', '.btn-quitar-blacklist', function() {
    if (!adminActual) return;
    const item = $(this).attr('data-item');
    blacklistAdmin = blacklistAdmin.filter(x => x !== item);
    guardarBlacklist();
    registrarEventoJson('BLACKLIST_QUITAR', `Se removió "${item}" de la blacklist de admin`, adminActual.nombre);
    renderAdminDashboard();
  });

  $('#btnDescargarEventosJson').on('click', function() {
    if (!adminActual) return;
    descargarArchivoEventosJson();
    mostrarToast('.JSON Exportado', 'Se descargó eventos.json con la bitácora.', false);
  });

  $('#btnLimpiarEventosJson').on('click', function() {
    if (!adminActual) return;
    dataEventosJson.eventos = [];
    guardarEventosJson();
    registrarEventoJson('LIMPIAR_JSON', 'Se reinició el historial de eventos en eventos.json', adminActual.nombre);
    mostrarToast('.JSON Limpiado', 'Historial de eventos reiniciado.', false);
  });

  function renderAdminDashboard() {
    if (!adminActual || !$('#adminDashboardContainer').is(':visible')) return;
    const ahora = new Date();
    const maquinas = todasLasMaquinas();
    const enMant = maquinas.filter(m => esMantenimiento(m.id)).length;
    const activas = reservas.filter(r => r.endDate > ahora).length;

    pintar($('#adminStats'), `
      <div class="admin-stat"><div class="admin-stat__valor">${maquinas.length}</div><div class="admin-stat__etiqueta">Total Máquinas</div></div>
      <div class="admin-stat"><div class="admin-stat__valor">${activas}</div><div class="admin-stat__etiqueta">Reservas Activas</div></div>
      <div class="admin-stat"><div class="admin-stat__valor" style="color:var(--yellow);">${enMant}</div><div class="admin-stat__etiqueta">En Mantenimiento</div></div>
      <div class="admin-stat"><div class="admin-stat__valor" style="color:var(--cyan);">${dataEventosJson.eventos.length}</div><div class="admin-stat__etiqueta">Eventos en .JSON</div></div>
    `);

    const maqHtml = maquinas.map(m => {
      const mant = esMantenimiento(m.id);
      const enUso = !mant && reservas.some(r => r.maquinaId === m.id && r.startDate <= ahora && r.endDate > ahora);
      const estadoTxt = mant ? 'MANTENIMIENTO' : (enUso ? 'OCUPADO' : 'LIBRE');
      const badgeCls = mant ? 'mantenimiento' : (enUso ? 'ocupado' : 'libre');
      const notaTxt = (estadosMaquinas[m.id] && estadosMaquinas[m.id].nota) ? ` · ${estadosMaquinas[m.id].nota}` : '';

      return `
        <li class="admin-fila">
          <div class="admin-fila__info">
            <strong>${m.nombre}</strong> (${m.zonaNombre})
            <span class="badge-estado badge-estado--${badgeCls}">${estadoTxt}</span>
            <div style="font-size:0.75rem; color:var(--muted);">BOB ${m.precio}/h${notaTxt}</div>
          </div>
          <div class="admin-fila__acciones">
            <button type="button" class="btn-mini btn-mini--liberar btn-estado-maquina" data-id="${m.id}" data-nombre="${m.nombre}" data-estado="LIBRE">Libre</button>
            <button type="button" class="btn-mini btn-mini--mant btn-estado-maquina" data-id="${m.id}" data-nombre="${m.nombre}" data-estado="MANTENIMIENTO">Mantenimiento</button>
          </div>
        </li>
      `;
    }).join('');
    pintar($('#adminMaquinasLista'), maqHtml);

    const activasLista = reservas.filter(r => r.endDate > ahora);
    const resHtml = activasLista.length
      ? activasLista.map(r => {
          const finStr = pad(r.endDate.getHours()) + ':' + pad(r.endDate.getMinutes());
          return `
            <li class="admin-fila">
              <div class="admin-fila__info">
                <strong>${r.maquinaNombre}</strong> · 👤 ${r.persona}
                <div style="font-size:0.75rem; color:var(--muted);">${etiquetaCorta(r.claveFecha)} · ${r.horaInicio} a ${finStr}</div>
              </div>
              <div class="admin-fila__acciones">
                <button type="button" class="btn-mini btn-mini--liberar btn-liberar-anticipada" data-id="${r.id}">Liberar Ahora</button>
              </div>
            </li>
          `;
        }).join('')
      : '<li class="bitacora__vacio">No hay reservas activas para liberar</li>';
    pintar($('#adminReservasLista'), resHtml);

    const blHtml = blacklistAdmin.length
      ? blacklistAdmin.map(item => `
          <li class="admin-fila">
            <span class="admin-fila__info">🚫 ${item}</span>
            <button type="button" class="btn-mini btn-quitar-blacklist" data-item="${item}">Quitar</button>
          </li>
        `).join('')
      : '<li class="bitacora__vacio">Blacklist vacía</li>';
    pintar($('#adminBlacklistLista'), blHtml);

    const evHtml = dataEventosJson.eventos.length
      ? dataEventosJson.eventos.slice(0, 30).map(ev => `
          <li class="registro">
            <h4 class="registro__titulo">${ev.tipo}</h4>
            <div class="registro__usuario">👤 ${ev.actor}</div>
            <div class="registro__detalle">${ev.detalle}<br><small>${new Date(ev.timestamp).toLocaleString()}</small></div>
          </li>
        `).join('')
      : '<li class="bitacora__vacio">Sin eventos registrados en eventos.json</li>';
    pintar($('#adminEventosJsonLista'), evHtml);
  }

  // ---------- BANNER DE PROMOCIÓN (desplegable) ----------
  function alternarPromo() {
    const $banner = $('#promoBanner');
    const abierto = $banner.hasClass('promo--abierto');
    $banner.toggleClass('promo--abierto', !abierto);
    $banner.attr('aria-expanded', String(!abierto));
    $('#promoDetalle').stop(true, true).slideToggle(220);
  }
  $('#promoBanner').on('click', alternarPromo);
  $('#promoBanner').on('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarPromo(); }
  });
  $('#promoDetalle').on('click', function(e) { e.stopPropagation(); });

  $(document).on('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const orden = ['#modalReserva', '#modalAuth'];
    for (let i = 0; i < orden.length; i++) {
      if ($(orden[i]).is(':visible')) {
        if (orden[i] === '#modalReserva') clearInterval(modalTimerInterval);
        cerrarModal(orden[i]);
        break;
      }
    }
  });

  // ---------- FLECHAS DEL CARRUSEL ----------
  function updateArrows() {
    const el = document.getElementById('contentGrid');
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    $('#arrowPrev').toggleClass('carrusel__flecha--oculta', el.scrollLeft <= 4);
    $('#arrowNext').toggleClass('carrusel__flecha--oculta', max <= 4 || el.scrollLeft >= max - 4);
  }
  function moverCarrusel(dir) {
    const el = document.getElementById('contentGrid');
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * (el.clientWidth + gap), behavior: 'smooth' });
  }
  $('#arrowPrev').on('click', () => moverCarrusel(-1));
  $('#arrowNext').on('click', () => moverCarrusel(1));
  $('#contentGrid').on('scroll', updateArrows);
  $(window).on('resize orientationchange', () => setTimeout(updateArrows, 150));

  // ---------- RENDERIZADO ----------
  function renderPlatform(platform) {
    $('#contentGrid').scrollLeft(0);
    if (platform === 'catalogo') {
      pintar($('#section-title'), '<span class="panel__icono--verde" aria-hidden="true">📚</span> Catálogo de Juegos');
      $('#filterContainer').show();
      $('#filterContainer .filtros__pestana').removeClass('filtros__pestana--activa');
      $('#filterContainer .filtros__pestana[data-genre="all"]').addClass('filtros__pestana--activa');
      renderCatalogo();
    } else if (platform === 'snacks') {
      pintar($('#section-title'), '<span class="panel__icono--magenta" aria-hidden="true">🍔</span> Snacks y Comida Rápida');
      $('#filterContainer').hide();
      renderSnacks();
    } else {
      const data = db[platform];
      const icon = platform === 'pc' ? '🖥️' : (platform === 'play' ? '🎮' : '🕹️');
      pintar($('#section-title'), '<span class="panel__icono--cyan" aria-hidden="true">' + icon + '</span> Máquinas ' + data.nombre);
      $('#filterContainer').hide();
      renderMaquinas();
    }
  }

  function renderCatalogo() {
    $('#contentGrid').scrollLeft(0);
    const filtered = db.catalogo.juegos.filter(j => currentGenre === 'all' || j.genero === currentGenre);
    let html = '';

    if (filtered.length === 0) {
      html = '<p class="carrusel__vacio">No hay juegos.</p>';
    } else {
      filtered.forEach(juego => {
        html += `
          <article class="tarjeta">
            <div class="tarjeta__imagen-contenedor">
              <img class="tarjeta__imagen" src="${juego.img}" width="400" height="300" loading="lazy" decoding="async" alt="Portada del juego ${juego.nombre} para ${juego.plataforma.toUpperCase()}">
            </div>
            <div class="tarjeta__info">
              <h3 class="tarjeta__titulo">${juego.nombre}</h3>
              <p class="tarjeta__texto tarjeta__texto--destacado">${juego.plataforma.toUpperCase()}</p>
            </div>
          </article>
        `;
      });
    }
    pintar($('#contentGrid'), html);
    requestAnimationFrame(updateArrows);
  }

  function renderSnacks() {
    $('#contentGrid').scrollLeft(0);
    const items = (db.snacks && db.snacks.items) || [];
    let html = '';

    if (items.length === 0) {
      html = '<p class="carrusel__vacio">No hay snacks disponibles.</p>';
    } else {
      items.forEach(item => {
        html += `
          <article class="tarjeta">
            <div class="tarjeta__imagen-contenedor">
              <img class="tarjeta__imagen" src="${item.img}" width="400" height="300" loading="lazy" decoding="async" alt="${item.nombre}" onerror="this.onerror=null;this.src='https://cdn-icons-png.flaticon.com/512/3075/3075977.png';">
            </div>
            <div class="tarjeta__info">
              <h3 class="tarjeta__titulo">${item.nombre}</h3>
              <p class="tarjeta__texto">${item.desc}</p>
              <p class="tarjeta__texto tarjeta__texto--destacado tarjeta__precio-snack">BOB ${item.precio}</p>
              <button type="button" class="tarjeta__boton" data-id="${item.id}" data-nombre="${item.nombre}" data-precio="${item.precio}" data-type="snacks">
                RESERVAR
              </button>
            </div>
          </article>
        `;
      });
    }
    pintar($('#contentGrid'), html);
    requestAnimationFrame(updateArrows);
  }

  function renderMaquinas() {
    const data = db[currentPlatform];
    if (!data || !data.maquinas) return;
    const ahora = new Date();
    let html = '';

    data.maquinas.forEach(maq => {
      const mant = esMantenimiento(maq.id);
      const enUso = !mant && reservas.some(r => r.maquinaId === maq.id && r.startDate <= ahora && r.endDate > ahora);
      const conReserva = !mant && reservas.some(r => r.maquinaId === maq.id && r.endDate > ahora);

      let estado = 'LIBRE', modificador = 'libre';
      if (mant) { estado = 'MANTENIMIENTO'; modificador = 'mantenimiento'; }
      else if (enUso) { estado = 'OCUPADO'; modificador = 'ocupado'; }
      else if (conReserva) { estado = 'RESERVADO'; modificador = 'reservado'; }

      html += `
        <article class="tarjeta">
          <div class="tarjeta__imagen-contenedor">
            <span class="tarjeta__estado tarjeta__estado--${modificador}">${estado}</span>
            <img class="tarjeta__imagen" src="${maq.img}" width="400" height="300" loading="lazy" decoding="async" alt="Máquina ${maq.nombre} en zona ${data.nombre}">
          </div>
          <div class="tarjeta__info">
            <h3 class="tarjeta__titulo">${maq.nombre}</h3>
            <p class="tarjeta__texto">BOB ${maq.precio} / hora</p>
            <button type="button" class="tarjeta__boton" ${mant ? 'disabled' : ''} data-id="${maq.id}" data-nombre="${maq.nombre}" data-precio="${maq.precio}" data-type="${currentPlatform}">
              ${mant ? 'MANTENIMIENTO' : 'ALQUILAR'}
            </button>
          </div>
        </article>
      `;
    });
    pintar($('#contentGrid'), html);
    requestAnimationFrame(updateArrows);
  }

  // ---------- CALENDARIO DEL FORMULARIO ----------
  function renderCalendario() {
    const lim = limites();
    const hoyK = claveFecha(new Date());
    let html = '';

    for (let i = 0; i < 7; i++) {
      const d = sumarDias(semanaInicio, i);
      const k = claveFecha(d);
      const bloqueado = d < lim.min || d > lim.max;
      const n = reservasDelDia(k).length;
      const clases = ['calendario__dia'];
      if (k === hoyK) clases.push('calendario__dia--hoy');
      if (k === fechaSeleccionada) clases.push('calendario__dia--seleccionado');
      if (bloqueado) clases.push('calendario__dia--bloqueado');
      const resumen = n ? n + (n === 1 ? ' reserva' : ' reservas') : 'sin reservas';

      html += `
        <button type="button" class="${clases.join(' ')}" data-fecha="${k}" aria-pressed="${k === fechaSeleccionada}" aria-label="${cap(textoDia(k))}, ${resumen}" ${bloqueado ? 'disabled' : ''}>
          <span class="calendario__dia-semana">${DIAS_CORTO[i]}</span>
          <span class="calendario__dia-numero">${d.getDate()}</span>
          <span class="calendario__marca${n ? ' calendario__marca--activa' : ''}"></span>
        </button>
      `;
    }
    pintar($('#calTira'), html);

    const fin = sumarDias(semanaInicio, 6);
    const m1 = MESES[semanaInicio.getMonth()], m2 = MESES[fin.getMonth()];
    $('#calMes').text(semanaInicio.getMonth() === fin.getMonth()
      ? m1 + ' ' + fin.getFullYear()
      : m1.slice(0, 3) + ' – ' + m2.slice(0, 3) + ' ' + fin.getFullYear());

    $('#calPrev').prop('disabled', semanaInicio <= inicioSemana(new Date()));
    $('#calNext').prop('disabled', sumarDias(semanaInicio, 7) > lim.max);
  }

  function primerDiaLibre(maquinaId) {
    const hoy = inicioDia(new Date());
    for (let i = 0; i <= MAX_DIAS_ADELANTE; i++) {
      const k = claveFecha(sumarDias(hoy, i));
      if (HORAS_INICIO.some(h => estadoHora(maquinaId, k, h, 1) === 'libre')) return k;
    }
    return claveFecha(hoy);
  }

  function elegirFecha(k) {
    fechaSeleccionada = k;
    semanaInicio = inicioSemana(fechaDesdeClave(k));
    renderCalendario();
    renderHorasModal();
  }

  $('#calTira').on('click', '.calendario__dia', function() { elegirFecha($(this).attr('data-fecha')); });
  $('#calPrev').on('click', function() { semanaInicio = sumarDias(semanaInicio, -7); renderCalendario(); });
  $('#calNext').on('click', function() { semanaInicio = sumarDias(semanaInicio, 7); renderCalendario(); });

  function renderDisponibilidad() {
    if (!maquinaSeleccionada) return;
    const k = fechaSeleccionada;
    const hora = $('#selectHoraInicio').val();
    const horas = duracionActual();

    $('#fechaElegida').text(cap(textoDia(k)) + (k === claveFecha(new Date()) ? ' · Hoy' : ''));

    if (esMantenimiento(maquinaSeleccionada.id)) {
      $('#dispLibres')
        .text('Esta máquina está actualmente en MANTENIMIENTO.')
        .addClass('disponibilidad__libres--ninguna');
      pintar($('#dispReservas'), '<li class="disponibilidad__vacio">No admite reservas hasta ser habilitada por Admin.</li>');
      return;
    }

    if (maquinaSeleccionada.type === 'snacks') {
      const sinHora = !hora;
      $('#dispLibres')
        .text(sinHora ? 'No quedan horarios disponibles ese día.' : 'Disponible para retirar/recibir a las ' + hora + ' (' + horas + ' ud.).')
        .toggleClass('disponibilidad__libres--ninguna', sinHora);
      pintar($('#dispReservas'), '<li class="disponibilidad__vacio">Pedido de snack sin límite de cupo por máquina.</li>');
      return;
    }

    const data = db[currentPlatform];
    if (!data || !data.maquinas) return;

    let textoLibres = '', ninguna = false;
    if (hora) {
      const libres = data.maquinas.filter(m => estadoHora(m.id, k, hora, horas) === 'libre').map(m => m.nombre);
      ninguna = libres.length === 0;
      textoLibres = ninguna
        ? 'Ninguna máquina de la zona está libre a las ' + hora + ' (' + horas + ' h).'
        : 'Libres a las ' + hora + ' (' + horas + ' h): ' + libres.join(', ');
    } else {
      textoLibres = 'No hay horas libres para esta máquina ese día.';
      ninguna = true;
    }
    $('#dispLibres').text(textoLibres).toggleClass('disponibilidad__libres--ninguna', ninguna);

    const delDia = reservasDelDia(k);
    let html = '';
    if (delDia.length === 0) {
      html = '<li class="disponibilidad__vacio">Sin reservas este día. ¡Todo libre!</li>';
    } else {
      delDia.forEach(res => {
        const fin = pad(res.endDate.getHours()) + ':' + pad(res.endDate.getMinutes());
        html += `
          <li class="disponibilidad__item">
            <span class="disponibilidad__maquina">${res.maquinaNombre}</span>
            <span>${res.horaInicio} – ${fin}</span>
            <span>👤 ${res.persona}</span>
          </li>
        `;
      });
    }
    pintar($('#dispReservas'), html);
  }

  // ---------- FILTROS DEL CATÁLOGO ----------
  $('#filterContainer').on('click', '.filtros__pestana', function() {
    $('#filterContainer .filtros__pestana').removeClass('filtros__pestana--activa');
    $(this).addClass('filtros__pestana--activa');
    currentGenre = $(this).data('genre');
    renderCatalogo();
  });

  // ---------- LÓGICA DE RESERVA ----------
  $('#contentGrid').on('click', '.tarjeta__boton', function() {
    abrirReserva({
      id: $(this).attr('data-id'), nombre: $(this).attr('data-nombre'),
      precio: Number($(this).attr('data-precio')), type: $(this).attr('data-type')
    });
  });

  function duracionActual() {
    const n = parseInt($('#inputHorasReserva').val(), 10);
    return (isNaN(n) || n < 1 || n > MAX_HORAS) ? 1 : n;
  }

  function renderHorasModal(horaPreferida) {
    if (!maquinaSeleccionada) return;
    const clave = fechaSeleccionada;
    const fechaOk = fechaValida(clave);
    const horas = duracionActual();
    const sel = document.getElementById('selectHoraInicio');
    const previa = horaPreferida || sel.value;
    let primeraLibre = null, previaLibre = false;

    sel.innerHTML = '';
    HORAS_INICIO.forEach(h => {
      const est = fechaOk ? estadoHora(maquinaSeleccionada.id, clave, h, horas) : 'pasada';
      const sufijo = !fechaOk ? '' : (est === 'mantenimiento' ? ' · mantenimiento' : (est === 'ocupada' ? ' · ocupada' : (est === 'pasada' ? ' · pasada' : '')));
      const op = new Option(h + sufijo, h);
      op.disabled = est !== 'libre';
      sel.add(op);
      if (est === 'libre') {
        if (!primeraLibre) primeraLibre = h;
        if (h === previa) previaLibre = true;
      }
    });

    const elegida = previaLibre ? previa : primeraLibre;
    if (elegida) sel.value = elegida;

    const sinHoras = !fechaOk || !primeraLibre;
    marcarError($('#selectHoraInicio'), $('#errorHora'), fechaOk && !primeraLibre,
      esMantenimiento(maquinaSeleccionada.id)
        ? 'Máquina en mantenimiento.'
        : 'No quedan horarios libres ese día con esa duración. Prueba otra fecha o menos horas.');
    $('#btnConfirmarReserva').prop('disabled', sinHoras);
    renderDisponibilidad();
  }

  function abrirReserva(maq, clave, hora) {
    if (!usuarioActual) {
      abrirModalAuth('login');
      return;
    }
    maquinaSeleccionada = maq;
    const esSnack = maq.type === 'snacks';
    pintar($('#modalTitle'), '<span class="panel__icono--cyan" aria-hidden="true">📅</span> ' + (esSnack ? 'Reserva de Snack: ' : 'Reserva de ') + maq.nombre);
    $('#labelHoraInicio').text(esSnack ? 'Hora de entrega:' : 'Hora inicio:');
    $('#labelCantidadHoras').text(esSnack ? 'Cantidad:' : 'Horas:');
    $('#errorHoras').text(esSnack ? 'Máx 5 unidades.' : 'Máx 5 horas.');

    $('#inputNombre').val(usuarioActual ? usuarioActual.nombre : '');
    marcarError($('#inputNombre'), $('#errorNombre'), false);
    $('#inputHorasReserva').val('1');
    marcarError($('#inputHorasReserva'), $('#errorHoras'), false);

    fechaSeleccionada = fechaValida(clave) ? clave : primerDiaLibre(maq.id);
    semanaInicio = inicioSemana(fechaDesdeClave(fechaSeleccionada));
    renderCalendario();
    renderHorasModal(hora);

    if (maq.type === 'play') {
      $('#controlesGroup').show();
      $('#selectControles').val('1');
    } else {
      $('#controlesGroup').hide();
    }

    tiempoRestante = 60;
    $('#modalTimerBar').removeClass('modal__temporizador--alerta').text('⏳ Tiempo: 01:00');

    clearInterval(modalTimerInterval);
    modalTimerInterval = setInterval(() => {
      tiempoRestante--;
      const mins = Math.floor(tiempoRestante / 60).toString().padStart(2, '0');
      const secs = (tiempoRestante % 60).toString().padStart(2, '0');
      $('#modalTimerBar').text('⏳ Tiempo: ' + mins + ':' + secs);

      if (tiempoRestante <= 10) $('#modalTimerBar').addClass('modal__temporizador--alerta');

      if (tiempoRestante <= 0) {
        clearInterval(modalTimerInterval);
        cerrarModal('#modalReserva');
        mostrarToast("Tiempo agotado", "Reserva cancelada.", true);
      }
    }, 1000);

    abrirModal('#modalReserva');
  }

  $('#inputNombre').on('input blur', function() {
    const val = $(this).val().trim();
    marcarError($(this), $('#errorNombre'), val !== '' && !SOLO_LETRAS.test(val));
  });

  $('#inputHorasReserva').on('input blur', function() {
    const val = parseInt($(this).val(), 10);
    marcarError($(this), $('#errorHoras'), isNaN(val) || val < 1 || val > MAX_HORAS);
    renderHorasModal();
  });

  $('#selectHoraInicio').on('change', function() {
    marcarError($(this), $('#errorHora'), false);
    renderDisponibilidad();
  });

  $('#btnConfirmarReserva').click(function() {
    if (!maquinaSeleccionada) return;
    const nombre = $('#inputNombre').val().trim();
    const clave = fechaSeleccionada;
    const hora = $('#selectHoraInicio').val();
    const horas = parseInt($('#inputHorasReserva').val(), 10);

    let controles = 1, extraControles = 0;
    if (maquinaSeleccionada.type === 'play') {
      controles = parseInt($('#selectControles').val(), 10);
      extraControles = (controles - 1) * 5;
    }

    const nombreOk = !!nombre && SOLO_LETRAS.test(nombre);
    const horasOk = !isNaN(horas) && horas >= 1 && horas <= MAX_HORAS;
    const fechaOk = fechaValida(clave);

    marcarError($('#inputNombre'), $('#errorNombre'), !nombreOk);
    marcarError($('#inputHorasReserva'), $('#errorHoras'), !horasOk);
    if (!nombreOk || !horasOk || !fechaOk) return;

    if (!hora) {
      marcarError($('#selectHoraInicio'), $('#errorHora'), true, 'Elige una hora disponible.');
      return;
    }

    if (estadoHora(maquinaSeleccionada.id, clave, hora, horas) !== 'libre') {
      renderHorasModal();
      marcarError($('#selectHoraInicio'), $('#errorHora'), true, 'Esa hora ya está ocupada o no disponible.');
      mostrarToast("Hora no disponible", "Elige otro horario libre.", true);
      return;
    }

    const startDate = construirFecha(clave, hora);
    const endDate = new Date(startDate.getTime() + horas * MS_HORA);
    const ahora = new Date();
    const esSnack = maquinaSeleccionada.type === 'snacks';
    const totalBOB = (maquinaSeleccionada.precio || 0) * horas + extraControles;

    reservas.push({
      id: Date.now(),
      ownerEmail: usuarioActual ? usuarioActual.email.toLowerCase() : null,
      maquinaId: maquinaSeleccionada.id,
      maquinaNombre: maquinaSeleccionada.nombre,
      tipo: maquinaSeleccionada.type,
      totalBOB,
      persona: nombre,
      horaInicio: hora,
      claveFecha: clave,
      startDate: startDate,
      endDate: endDate,
      controles: controles,
      extraControles: extraControles,
      iniciada: esSnack ? true : (startDate <= ahora),
      liberada: false
    });
    guardarReservas();

    registrarEventoJson(
      esSnack ? 'RESERVA_SNACK' : 'RESERVA_MAQUINA',
      `${maquinaSeleccionada.nombre} (${clave} ${hora}, ${horas}${esSnack ? ' ud.' : 'h'}) · Total: BOB ${totalBOB}`,
      nombre
    );

    clearInterval(modalTimerInterval);
    cerrarModal('#modalReserva');

    fechaSeleccionada = clave;
    semanaInicio = inicioSemana(fechaDesdeClave(clave));
    mostrarToast("¡Reserva guardada en tu perfil!", nombre + ': ' + maquinaSeleccionada.nombre + ', ' + etiquetaCorta(clave).toLowerCase() + ' a las ' + hora + '.', false);
    refrescarTodo();
  });

  $('#modalClose, #btnCancelarModal').click(function() {
    clearInterval(modalTimerInterval);
    cerrarModal('#modalReserva');
  });

  function estadoTemporizador($t, modificador, texto) {
    $t.removeClass('registro__temporizador--espera registro__temporizador--activo registro__temporizador--terminado')
      .addClass('registro__temporizador--' + modificador).text(texto);
  }

  function actualizarEstadoMaquinasYTimers() {
    const ahora = new Date();
    let necesitaRenderMaquinas = false;

    reservas.forEach(res => {
      const esSnack = res.tipo === 'snacks' || (res.maquinaId && res.maquinaId.startsWith('snk-'));
      const $timer = $('[data-temporizador="' + res.id + '"]');
      if ($timer.length > 0) {
        if (ahora < res.startDate) {
          estadoTemporizador($timer, 'espera', '⏳ Empieza en: ' + formatoDuracion(res.startDate - ahora));
        } else if (ahora < res.endDate) {
          const prefijo = esSnack ? '🟢 En curso: ' : '🟢 En juego: ';
          estadoTemporizador($timer, 'activo', prefijo + formatoDuracion(res.endDate - ahora));
        } else {
          estadoTemporizador($timer, 'terminado', '🔴 Finalizada');
        }
      }
      if (ahora >= res.startDate && !res.iniciada) { res.iniciada = true; necesitaRenderMaquinas = true; }
      if (ahora >= res.endDate && !res.liberada) { res.liberada = true; necesitaRenderMaquinas = true; }
    });

    if (necesitaRenderMaquinas && currentPlatform !== 'catalogo' && currentPlatform !== 'snacks') renderMaquinas();
  }

  // ---------- ARRANQUE ----------
  sincronizarDesdeArchivoJson();
  inicializarSesion();
  renderMaquinas();
});
