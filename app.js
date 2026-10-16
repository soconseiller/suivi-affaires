/* Suivi affaires — écrans
 * Application sans outil de construction : du HTML, du CSS et ce fichier.
 * Toutes les données passent par le programme Google (voir config.js).
 */
(function () {
  'use strict';

  const CFG = window.SUIVI_CONFIG || {};
  const $ = (s, el) => (el || document).querySelector(s);
  const S = { token: null, data: null, dossier: null };

  /* ================================================================
   * OUTILS
   * ================================================================ */
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => (S.data && S.data.aujourdhui) || isoLocal(new Date());
  function isoLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2], 12);
    d.setDate(d.getDate() + Number(n || 0));
    return isoLocal(d);
  }
  function daysBetween(a, b) {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((new Date(pb[0], pb[1] - 1, pb[2], 12) - new Date(pa[0], pa[1] - 1, pa[2], 12)) / 864e5);
  }
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function fr(iso, avecJour) {
    if (!iso) return '';
    const s = String(iso);
    const p = s.slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || !p[0]) return esc(s);
    const d = new Date(p[0], p[1] - 1, p[2], 12);
    const base = p[2] + ' ' + MOIS[p[1] - 1] + (p[0] !== new Date().getFullYear() ? ' ' + p[0] : '');
    const heure = s.length > 10 ? ' à ' + s.slice(11, 16).replace(':', 'h') : '';
    return (avecJour ? JOURS[d.getDay()] + ' ' : '') + base + heure;
  }
  function relatif(iso) {
    if (!iso) return '';
    const n = daysBetween(today(), iso.slice(0, 10));
    if (n === 0) return "aujourd'hui";
    if (n === 1) return 'demain';
    if (n === -1) return 'hier';
    return n > 0 ? 'dans ' + n + ' jours' : 'il y a ' + (-n) + ' jours';
  }
  const ETAPES = () => (S.data && S.data.etapes) || {};
  const mailCfg = (cle) => (S.data.mails || []).find((m) => m.cle === cle) || {};
  const delai = (cle) => Number(mailCfg(cle).delaiJours || 0);
  const nomClient = (d) => d.client || d.titreRdv || 'Sans nom';
  const nomChantier = (d) => d.chantier || nomClient(d);
  const parId = (id) => S.data.dossiers.find((d) => d.id === id);
  const estAdmin = () => S.data && S.data.user.role === 'admin';
  const ouvert = (d) => d && ['facture', 'refuse', 'ignore'].indexOf(d.etape) < 0;
  const nomUser = (email) => {
    const u = (S.data.users || []).find((x) => x.email === email);
    return u ? (u.nom || u.email) : email;
  };

  function pillEtape(d) {
    const cls = { devis_a_faire: 'amber', termine: 'amber', facture: 'green', refuse: 'red', ignore: 'grey' }[d.etape] || '';
    return '<span class="pill ' + cls + '">' + esc(ETAPES()[d.etape] || d.etape) + '</span>';
  }

  /* Retards (mêmes règles que les mails) */
  const enRetard = {
    devis: (d) => d.etape === 'devis_a_faire' && d.dateRdv && addDays(d.dateRdv, delai('devis_a_faire')) <= today(),
    relance: (d) => d.etape === 'devis_envoye' && d.prochaineRelance && d.prochaineRelance <= today(),
    materiel: (d) => d.etape === 'commande' && d.dateValidation && addDays(d.dateValidation, delai('commande_materiel')) <= today(),
    arc: (c) => c.arcControle !== 'oui' && c.dateCommande && addDays(c.dateCommande, delai('arc')) <= today()
  };

  /* ================================================================
   * DIALOGUE AVEC LE PROGRAMME GOOGLE
   * ================================================================ */
  let enCours = 0;
  function chargement(on) {
    enCours += on ? 1 : -1;
    $('#loader').hidden = enCours <= 0;
  }

  async function api(action, data) {
    chargement(true);
    try {
      const res = await fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: S.token, action: action, data: data || {} }),
        redirect: 'follow'
      });
      const out = await res.json();
      if (!out.ok) {
        if (out.code === 'NON_CONNECTE' || out.code === 'ACCES_REFUSE') {
          deconnecter(out.error);
        }
        const e = new Error(out.error || 'Erreur inconnue');
        e.code = out.code;
        throw e;
      }
      return out.data;
    } catch (e) {
      if (!e.code) e.message = "Le programme Google ne répond pas. Vérifiez votre connexion internet. (" + e.message + ')';
      throw e;
    } finally {
      chargement(false);
    }
  }

  /** Action qui modifie les données : renvoie l'état à jour */
  async function agir(action, data, message) {
    const d = await api(action, data);
    if (d && d.dossiers) S.data = d;
    if (message) toast(message);
    return d;
  }

  /* ================================================================
   * CONNEXION GOOGLE
   * ================================================================ */
  function lireJeton(t) {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; }
  }
  function jetonValide(t) {
    const p = t && lireJeton(t);
    return p && p.exp * 1000 > Date.now() + 60000;
  }
  function stocker(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* stockage indisponible */ } }
  function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function initGoogle() {
    if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(initGoogle, 200); return; }
    google.accounts.id.initialize({
      client_id: CFG.CLIENT_ID,
      callback: (r) => { S.token = r.credential; stocker('sa_token', r.credential); demarrer(); },
      auto_select: true,
      cancel_on_tap_outside: false
    });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'fr' });
    google.accounts.id.prompt();
  }

  function montrerConnexion(msg) {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-msg').textContent = msg || '';
    initGoogle();
  }

  function deconnecter(msg) {
    S.token = null;
    stocker('sa_token', null);
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    montrerConnexion(msg);
  }

  async function demarrer() {
    $('#login').hidden = true;
    try {
      S.data = await api('boot');
      $('#app').hidden = false;
      if (!location.hash || location.hash === '#') {
        location.hash = S.data.user.role === 'technicien' ? '#/terrain' : '#/';
      } else {
        afficher();
      }
    } catch (e) {
      if (e.code !== 'NON_CONNECTE' && e.code !== 'ACCES_REFUSE') montrerConnexion(e.message);
    }
  }

  /* ================================================================
   * NAVIGATION
   * ================================================================ */
  function compteurs() {
    const ds = S.data.dossiers, cs = S.data.commandes, fs = S.data.factures;
    const dOuverts = ds.filter(ouvert);
    const arcs = cs.filter((c) => c.arcControle !== 'oui' && ouvert(parId(c.dossierId)));
    return {
      devis: ds.filter((d) => d.etape === 'devis_a_faire').length,
      devisRetard: ds.filter(enRetard.devis).length,
      relances: ds.filter((d) => d.etape === 'devis_envoye').length,
      relancesDues: ds.filter(enRetard.relance).length,
      materiel: ds.filter((d) => d.etape === 'commande').length,
      materielRetard: ds.filter(enRetard.materiel).length,
      arc: arcs.length,
      arcRetard: arcs.filter(enRetard.arc).length,
      aPlanifier: dOuverts.filter((d) => ['commande', 'materiel'].indexOf(d.etape) >= 0 && !d.dateDebut).length,
      enCours: ds.filter((d) => d.etape === 'en_cours').length,
      planifies: dOuverts.filter((d) => ['planifie', 'en_cours'].indexOf(d.etape) >= 0 || (d.dateDebut && ['commande', 'materiel'].indexOf(d.etape) >= 0)).length,
      factures: fs.filter((f) => f.faite !== 'oui' && parId(f.dossierId)).length
    };
  }

  function dessinerMenu(route) {
    const c = compteurs();
    const lien = (href, label, n, late) =>
      '<a href="' + href + '" class="' + (route === href ? 'active' : '') + '">' + label +
      (n ? '<span class="badge' + (late ? ' late' : '') + '">' + n + '</span>' : '') + '</a>';
    const u = S.data.user;
    $('#nav').innerHTML =
      '<div class="nav-brand"><strong>Suivi affaires</strong><span>' + esc(S.data.reglages.entreprise || '') + '</span></div>' +
      lien('#/', 'Tableau de bord') +
      lien('#/devis', 'Devis à faire', c.devis, c.devisRetard) +
      lien('#/relances', 'Relances clients', c.relancesDues || '', c.relancesDues) +
      lien('#/commandes', 'Commandes', c.materiel + c.arc, c.materielRetard + c.arcRetard) +
      lien('#/planning', 'Planning', c.aPlanifier, false) +
      lien('#/facturer', 'À facturer', c.factures, c.factures) +
      lien('#/archives', 'Archives') +
      '<div class="nav-sep"></div>' +
      lien('#/terrain', 'Écran chantier') +
      (estAdmin() ? lien('#/reglages', 'Réglages') : '') +
      '<div class="nav-user">' + esc(u.nom || u.email) + '<br><button type="button" data-act="logout">Se déconnecter</button>' +
      '<div style="margin-top:10px;font-size:11px;opacity:.6">par So Conseiller</div></div>';
  }

  function fermerMenu() {
    $('#nav').classList.remove('open');
    $('#nav-scrim').classList.remove('open');
    $('#menu-btn').setAttribute('aria-expanded', 'false');
  }

  async function afficher() {
    if (!S.data) return;
    fermerMenu();
    const h = location.hash.replace(/^#/, '') || '/';
    const parts = h.split('/').filter(Boolean);
    const route = '#/' + (parts[0] || '');
    dessinerMenu(route);
    const main = $('#main');
    try {
      let html;
      switch (parts[0] || '') {
        case '': html = vueAccueil(); break;
        case 'devis': html = vueDevis(); break;
        case 'relances': html = vueRelances(); break;
        case 'commandes': html = vueCommandes(); break;
        case 'planning': html = vuePlanning(); break;
        case 'facturer': html = vueFacturer(); break;
        case 'archives': html = vueArchives(); break;
        case 'reglages': html = estAdmin() ? vueReglages() : '<div class="empty">Réservé aux administrateurs.</div>'; break;
        case 'terrain':
          if (parts[1]) { await chargerDossier(parts[1]); html = vueTerrainChantier(); } else html = vueTerrain();
          break;
        case 'dossier':
          await chargerDossier(parts[1]); html = vueDossier(); break;
        default: html = '<div class="empty">Page introuvable. <a href="#/">Retour au tableau de bord</a></div>';
      }
      const banniere = S.data.reglages.modeTest === 'oui'
        ? '<div class="test-banner"><strong>Mode test.</strong> Tous les mails partent vers ' + esc(S.data.reglages.emailTest || 'l\'adresse de test') +
          ' et l\'agenda n\'est pas lu automatiquement. ' + (estAdmin() ? '<a href="#/reglages">Changer dans les réglages</a>' : '') + '</div>'
        : '';
      main.innerHTML = banniere + html;
      apresAffichage(parts[0] || '');
    } catch (e) {
      main.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    }
  }

  async function chargerDossier(id) {
    S.dossier = await api('dossier', { id: id });
  }

  async function rafraichir(msg) {
    S.data = await api('boot');
    await afficher();
    if (msg) toast(msg);
  }

  /* ================================================================
   * TABLEAU DE BORD
   * ================================================================ */
  function vueAccueil() {
    const c = compteurs();
    const ds = S.data.dossiers;
    const t = today();
    const u = S.data.user;
    const stat = (href, n, label, late, lateLabel) =>
      '<a class="stat" href="' + href + '"><div class="n">' + n + '</div><div class="l">' + label + '</div>' +
      (late ? '<div class="late">' + late + ' ' + lateLabel + '</div>' : '<div class="ok">à jour</div>') + '</a>';

    // Ce qui est en retard
    const retards = [];
    ds.filter(enRetard.devis).forEach((d) => retards.push({ d, txt: 'Devis à faire', date: d.dateRdv, quand: 'rdv ' + fr(d.dateRdv) }));
    ds.filter(enRetard.relance).forEach((d) => retards.push({ d, txt: 'Client à relancer', date: d.prochaineRelance, quand: 'prévu ' + fr(d.prochaineRelance) }));
    ds.filter(enRetard.materiel).forEach((d) => retards.push({ d, txt: 'Matériel à commander', date: d.dateValidation, quand: 'validé ' + fr(d.dateValidation) }));
    S.data.commandes.filter((c2) => enRetard.arc(c2) && ouvert(parId(c2.dossierId))).forEach((c2) =>
      retards.push({ d: parId(c2.dossierId), txt: 'ARC à contrôler (' + c2.fournisseur + ')', date: c2.dateCommande, quand: 'commandé ' + fr(c2.dateCommande) }));
    S.data.factures.filter((f) => f.faite !== 'oui' && parId(f.dossierId)).forEach((f) =>
      retards.push({ d: parId(f.dossierId), txt: f.type === 'finale' ? 'Facture finale à faire' : 'Facture intermédiaire ' + f.pourcentage + ' %', date: f.dateDemande, quand: 'demandée ' + fr(f.dateDemande) }));
    retards.sort((a, b) => (a.date < b.date ? -1 : 1));

    // Cette semaine
    const fin = addDays(t, 7);
    const semaine = [];
    S.data.commandes.forEach((c2) => {
      const d = parId(c2.dossierId);
      if (ouvert(d) && c2.dateLivraison >= t && c2.dateLivraison <= fin) semaine.push({ date: c2.dateLivraison, d, txt: 'Livraison ' + c2.fournisseur });
    });
    ds.filter(ouvert).forEach((d) => {
      if (d.dateDebut && d.dateDebut >= t && d.dateDebut <= fin) semaine.push({ date: d.dateDebut, d, txt: 'Début de chantier' });
    });
    semaine.sort((a, b) => (a.date < b.date ? -1 : 1));

    // Taux de signature
    const taux = (debut) => {
      const envoyes = ds.filter((d) => d.dateDevis && d.dateDevis >= debut && d.etape !== 'ignore');
      const valides = envoyes.filter((d) => ['devis_a_faire', 'devis_envoye', 'refuse', 'ignore'].indexOf(d.etape) < 0);
      return { n: envoyes.length, v: valides.length, pct: envoyes.length ? Math.round((100 * valides.length) / envoyes.length) : null };
    };
    const tm = taux(t.slice(0, 8) + '01'), ta = taux(t.slice(0, 4) + '-01-01');

    // Motifs de refus
    const motifs = {};
    ds.filter((d) => d.etape === 'refuse').forEach((d) => { const m = d.motifRefus || 'Non précisé'; motifs[m] = (motifs[m] || 0) + 1; });
    const maxM = Math.max(1, ...Object.values(motifs));
    const motifsHtml = Object.keys(motifs).length
      ? '<div class="bars">' + Object.keys(motifs).sort((a, b) => motifs[b] - motifs[a]).map((m) =>
        '<div class="bar-row"><span>' + esc(m) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.round((100 * motifs[m]) / maxM) + '%"></div></div><span class="v">' + motifs[m] + '</span></div>').join('') + '</div>'
      : '<p class="muted small">Aucun devis refusé pour l\'instant.</p>';

    const chantiers = ds.filter((d) => d.etape === 'en_cours' || d.etape === 'planifie').sort((a, b) => ((a.dateDebut || 'z') < (b.dateDebut || 'z') ? -1 : 1));

    const h = new Date().getHours();
    return '<div class="page-head"><div><h1>' + (h < 18 ? 'Bonjour' : 'Bonsoir') + ' ' + esc((u.nom || '').split(' ')[0]) + '</h1>' +
      '<p>' + fr(t, true) + ' · ' + ds.filter(ouvert).length + ' dossiers ouverts</p></div>' +
      '<div class="actions"><button class="btn" data-act="scan">Lire l\'agenda maintenant</button></div></div>' +
      '<div class="stats">' +
      stat('#/devis', c.devis, 'Devis à faire', c.devisRetard, 'en retard') +
      stat('#/relances', c.relances, 'Devis en attente', c.relancesDues, 'à relancer') +
      stat('#/commandes', c.materiel, 'Matériel à commander', c.materielRetard, 'en retard') +
      stat('#/commandes', c.arc, 'ARC à contrôler', c.arcRetard, 'en retard') +
      stat('#/planning', c.enCours, 'Chantiers en cours', c.aPlanifier, 'à planifier') +
      stat('#/facturer', c.factures, 'Factures à faire', c.factures, 'en attente') +
      '</div>' +
      '<div class="grid two">' +
      '<div class="card"><h2>À traiter <span class="pill ' + (retards.length ? 'red' : 'green') + '">' + retards.length + '</span></h2>' +
      (retards.length ? '<ul class="mini-list">' + retards.slice(0, 12).map((r) =>
        '<li><span><a href="#/dossier/' + r.d.id + '">' + esc(nomClient(r.d)) + '</a> · ' + esc(r.txt) + '</span><span class="muted">' + esc(r.quand) + '</span></li>').join('') + '</ul>' +
        (retards.length > 12 ? '<p class="muted small">… et ' + (retards.length - 12) + ' autres.</p>' : '')
        : '<p class="muted">Rien en retard. Tout est à jour.</p>') + '</div>' +
      '<div class="card"><h2>Les 7 prochains jours</h2>' +
      (semaine.length ? '<ul class="mini-list">' + semaine.map((s) =>
        '<li><span><a href="#/dossier/' + s.d.id + '">' + esc(nomChantier(s.d)) + '</a> · ' + esc(s.txt) + '</span><span class="muted">' + fr(s.date, true) + '</span></li>').join('') + '</ul>'
        : '<p class="muted">Aucune livraison ni début de chantier prévu.</p>') + '</div>' +
      '</div>' +
      '<div class="grid three" style="margin-top:16px">' +
      '<div class="card"><h2>Taux de signature</h2><div class="big-rate">' +
      '<div><div class="n">' + (tm.pct === null ? '–' : tm.pct + ' %') + '</div><div class="l">ce mois-ci<br>' + tm.v + ' sur ' + tm.n + ' devis</div></div>' +
      '<div><div class="n">' + (ta.pct === null ? '–' : ta.pct + ' %') + '</div><div class="l">depuis janvier<br>' + ta.v + ' sur ' + ta.n + ' devis</div></div>' +
      '</div></div>' +
      '<div class="card"><h2>Motifs de refus</h2>' + motifsHtml + '</div>' +
      '<div class="card"><h2>Chantiers</h2>' +
      (chantiers.length ? '<ul class="mini-list">' + chantiers.map((d) =>
        '<li style="display:block"><a href="#/dossier/' + d.id + '">' + esc(nomChantier(d)) + '</a>' +
        '<div class="progress-line"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div>' + (Number(d.avancement) || 0) + ' %</div></li>').join('') + '</ul>'
        : '<p class="muted small">Aucun chantier planifié.</p>') + '</div>' +
      '</div>';
  }

  /* ================================================================
   * LISTES PAR ÉTAPE
   * ================================================================ */
  function ligne(d, opts) {
    return '<div class="item' + (opts.late ? ' late' : '') + '"><div class="item-main">' +
      '<a class="item-title" href="#/dossier/' + d.id + '">' + esc(opts.titre || nomClient(d)) + '</a>' +
      (opts.late ? ' <span class="pill red">' + esc(opts.lateLabel || 'en retard') + '</span>' : '') +
      '<div class="item-meta">' + (opts.meta || []).filter(Boolean).map((m) => '<span>' + m + '</span>').join('') + '</div>' +
      (opts.note ? '<div class="item-note">' + esc(opts.note) + '</div>' : '') +
      (opts.extra || '') +
      '</div>' + (opts.actions ? '<div class="actions">' + opts.actions + '</div>' : '') + '</div>';
  }
  const vide = (txt) => '<div class="empty">' + txt + '</div>';

  function vueDevis() {
    const ds = S.data.dossiers.filter((d) => d.etape === 'devis_a_faire').sort((a, b) => (a.dateRdv < b.dateRdv ? -1 : 1));
    return '<div class="page-head"><div><h1>Devis à faire</h1><p>Rendez-vous repérés dans l\'agenda avec le mot « ' + esc(S.data.reglages.motsCles) + ' ».</p></div>' +
      '<div class="actions"><button class="btn primary" data-act="scan">Lire l\'agenda maintenant</button></div></div>' +
      (ds.length ? '<div class="list">' + ds.map((d) => ligne(d, {
        late: enRetard.devis(d),
        meta: ['Rdv ' + fr(d.dateRdv, true) + (d.heureRdv ? ' à ' + d.heureRdv.replace(':', 'h') : ''), d.lieu && esc(d.lieu), d.client && d.titreRdv !== d.client && esc(d.titreRdv)],
        note: d.descriptionRdv ? d.descriptionRdv.slice(0, 200) : '',
        actions: '<button class="btn primary" data-act="devisFait" data-id="' + d.id + '">Devis fait</button>' +
          '<button class="btn" data-act="ignorer" data-id="' + d.id + '">Ignorer</button>'
      })).join('') + '</div>' : vide('Aucun devis à faire. Les nouveaux rendez-vous apparaîtront ici.'));
  }

  function vueRelances() {
    const ds = S.data.dossiers.filter((d) => d.etape === 'devis_envoye').sort((a, b) => ((a.prochaineRelance || 'z') < (b.prochaineRelance || 'z') ? -1 : 1));
    return '<div class="page-head"><div><h1>Relances clients</h1><p>Devis envoyés en attente de réponse. Délai par défaut : ' + delai('relance_client') + ' jours.</p></div></div>' +
      (ds.length ? '<div class="list">' + ds.map((d) => {
        const late = enRetard.relance(d);
        return ligne(d, {
          late: late, lateLabel: 'à relancer',
          meta: ['Devis <strong>' + esc(d.numDevis) + '</strong> du ' + fr(d.dateDevis), 'Relance ' + fr(d.prochaineRelance, true) + ' (' + relatif(d.prochaineRelance) + ')'],
          note: d.notesRelance,
          actions: '<button class="btn primary" data-act="reponse" data-id="' + d.id + '">Réponse du client</button>'
        });
      }).join('') + '</div>' : vide('Aucun devis en attente de réponse.'));
  }

  function vueCommandes() {
    const ds = S.data.dossiers;
    const aCommander = ds.filter((d) => d.etape === 'commande').sort((a, b) => (a.dateValidation < b.dateValidation ? -1 : 1));
    const cmds = S.data.commandes.filter((c) => ouvert(parId(c.dossierId))).sort((a, b) => (a.dateLivraison < b.dateLivraison ? -1 : 1));
    const arcs = cmds.filter((c) => c.arcControle !== 'oui');
    const livraisons = cmds.filter((c) => c.dateLivraison >= today());
    const cmdLigne = (c, avecArc) => {
      const d = parId(c.dossierId);
      return ligne(d, {
        titre: nomChantier(d) + ' · ' + c.fournisseur,
        late: avecArc && enRetard.arc(c), lateLabel: 'ARC en retard',
        meta: ['Commandé le ' + fr(c.dateCommande), 'Livraison ' + fr(c.dateLivraison, true) + ' (' + relatif(c.dateLivraison) + ')',
          c.arcFichier ? '<a href="https://drive.google.com/file/d/' + esc(c.arcFichier) + '/view" target="_blank" rel="noopener">PDF de l\'ARC</a>' : ''],
        note: c.commentaire,
        actions: (avecArc ? '<button class="btn primary" data-act="arc" data-id="' + c.id + '" data-v="oui">ARC contrôlé</button>' : '') +
          '<label class="btn">Joindre le PDF<input type="file" accept="application/pdf,image/*" hidden data-upload="arc" data-cmd="' + c.id + '" data-dossier="' + c.dossierId + '"></label>'
      });
    };
    return '<div class="page-head"><div><h1>Commandes</h1><p>Matériel à commander, ARC à contrôler et livraisons à venir.</p></div></div>' +
      '<h2 class="section-title">Matériel à commander (' + aCommander.length + ')</h2>' +
      (aCommander.length ? '<div class="list">' + aCommander.map((d) => ligne(d, {
        late: enRetard.materiel(d),
        meta: ['Devis ' + esc(d.numDevis), 'Validé le ' + fr(d.dateValidation), d.numCommande ? 'Commande ' + esc(d.numCommande) : '<span class="pill amber">N° de commande à saisir</span>'],
        actions: '<button class="btn primary" data-act="commande" data-id="' + d.id + '">Commande passée</button>'
      })).join('') + '</div>' : vide('Rien à commander.')) +
      '<h2 class="section-title">ARC à contrôler (' + arcs.length + ')</h2>' +
      (arcs.length ? '<div class="list">' + arcs.map((c) => cmdLigne(c, true)).join('') + '</div>' : vide('Tous les ARC sont contrôlés.')) +
      '<h2 class="section-title">Livraisons à venir (' + livraisons.length + ')</h2>' +
      (livraisons.length ? '<div class="list">' + livraisons.map((c) => cmdLigne(c, false)).join('') + '</div>' : vide('Aucune livraison prévue.'));
  }

  function vuePlanning() {
    const ds = S.data.dossiers.filter(ouvert);
    const aPlanifier = ds.filter((d) => ['commande', 'materiel'].indexOf(d.etape) >= 0 && !d.dateDebut);
    const planifies = ds.filter((d) => d.dateDebut && ['commande', 'materiel', 'planifie', 'en_cours'].indexOf(d.etape) >= 0)
      .sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1));
    const livraisonsDe = (d) => S.data.commandes.filter((c) => c.dossierId === d.id);
    return '<div class="page-head"><div><h1>Planning des chantiers</h1><p>Du plus proche au plus lointain.</p></div></div>' +
      '<h2 class="section-title">À planifier (' + aPlanifier.length + ')</h2>' +
      (aPlanifier.length ? '<div class="list">' + aPlanifier.map((d) => ligne(d, {
        titre: nomChantier(d),
        meta: [esc(nomClient(d)), livraisonsDe(d).length ? livraisonsDe(d).map((c) => 'livraison ' + fr(c.dateLivraison)).join(', ') : 'matériel pas encore commandé'],
        actions: '<button class="btn primary" data-act="planifier" data-id="' + d.id + '">Planifier</button>'
      })).join('') + '</div>' : vide('Aucun chantier à planifier.')) +
      '<h2 class="section-title">Chantiers planifiés (' + planifies.length + ')</h2>' +
      (planifies.length ? '<div class="list">' + planifies.map((d) => ligne(d, {
        titre: nomChantier(d),
        meta: [fr(d.dateDebut, true) + (d.dateFin && d.dateFin !== d.dateDebut ? ' → ' + fr(d.dateFin, true) : ''), esc(nomClient(d)),
          d.techniciens ? esc(d.techniciens.split(',').map(nomUser).join(', ')) : 'technicien à choisir', pillEtape(d)],
        extra: '<div class="progress-line" style="margin-top:8px;max-width:320px"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div>' + (Number(d.avancement) || 0) + ' %</div>',
        actions: '<a class="btn" href="#/terrain/' + d.id + '">Écran chantier</a><button class="btn" data-act="planifier" data-id="' + d.id + '">Modifier</button>'
      })).join('') + '</div>' : vide('Aucun chantier planifié.'));
  }

  function vueFacturer() {
    const fs = S.data.factures.filter((f) => f.faite !== 'oui' && parId(f.dossierId)).sort((a, b) => (a.dateDemande < b.dateDemande ? -1 : 1));
    return '<div class="page-head"><div><h1>À facturer</h1><p>Factures intermédiaires demandées et chantiers terminés.</p></div></div>' +
      (fs.length ? '<div class="list">' + fs.map((f) => {
        const d = parId(f.dossierId);
        return ligne(d, {
          titre: nomChantier(d),
          meta: [f.type === 'finale' ? '<span class="pill amber">Facture finale</span>' : '<span class="pill">Intermédiaire ' + esc(f.pourcentage) + ' %</span>',
            esc(nomClient(d)), 'Demandée le ' + fr(f.dateDemande) + ' par ' + esc(f.demandePar), d.numCommande ? 'Commande ' + esc(d.numCommande) : ''],
          note: f.commentaire,
          actions: '<button class="btn green" data-act="factureFaite" data-id="' + f.id + '">Facture faite</button>'
        });
      }).join('') + '</div>' : vide('Aucune facture à faire.'));
  }

  function vueArchives() {
    return '<div class="page-head"><div><h1>Archives</h1><p>Dossiers facturés, devis refusés et rendez-vous ignorés.</p></div></div>' +
      '<div class="card" style="margin-bottom:16px"><label class="field" style="margin:0"><span>Rechercher</span>' +
      '<input type="text" id="search" placeholder="Client, numéro de devis, numéro de commande, chantier…" autocomplete="off"></label></div>' +
      '<div id="search-results"></div>';
  }
  function resultatsRecherche(q) {
    const n = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qq = n(q).trim();
    let ds = S.data.dossiers.slice();
    if (qq) ds = ds.filter((d) => n([d.client, d.titreRdv, d.numDevis, d.numCommande, d.chantier, d.lieu].join(' ')).indexOf(qq) >= 0);
    else ds = ds.filter((d) => !ouvert(d));
    ds.sort((a, b) => ((b.dateCloture || b.majLe || '') > (a.dateCloture || a.majLe || '') ? 1 : -1));
    $('#search-results').innerHTML = ds.length
      ? '<div class="list">' + ds.slice(0, 100).map((d) => ligne(d, {
        meta: [pillEtape(d), d.numDevis && 'Devis ' + esc(d.numDevis), d.numCommande && 'Commande ' + esc(d.numCommande), d.chantier && esc(d.chantier),
          d.motifRefus && 'Motif : ' + esc(d.motifRefus), d.dateCloture && 'Clos le ' + fr(d.dateCloture)]
      })).join('') + '</div>'
      : vide(qq ? 'Aucun dossier ne correspond.' : 'Aucun dossier archivé.');
  }

  /* ================================================================
   * FICHE DOSSIER
   * ================================================================ */
  const PARCOURS = ['devis_a_faire', 'devis_envoye', 'commande', 'materiel', 'planifie', 'en_cours', 'termine', 'facture'];

  function vueDossier() {
    const { dossier: d, commandes, factures, commentaires, historique } = S.dossier;
    const idx = PARCOURS.indexOf(d.etape);
    const steps = '<div class="steps" aria-label="Avancement du dossier">' + PARCOURS.map((e, i) => {
      const cls = idx < 0 ? '' : i < idx ? 'done' : i === idx ? (e === 'facture' ? 'done' : 'current') : '';
      return '<div class="step ' + cls + '"><div class="dot">' + (cls === 'done' ? '✓' : '') + '</div>' + esc(ETAPES()[e]) + '</div>';
    }).join('') + '</div>';

    const kv = (pairs) => '<dl class="kv">' + pairs.filter((p) => p[1]).map((p) => '<dt>' + p[0] + '</dt><dd>' + p[1] + '</dd>').join('') + '</dl>';

    let actions = '';
    switch (d.etape) {
      case 'devis_a_faire': actions = '<button class="btn primary" data-act="devisFait" data-id="' + d.id + '">Devis fait</button><button class="btn" data-act="ignorer" data-id="' + d.id + '">Ignorer</button>'; break;
      case 'devis_envoye': actions = '<button class="btn primary" data-act="reponse" data-id="' + d.id + '">Réponse du client</button>'; break;
      case 'commande': actions = '<button class="btn primary" data-act="commande" data-id="' + d.id + '">Commande matériel passée</button><button class="btn" data-act="planifier" data-id="' + d.id + '">Planifier</button>'; break;
      case 'materiel': actions = '<button class="btn primary" data-act="planifier" data-id="' + d.id + '">Planifier le chantier</button><button class="btn" data-act="commande" data-id="' + d.id + '">Autre commande</button>'; break;
      case 'planifie': case 'en_cours': actions = '<a class="btn primary" href="#/terrain/' + d.id + '">Écran chantier</a><button class="btn" data-act="commande" data-id="' + d.id + '">Autre commande</button>'; break;
      case 'termine': {
        const ff = factures.find((f) => f.type === 'finale' && f.faite !== 'oui');
        if (ff) actions = '<button class="btn green" data-act="factureFaite" data-id="' + ff.id + '">Facture finale faite</button>';
        break;
      }
      default: break;
    }

    const delaiTxt = d.delaiRelance ? d.delaiRelance + ' jours (propre à ce devis)' : delai('relance_client') + ' jours (par défaut)';

    const retour = { devis_a_faire: ['#/devis', 'Devis à faire'], devis_envoye: ['#/relances', 'Relances clients'], commande: ['#/commandes', 'Commandes'], materiel: ['#/planning', 'Planning'], planifie: ['#/planning', 'Planning'], en_cours: ['#/planning', 'Planning'], termine: ['#/facturer', 'À facturer'] }[d.etape] || ['#/archives', 'Archives'];
    return '<a class="back" href="' + retour[0] + '">← ' + retour[1] + '</a>' +
      '<div class="page-head"><div><h1>' + esc(nomClient(d)) + '</h1><p>' + pillEtape(d) + (d.chantier ? ' · ' + esc(d.chantier) : '') + (d.demo === 'oui' ? ' · <span class="pill grey">démo</span>' : '') + '</p></div>' +
      '<div class="actions">' + actions + '<button class="btn" data-act="modifier" data-id="' + d.id + '">Modifier</button></div></div>' +
      steps +
      '<div class="grid two">' +
      '<div>' +
      '<div class="card"><h2>Rendez-vous</h2>' + kv([
        ['Date', fr(d.dateRdv, true) + (d.heureRdv ? ' à ' + d.heureRdv.replace(':', 'h') : '')],
        ['Titre', esc(d.titreRdv)], ['Lieu', esc(d.lieu)], ['Notes', esc(d.descriptionRdv)]
      ]) + '</div>' +
      '<div class="card"><h2>Devis</h2>' + (d.numDevis ? kv([
        ['Numéro', '<strong>' + esc(d.numDevis) + '</strong>'], ['Envoyé le', fr(d.dateDevis)], ['Commentaire', esc(d.commentaireDevis)],
        ['Délai de relance', delaiTxt],
        ['Prochaine relance', d.etape === 'devis_envoye' ? fr(d.prochaineRelance, true) + ' (' + relatif(d.prochaineRelance) + ')' : ''],
        ['Notes de relance', esc(d.notesRelance)],
        ['Refus', d.motifRefus ? esc(d.motifRefus) + (d.commentaireRefus ? ' – ' + esc(d.commentaireRefus) : '') : '']
      ]) : '<p class="muted">Pas encore fait.</p>') + '</div>' +
      '<div class="card"><h2>Commande client</h2>' + (d.dateValidation ? kv([
        ['Validé le', fr(d.dateValidation)],
        ['N° de commande', d.numCommande ? esc(d.numCommande) : '<span class="pill amber">à saisir</span>'],
        ['Chantier', esc(d.chantier)]
      ]) : '<p class="muted">Devis pas encore validé.</p>') + '</div>' +
      '<div class="card"><h2>Matériel <span>' + (d.dateValidation && ouvert(d) ? '<button class="btn ghost" data-act="commande" data-id="' + d.id + '">+ Ajouter</button>' : '') + '</span></h2>' +
      (commandes.length ? '<div class="stack">' + commandes.map((c) =>
        '<div style="border:1px solid var(--line);border-radius:8px;padding:12px">' +
        '<strong>' + esc(c.fournisseur) + '</strong> <span class="muted small">commandé le ' + fr(c.dateCommande) + '</span>' +
        '<div class="small" style="margin:4px 0 8px">Livraison ' + fr(c.dateLivraison, true) + '</div>' +
        (c.commentaire ? '<div class="small muted" style="margin-bottom:8px">' + esc(c.commentaire) + '</div>' : '') +
        '<div class="actions" style="align-items:center"><label class="check"><input type="checkbox" data-arc="' + c.id + '"' + (c.arcControle === 'oui' ? ' checked' : '') + '> ARC contrôlé</label>' +
        (c.arcFichier ? '<a class="small" href="https://drive.google.com/file/d/' + esc(c.arcFichier) + '/view" target="_blank" rel="noopener">Voir le PDF</a>' : '') +
        '<label class="btn ghost">' + (c.arcFichier ? 'Remplacer le PDF' : 'Joindre le PDF') + '<input type="file" accept="application/pdf,image/*" hidden data-upload="arc" data-cmd="' + c.id + '" data-dossier="' + d.id + '"></label>' +
        '<button class="btn ghost" data-act="modifCommande" data-id="' + c.id + '">Modifier</button></div></div>').join('') + '</div>'
        : '<p class="muted">Aucune commande de matériel.</p>') + '</div>' +
      '</div>' +
      '<div>' +
      '<div class="card"><h2>Chantier' + (d.dateValidation && ouvert(d) ? ' <button class="btn ghost" data-act="planifier" data-id="' + d.id + '">' + (d.dateDebut ? 'Modifier' : 'Planifier') + '</button>' : '') + '</h2>' +
      (d.dateDebut ? kv([
        ['Dates', fr(d.dateDebut, true) + (d.dateFin && d.dateFin !== d.dateDebut ? ' → ' + fr(d.dateFin, true) : '')],
        ['Technicien(s)', esc((d.techniciens || '').split(',').filter(Boolean).map(nomUser).join(', '))],
        ['Terminé le', fr(d.dateFinChantier)]
      ]) + '<div class="progress-line" style="margin:12px 0 4px"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div><strong>' + (Number(d.avancement) || 0) + ' %</strong></div>'
        : '<p class="muted">Pas encore planifié.</p>') + '</div>' +
      '<div class="card"><h2>Factures</h2>' + (factures.length ? '<ul class="mini-list">' + factures.map((f) =>
        '<li><span>' + (f.type === 'finale' ? 'Facture finale' : 'Intermédiaire ' + esc(f.pourcentage) + ' %') + '<br><span class="muted small">demandée le ' + fr(f.dateDemande) + (f.commentaire ? ' · ' + esc(f.commentaire) : '') + '</span></span>' +
        (f.faite === 'oui' ? '<span class="pill green">faite le ' + fr(f.dateFaite) + '</span>' : '<button class="btn green" data-act="factureFaite" data-id="' + f.id + '">Facture faite</button>') + '</li>').join('') + '</ul>'
        : '<p class="muted">Aucune facture demandée.</p>') + '</div>' +
      '<div class="card"><h2>Commentaires et photos du chantier</h2>' + blocCommentaires(commentaires) + '</div>' +
      '<div class="card"><h2>Historique</h2><ul class="history">' + historique.map((h) =>
        '<li><span class="when">' + fr(h.date) + '</span><span><strong>' + esc(h.action) + '</strong>' + (h.note ? ' – ' + esc(h.note) : '') + ' <span class="muted">· ' + esc(h.qui) + '</span></span></li>').join('') + '</ul></div>' +
      (estAdmin() ? '<div class="card"><h2>Corriger l\'étape</h2><p class="muted small" style="margin-top:0">En cas d\'erreur, remettez le dossier à la bonne étape.</p>' +
        '<div class="actions"><select id="etape-corr" style="max-width:260px">' + Object.keys(ETAPES()).map((e) =>
          '<option value="' + e + '"' + (e === d.etape ? ' selected' : '') + '>' + esc(ETAPES()[e]) + '</option>').join('') + '</select>' +
        '<button class="btn" data-act="corriger" data-id="' + d.id + '">Appliquer</button></div></div>' : '') +
      '</div></div>';
  }

  function blocCommentaires(list) {
    if (!list.length) return '<p class="muted">Aucun commentaire pour l\'instant.</p>';
    return list.map((c) =>
      '<div class="comment"><div class="who">' + esc(c.auteur) + ' · ' + fr(c.date, true) + '</div>' +
      (c.texte ? '<p>' + esc(c.texte) + '</p>' : '') +
      (c.photo ? '<a class="photo" href="https://drive.google.com/file/d/' + esc(c.photo) + '/view" target="_blank" rel="noopener">' +
        '<img src="https://drive.google.com/thumbnail?id=' + esc(c.photo) + '&sz=w480" alt="Photo du chantier" loading="lazy" onerror="this.outerHTML=\'<span class=alt>Voir la photo</span>\'"></a>' : '') +
      '</div>').join('');
  }

  /* ================================================================
   * ÉCRAN CHANTIER (TECHNICIEN, TÉLÉPHONE)
   * ================================================================ */
  function vueTerrain() {
    const moi = S.data.user.email;
    const ds = S.data.dossiers.filter((d) => ouvert(d) && (['planifie', 'en_cours'].indexOf(d.etape) >= 0 || (d.dateDebut && ['commande', 'materiel'].indexOf(d.etape) >= 0)))
      .sort((a, b) => ((a.dateDebut || 'z') < (b.dateDebut || 'z') ? -1 : 1));
    const miens = ds.filter((d) => (d.techniciens || '').split(',').indexOf(moi) >= 0);
    const autres = ds.filter((d) => miens.indexOf(d) < 0);
    const carte = (d) => '<a class="terrain-card" href="#/terrain/' + d.id + '"><div class="t">' + esc(nomChantier(d)) + '</div>' +
      '<div class="when">' + (d.dateDebut ? fr(d.dateDebut, true) + (d.dateFin && d.dateFin !== d.dateDebut ? ' → ' + fr(d.dateFin, true) : '') : 'date à définir') + (d.lieu ? ' · ' + esc(d.lieu) : '') + '</div>' +
      '<div class="progress-line"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div><strong>' + (Number(d.avancement) || 0) + ' %</strong></div></a>';
    return '<div class="page-head"><div><h1>Mes chantiers</h1><p>Touchez un chantier pour noter l\'avancement.</p></div></div>' +
      (miens.length ? miens.map(carte).join('') : (autres.length ? '' : vide('Aucun chantier planifié pour l\'instant.'))) +
      (autres.length ? '<h2 class="section-title">' + (miens.length ? 'Autres chantiers' : 'Chantiers planifiés') + '</h2>' + autres.map(carte).join('') : '');
  }

  function vueTerrainChantier() {
    const { dossier: d, commentaires, factures } = S.dossier;
    const pct = Number(d.avancement) || 0;
    const fini = d.etape === 'termine' || d.etape === 'facture';
    const inter = factures.filter((f) => f.type === 'intermediaire');
    return '<a class="back" href="#/terrain">← Mes chantiers</a>' +
      '<div class="page-head"><div><h1>' + esc(nomChantier(d)) + '</h1><p>' + esc(nomClient(d)) +
      (d.lieu ? ' · <a href="https://maps.google.com/?q=' + encodeURIComponent(d.lieu) + '" target="_blank" rel="noopener">' + esc(d.lieu) + '</a>' : '') +
      (d.dateDebut ? '<br>' + fr(d.dateDebut, true) + (d.dateFin && d.dateFin !== d.dateDebut ? ' → ' + fr(d.dateFin, true) : '') : '') + '</p></div></div>' +
      '<div class="card"><h2>Avancement</h2><div class="slider-box"><div class="pct" id="pct-val">' + pct + ' %</div>' +
      '<input type="range" min="0" max="100" step="5" value="' + pct + '" id="pct" aria-label="Avancement du chantier en pourcentage"' + (fini ? ' disabled' : '') + '></div>' +
      '<p class="muted small" style="text-align:center;margin:4px 0 0">Glissez puis relâchez : c\'est enregistré tout seul.</p></div>' +
      '<div class="card"><h2>Ajouter un commentaire</h2>' +
      '<label class="field"><span class="muted small" style="font-weight:400">Pour dicter, touchez le micro du clavier.</span>' +
      '<textarea id="com-txt" rows="4" placeholder="Ce qui a été fait, ce qui manque, un souci…"></textarea></label>' +
      '<div class="stack"><button class="btn primary big" data-act="ajoutCom" data-id="' + d.id + '">Enregistrer le commentaire</button>' +
      '<label class="btn big">Prendre une photo<input type="file" accept="image/*" capture="environment" hidden data-upload="photo" data-dossier="' + d.id + '"></label></div></div>' +
      (!fini ? '<div class="card"><h2>Facturation</h2><div class="stack">' +
        '<button class="btn big" data-act="factInter" data-id="' + d.id + '">Demander une facture intermédiaire</button>' +
        '<button class="btn green big" data-act="termine" data-id="' + d.id + '">Chantier terminé</button></div>' +
        (inter.length ? '<p class="muted small" style="margin-bottom:0">Déjà demandé : ' + inter.map((f) => esc(f.pourcentage) + ' %' + (f.faite === 'oui' ? ' (facturé)' : '')).join(', ') + '</p>' : '') + '</div>'
        : '<div class="card"><p style="margin:0"><span class="pill green">Chantier terminé</span> ' + (d.dateFinChantier ? 'le ' + fr(d.dateFinChantier) : '') + '</p></div>') +
      '<div class="card"><h2>Historique du chantier</h2>' + blocCommentaires(commentaires) + '</div>';
  }

  /* ================================================================
   * RÉGLAGES
   * ================================================================ */
  const LIB_DELAI = {
    devis_a_faire: 'Premier rappel, en jours après le rendez-vous',
    relance_client: 'Délai par défaut, en jours après l\'envoi du devis',
    commande_materiel: 'Premier rappel, en jours après la validation du devis',
    arc: 'Premier rappel, en jours après la commande',
    facture_inter: 'Premier rappel, en jours après la demande (0 = le jour même)',
    a_facturer: 'Premier rappel, en jours après la fin du chantier (0 = le jour même)'
  };
  const AIDE_MAIL = {
    nouvelle_commande: 'Envoyé tout de suite quand un devis est validé.',
    livraison: 'Envoyé une seule fois, la veille de chaque livraison.',
    recap: 'Un seul mail qui liste tout ce qui reste à faire.',
    facture_inter: 'Envoyé tout de suite à la demande du technicien, puis relancé selon le rythme.',
    a_facturer: 'Envoyé tout de suite quand le chantier est terminé, puis relancé selon le rythme.'
  };
  const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function vueReglages() {
    const r = S.data.reglages;
    const opt = (v, cur, label) => '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + label + '</option>';
    const heures = (cur) => Array.from({ length: 24 }, (_, h) => opt(h, cur, h + ' h')).join('');

    const mails = S.data.mails.map((m) => {
      const jours = String(m.jours || '').split(',');
      const k = m.cle;
      const avecDelai = !!LIB_DELAI[k];
      const avecRythme = ['nouvelle_commande', 'livraison', 'recap'].indexOf(k) < 0;
      const avecHoraire = k !== 'nouvelle_commande';
      const resume = m.active === 'oui'
        ? (avecHoraire ? jours.filter(Boolean).map((j) => LETTRES[Number(j) - 1]).join(' ') + ' à ' + m.heure + ' h' : 'immédiat')
        : 'désactivé';
      return '<details class="mail" data-mail="' + k + '"><summary>' + esc(m.nom) + '<span class="sum-info">' + esc(resume) + '</span></summary><div class="mail-body">' +
        (AIDE_MAIL[k] ? '<p class="muted small">' + AIDE_MAIL[k] + '</p>' : '') +
        '<label class="check" style="margin:8px 0 14px"><input type="checkbox" name="active"' + (m.active === 'oui' ? ' checked' : '') + '> Relance active</label>' +
        '<label class="field"><span>Envoyer à</span><input type="text" name="destinataires" value="' + esc(m.destinataires) + '" placeholder="' + esc(r.emailContact || '') + '">' +
        '<small>Une ou plusieurs adresses séparées par une virgule. Vide = adresse contact.</small></label>' +
        (avecDelai || avecRythme ? '<div class="row2">' +
          (avecDelai ? '<label class="field"><span>' + LIB_DELAI[k] + '</span><input type="number" min="0" name="delaiJours" value="' + esc(m.delaiJours) + '"></label>' : '<div></div>') +
          (avecRythme ? '<label class="field"><span>Puis tous les … jours, tant que rien n\'est fait</span><input type="number" min="1" name="rythmeJours" value="' + esc(m.rythmeJours) + '"></label>' : '') +
          '</div>' : '') +
        (avecHoraire ? '<div class="row2"><div class="field"><span>Jours d\'envoi</span><div class="days">' + LETTRES.map((l, i) =>
          '<label><input type="checkbox" name="jour" value="' + (i + 1) + '"' + (jours.indexOf(String(i + 1)) >= 0 ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div></div>' +
          '<label class="field"><span>Heure d\'envoi</span><select name="heure">' + heures(m.heure) + '</select><small>Le mail part dans l\'heure choisie.</small></label></div>' : '') +
        '<label class="field"><span>Objet du mail</span><input type="text" name="objet" value="' + esc(m.objet) + '"></label>' +
        '<label class="field"><span>Texte du mail</span><textarea name="texte" rows="5">' + esc(m.texte) + '</textarea></label>' +
        '<button type="button" class="btn" data-act="mailTest" data-cle="' + k + '">M\'envoyer un essai</button>' +
        '</div></details>';
    }).join('');

    const users = S.data.users.map((u, i) => ligneUser(u, i)).join('');

    return '<div class="page-head"><div><h1>Réglages</h1><p>Tout ce que l\'entreprise peut adapter sans toucher au code.</p></div></div>' +
      '<form class="card" id="f-reglages"><h2>Entreprise et agenda</h2>' +
      '<div class="row2"><label class="field"><span>Nom de l\'entreprise</span><input type="text" name="entreprise" value="' + esc(r.entreprise) + '"></label>' +
      '<label class="field"><span>Adresse contact</span><input type="email" name="emailContact" value="' + esc(r.emailContact) + '"><small>Reçoit les mails quand aucune adresse n\'est précisée.</small></label></div>' +
      '<label class="field"><span>Mots-clés à repérer dans l\'agenda</span><input type="text" name="motsCles" value="' + esc(r.motsCles) + '">' +
      '<small>Séparés par une virgule. Cherchés dans le titre et les notes du rendez-vous, sans tenir compte des majuscules ni des accents.</small></label>' +
      '<label class="field"><span>Motifs de refus proposés</span><input type="text" name="motifsRefus" value="' + esc(r.motifsRefus) + '"><small>Séparés par une virgule.</small></label>' +
      '<div class="row3"><label class="field"><span>Lecture automatique de l\'agenda</span><select name="agendaActif">' + opt('oui', r.agendaActif, 'Oui, toutes les heures') + opt('non', r.agendaActif, 'Non') + '</select></label>' +
      '<label class="field"><span>Regarder en arrière (jours)</span><input type="number" min="1" name="joursAgendaPasse" value="' + esc(r.joursAgendaPasse) + '"></label>' +
      '<label class="field"><span>Regarder en avant (jours)</span><input type="number" min="1" name="joursAgendaFutur" value="' + esc(r.joursAgendaFutur) + '"></label></div>' +
      '<label class="field"><span>Identifiant de l\'agenda</span><input type="text" name="agendaId" value="' + esc(r.agendaId) + '" placeholder="Vide = agenda principal du compte contact"></label>' +
      '<h2 style="margin-top:8px">Mode test</h2>' +
      '<div class="row2"><label class="field"><span>Mode test</span><select name="modeTest">' + opt('oui', r.modeTest, 'Activé') + opt('non', r.modeTest, 'Désactivé (utilisation réelle)') + '</select>' +
      '<small>En mode test, tous les mails vont à l\'adresse de test et l\'agenda n\'est pas lu automatiquement.</small></label>' +
      '<label class="field"><span>Adresse de test</span><input type="email" name="emailTest" value="' + esc(r.emailTest) + '"></label></div>' +
      '<button class="btn primary" type="submit">Enregistrer</button></form>' +

      '<div class="card"><h2>Mails de rappel</h2>' +
      '<div class="help">Dans l\'objet et le texte, ces mots entre accolades sont remplacés automatiquement : ' +
      ['client', 'numero_devis', 'date_rdv', 'numero_commande', 'date_validation', 'chantier', 'fournisseur', 'date_livraison', 'avancement', 'pourcentage', 'commentaire', 'prochaine_relance', 'entreprise']
        .map((x) => '<code>{' + x + '}</code>').join(' ') + '. Un bouton « Ouvrir le dossier » est ajouté en bas de chaque mail.</div>' +
      mails + '<button class="btn primary" data-act="saveMails" style="margin-top:6px">Enregistrer les mails</button></div>' +

      '<div class="card"><h2>Utilisateurs</h2><p class="muted small" style="margin-top:0">Seules ces adresses Google peuvent se connecter. Elles ont aussi accès aux PDF et photos dans Google Drive.</p>' +
      '<div style="overflow-x:auto"><table class="users"><thead><tr><th>Adresse Gmail</th><th>Nom</th><th>Rôle</th><th>Actif</th><th></th></tr></thead><tbody id="users-body">' + users + '</tbody></table></div>' +
      '<div class="actions" style="margin-top:12px"><button class="btn" data-act="addUser">+ Ajouter une personne</button><button class="btn primary" data-act="saveUsers">Enregistrer les utilisateurs</button></div></div>' +

      '<div class="card"><h2>Données de démonstration</h2><p class="muted small" style="margin-top:0">Neuf dossiers fictifs à toutes les étapes, pour essayer l\'appli. Ils sont marqués « démo » et se suppriment d\'un clic sans toucher aux vrais dossiers.</p>' +
      '<div class="actions"><button class="btn" data-act="demoCharger">Charger la démo</button><button class="btn danger" data-act="demoSupprimer">Supprimer la démo</button></div></div>';
  }

  function ligneUser(u, i) {
    return '<tr data-user="' + i + '"><td><input type="email" name="email" value="' + esc(u.email) + '" placeholder="prenom@gmail.com"></td>' +
      '<td><input type="text" name="nom" value="' + esc(u.nom) + '" placeholder="Prénom Nom"></td>' +
      '<td><select name="role"><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Administration</option><option value="technicien"' + (u.role === 'technicien' ? ' selected' : '') + '>Technicien</option></select></td>' +
      '<td><input type="checkbox" name="actif"' + (u.actif !== 'non' ? ' checked' : '') + ' aria-label="Actif"></td>' +
      '<td><button class="btn ghost" data-act="delUser" aria-label="Retirer">✕</button></td></tr>';
  }

  /* ================================================================
   * FENÊTRES (FORMULAIRES)
   * ================================================================ */
  function fenetre(opts) {
    const dlg = $('#modal');
    dlg.innerHTML = '<form method="dialog" novalidate><header><h2>' + esc(opts.titre) + '</h2>' + (opts.sousTitre ? '<p>' + opts.sousTitre + '</p>' : '') + '</header>' +
      '<div class="body"><p class="err" hidden></p>' + opts.corps + '</div>' +
      '<footer><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn ' + (opts.classe || 'primary') + '">' + esc(opts.bouton || 'Enregistrer') + '</button></footer></form>';
    const form = $('form', dlg);
    $('[data-close]', dlg).onclick = () => dlg.close();
    if (opts.apres) opts.apres(form);
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const v = {};
      fd.forEach((val, key) => { v[key] = typeof val === 'string' ? val.trim() : val; });
      const btn = $('button[type=submit]', form);
      const err = $('.err', form);
      err.hidden = true;
      btn.disabled = true;
      try {
        await opts.valider(v, form);
        dlg.close();
        await afficher();
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
      }
    };
    dlg.showModal();
    const first = $('.body input:not([type=hidden]):not([type=radio]), .body textarea, .body select', dlg);
    if (first && window.innerWidth > 860) first.focus();
  }

  const champ = (label, html, aide) => '<label class="field"><span>' + label + '</span>' + html + (aide ? '<small>' + aide + '</small>' : '') + '</label>';
  const input = (name, value, type, attrs) => '<input type="' + (type || 'text') + '" name="' + name + '" value="' + esc(value || '') + '" ' + (attrs || '') + '>';

  const FORMS = {
    devisFait(id) {
      const d = parId(id);
      fenetre({
        titre: 'Devis fait', sousTitre: esc(d.titreRdv) + ' · rdv du ' + fr(d.dateRdv),
        corps: champ('Numéro de devis *', input('numDevis', '', 'text', 'required')) +
          champ('Nom du client *', input('client', d.client, 'text', 'required')) +
          champ('Commentaire', '<textarea name="commentaire" rows="3"></textarea>') +
          '<p class="muted small">Une coche verte ✅ sera ajoutée au rendez-vous dans l\'agenda.</p>',
        valider: (v) => {
          if (!v.numDevis) throw new Error('Le numéro de devis est obligatoire.');
          if (!v.client) throw new Error('Le nom du client est obligatoire.');
          return agir('devisFait', { id, numDevis: v.numDevis, client: v.client, commentaire: v.commentaire }, 'Devis enregistré');
        }
      });
    },
    reponse(id) {
      const d = parId(id);
      const motifs = String(S.data.reglages.motifsRefus || '').split(',').map((s) => s.trim()).filter(Boolean);
      const proposition = addDays(today(), 7);
      fenetre({
        titre: 'Réponse du client', sousTitre: esc(nomClient(d)) + ' · devis ' + esc(d.numDevis),
        corps: '<div class="choices" role="radiogroup" aria-label="Réponse">' +
          '<label><input type="radio" name="type" value="report" checked><span>Report</span></label>' +
          '<label><input type="radio" name="type" value="refuse"><span>Refusé</span></label>' +
          '<label><input type="radio" name="type" value="valide"><span>Validé</span></label></div>' +
          '<div data-pane="report">' + champ('Relancer de nouveau le', input('date', proposition, 'date')) +
          champ('Notes', '<textarea name="notes" rows="3" placeholder="Ce que le client a dit…"></textarea>') + '</div>' +
          '<div data-pane="refuse" hidden>' + champ('Motif du refus', '<select name="motif">' + motifs.map((m) => '<option>' + esc(m) + '</option>').join('') + '</select>') +
          champ('Commentaire', '<textarea name="commentaire" rows="3"></textarea>') + '</div>' +
          '<div data-pane="valide" hidden>' + champ('Numéro de commande', input('numCommande', ''), 'Celui d\'Hercule Pro. Vous pourrez le saisir plus tard si vous ne l\'avez pas encore.') +
          '<p class="muted small">Un mail « Nouvelle commande » sera envoyé.</p></div>',
        apres: (form) => {
          const maj = () => {
            const t = form.querySelector('input[name=type]:checked').value;
            form.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
            $('button[type=submit]', form).textContent = { report: 'Reporter', refuse: 'Classer en refus', valide: 'Valider le devis' }[t];
          };
          form.querySelectorAll('input[name=type]').forEach((r) => { r.onchange = maj; });
          maj();
        },
        valider: (v) => {
          if (v.type === 'report' && !v.date) throw new Error('Choisissez la date de la prochaine relance.');
          const msg = { report: 'Relance reportée au ' + fr(v.date), refuse: 'Devis classé en refus', valide: 'Devis validé, commande créée' }[v.type];
          return agir('reponseClient', Object.assign({ id }, v), msg);
        }
      });
    },
    commande(id) {
      const d = parId(id);
      fenetre({
        titre: 'Commande de matériel passée', sousTitre: esc(nomClient(d)) + (d.numCommande ? ' · commande ' + esc(d.numCommande) : ''),
        corps: champ('Nom du chantier *', input('chantier', d.chantier || nomClient(d), 'text', d.chantier ? 'readonly' : ''), d.chantier ? 'Déjà défini pour ce dossier (modifiable depuis la fiche).' : '') +
          champ('Fournisseur *', input('fournisseur', '')) +
          '<div class="row2">' + champ('Commandé le', input('dateCommande', today(), 'date')) + champ('Livraison prévue le *', input('dateLivraison', '', 'date')) + '</div>' +
          champ('Commentaire', '<textarea name="commentaire" rows="2"></textarea>'),
        valider: (v) => {
          if (!v.chantier || !v.fournisseur || !v.dateLivraison) throw new Error('Chantier, fournisseur et date de livraison sont obligatoires.');
          return agir('ajouterCommande', Object.assign({ dossierId: id }, v), 'Commande enregistrée');
        }
      });
    },
    modifCommande(id) {
      const c = S.data.commandes.find((x) => x.id === id);
      fenetre({
        titre: 'Modifier la commande',
        corps: champ('Fournisseur', input('fournisseur', c.fournisseur)) + champ('Livraison prévue le', input('dateLivraison', c.dateLivraison, 'date')) +
          champ('Commentaire', '<textarea name="commentaire" rows="2">' + esc(c.commentaire) + '</textarea>'),
        valider: async (v) => { await agir('modifierCommande', Object.assign({ id }, v), 'Commande modifiée'); }
      });
    },
    planifier(id) {
      const d = parId(id);
      const techs = S.data.users.filter((u) => u.actif !== 'non');
      const choisis = (d.techniciens || '').split(',');
      fenetre({
        titre: d.dateDebut ? 'Modifier le planning' : 'Planifier le chantier', sousTitre: esc(nomClient(d)),
        corps: champ('Nom du chantier', input('chantier', d.chantier || nomClient(d))) +
          '<div class="row2">' + champ('Début *', input('dateDebut', d.dateDebut, 'date')) + champ('Fin', input('dateFin', d.dateFin, 'date'), 'Vide = un seul jour') + '</div>' +
          '<div class="field"><span>Technicien(s)</span><div class="stack">' + techs.map((u) =>
            '<label class="check"><input type="checkbox" name="tech_' + esc(u.email) + '"' + (choisis.indexOf(u.email) >= 0 ? ' checked' : '') + '> ' + esc(u.nom || u.email) +
            (u.role === 'admin' ? ' <span class="muted small">(administration)</span>' : '') + '</label>').join('') + '</div></div>',
        valider: (v) => {
          if (!v.dateDebut) throw new Error('Indiquez la date de début.');
          if (v.dateFin && v.dateFin < v.dateDebut) throw new Error('La date de fin est avant la date de début.');
          const t = Object.keys(v).filter((k) => k.indexOf('tech_') === 0).map((k) => k.slice(5));
          return agir('planifier', { id, chantier: v.chantier, dateDebut: v.dateDebut, dateFin: v.dateFin || v.dateDebut, techniciens: t.join(',') }, 'Chantier planifié');
        }
      });
    },
    modifier(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Modifier le dossier', sousTitre: esc(nomClient(d)),
        corps: champ('Nom du client', input('client', d.client)) + champ('Lieu', input('lieu', d.lieu)) +
          '<div class="row2">' + champ('Numéro de devis', input('numDevis', d.numDevis)) + champ('N° de commande (Hercule Pro)', input('numCommande', d.numCommande)) + '</div>' +
          champ('Commentaire sur le devis', '<textarea name="commentaireDevis" rows="2">' + esc(d.commentaireDevis) + '</textarea>') +
          '<div class="row2">' + champ('Délai de relance de ce devis (jours)', input('delaiRelance', d.delaiRelance, 'number', 'min="1" placeholder="' + delai('relance_client') + ' par défaut"'), 'Vide = délai général') +
          champ('Prochaine relance', input('prochaineRelance', d.prochaineRelance, 'date')) + '</div>' +
          champ('Nom du chantier', input('chantier', d.chantier)),
        valider: async (v) => {
          await agir('modifierDossier', { id, champs: v }, 'Dossier modifié');
        }
      });
    },
    factInter(id) {
      const d = S.dossier ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Facture intermédiaire', sousTitre: esc(nomChantier(d)),
        corps: champ('Pourcentage à facturer *', input('pct', d.avancement && Number(d.avancement) < 100 ? d.avancement : '', 'number', 'min="1" max="99" inputmode="numeric"'), 'Par exemple 30 pour 30 %.') +
          champ('Commentaire', '<textarea name="commentaire" rows="3" placeholder="Ce qui justifie cette facture…"></textarea>') +
          '<p class="muted small">Un mail part tout de suite à l\'administration.</p>',
        bouton: 'Envoyer la demande',
        valider: async (v) => {
          const p = Number(v.pct);
          if (!(p > 0 && p < 100)) throw new Error('Indiquez un pourcentage entre 1 et 99.');
          await agir('demandeFactureInter', { id, pct: p, commentaire: v.commentaire }, 'Demande envoyée');
        }
      });
    },
    termine(id) {
      const d = S.dossier ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Chantier terminé ?', sousTitre: esc(nomChantier(d)),
        corps: '<p>L\'avancement passera à 100 % et un mail préviendra qu\'il faut facturer.</p>' + champ('Commentaire de fin (facultatif)', '<textarea name="commentaire" rows="3"></textarea>'),
        bouton: 'Oui, chantier terminé', classe: 'green',
        valider: async (v) => {
          await agir('chantierTermine', { id, commentaire: v.commentaire }, 'Chantier terminé, facturation prévenue');
        }
      });
    },
    confirmer(titre, texte, bouton, fn, classe) {
      fenetre({ titre, corps: '<p>' + texte + '</p>', bouton, classe: classe || 'primary', valider: fn });
    }
  };

  /* ================================================================
   * FICHIERS (PDF, PHOTOS)
   * ================================================================ */
  function lireBase64(file) {
    return new Promise((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1]);
      r.onerror = ko;
      r.readAsDataURL(file);
    });
  }
  function reduirePhoto(file, max) {
    return new Promise((ok) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
      img.src = url;
    });
  }
  async function envoyerFichier(inp) {
    const file = inp.files && inp.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('Fichier trop lourd (20 Mo maximum).', true); return; }
    const type = inp.dataset.upload;
    try {
      let b64, mime = file.type, nom = file.name;
      if (file.type.indexOf('image/') === 0) {
        b64 = await reduirePhoto(file, 1600);
        mime = 'image/jpeg';
        nom = (type === 'arc' ? 'ARC ' : 'Photo ') + new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h') + '.jpg';
      }
      if (!b64) b64 = await lireBase64(file);
      toast('Envoi en cours…');
      await agir('envoyerFichier', { dossierId: inp.dataset.dossier, commandeId: inp.dataset.cmd || '', type, base64: b64, mime, nom },
        type === 'arc' ? 'PDF de l\'ARC enregistré' : 'Photo enregistrée');
      await afficher();
    } catch (e) {
      toast(e.message, true);
    } finally {
      inp.value = '';
    }
  }

  /* ================================================================
   * ACTIONS DES BOUTONS
   * ================================================================ */
  async function essayer(fn) {
    try { await fn(); } catch (e) { toast(e.message, true); }
  }

  const ACTIONS = {
    logout: () => deconnecter(),
    refresh: () => essayer(() => rafraichir('Données à jour')),
    scan: () => essayer(async () => {
      const avant = S.data.dossiers.length;
      await agir('scannerAgenda');
      const n = S.data.dossiers.length - avant;
      toast(n ? n + ' nouveau' + (n > 1 ? 'x' : '') + ' rendez-vous repéré' + (n > 1 ? 's' : '') : 'Aucun nouveau rendez-vous');
      await afficher();
    }),
    devisFait: (el) => FORMS.devisFait(el.dataset.id),
    ignorer: (el) => FORMS.confirmer('Ignorer ce rendez-vous ?', 'Il ne sera plus proposé dans les devis à faire. Vous le retrouverez dans les archives.', 'Ignorer',
      () => agir('ignorer', { id: el.dataset.id }, 'Rendez-vous ignoré')),
    reponse: (el) => FORMS.reponse(el.dataset.id),
    commande: (el) => FORMS.commande(el.dataset.id),
    modifCommande: (el) => FORMS.modifCommande(el.dataset.id),
    arc: (el) => essayer(async () => { await agir('modifierCommande', { id: el.dataset.id, arcControle: el.dataset.v }, 'ARC contrôlé'); await afficher(); }),
    planifier: (el) => FORMS.planifier(el.dataset.id),
    modifier: (el) => FORMS.modifier(el.dataset.id),
    factureFaite: (el) => FORMS.confirmer('Facture faite ?', 'Confirmez que la facture a bien été faite.', 'Oui, facture faite',
      async () => {
        await agir('factureFaite', { factureId: el.dataset.id }, 'Facture enregistrée');
      }, 'green'),
    corriger: (el) => essayer(async () => {
      const e = $('#etape-corr').value;
      await agir('retourEtape', { id: el.dataset.id, etape: e }, 'Étape corrigée');
      await afficher();
    }),
    ajoutCom: (el) => essayer(async () => {
      const t = $('#com-txt').value.trim();
      if (!t) { toast('Écrivez ou dictez un commentaire.', true); return; }
      await agir('commentaire', { id: el.dataset.id, texte: t }, 'Commentaire enregistré');
      await afficher();
    }),
    factInter: (el) => FORMS.factInter(el.dataset.id),
    termine: (el) => FORMS.termine(el.dataset.id),
    saveMails: () => essayer(async () => {
      const mails = Array.from(document.querySelectorAll('details.mail')).map((box) => {
        const g = (n) => box.querySelector('[name=' + n + ']');
        const m = { cle: box.dataset.mail, active: g('active').checked ? 'oui' : 'non', destinataires: g('destinataires').value.trim(), objet: g('objet').value, texte: g('texte').value };
        if (g('delaiJours')) m.delaiJours = g('delaiJours').value || '0';
        if (g('rythmeJours')) m.rythmeJours = g('rythmeJours').value || '1';
        if (g('heure')) {
          m.heure = g('heure').value;
          m.jours = Array.from(box.querySelectorAll('[name=jour]:checked')).map((x) => x.value).join(',');
        }
        return m;
      });
      await agir('enregistrerMails', { mails }, 'Mails enregistrés');
      await afficher();
    }),
    mailTest: (el) => essayer(async () => {
      await api('mailTest', { cle: el.dataset.cle });
      toast('Mail d\'essai envoyé');
    }),
    addUser: () => {
      const tb = $('#users-body');
      tb.insertAdjacentHTML('beforeend', ligneUser({ email: '', nom: '', role: 'technicien', actif: 'oui' }, tb.children.length));
      tb.lastElementChild.querySelector('input').focus();
    },
    delUser: (el) => el.closest('tr').remove(),
    saveUsers: () => essayer(async () => {
      const users = Array.from(document.querySelectorAll('#users-body tr')).map((tr) => ({
        email: tr.querySelector('[name=email]').value.trim().toLowerCase(),
        nom: tr.querySelector('[name=nom]').value.trim(),
        role: tr.querySelector('[name=role]').value,
        actif: tr.querySelector('[name=actif]').checked ? 'oui' : 'non'
      })).filter((u) => u.email);
      await agir('enregistrerUtilisateurs', { users }, 'Utilisateurs enregistrés');
      await afficher();
    }),
    demoCharger: () => FORMS.confirmer('Charger la démonstration ?', 'Neuf dossiers fictifs vont être ajoutés. Les vrais dossiers ne sont pas touchés.', 'Charger',
      () => agir('demoCharger', {}, 'Démonstration chargée')),
    demoSupprimer: () => FORMS.confirmer('Supprimer la démonstration ?', 'Les dossiers marqués « démo » seront supprimés. Les vrais dossiers ne sont pas touchés.', 'Supprimer',
      () => agir('demoSupprimer', {}, 'Démonstration supprimée'), 'danger')
  };

  function apresAffichage(page) {
    if (page === 'archives') {
      const s = $('#search');
      resultatsRecherche('');
      s.oninput = () => resultatsRecherche(s.value);
    }
    if (page === 'terrain') {
      const r = $('#pct');
      if (r) {
        r.oninput = () => { $('#pct-val').textContent = r.value + ' %'; };
        r.onchange = () => essayer(async () => {
          await agir('avancement', { id: S.dossier.dossier.id, pct: Number(r.value) }, 'Avancement : ' + r.value + ' %');
          S.dossier.dossier.avancement = r.value;
        });
      }
    }
    if (page === 'reglages') {
      $('#f-reglages').onsubmit = (ev) => {
        ev.preventDefault();
        const v = {};
        new FormData(ev.target).forEach((val, k) => { v[k] = String(val).trim(); });
        essayer(async () => { await agir('enregistrerReglages', v, 'Réglages enregistrés'); await afficher(); });
      };
    }
    window.scrollTo(0, 0);
  }

  /* ================================================================
   * MESSAGES
   * ================================================================ */
  let toastTimer;
  function toast(msg, erreur) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (erreur ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, erreur ? 6000 : 2800);
  }

  /* ================================================================
   * DÉMARRAGE
   * ================================================================ */
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || !ACTIONS[el.dataset.act]) return;
    ev.preventDefault();
    ACTIONS[el.dataset.act](el);
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('input[type=file][data-upload]')) envoyerFichier(t);
    if (t.matches('input[data-arc]')) {
      essayer(async () => {
        await agir('modifierCommande', { id: t.dataset.arc, arcControle: t.checked ? 'oui' : 'non' }, t.checked ? 'ARC contrôlé' : 'ARC à recontrôler');
        await afficher();
      });
    }
  });
  window.addEventListener('hashchange', afficher);
  $('#menu-btn').onclick = () => {
    const open = !$('#nav').classList.contains('open');
    $('#nav').classList.toggle('open', open);
    $('#nav-scrim').classList.toggle('open', open);
    $('#menu-btn').setAttribute('aria-expanded', String(open));
  };
  $('#nav-scrim').onclick = fermerMenu;

  if (!CFG.API_URL || CFG.API_URL.indexOf('A_REMPLIR') >= 0) {
    montrerConnexion('L\'appli n\'est pas encore reliée au programme Google : remplissez le fichier config.js.');
    return;
  }
  const t = lire('sa_token');
  if (jetonValide(t)) { S.token = t; demarrer(); } else montrerConnexion();
})();
