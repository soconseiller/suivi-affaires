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

  /** Étape précédente (mêmes règles que le programme Google) */
  function etapePrec(d) {
    const aDesCommandes = S.data.commandes.some((c) => c.dossierId === d.id);
    return {
      devis_envoye: 'devis_a_faire', commande: 'devis_envoye', materiel: 'commande',
      planifie: aDesCommandes ? 'materiel' : 'commande', en_cours: 'planifie', termine: 'en_cours',
      facture: 'termine', refuse: 'devis_envoye', ignore: 'devis_a_faire'
    }[d.etape] || null;
  }
  const btnRetour = (d) => etapePrec(d)
    ? '<button class="btn ghost" data-act="retour" data-id="' + d.id + '" title="Revenir à « ' + esc(ETAPES()[etapePrec(d)]) + ' »">↩ Étape précédente</button>' : '';

  /* Interventions planifiées */
  const LIB_CRENEAU = { journee: 'Journée', matin: 'Matin', apres_midi: 'Après-midi' };
  const interventionsDe = (id) => (S.data.interventions || []).filter((x) => x.dossierId === id)
    .sort((a, b) => (a.date + (a.creneau === 'apres_midi' ? 2 : 1) < b.date + (b.creneau === 'apres_midi' ? 2 : 1) ? -1 : 1));
  /** « lun. 3 nov. (journée) · mer. 5 nov. (matin) » ; à défaut, les dates de début et de fin */
  function datesChantier(d) {
    const its = interventionsDe(d.id);
    if (its.length) return its.map((x) => fr(x.date, true) + ' (' + LIB_CRENEAU[x.creneau].toLowerCase() + ')').join(' · ');
    return d.dateDebut ? fr(d.dateDebut, true) + (d.dateFin && d.dateFin !== d.dateDebut ? ' → ' + fr(d.dateFin, true) : '') : '';
  }
  function listeInterventions(its) {
    return '<ul class="mini-list interv">' + its.map((x) => '<li style="display:block"><div><strong>' + fr(x.date, true) + '</strong> · ' +
      '<span class="pill ' + (x.creneau === 'journee' ? '' : 'grey') + '">' + LIB_CRENEAU[x.creneau] + '</span>' +
      (x.date < today() ? ' <span class="muted small">passée</span>' : '') + '</div>' +
      (x.travaux ? '<div class="small" style="margin-top:4px;white-space:pre-line">' + esc(x.travaux) + '</div>' : '<div class="small muted">Travaux non précisés</div>') +
      '</li>').join('') + '</ul>';
  }
  /** Ce qui n'est pas encore validé avant de planifier */
  function etapesManquantes(d) {
    const manque = [];
    if (['devis_a_faire', 'devis_envoye', 'refuse', 'ignore'].indexOf(d.etape) >= 0) manque.push('Le devis n\'est pas validé par le client.');
    const cmds = S.data.commandes.filter((c) => c.dossierId === d.id);
    if (!cmds.length) manque.push('Le matériel n\'est pas commandé.');
    cmds.filter((c) => c.arcControle !== 'oui').forEach((c) => manque.push('ARC non contrôlé : ' + c.fournisseur + '.'));
    cmds.filter((c) => c.receptionStatut !== 'conforme').forEach((c) => manque.push('Réception non validée conforme : ' + c.fournisseur + '.'));
    return manque;
  }

  function pillEtape(d) {
    const cls = { devis_a_faire: 'amber', termine: 'amber', facture: 'green', refuse: 'red', ignore: 'grey' }[d.etape] || '';
    return '<span class="pill ' + cls + '">' + esc(ETAPES()[d.etape] || d.etape) + '</span>';
  }

  /* Retards (mêmes règles que les mails) */
  /* Réception du matériel (une par commande fournisseur) */
  const LIB_RECEP = { '': 'À réceptionner', conforme: 'Reçu conforme', non_conforme: 'Non conforme', partielle: 'Reçu en partie' };
  const recepOuverte = (c) => c.receptionStatut !== 'conforme';
  function pillRecep(c) {
    const st = c.receptionStatut || '';
    const cls = { conforme: 'green', non_conforme: 'red', partielle: 'amber' }[st] || (c.dateLivraison && c.dateLivraison <= today() ? 'amber' : 'grey');
    return '<span class="pill ' + cls + '">' + LIB_RECEP[st] + '</span>';
  }
  const btnRecep = (c, cls) => '<button class="btn ' + (cls || 'primary') + '" data-act="reception" data-id="' + c.id + '">' +
    (c.receptionStatut === 'non_conforme' || c.receptionStatut === 'partielle' ? 'Nouvelle réception' : 'Valider la réception') + '</button>';

  const enRetard = {
    devis: (d) => d.etape === 'devis_a_faire' && d.dateRdv && addDays(d.dateRdv, delai('devis_a_faire')) <= today(),
    relance: (d) => d.etape === 'devis_envoye' && d.prochaineRelance && d.prochaineRelance <= today(),
    materiel: (d) => d.etape === 'commande' && d.dateValidation && addDays(d.dateValidation, delai('commande_materiel')) <= today(),
    arc: (c) => c.arcControle !== 'oui' && c.dateCommande && addDays(c.dateCommande, delai('arc')) <= today(),
    reception: (c) => recepOuverte(c) && c.dateLivraison && addDays(c.dateLivraison, delai('reception')) <= today()
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
        e.serveur = true;
        throw e;
      }
      return out.data;
    } catch (e) {
      if (!e.code && !e.serveur) e.message = "Le programme Google ne répond pas. Vérifiez votre connexion internet. (" + e.message + ')';
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
      receptions: S.data.commandes.filter((c2) => ouvert(parId(c2.dossierId)) && recepOuverte(c2) && c2.dateLivraison && c2.dateLivraison <= today()).length,
      receptionsRetard: S.data.commandes.filter((c2) => ouvert(parId(c2.dossierId)) && (enRetard.reception(c2) || c2.receptionStatut === 'non_conforme')).length,
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
      lien('#/commandes', 'Commandes', c.materiel + c.arc + c.receptions, c.materielRetard + c.arcRetard + c.receptionsRetard) +
      lien('#/planning', 'Planning', c.aPlanifier, false) +
      lien('#/facturer', 'À facturer', c.factures, c.factures) +
      lien('#/archives', 'Archives') +
      '<div class="nav-sep"></div>' +
      lien('#/terrain', 'Infos chantiers') +
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
    S.data.commandes.filter((c2) => ouvert(parId(c2.dossierId)) && (enRetard.reception(c2) || c2.receptionStatut === 'non_conforme')).forEach((c2) =>
      retards.push({ d: parId(c2.dossierId), txt: (c2.receptionStatut === 'non_conforme' ? 'Réception non conforme (' : 'Réception à valider (') + c2.fournisseur + ')', date: c2.dateLivraison, quand: 'attendu ' + fr(c2.dateLivraison) }));
    S.data.factures.filter((f) => f.faite !== 'oui' && parId(f.dossierId)).forEach((f) =>
      retards.push({ d: parId(f.dossierId), txt: f.type === 'finale' ? 'Facture finale à faire' : 'Facture intermédiaire ' + f.pourcentage + ' %', date: f.dateDemande, quand: 'demandée ' + fr(f.dateDemande) }));
    retards.sort((a, b) => (a.date < b.date ? -1 : 1));

    // Cette semaine
    const fin = addDays(t, 7);
    const semaine = [];
    S.data.commandes.forEach((c2) => {
      const d = parId(c2.dossierId);
      if (ouvert(d) && recepOuverte(c2) && c2.dateLivraison >= t && c2.dateLivraison <= fin) semaine.push({ date: c2.dateLivraison, d, txt: 'Livraison ' + c2.fournisseur });
    });
    ds.filter(ouvert).forEach((d) => {
      const its = interventionsDe(d.id);
      if (its.length) its.filter((x) => x.date >= t && x.date <= fin).forEach((x) => semaine.push({ date: x.date, d, txt: 'Intervention (' + LIB_CRENEAU[x.creneau].toLowerCase() + ')' }));
      else if (d.dateDebut && d.dateDebut >= t && d.dateDebut <= fin) semaine.push({ date: d.dateDebut, d, txt: 'Début de chantier' });
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
      '<div class="actions"><button class="btn" data-act="nouveau">+ Nouveau dossier</button><button class="btn" data-act="scan">Lire l\'agenda maintenant</button></div></div>' +
      '<div class="loupe"><svg class="loupe-ico" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '<input type="search" id="loupe" placeholder="Rechercher un dossier : client, chantier, n° de devis ou de commande, document…" autocomplete="off" aria-label="Rechercher un dossier">' +
      '<div id="loupe-res" class="loupe-res" hidden></div></div>' +
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
      '</div>' + (opts.actions || opts.retour ? '<div class="actions">' + (opts.actions || '') + (opts.retour ? btnRetour(d) : '') + '</div>' : '') + '</div>';
  }
  const vide = (txt) => '<div class="empty">' + txt + '</div>';

  function vueDevis() {
    const ds = S.data.dossiers.filter((d) => d.etape === 'devis_a_faire').sort((a, b) => (a.dateRdv < b.dateRdv ? -1 : 1));
    return '<div class="page-head"><div><h1>Devis à faire</h1><p>Rendez-vous repérés dans l\'agenda avec le mot « ' + esc(S.data.reglages.motsCles) + ' ».</p></div>' +
      '<div class="actions"><button class="btn" data-act="nouveau">+ Nouveau dossier</button><button class="btn primary" data-act="scan">Lire l\'agenda maintenant</button></div></div>' +
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
          actions: '<button class="btn primary" data-act="reponse" data-id="' + d.id + '">Réponse du client</button>', retour: true
        });
      }).join('') + '</div>' : vide('Aucun devis en attente de réponse.'));
  }

  function vueCommandes() {
    const ds = S.data.dossiers;
    const aCommander = ds.filter((d) => d.etape === 'commande').sort((a, b) => (a.dateValidation < b.dateValidation ? -1 : 1));
    const cmds = S.data.commandes.filter((c) => ouvert(parId(c.dossierId))).sort((a, b) => (a.dateLivraison < b.dateLivraison ? -1 : 1));
    const arcs = cmds.filter((c) => c.arcControle !== 'oui');
    const receptions = cmds.filter((c) => c.receptionStatut === 'non_conforme' || (recepOuverte(c) && c.dateLivraison <= today()));
    const livraisons = cmds.filter((c) => recepOuverte(c) && c.receptionStatut !== 'non_conforme' && c.dateLivraison > today());
    const cmdLigne = (c, mode) => {
      const d = parId(c.dossierId);
      const nc = c.receptionStatut === 'non_conforme';
      return ligne(d, {
        titre: nomChantier(d) + ' · ' + c.fournisseur,
        late: mode === 'arc' ? enRetard.arc(c) : mode === 'recep' ? (nc || enRetard.reception(c)) : false,
        lateLabel: mode === 'arc' ? 'ARC en retard' : nc ? 'à traiter' : 'réception en retard',
        meta: ['Commandé le ' + fr(c.dateCommande), 'Livraison ' + fr(c.dateLivraison, true) + ' (' + relatif(c.dateLivraison) + ')',
          mode === 'arc' ? '' : pillRecep(c),
          c.arcFichier ? '<a href="https://drive.google.com/file/d/' + esc(c.arcFichier) + '/view" target="_blank" rel="noopener">PDF de l\'ARC</a>' : ''],
        note: (mode !== 'arc' && c.receptionCommentaire && c.receptionStatut ? 'Réception : ' + c.receptionCommentaire + '\n' : '') + (c.commentaire || ''),
        actions: (mode === 'arc' ? '<button class="btn primary" data-act="arc" data-id="' + c.id + '" data-v="oui">ARC contrôlé</button>' +
            '<label class="btn">Joindre le PDF<input type="file" accept="application/pdf,image/*" hidden data-upload="arc" data-cmd="' + c.id + '" data-dossier="' + c.dossierId + '"></label>'
          : btnRecep(c, mode === 'recep' ? 'primary' : '')) +
          '<button class="btn ghost" data-act="modifCommande" data-id="' + c.id + '">Modifier</button>'
      });
    };
    return '<div class="page-head"><div><h1>Commandes</h1><p>Matériel à commander, ARC à contrôler, réceptions et livraisons à venir.</p></div></div>' +
      '<h2 class="section-title">Matériel à commander (' + aCommander.length + ')</h2>' +
      (aCommander.length ? '<div class="list">' + aCommander.map((d) => ligne(d, {
        late: enRetard.materiel(d),
        meta: ['Devis ' + esc(d.numDevis), 'Validé le ' + fr(d.dateValidation), d.numCommande ? 'Commande ' + esc(d.numCommande) : '<span class="pill amber">N° de commande à saisir</span>'],
        actions: '<button class="btn primary" data-act="commande" data-id="' + d.id + '">Commande passée</button>', retour: true
      })).join('') + '</div>' : vide('Rien à commander.')) +
      '<h2 class="section-title">ARC à contrôler (' + arcs.length + ')</h2>' +
      (arcs.length ? '<div class="list">' + arcs.map((c) => cmdLigne(c, 'arc')).join('') + '</div>' : vide('Tous les ARC sont contrôlés.')) +
      '<h2 class="section-title">Réceptions à valider (' + receptions.length + ')</h2>' +
      (receptions.length ? '<div class="list">' + receptions.map((c) => cmdLigne(c, 'recep')).join('') + '</div>' : vide('Aucune réception en attente.')) +
      '<h2 class="section-title">Livraisons à venir (' + livraisons.length + ')</h2>' +
      (livraisons.length ? '<div class="list">' + livraisons.map((c) => cmdLigne(c, 'avenir')).join('') + '</div>' : vide('Aucune livraison prévue.'));
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
        meta: [esc(nomClient(d)), livraisonsDe(d).length ? livraisonsDe(d).map((c) => esc(c.fournisseur) + ' ' + fr(c.dateLivraison) + ' ' + pillRecep(c)).join(' · ') : 'matériel pas encore commandé'],
        actions: '<button class="btn primary" data-act="planifier" data-id="' + d.id + '">Planifier</button>', retour: true
      })).join('') + '</div>' : vide('Aucun chantier à planifier.')) +
      '<h2 class="section-title">Chantiers planifiés (' + planifies.length + ')</h2>' +
      (planifies.length ? '<div class="list">' + planifies.map((d) => ligne(d, {
        titre: nomChantier(d),
        meta: [datesChantier(d), esc(nomClient(d)),
          d.techniciens ? esc(d.techniciens.split(',').map(nomUser).join(', ')) : 'technicien à choisir', pillEtape(d),
          livraisonsDe(d).length ? (livraisonsDe(d).every((c) => !recepOuverte(c)) ? '<span class="pill green">Matériel reçu</span>'
            : '<span class="pill amber">' + livraisonsDe(d).filter(recepOuverte).length + ' réception(s) en attente</span>') : ''],
        extra: '<div class="progress-line" style="margin-top:8px;max-width:320px"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div>' + (Number(d.avancement) || 0) + ' %</div>',
        actions: '<a class="btn" href="#/terrain/' + d.id + '">Infos chantier</a><button class="btn" data-act="planifier" data-id="' + d.id + '">Modifier</button>', retour: true
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
            esc(nomClient(d)), 'Demandée le ' + fr(f.dateDemande) + ' par ' + esc(f.demandePar), d.numCommande ? 'Commande ' + esc(d.numCommande) : '',
            f.type === 'finale' ? pillPV(d) : '',
            f.type === 'finale' ? (S.data.documents || []).filter((x) => x.dossierId === d.id && x.type === 'pv')
              .map((x, i) => '<a href="' + lienDrive(x.fichier) + '" target="_blank" rel="noopener">Voir le PV' + (i ? ' (' + (i + 1) + ')' : '') + '</a>').join(' · ') : ''],
          note: f.type === 'finale' && d.pvStatut === 'avec_reserves' && d.pvReserves ? 'Réserves : ' + d.pvReserves : f.commentaire,
          actions: '<button class="btn green" data-act="factureFaite" data-id="' + f.id + '">Facture faite</button>' +
            (f.type === 'finale' ? btnRetour(d) : '<button class="btn ghost" data-act="modifFacture" data-id="' + f.id + '">Modifier</button>')
        });
      }).join('') + '</div>' : vide('Aucune facture à faire.'));
  }

  function vueArchives() {
    return '<div class="page-head"><div><h1>Archives</h1><p>Dossiers facturés, devis refusés et rendez-vous ignorés.</p></div></div>' +
      '<div class="card" style="margin-bottom:16px"><label class="field" style="margin:0"><span>Rechercher</span>' +
      '<input type="text" id="search" placeholder="Client, numéro de devis, numéro de commande, chantier, nom de document…" autocomplete="off"></label></div>' +
      '<div id="search-results"></div>';
  }
  function resultatsRecherche(q) {
    const n = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qq = n(q).trim();
    let ds = S.data.dossiers.slice();
    const docsDe = (d) => (S.data.documents || []).filter((x) => x.dossierId === d.id);
    if (qq) ds = ds.filter((d) => n([d.client, d.titreRdv, d.numDevis, d.numCommande, d.chantier, d.lieu].concat(docsDe(d).map((x) => x.nom)).join(' ')).indexOf(qq) >= 0);
    else ds = ds.filter((d) => !ouvert(d));
    ds.sort((a, b) => ((b.dateCloture || b.majLe || '') > (a.dateCloture || a.majLe || '') ? 1 : -1));
    $('#search-results').innerHTML = ds.length
      ? '<div class="list">' + ds.slice(0, 100).map((d) => ligne(d, {
        meta: [pillEtape(d), d.numDevis && 'Devis ' + esc(d.numDevis), d.numCommande && 'Commande ' + esc(d.numCommande), d.chantier && esc(d.chantier),
          d.motifRefus && 'Motif : ' + esc(d.motifRefus), d.dateCloture && 'Clos le ' + fr(d.dateCloture),
          qq ? docsDe(d).filter((x) => n(x.nom).indexOf(qq) >= 0).map((x) => '<a href="' + lienDrive(x.fichier) + '" target="_blank" rel="noopener">📄 ' + esc(x.nom) + '</a>').join(' · ') : ''],
        retour: !ouvert(d)
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
      case 'planifie': case 'en_cours': actions = '<a class="btn primary" href="#/terrain/' + d.id + '">Infos chantier</a><button class="btn" data-act="commande" data-id="' + d.id + '">Autre commande</button>'; break;
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
      '<div class="actions">' + actions + '<button class="btn" data-act="modifier" data-id="' + d.id + '">Modifier</button>' + btnRetour(d) + '</div></div>' +
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
      ]) : '<p class="muted">Pas encore fait.</p>') +
      blocDocsDevis(d, (S.dossier.documents || []).filter((x) => x.type === 'devis')) + '</div>' +
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
        blocReception(c) +
        '<div class="actions" style="align-items:center"><label class="check"><input type="checkbox" data-arc="' + c.id + '"' + (c.arcControle === 'oui' ? ' checked' : '') + '> ARC contrôlé</label>' +
        (c.arcFichier ? '<a class="small" href="https://drive.google.com/file/d/' + esc(c.arcFichier) + '/view" target="_blank" rel="noopener">Voir le PDF</a>' : '') +
        '<label class="btn ghost">' + (c.arcFichier ? 'Remplacer le PDF' : 'Joindre le PDF') + '<input type="file" accept="application/pdf,image/*" hidden data-upload="arc" data-cmd="' + c.id + '" data-dossier="' + d.id + '"></label>' +
        '<button class="btn ghost" data-act="modifCommande" data-id="' + c.id + '">Modifier</button>' +
        '<button class="btn ghost danger" data-act="supprCommande" data-id="' + c.id + '">Supprimer</button></div></div>').join('') + '</div>'
        : '<p class="muted">Aucune commande de matériel.</p>') + '</div>' +
      '</div>' +
      '<div>' +
      '<div class="card"><h2>Chantier' + (d.dateValidation && ouvert(d) ? ' <button class="btn ghost" data-act="planifier" data-id="' + d.id + '">' + (d.dateDebut ? 'Modifier' : 'Planifier') + '</button>' : '') + '</h2>' +
      (d.dateDebut ? kv([
        ['Technicien(s)', esc((d.techniciens || '').split(',').filter(Boolean).map(nomUser).join(', '))],
        ['Terminé le', fr(d.dateFinChantier)]
      ]) + '<div class="progress-line" style="margin:12px 0 4px"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div><strong>' + (Number(d.avancement) || 0) + ' %</strong></div>' +
        (interventionsDe(d.id).length ? '<div class="small muted" style="margin:14px 0 4px">Interventions</div>' + listeInterventions(interventionsDe(d.id))
          : '<p class="small muted">Dates : ' + datesChantier(d) + '</p>')
        : '<p class="muted">Pas encore planifié.</p>') + '</div>' +
      (['en_cours', 'termine', 'facture'].indexOf(d.etape) >= 0 || d.pvStatut || (S.dossier.documents || []).some((x) => x.type !== 'devis')
        ? '<div class="card"><h2>PV de réception</h2>' + blocPV(d, S.dossier.documents || []) + '</div>' : '') +
      '<div class="card"><h2>Factures</h2>' + (factures.length ? '<ul class="mini-list">' + factures.map((f) =>
        '<li><span>' + (f.type === 'finale' ? 'Facture finale' : 'Intermédiaire ' + esc(f.pourcentage) + ' %') + '<br><span class="muted small">demandée le ' + fr(f.dateDemande) + (f.commentaire ? ' · ' + esc(f.commentaire) : '') + '</span></span>' +
        '<span class="actions" style="justify-content:flex-end">' +
        (f.faite === 'oui'
          ? '<span class="pill green">faite le ' + fr(f.dateFaite) + '</span><button class="btn ghost" data-act="annulerFacture" data-id="' + f.id + '">Annuler</button>'
          : '<button class="btn green" data-act="factureFaite" data-id="' + f.id + '">Facture faite</button>' +
            (f.type === 'intermediaire' ? '<button class="btn ghost" data-act="modifFacture" data-id="' + f.id + '">Modifier</button><button class="btn ghost danger" data-act="supprFacture" data-id="' + f.id + '">Supprimer</button>' : '')) +
        '</span></li>').join('') + '</ul>'
        : '<p class="muted">Aucune facture demandée.</p>') + '</div>' +
      '<div class="card"><h2>Documents</h2>' + blocDocuments(d, S.dossier.documents || []) + '</div>' +
      '<div class="card"><h2>Commentaires et photos du chantier</h2>' + blocCommentaires(commentaires) + '</div>' +
      '<div class="card"><h2>Historique</h2><ul class="history">' + historique.map((h) =>
        '<li><span class="when">' + fr(h.date) + '</span><span><strong>' + esc(h.action) + '</strong>' + (h.note ? ' – ' + esc(h.note) : '') + ' <span class="muted">· ' + esc(h.qui) + '</span></span></li>').join('') + '</ul></div>' +
      '<div class="card"><h2>Statut du dossier</h2><p class="muted small" style="margin-top:0">En cas d\'erreur, revenez à l\'étape précédente ou supprimez le dossier. Chaque changement est noté dans l\'historique avec son motif.</p>' +
      '<div class="actions">' + (btnRetour(d) ? btnRetour(d).replace('btn ghost', 'btn') : '<span class="muted small">Première étape : pas de retour possible.</span>') +
      '<button class="btn danger" data-act="supprDossier" data-id="' + d.id + '">Supprimer le dossier</button></div></div>' +
      '</div></div>';
  }

  /* PV de réception du chantier */
  const LIB_PV = { sans_reserves: 'Sans réserves', avec_reserves: 'Avec réserves' };
  function pillPV(d) {
    if (!d.pvStatut) return '<span class="pill grey">Pas encore de PV</span>';
    return '<span class="pill ' + (d.pvStatut === 'avec_reserves' ? 'amber' : 'green') + '">PV ' + LIB_PV[d.pvStatut].toLowerCase() + '</span>';
  }
  const lienDrive = (id) => 'https://drive.google.com/file/d/' + esc(id) + '/view';
  const estImage = (doc) => /^image\//.test(doc.mime || '') || /\.(jpe?g|png|heic|webp)$/i.test(doc.nom || '');

  /** Libellé court du type de fichier : PDF, DOC, XLS… */
  function typeDoc(x) {
    const m = (x.nom || '').match(/\.([a-z0-9]{2,4})$/i);
    if (m) return m[1].toUpperCase();
    const mime = x.mime || '';
    if (/pdf/.test(mime)) return 'PDF';
    if (/word|document/.test(mime)) return 'DOC';
    if (/sheet|excel/.test(mime)) return 'XLS';
    if (/^image\//.test(mime)) return 'Photo';
    return 'Fichier';
  }
  const vignette = (x) => '<div class="doc" data-nom="' + esc(sansAccent(x.nom)) + '">' +
      '<a href="' + lienDrive(x.fichier) + '" target="_blank" rel="noopener">' +
      (estImage(x) ? '<img src="https://drive.google.com/thumbnail?id=' + esc(x.fichier) + '&sz=w320" alt="" loading="lazy" onerror="this.outerHTML=\'<span class=doc-ico>Photo</span>\'">' : '<span class="doc-ico">' + esc(typeDoc(x)) + '</span>') +
      '<span class="doc-nom">' + esc(x.nom || 'Document') + '</span></a>' +
      '<span class="doc-liens"><button class="link" data-act="renommerDoc" data-id="' + x.id + '">renommer</button>' +
      '<button class="link danger" data-act="supprDoc" data-id="' + x.id + '">retirer</button></span></div>';
  const sansAccent = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const LIB_TYPE_DOC = { devis: 'Devis', pv: 'PV', reserve: 'Réserve', divers: 'Document' };

  /** Tous les documents du dossier, avec recherche par nom */
  function blocDocuments(d, docs) {
    const autres = docs.filter((x) => x.type === 'divers');
    const lies = docs.filter((x) => x.type !== 'divers');
    return (docs.length > 1 ? '<input type="text" class="doc-search" data-docsearch placeholder="Rechercher un document par son nom…" autocomplete="off" style="margin-bottom:12px">' : '') +
      (autres.length ? '<div class="docs">' + autres.map(vignette).join('') + '</div>' : '<p class="muted small" style="margin-top:0">Aucun document déposé.</p>') +
      (lies.length ? '<div class="small muted" style="margin:14px 0 6px">Aussi dans ce dossier (devis, PV)</div><div class="docs">' +
        lies.map((x) => vignette(Object.assign({}, x, { nom: x.nom }))
          .replace('<span class="doc-nom">', '<span class="doc-nom"><span class="doc-type">' + LIB_TYPE_DOC[x.type] + '</span> ')).join('') + '</div>' : '') +
      '<p class="muted small doc-vide" hidden>Aucun document ne correspond.</p>' +
      '<div class="actions" style="margin-top:12px"><button class="btn" data-act="deposer" data-id="' + d.id + '">+ Déposer des documents ou photos</button></div>';
  }

  /** Documents joints au devis (devis signé, annexes, plans…) */
  function blocDocsDevis(d, docs) {
    return (docs.length ? '<div class="small muted" style="margin:14px 0 6px">Documents du devis</div><div class="docs">' + docs.map(vignette).join('') + '</div>' : '') +
      '<div class="actions" style="margin-top:12px"><button class="btn" data-act="docDevis" data-id="' + d.id + '">' + (docs.length ? '+ Ajouter un document' : 'Joindre le devis') + '</button></div>';
  }

  function blocPV(d, docs) {
    const pv = docs.filter((x) => x.type === 'pv');
    const res = docs.filter((x) => x.type === 'reserve');
    return '<div class="actions" style="align-items:center;margin-bottom:10px">' + pillPV(d) +
      (d.pvDate ? '<span class="muted small">le ' + fr(d.pvDate) + '</span>' : '') + '</div>' +
      (d.pvStatut === 'avec_reserves' && d.pvReserves ? '<div class="help" style="white-space:pre-line"><strong>Réserves :</strong> ' + esc(d.pvReserves) + '</div>' : '') +
      (pv.length ? '<div class="docs">' + pv.map(vignette).join('') + '</div>' : '') +
      (res.length ? '<div class="small muted" style="margin:10px 0 6px">Photos des réserves</div><div class="docs">' + res.map(vignette).join('') + '</div>' : '') +
      '<div class="actions" style="margin-top:10px"><button class="btn" data-act="pv" data-id="' + d.id + '">' + (d.pvStatut || pv.length || res.length ? 'Compléter le PV' : 'Joindre le PV') + '</button></div>';
  }

  /** Réception d'une commande, dans la fiche et sur l'écran chantier */
  function blocReception(c) {
    const st = c.receptionStatut || '';
    const details = st ? [
      c.dateReception ? 'le ' + fr(c.dateReception) : '', c.receptionPar ? 'par ' + esc(c.receptionPar) : '',
      c.numBL ? 'BL ' + esc(c.numBL) : ''
    ].filter(Boolean).join(' · ') : '';
    return '<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin:0 0 10px">' +
      '<div class="actions" style="align-items:center;justify-content:space-between"><span><strong class="small">Réception</strong> ' + pillRecep(c) +
      (details ? ' <span class="muted small">' + details + '</span>' : '') + '</span>' +
      '<span class="actions">' + (st !== 'conforme' ? btnRecep(c, st ? 'primary' : '') : '') +
      (st ? '<button class="btn ghost" data-act="annulerReception" data-id="' + c.id + '">Annuler</button>' : '') + '</span></div>' +
      (c.receptionCommentaire && st ? '<div class="small" style="margin-top:6px;white-space:pre-line">' + esc(c.receptionCommentaire) + '</div>' : '') +
      (c.receptionPhoto ? '<a class="small" href="https://drive.google.com/file/d/' + esc(c.receptionPhoto) + '/view" target="_blank" rel="noopener">Voir la photo de réception</a>' : '') +
      '</div>';
  }

  function blocCommentaires(list) {
    if (!list.length) return '<p class="muted">Aucun commentaire pour l\'instant.</p>';
    return list.map((c) =>
      '<div class="comment"><div class="who">' + esc(c.auteur) + ' · ' + fr(c.date, true) +
      ' · <button class="link" data-act="modifCom" data-id="' + c.id + '">modifier</button> · <button class="link danger" data-act="supprCom" data-id="' + c.id + '">supprimer</button></div>' +
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
      '<div class="when">' + (datesChantier(d) || 'date à définir') + (d.lieu ? ' · ' + esc(d.lieu) : '') + '</div>' +
      '<div class="progress-line"><div class="progress"><span style="width:' + (Number(d.avancement) || 0) + '%"></span></div><strong>' + (Number(d.avancement) || 0) + ' %</strong></div></a>';
    return '<div class="page-head"><div><h1>Infos chantiers</h1><p>Touchez un chantier pour noter l\'avancement.</p></div></div>' +
      (miens.length ? miens.map(carte).join('') : (autres.length ? '' : vide('Aucun chantier planifié pour l\'instant.'))) +
      (autres.length ? '<h2 class="section-title">' + (miens.length ? 'Autres chantiers' : 'Chantiers planifiés') + '</h2>' + autres.map(carte).join('') : '');
  }

  function vueTerrainChantier() {
    const { dossier: d, commentaires, factures, commandes } = S.dossier;
    const pct = Number(d.avancement) || 0;
    const fini = d.etape === 'termine' || d.etape === 'facture';
    const inter = factures.filter((f) => f.type === 'intermediaire');
    return '<a class="back" href="#/terrain">← Infos chantiers</a>' +
      '<div class="page-head"><div><h1>' + esc(nomChantier(d)) + '</h1><p>' + esc(nomClient(d)) +
      (d.lieu ? ' · <a href="https://maps.google.com/?q=' + encodeURIComponent(d.lieu) + '" target="_blank" rel="noopener">' + esc(d.lieu) + '</a>' : '') +
      '</p></div></div>' +
      (interventionsDe(d.id).length ? '<div class="card"><h2>Interventions prévues</h2>' + listeInterventions(interventionsDe(d.id)) + '</div>' : '') +
      '<div class="card"><h2>Avancement</h2><div class="slider-box"><div class="pct" id="pct-val">' + pct + ' %</div>' +
      '<input type="range" min="0" max="100" step="5" value="' + pct + '" id="pct" aria-label="Avancement du chantier en pourcentage"' + (fini ? ' disabled' : '') + '></div>' +
      '<p class="muted small" style="text-align:center;margin:4px 0 0">Glissez puis relâchez : c\'est enregistré tout seul.</p></div>' +
      (commandes && commandes.length ? '<div class="card"><h2>Matériel</h2>' + commandes.map((c) =>
        '<div style="margin-bottom:6px"><strong>' + esc(c.fournisseur) + '</strong> <span class="muted small">livraison ' + fr(c.dateLivraison, true) + '</span></div>' +
        blocReception(c)).join('') + '</div>' : '') +
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
      '<div class="card"><h2>PV de réception</h2>' + blocPV(d, S.dossier.documents || []) + '</div>' +
      '<div class="card"><h2>Documents</h2>' + blocDocuments(d, S.dossier.documents || []) + '</div>' +
      '<div class="card"><h2>Historique du chantier</h2>' + blocCommentaires(commentaires) + '</div>';
  }

  /* ================================================================
   * RÉGLAGES
   * ================================================================ */
  const LIB_DELAI = {
    livraison: 'Prévenir combien de jours avant la livraison (0 = le jour même)',
    reception: 'Premier rappel, en jours après la date de livraison prévue (0 = le jour même)',
    devis_a_faire: 'Premier rappel, en jours après le rendez-vous',
    relance_client: 'Délai par défaut, en jours après l\'envoi du devis',
    commande_materiel: 'Premier rappel, en jours après la validation du devis',
    arc: 'Premier rappel, en jours après la commande',
    facture_inter: 'Premier rappel, en jours après la demande (0 = le jour même)',
    a_facturer: 'Premier rappel, en jours après la fin du chantier (0 = le jour même)'
  };
  const AIDE_MAIL = {
    reception: 'Envoyé quand la réception n\'est pas validée à la date de livraison prévue, puis selon le rythme, tant qu\'elle n\'est pas « conforme ».',
    reception_nc: 'Envoyé tout de suite quand une livraison est déclarée non conforme.',
    pv_reserves: 'Envoyé tout de suite quand un PV avec réserves est enregistré. Le PV et les photos sont joints.',
    a_facturer: 'Envoyé tout de suite quand le chantier est terminé, puis relancé selon le rythme. Les documents du PV sont joints.',
    nouvelle_commande: 'Envoyé tout de suite quand un devis est validé.',
    livraison: 'Envoyé une seule fois par livraison, le nombre de jours choisi avant la date prévue.',
    recap: 'Un seul mail qui liste tout ce qui reste à faire.',
    facture_inter: 'Envoyé tout de suite à la demande du technicien, puis relancé selon le rythme.'
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
      const avecRythme = ['nouvelle_commande', 'livraison', 'recap', 'reception_nc', 'pv_reserves'].indexOf(k) < 0;
      const avecHoraire = ['nouvelle_commande', 'reception_nc', 'pv_reserves'].indexOf(k) < 0;
      const avecCopie = ['pv_reserves', 'reception_nc', 'a_facturer', 'facture_inter'].indexOf(k) >= 0;
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
        (avecCopie ? '<label class="check" style="margin:-4px 0 14px"><input type="checkbox" name="copieTechniciens"' + (m.copieTechniciens === 'oui' ? ' checked' : '') + '> Envoyer aussi aux techniciens du chantier</label>' : '') +
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
      '<div class="field"><span>Horaires des interventions (écrites dans l\'agenda)</span><div class="row2">' +
      '<label class="field"><span class="small muted" style="font-weight:400">Matin</span><div class="actions"><input type="time" name="matinDebut" value="' + esc(r.matinDebut || '08:00') + '"> à <input type="time" name="matinFin" value="' + esc(r.matinFin || '12:00') + '"></div></label>' +
      '<label class="field"><span class="small muted" style="font-weight:400">Après-midi</span><div class="actions"><input type="time" name="apremDebut" value="' + esc(r.apremDebut || '13:30') + '"> à <input type="time" name="apremFin" value="' + esc(r.apremFin || '17:30') + '"></div></label>' +
      '</div><small>Une journée va du début du matin à la fin de l\'après-midi.</small></div>' +
      '<label class="field"><span>Identifiant de l\'agenda</span><input type="text" name="agendaId" value="' + esc(r.agendaId) + '" placeholder="Vide = agenda principal du compte contact"></label>' +
      '<h2 style="margin-top:8px">Mode test</h2>' +
      '<div class="row2"><label class="field"><span>Mode test</span><select name="modeTest">' + opt('oui', r.modeTest, 'Activé') + opt('non', r.modeTest, 'Désactivé (utilisation réelle)') + '</select>' +
      '<small>En mode test, tous les mails vont à l\'adresse de test et l\'agenda n\'est pas lu automatiquement.</small></label>' +
      '<label class="field"><span>Adresse de test</span><input type="email" name="emailTest" value="' + esc(r.emailTest) + '"></label></div>' +
      '<button class="btn primary" type="submit">Enregistrer</button></form>' +

      '<div class="card"><h2>Mails de rappel</h2>' +
      '<div class="help">Dans l\'objet et le texte, ces mots entre accolades sont remplacés automatiquement : ' +
      ['client', 'numero_devis', 'date_rdv', 'numero_commande', 'date_validation', 'chantier', 'fournisseur', 'date_livraison', 'quand', 'reception', 'receptionne_par', 'numero_bl', 'pv', 'reserves', 'avancement', 'pourcentage', 'commentaire', 'prochaine_relance', 'entreprise']
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
      '<footer><button type="button" class="btn" data-close>' + esc(opts.annuler || 'Annuler') + '</button><button type="submit" class="btn ' + (opts.classe || 'primary') + '">' + esc(opts.bouton || 'Enregistrer') + '</button></footer></form>';
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

  /* Champs communs du PV : choix sans / avec réserves, fichiers, détail des réserves */
  function champsPV(avecAucun, d) {
    const st = (d && d.pvStatut) || '';
    const radio = (val, label) => '<label><input type="radio" name="pvStatut" value="' + val + '"' + (st === val || (!st && !val) ? ' checked' : '') + '><span>' + label + '</span></label>';
    return '<div class="choices" role="radiogroup" aria-label="PV de réception">' +
      (avecAucun ? radio('', 'Pas de PV') : '') + radio('sans_reserves', 'Sans réserves') + radio('avec_reserves', 'Avec réserves') + '</div>' +
      '<div data-pv="fichiers"' + (avecAucun ? ' hidden' : '') + '>' +
      champ('PV signé (photos ou fichiers)', '<input type="file" name="pvFichiers" accept="image/*,application/pdf" multiple>', 'Vous pouvez en choisir plusieurs : par exemple le recto et le verso.') + '</div>' +
      '<div data-pv="reserves"' + (st === 'avec_reserves' ? '' : ' hidden') + '>' +
      champ('Détail des réserves', '<textarea name="reserves" rows="3" placeholder="Ce que le client a noté…">' + esc((d && d.pvReserves) || '') + '</textarea>') +
      champ('Photos des réserves', '<input type="file" name="reserveFichiers" accept="image/*" multiple>') +
      '<p class="muted small">Un mail part tout de suite, avec le PV et les photos.</p></div>';
  }
  function brancherPV(form) {
    const maj = () => {
      const r = form.querySelector('input[name=pvStatut]:checked');
      const t = r ? r.value : '';
      form.querySelector('[data-pv=fichiers]').hidden = !t;
      form.querySelector('[data-pv=reserves]').hidden = t !== 'avec_reserves';
    };
    form.querySelectorAll('input[name=pvStatut]').forEach((r) => { r.onchange = maj; });
    maj();
  }
  function lirePV(v, form, facultatif) {
    const statut = v.pvStatut || '';
    if (!facultatif && !statut) throw new Error('Indiquez si le PV est sans réserves ou avec réserves.');
    const pv = Array.from(form.querySelector('input[name=pvFichiers]').files || []);
    const res = statut === 'avec_reserves' ? Array.from(form.querySelector('input[name=reserveFichiers]').files || []) : [];
    return { statut, reserves: statut === 'avec_reserves' ? (v.reserves || '') : '', pv: statut ? pv : [], res };
  }
  async function envoyerDocs(dossierId, type, fichiers) {
    for (let i = 0; i < fichiers.length; i++) {
      toast('Envoi du document ' + (i + 1) + ' sur ' + fichiers.length + '…');
      await televerser(fichiers[i], type, dossierId);
    }
  }
  async function envoyerFichiersPV(dossierId, pv) {
    const tous = pv.pv.map((f) => ['pv', f]).concat(pv.res.map((f) => ['reserve', f]));
    for (let i = 0; i < tous.length; i++) {
      toast('Envoi du document ' + (i + 1) + ' sur ' + tous.length + '…');
      await televerser(tous[i][1], tous[i][0], dossierId);
    }
  }

  const FORMS = {
    devisFait(id) {
      const d = parId(id);
      fenetre({
        titre: 'Devis fait', sousTitre: esc(d.titreRdv) + ' · rdv du ' + fr(d.dateRdv),
        corps: champ('Numéro de devis *', input('numDevis', '', 'text', 'required')) +
          champ('Nom du client *', input('client', d.client, 'text', 'required')) +
          champ('Commentaire', '<textarea name="commentaire" rows="3"></textarea>') +
          champ('Document(s) du devis', '<input type="file" name="devisFichiers" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" multiple>', 'Facultatif. Vous pouvez en choisir plusieurs.') +
          '<p class="muted small">Une coche verte ✅ sera ajoutée au rendez-vous dans l\'agenda.</p>',
        valider: async (v, form) => {
          if (!v.numDevis) throw new Error('Le numéro de devis est obligatoire.');
          if (!v.client) throw new Error('Le nom du client est obligatoire.');
          const fichiers = Array.from(form.querySelector('input[name=devisFichiers]').files || []);
          await agir('devisFait', { id, numDevis: v.numDevis, client: v.client, commentaire: v.commentaire }, 'Devis enregistré');
          await envoyerDocs(id, 'devis', fichiers);
        }
      });
    },
    deposer(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Déposer des documents ou photos', sousTitre: esc(nomChantier(d)),
        corps: champ('Fichiers *', '<input type="file" name="fichiers" multiple>', 'Photos, PDF, Word, Excel… Vous pouvez en choisir plusieurs.') +
          '<div data-noms></div>',
        bouton: 'Déposer',
        apres: (form) => {
          const inp = form.querySelector('input[name=fichiers]');
          inp.onchange = () => {
            form.querySelector('[data-noms]').innerHTML = Array.from(inp.files).map((f, i) =>
              champ('Nom du document ' + (Array.from(inp.files).length > 1 ? (i + 1) + ' ' : '') + '<span class="muted small" style="font-weight:400">(' + esc(f.name) + ')</span>',
                '<input type="text" name="nom_' + i + '" value="' + esc(f.name.replace(/\.[a-z0-9]{2,5}$/i, '')) + '">')).join('');
            const premier = form.querySelector('[data-noms] input');
            if (premier) { premier.focus(); premier.select(); }
          };
        },
        valider: async (v, form) => {
          const fichiers = Array.from(form.querySelector('input[name=fichiers]').files || []);
          if (!fichiers.length) throw new Error('Choisissez au moins un fichier.');
          for (let i = 0; i < fichiers.length; i++) {
            if (!v['nom_' + i]) throw new Error('Donnez un nom au document ' + (i + 1) + '.');
          }
          for (let i = 0; i < fichiers.length; i++) {
            toast('Envoi du document ' + (i + 1) + ' sur ' + fichiers.length + '…');
            await televerser(fichiers[i], 'divers', d.id, '', v['nom_' + i]);
          }
        }
      });
    },
    renommerDoc(id) {
      const doc = ((S.dossier && S.dossier.documents) || S.data.documents || []).find((x) => x.id === id);
      fenetre({
        titre: 'Renommer le document',
        corps: champ('Nouveau nom', input('nom', (doc.nom || '').replace(/\.[a-z0-9]{2,5}$/i, ''))),
        bouton: 'Renommer',
        valider: (v) => {
          if (!v.nom) throw new Error('Indiquez un nom.');
          return agir('renommerDocument', { id, nom: v.nom }, 'Document renommé');
        }
      });
    },
    docDevis(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'Documents du devis', sousTitre: esc(nomClient(d)) + (d.numDevis ? ' · devis ' + esc(d.numDevis) : ''),
        corps: champ('Document(s) à joindre *', '<input type="file" name="devisFichiers" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" multiple>', 'Vous pouvez en choisir plusieurs.'),
        bouton: 'Joindre',
        valider: async (v, form) => {
          const fichiers = Array.from(form.querySelector('input[name=devisFichiers]').files || []);
          if (!fichiers.length) throw new Error('Choisissez au moins un document.');
          await envoyerDocs(d.id, 'devis', fichiers);
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
        corps: champ('Fournisseur', input('fournisseur', c.fournisseur)) +
          '<div class="row2">' + champ('Commandé le', input('dateCommande', c.dateCommande, 'date')) + champ('Livraison prévue le', input('dateLivraison', c.dateLivraison, 'date')) + '</div>' +
          champ('Commentaire', '<textarea name="commentaire" rows="2">' + esc(c.commentaire) + '</textarea>'),
        valider: async (v) => { await agir('modifierCommande', Object.assign({ id }, v), 'Commande modifiée'); }
      });
    },
    /** Avant de planifier : alerte si des étapes précédentes ne sont pas validées */
    planifier(id) {
      const d = parId(id);
      const manque = interventionsDe(id).length || d.dateDebut ? [] : etapesManquantes(d);
      if (!manque.length) { FORMS.planning(id); return; }
      fenetre({
        titre: 'Des étapes ne sont pas validées', sousTitre: esc(nomClient(d)),
        corps: '<ul class="manques">' + manque.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>',
        bouton: 'Planifier quand même', annuler: 'Ne pas planifier',
        valider: () => { setTimeout(() => FORMS.planning(id), 60); }
      });
    },
    planning(id) {
      const d = parId(id);
      const techs = S.data.users.filter((u) => u.actif !== 'non');
      const choisis = (d.techniciens || '').split(',');
      let its = interventionsDe(id).map((x) => ({ id: x.id, date: x.date, creneau: x.creneau, travaux: x.travaux }));
      if (!its.length && d.dateDebut) {
        // ancien planning (dates de début et de fin) : une journée par jour
        for (let j = d.dateDebut, n = 0; j <= (d.dateFin || d.dateDebut) && n < 14; j = addDays(j, 1), n++) its.push({ date: j, creneau: 'journee', travaux: '' });
      }
      if (!its.length) its = [{ date: '', creneau: 'journee', travaux: '' }];
      const ligneIt = (x) => '<div class="interv-ligne" data-it="' + esc(x.id || '') + '">' +
        '<div class="interv-haut">' + input('it_date', x.date, 'date', 'aria-label="Date"') +
        '<select name="it_creneau" aria-label="Créneau">' + Object.keys(LIB_CRENEAU).map((k) =>
          '<option value="' + k + '"' + (x.creneau === k ? ' selected' : '') + '>' + LIB_CRENEAU[k] + '</option>').join('') + '</select>' +
        '<button type="button" class="btn ghost danger" data-retirer-it aria-label="Retirer cette période">✕</button></div>' +
        '<textarea name="it_travaux" rows="2" placeholder="Travaux à faire ce jour-là…">' + esc(x.travaux || '') + '</textarea></div>';
      const r = S.data.reglages;
      fenetre({
        titre: d.dateDebut ? 'Modifier le planning' : 'Planifier le chantier', sousTitre: esc(nomClient(d)),
        corps: champ('Nom du chantier', input('chantier', d.chantier || nomClient(d))) +
          '<div class="field"><span>Périodes d\'intervention *</span><div data-its>' + its.map(ligneIt).join('') + '</div>' +
          '<button type="button" class="btn" data-ajout-it>+ Ajouter une période</button>' +
          '<small>Journée : ' + esc(r.matinDebut || '08:00') + '–' + esc(r.apremFin || '17:30') + ' · Matin : ' + esc(r.matinDebut || '08:00') + '–' + esc(r.matinFin || '12:00') +
          ' · Après-midi : ' + esc(r.apremDebut || '13:30') + '–' + esc(r.apremFin || '17:30') + '. Chaque période est écrite dans l\'agenda, avec les travaux dans les notes.</small></div>' +
          '<div class="field"><span>Technicien(s)</span><div class="stack">' + techs.map((u) =>
            '<label class="check"><input type="checkbox" name="tech_' + esc(u.email) + '"' + (choisis.indexOf(u.email) >= 0 ? ' checked' : '') + '> ' + esc(u.nom || u.email) +
            (u.role === 'admin' ? ' <span class="muted small">(administration)</span>' : '') + '</label>').join('') + '</div></div>',
        apres: (form) => {
          const zone = form.querySelector('[data-its]');
          form.querySelector('[data-ajout-it]').onclick = () => {
            const dern = zone.querySelectorAll('input[name=it_date]');
            const der = dern.length ? dern[dern.length - 1].value : '';
            zone.insertAdjacentHTML('beforeend', ligneIt({ date: der ? addDays(der, 1) : '', creneau: 'journee', travaux: '' }));
          };
          zone.onclick = (ev) => {
            const b = ev.target.closest('[data-retirer-it]');
            if (b) b.closest('.interv-ligne').remove();
          };
        },
        valider: (v, form) => {
          const lignes = Array.from(form.querySelectorAll('.interv-ligne')).map((el) => ({
            id: el.dataset.it || '',
            date: el.querySelector('[name=it_date]').value,
            creneau: el.querySelector('[name=it_creneau]').value,
            travaux: el.querySelector('[name=it_travaux]').value.trim()
          }));
          if (!lignes.length) throw new Error('Ajoutez au moins une période d\'intervention.');
          if (lignes.some((x) => !x.date)) throw new Error('Indiquez la date de chaque période (ou retirez la ligne vide).');
          const t = Object.keys(v).filter((k) => k.indexOf('tech_') === 0).map((k) => k.slice(5));
          return agir('planifier', { id, chantier: v.chantier, interventions: lignes, techniciens: t.join(',') }, 'Chantier planifié et inscrit dans l\'agenda');
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
        corps: '<p>L\'avancement passera à 100 % et un mail préviendra qu\'il faut facturer.</p>' +
          champ('Commentaire de fin (facultatif)', '<textarea name="commentaire" rows="3"></textarea>') +
          '<h3 style="font-size:15px;margin:18px 0 10px;color:var(--navy)">PV de réception (facultatif)</h3>' + champsPV(true),
        bouton: 'Oui, chantier terminé', classe: 'green',
        apres: brancherPV,
        valider: async (v, form) => {
          const pv = lirePV(v, form, true);
          await envoyerFichiersPV(d.id, pv);
          await agir('chantierTermine', { id, commentaire: v.commentaire, pvStatut: pv.statut, reserves: pv.reserves },
            pv.statut === 'avec_reserves' ? 'Chantier terminé, réserves signalées par mail' : 'Chantier terminé, facturation prévenue');
        }
      });
    },
    pv(id) {
      const d = S.dossier && S.dossier.dossier.id === id ? S.dossier.dossier : parId(id);
      fenetre({
        titre: 'PV de réception', sousTitre: esc(nomChantier(d)) + ' · vous pouvez ajouter des documents à ceux déjà joints',
        corps: champsPV(false, d),
        bouton: 'Enregistrer le PV',
        apres: brancherPV,
        valider: async (v, form) => {
          const pv = lirePV(v, form, false);
          await envoyerFichiersPV(d.id, pv);
          await agir('enregistrerPV', { id, pvStatut: pv.statut, reserves: pv.reserves },
            pv.statut === 'avec_reserves' ? 'PV enregistré, réserves signalées par mail' : 'PV enregistré');
        }
      });
    },
    confirmer(titre, texte, bouton, fn, classe) {
      fenetre({ titre, corps: '<p>' + texte + '</p>', bouton, classe: classe || 'primary', valider: fn });
    },
    /** Confirmation avec motif obligatoire, gardé dans l'historique */
    avecMotif(titre, texte, bouton, fn, classe) {
      fenetre({
        titre, corps: '<p>' + texte + '</p>' + champ('Motif *', '<textarea name="motif" rows="2" placeholder="Pourquoi ce changement ?"></textarea>', 'Il sera noté dans l\'historique du dossier.'),
        bouton, classe: classe || 'primary',
        valider: (v) => { if (!v.motif) throw new Error('Indiquez le motif.'); return fn(v.motif); }
      });
    },
    retour(id) {
      const d = parId(id);
      const cible = etapePrec(d);
      const notes = {
        devis_envoye: 'La relance client repartira d\'aujourd\'hui.',
        commande: 'Le rappel « commander le matériel » repartira d\'aujourd\'hui. Les dates de chantier seront effacées si le chantier était planifié.',
        materiel: 'Les dates de chantier seront effacées.',
        planifie: 'L\'avancement repassera à 0 %.',
        en_cours: 'La facture finale pas encore faite sera retirée.',
        termine: 'La facture finale redevient « à faire » et le rappel « À facturer » repartira d\'aujourd\'hui.',
        devis_a_faire: 'Le rappel « Devis à faire » repartira d\'aujourd\'hui.'
      };
      FORMS.avecMotif('Revenir à l\'étape précédente',
        '<strong>' + esc(nomClient(d)) + '</strong> passe de « ' + esc(ETAPES()[d.etape]) + ' » à « ' + esc(ETAPES()[cible]) + ' ». ' + (notes[cible] || ''),
        'Revenir en arrière', (motif) => agir('etapePrecedente', { id, motif }, 'Dossier revenu à « ' + ETAPES()[cible] + ' »'));
    },
    nouveau() {
      fenetre({
        titre: 'Nouveau dossier', sousTitre: 'Pour un client qui n\'a pas de rendez-vous dans l\'agenda.',
        corps: champ('Nom du client *', input('client', '')) +
          '<div class="row2">' + champ('Date du contact', input('dateRdv', today(), 'date')) + champ('Lieu', input('lieu', '')) + '</div>' +
          champ('Notes', '<textarea name="notes" rows="3" placeholder="Ce que veut le client…"></textarea>') +
          champ('Numéro de devis', input('numDevis', ''), 'Seulement si le devis est déjà envoyé. Le dossier passera alors directement en « Devis envoyé ».'),
        bouton: 'Créer le dossier',
        valider: async (v) => {
          if (!v.client) throw new Error('Le nom du client est obligatoire.');
          const r = await agir('creerDossier', v, 'Dossier créé');
          if (r && r.resultat) location.hash = '#/dossier/' + r.resultat;
        }
      });
    },
    reception(id) {
      const c = S.data.commandes.find((x) => x.id === id);
      const d = parId(c.dossierId);
      fenetre({
        titre: 'Réception du matériel', sousTitre: esc(nomChantier(d)) + ' · ' + esc(c.fournisseur) + ' · attendu le ' + fr(c.dateLivraison),
        corps: '<div class="choices" role="radiogroup" aria-label="État de la livraison">' +
          '<label><input type="radio" name="statut" value="conforme"><span>Conforme</span></label>' +
          '<label><input type="radio" name="statut" value="non_conforme"><span>Non conforme</span></label>' +
          '<label><input type="radio" name="statut" value="partielle"><span>Partielle</span></label></div>' +
          '<div data-pane="partielle" hidden>' + champ('Le reste arrive le *', input('nouvelleDate', '', 'date')) + '</div>' +
          '<div data-pane="non_conforme" hidden><p class="help">La commande reste ouverte, en attente de traitement, et un mail prévient l\'administration.</p></div>' +
          '<div class="row2">' + champ('Reçu le', input('dateReception', today(), 'date')) + champ('Réceptionné par', input('receptionPar', S.data.user.nom || '')) + '</div>' +
          champ('N° du bon de livraison', input('numBL', '')) +
          champ('Commentaire', '<textarea name="commentaire" rows="3" placeholder="Manquant, abîmé, erreur de référence…"></textarea>') +
          champ('Photo (bon de livraison ou matériel)', '<input type="file" name="photo" accept="image/*,application/pdf">'),
        bouton: 'Enregistrer la réception',
        apres: (form) => {
          form.querySelectorAll('input[name=statut]').forEach((r) => {
            r.onchange = () => {
              const t = form.querySelector('input[name=statut]:checked').value;
              form.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
            };
          });
        },
        valider: async (v) => {
          if (!v.statut) throw new Error('Indiquez si la livraison est conforme, non conforme ou partielle.');
          if (v.statut === 'partielle' && !v.nouvelleDate) throw new Error('Indiquez quand arrive le reste.');
          const photo = v.photo && v.photo.size ? v.photo : null;
          await agir('receptionCommande', {
            id, statut: v.statut, nouvelleDate: v.nouvelleDate, dateReception: v.dateReception,
            receptionPar: v.receptionPar, numBL: v.numBL, commentaire: v.commentaire
          }, { conforme: 'Réception conforme enregistrée', non_conforme: 'Non conformité enregistrée, mail envoyé', partielle: 'Livraison partielle enregistrée' }[v.statut]);
          if (photo) await televerser(photo, 'reception', c.dossierId, c.id);
        }
      });
    },
    modifFacture(id) {
      const f = S.data.factures.find((x) => x.id === id);
      fenetre({
        titre: 'Modifier la facture intermédiaire',
        corps: champ('Pourcentage', input('pourcentage', f.pourcentage, 'number', 'min="1" max="99" inputmode="numeric"')) +
          champ('Commentaire', '<textarea name="commentaire" rows="3">' + esc(f.commentaire) + '</textarea>'),
        valider: (v) => agir('modifierFacture', { id, pourcentage: v.pourcentage, commentaire: v.commentaire }, 'Facture modifiée')
      });
    },
    modifCom(id) {
      const c = (S.dossier.commentaires || []).find((x) => x.id === id);
      fenetre({
        titre: 'Modifier le commentaire',
        corps: champ('Commentaire', '<textarea name="texte" rows="5">' + esc(c.texte) + '</textarea>'),
        valider: (v) => agir('modifierCommentaire', { id, texte: v.texte }, 'Commentaire modifié')
      });
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
  /** Envoie un fichier (PDF ou photo) au programme Google */
  async function televerser(file, type, dossierId, commandeId, nomChoisi) {
    if (file.size > 20 * 1024 * 1024) throw new Error('Fichier trop lourd (20 Mo maximum).');
    let b64, mime = file.type, nom = file.name;
    const ext = (file.name.match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
    if (file.type.indexOf('image/') === 0) {
      b64 = await reduirePhoto(file, 1600);
      mime = 'image/jpeg';
      if (!b64) mime = file.type;
      nom = ({ arc: 'ARC ', reception: 'Réception ', pv: 'PV ', reserve: 'Réserve ', devis: 'Devis ' }[type] || 'Photo ') + new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h') + '.jpg';
    }
    if (!b64) b64 = await lireBase64(file);
    let nomFichier = nom;
    if (nomChoisi) {
      nom = nomChoisi;
      nomFichier = nomChoisi + (mime === 'image/jpeg' && file.type !== 'image/jpeg' ? '.jpg' : ext);
    }
    toast('Envoi en cours…');
    await agir('envoyerFichier', { dossierId, commandeId: commandeId || '', type, base64: b64, mime, nom, nomFichier },
      { arc: 'PDF de l\'ARC enregistré', reception: 'Photo de réception enregistrée', pv: 'Document du PV enregistré', reserve: 'Photo de réserve enregistrée', devis: 'Document du devis enregistré', divers: 'Document enregistré' }[type] || 'Photo enregistrée');
  }

  async function envoyerFichier(inp) {
    const file = inp.files && inp.files[0];
    if (!file) return;
    try {
      await televerser(file, inp.dataset.upload, inp.dataset.dossier, inp.dataset.cmd);
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
    ajoutCom: (el) => essayer(async () => {
      const t = $('#com-txt').value.trim();
      if (!t) { toast('Écrivez ou dictez un commentaire.', true); return; }
      await agir('commentaire', { id: el.dataset.id, texte: t }, 'Commentaire enregistré');
      await afficher();
    }),
    factInter: (el) => FORMS.factInter(el.dataset.id),
    retour: (el) => FORMS.retour(el.dataset.id),
    nouveau: () => FORMS.nouveau(),
    supprDossier: (el) => {
      const d = parId(el.dataset.id);
      FORMS.avecMotif('Supprimer ce dossier ?', 'Le dossier <strong>' + esc(nomClient(d)) + '</strong> sera supprimé avec ses commandes, factures et commentaires. Les fichiers déjà rangés dans Google Drive sont conservés. <strong>Cette action est définitive.</strong>',
        'Supprimer définitivement', async (motif) => { await agir('supprimerDossier', { id: d.id, motif }, 'Dossier supprimé'); location.hash = '#/'; }, 'danger');
    },
    supprCommande: (el) => {
      const c = S.data.commandes.find((x) => x.id === el.dataset.id);
      FORMS.avecMotif('Supprimer cette commande ?', 'Commande <strong>' + esc(c.fournisseur) + '</strong>, livraison le ' + fr(c.dateLivraison) + '.', 'Supprimer',
        (motif) => agir('supprimerCommande', { id: c.id, motif }, 'Commande supprimée'), 'danger');
    },
    modifFacture: (el) => FORMS.modifFacture(el.dataset.id),
    reception: (el) => FORMS.reception(el.dataset.id),
    annulerReception: (el) => FORMS.avecMotif('Annuler cette réception ?', 'La commande redevient « à réceptionner ».', 'Annuler la réception',
      (motif) => agir('annulerReception', { id: el.dataset.id, motif }, 'Réception annulée')),
    supprFacture: (el) => FORMS.avecMotif('Supprimer cette demande de facture ?', 'La demande de facture intermédiaire sera retirée.', 'Supprimer',
      (motif) => agir('supprimerFacture', { id: el.dataset.id, motif }, 'Demande supprimée'), 'danger'),
    annulerFacture: (el) => FORMS.avecMotif('Annuler « facture faite » ?', 'La facture redevient « à faire » et le rappel repartira d\'aujourd\'hui. Si c\'est la facture finale, le dossier revient en « À facturer ».', 'Annuler la facture',
      (motif) => agir('annulerFacture', { id: el.dataset.id, motif }, 'Facture remise à faire')),
    modifCom: (el) => FORMS.modifCom(el.dataset.id),
    supprCom: (el) => FORMS.confirmer('Supprimer ce commentaire ?', 'Le commentaire (et la photo, s\'il y en a une) ne sera plus affiché. La photo reste dans Google Drive.', 'Supprimer',
      () => agir('supprimerCommentaire', { id: el.dataset.id }, 'Commentaire supprimé'), 'danger'),
    termine: (el) => FORMS.termine(el.dataset.id),
    pv: (el) => FORMS.pv(el.dataset.id),
    docDevis: (el) => FORMS.docDevis(el.dataset.id),
    deposer: (el) => FORMS.deposer(el.dataset.id),
    renommerDoc: (el) => FORMS.renommerDoc(el.dataset.id),
    supprDoc: (el) => FORMS.confirmer('Retirer ce document ?', 'Il ne sera plus affiché dans le dossier. Le fichier part dans la corbeille Google Drive, où il reste récupérable pendant 30 jours.', 'Retirer',
      () => agir('supprimerDocument', { id: el.dataset.id }, 'Document retiré'), 'danger'),
    saveMails: () => essayer(async () => {
      const mails = Array.from(document.querySelectorAll('details.mail')).map((box) => {
        const g = (n) => box.querySelector('[name=' + n + ']');
        const m = { cle: box.dataset.mail, active: g('active').checked ? 'oui' : 'non', destinataires: g('destinataires').value.trim(), objet: g('objet').value, texte: g('texte').value };
        if (g('copieTechniciens')) m.copieTechniciens = g('copieTechniciens').checked ? 'oui' : 'non';
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
    if (page === '') {
      const inp = $('#loupe');
      const box = $('#loupe-res');
      const chercher = () => {
        const q = sansAccent(inp.value).trim();
        if (!q) { box.hidden = true; box.innerHTML = ''; return; }
        const docsDe = (d) => (S.data.documents || []).filter((x) => x.dossierId === d.id);
        const res = S.data.dossiers.filter((d) => sansAccent([d.client, d.titreRdv, d.chantier, d.numDevis, d.numCommande, d.lieu]
          .concat(docsDe(d).map((x) => x.nom)).join(' ')).indexOf(q) >= 0)
          .sort((a, b) => (ouvert(b) - ouvert(a)) || ((b.majLe || '') > (a.majLe || '') ? 1 : -1)).slice(0, 12);
        box.innerHTML = res.length ? res.map((d) => {
          const doc = docsDe(d).find((x) => sansAccent(x.nom).indexOf(q) >= 0);
          return '<a class="loupe-item" href="#/dossier/' + d.id + '"><span><strong>' + esc(nomClient(d)) + '</strong>' +
            (d.chantier && d.chantier !== nomClient(d) ? ' · ' + esc(d.chantier) : '') +
            '<span class="muted small">' + [d.numDevis && 'Devis ' + esc(d.numDevis), d.numCommande && 'Commande ' + esc(d.numCommande), d.lieu && esc(d.lieu),
              doc ? 'document « ' + esc(doc.nom) + ' »' : ''].filter(Boolean).map((x) => ' · ' + x).join('') + '</span></span>' + pillEtape(d) + '</a>';
        }).join('') : '<div class="loupe-vide">Aucun dossier ne correspond.</div>';
        box.hidden = false;
      };
      inp.oninput = chercher;
      inp.onkeydown = (ev) => {
        if (ev.key === 'Enter') { const a = box.querySelector('a'); if (a) location.hash = a.getAttribute('href'); }
        if (ev.key === 'Escape') { inp.value = ''; chercher(); }
      };
    }
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
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t.matches('[data-docsearch]')) return;
    const q = sansAccent(t.value).trim();
    const carte = t.closest('.card');
    let n = 0;
    carte.querySelectorAll('.doc').forEach((el) => {
      const ok = !q || (el.dataset.nom || '').indexOf(q) >= 0;
      el.hidden = !ok;
      if (ok) n++;
    });
    carte.querySelectorAll('.docs').forEach((g) => {
      const titre = g.previousElementSibling;
      const visible = Array.from(g.children).some((x) => !x.hidden);
      g.hidden = !visible;
      if (titre && titre.classList.contains('muted') && titre.tagName === 'DIV') titre.hidden = !visible;
    });
    carte.querySelector('.doc-vide').hidden = n > 0;
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
