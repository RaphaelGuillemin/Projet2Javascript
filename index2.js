// Raphael Guillemain et Pierre Antoine Vaillancourt
// 2018-12-14
'use strict';

var http = require("http");
var fs = require('fs');
var urlParse = require('url').parse;
var pathParse = require('path').parse;
var querystring = require('querystring');

var port = 1337;
var hostUrl = 'http://localhost:' + port + '/';
var defaultPage = '/index.html';

var mimes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

// --- Helpers ---
var readFile = function (path) {
  return fs.readFileSync(path).toString('utf8');
};

var writeFile = function (path, texte) {
  fs.writeFileSync(path, texte);
};

// --- Server handler ---
var redirect = function (reponse, path, query) {
  var newLocation = path + (query == null ? '' : '?' + query);
  reponse.writeHeader(302, {
    'Location': newLocation
  });
  reponse.end('302 page deplace');
};

var getDocument = function (url) {
  var pathname = url.pathname;
  var parsedPath = pathParse(url.pathname);
  var result = {
    data: null,
    status: 200,
    type: null
  };

  if (parsedPath.ext in mimes) {
    result.type = mimes[parsedPath.ext];
  } else {
    result.type = 'text/plain';
  }

  try {
    result.data = readFile('./public' + pathname);
    console.log('[' + new Date().toLocaleString('iso') + "] GET " + url.path);
  } catch (e) {
    // File not found.
    console.log('[' + new Date().toLocaleString('iso') + "] GET " +
      url.path + ' not found');
    result.data = readFile('template/error404.html');
    result.type = 'text/html';
    result.status = 404;
  }

  return result;
};
var sendPage = function (reponse, page) {
  reponse.writeHeader(page.status, {
    'Content-Type': page.type
  });
  reponse.end(page.data);
};

var indexQuery = function (query) {

  var resultat = {
    exists: false,
    id: null
  };

  if (query !== null) {

    query = querystring.parse(query);
    if ('id' in query && 'titre' in query &&
      query.id.length > 0 && query.titre.length > 0) {

      resultat.exists = creerSondage(
        query.titre, query.id,
        query.dateDebut, query.dateFin,
        query.heureDebut, query.heureFin);
    }

    if (resultat.exists) {
      resultat.id = query.id;
    }
  }

  return resultat;
};

var calQuery = function (id, query) {
  if (query !== null) {
    query = querystring.parse(query);
    // query = { nom: ..., disponibilites: ... }
    ajouterParticipant(id, query.nom, query.disponibilites);
    return true;
  }
  return false;
};

var getIndex = function (replacements) {
  return {
    status: 200,
    data: readFile('template/index.html'),
    type: 'text/html'
  };
};


// --------------------------------------------------------------

// -----Creation des pages-----

var sondagesOuverts = [];

// Cree un sondage a partir des informations entrees
//
// Retourne false si les informations ne sont pas valides, ou
// true si le sondage a ete cree correctement.
var creerSondage = function (titre,
                             id,
                             dateDebut,
                             dateFin,
                             heureDebut,
                             heureFin
                             ) {
  if (!verifId(id) || 
      !verifHeures(heureDebut, heureFin) ||
      !dureeMax(dateDebut, dateFin)
      ) {
    return false;
  } else {
    sondagesOuverts.push({titre: "" + titre,
                          id: "" + id,
                          dateDebut: "" + dateDebut,
                          dateFin: "" + dateFin,
                          heureDebut: "" + heureDebut,
                          heureFin: "" + heureFin,
                          participants: [],
                          tableauMax: [],
                          tableauMin: []
                          });
    return true;
  }
};

// Ajoute un participant et ses disponibilites aux resultats d'un
// sondage. Les disponibilites sont envoyees au format textuel
// fourni par la fonction compacterDisponibilites() de public/calendar.js
//
// Cette fonction ne retourne rien
var ajouterParticipant = function (sondageId, nom, disponibilites) {
  var idxSondage = indexSondage(sondageId);
  var infosParticipant = {
    sondageId: sondageId,
    nom: nom,
    disponibilites: disponibilites,
    tableauChoix: []
  };

  sondagesOuverts[idxSondage].participants.push(infosParticipant);

  // Met a jour les infos du sondage
  analyseDonnees(sondageId);
};

// Retourne une rangee d'une "Table" en HTML
var creerRangee = function (noRangee,
                            tableauDates,
                            tableauHeures,
                            page,
                            sondageId
                            ) {

  var rangee = "";
  var indexCal = indexSondage(sondageId);
  var participants = sondagesOuverts[indexCal].participants;
  var nbParticipants = participants.length;
  var nbJoursSondage = tableauDates.length;
  var tuilesMax = sondagesOuverts[indexCal].tableauMax;
  var tuilesMin = sondagesOuverts[indexCal].tableauMin;

  // Rangee contenant les dates
  if (noRangee == -1) {
    rangee += "<tr><th></th>";

    for (var i = 0; i < nbJoursSondage; i++) {
      rangee += "<th>" + tableauDates[i] + "</th>";
    }

    rangee += "</tr>";

    // Rangee contenant des cases a cocher
  } else if (page == "cal") {
    rangee += "<tr><th>" + tableauHeures[noRangee];

    for (var i = 0; i < nbJoursSondage; i++) {
      rangee += "</th><td id='" + i + "-" + (+noRangee) + "'></td>";
    }

    rangee += "</td>";

    // Rangee contenant resultats
  } else if (page == "res") {
    rangee += "<tr><th>" + tableauHeures[noRangee] + "</th>";

    for (var i = 0; i < nbJoursSondage; i++) {
      var idTuile = "" + i + "-" + noRangee;
      var idTuileTabMax = indexTuileDansTab(tuilesMax, idTuile);
      var idTuileTabMin = indexTuileDansTab(tuilesMin, idTuile);

      rangee += "<td id='" + i + "-" + (+noRangee) + "'";

      if (idTuileTabMin != -1) { // Tuile la moins populaire
        rangee += " class='min'>";
      } else if (idTuileTabMax != -1) { // Tuile la plus populaire
        rangee += " class='max'>";
      } else { // Tuile moyenne
        rangee += ">";
      }

      // Tuile a ete choisie par au moins un participant
      for (var j = 0; j < nbParticipants; j++) {
        var idTuileDansPart = indexTuileDansTab(participants[j].tableauChoix,
          idTuile
        );
        if (idTuileDansPart != -1) {
          rangee += '<span style="background-color: ' +
            genColor(j, nbParticipants) +
            "; color: " +
            genColor(j, nbParticipants) +
            '">.</span>';
        }
      }
    }
    rangee += "</td>";
  }
  return rangee;
};

// Retourne la portion "calendrier" du code HTML de la page calendar
var creerCalendrier = function (dateDebut,
                                dateFin,
                                heureDebut,
                                heureFin,
                                sondageId
                                ) {
  var datesSondage = tableauDiffDates(dateDebut, dateFin);
  var heuresSondage = tableauDiffHeures(heureDebut, heureFin);

  // Debut du code HTML du calendrier
  var tabHTMLSondage = ("<table id='calendrier' onmousedown='onClick(event)'" +
    " onmouseover='onMove(event)' data-nbjours='" +
    datesSondage.length + "' data-nbheures='" +
    heuresSondage.length + "'> <!-- En-tête -->"
  );

  // Premiere rangee de "calendrier" contenant les dates
  var rangeeDates = creerRangee(-1,
                                datesSondage,
                                heuresSondage,
                                "cal",
                                sondageId
                                );

  tabHTMLSondage += rangeeDates;

  // Ajout des rangees (une par heure)
  for (var i = 0; i < heuresSondage.length; i++) {
    tabHTMLSondage += creerRangee(i,
                                  datesSondage,
                                  heuresSondage,
                                  "cal",
                                  sondageId
                                  );
  }

  // Fin de "Table"
  tabHTMLSondage += "</table>";

  return tabHTMLSondage;
};

// Retourne la portion "calendrier" du code HTML de la page results
var creerResultats = function (dateDebut,
                               dateFin,
                               heureDebut,
                               heureFin,
                               sondageId
                               ) {
  var datesSondage = tableauDiffDates(dateDebut, dateFin);
  var heuresSondage = tableauDiffHeures(heureDebut, heureFin);

  // Debut du code HTML de "calendrier"
  var tableauResultats = ("<table>");

  // Premiere rangee de "calendrier" contenant les dates
  var rangeeDates = creerRangee(-1,
                                datesSondage,
                                heuresSondage,
                                "res",
                                sondageId
                                );
  tableauResultats += rangeeDates;

  // Ajout des rangees (une par heure)
  for (var i = 0; i < heuresSondage.length; i++) {
    tableauResultats += creerRangee(i,
                                    datesSondage,
                                    heuresSondage,
                                    "res",
                                    sondageId
                                    );
  }

  // Fin de "Table"
  tableauResultats += "</table>";

  return tableauResultats;
};

// Cree une legende pour un sondage
var creerLegende = function (sondageId) {
  var indexCal = indexSondage(sondageId);
  var participants = sondagesOuverts[indexCal].participants;

  var HTMLLegende = "<ul>";

  // Ajoute une rangee coloree par participant
  for (var i = 0; i < participants.length; i++) {
    var couleurParticipant = genColor(i, participants.length);
    HTMLLegende += "<li style='background-color: " +
                    couleurParticipant +
                    "'>" + participants[i].nom + "</li>";
  }

  HTMLLegende += "</ul>";

  return HTMLLegende;
};

// Retourne le texte HTML a afficher a l'utilisateur pour repondre au
// sondage demande.
//
// Retourne false si le calendrier demande n'existe pas
var getCalendar = function (sondageId) {

  // Recupere la structure HTML pour la page "calendar.html"
  var calendrierHTML = readFile("template/calendar.html");

  // Trouve les donnees du calendrier voulu parmi les calendriers enregistres
  var indexCal = indexSondage(sondageId);

  var sondage = sondagesOuverts[indexCal];
  var titreSondage = sondage.titre;
  var urlSondage = hostUrl + sondageId;
  var tableauDispos = creerCalendrier(sondage.dateDebut, 
                                      sondage.dateFin,
                                      sondage.heureDebut,
                                      sondage.heureFin, sondageId
                                      );

  // Substitue une expression {{ }} par un texte
  var motsARemplacer = [titreSondage, titreSondage, tableauDispos, urlSondage];
  calendrierHTML = substituerPlusieursMots(calendrierHTML, motsARemplacer);

  return calendrierHTML;
};

// Retourne le texte HTML a afficher a l'utilisateur pour voir les
// resultats du sondage demande
//
// Retourne false si le calendrier demande n'existe pas
var getResults = function (sondageId) {
  var resultsHTML = readFile("template/results.html");
  var indexResults = indexSondage(sondageId);
  var sondage = sondagesOuverts[indexResults];
  var titreSondage = sondage.titre;
  var urlSondage = hostUrl + sondageId;
  var tableauResultats = creerResultats(sondage.dateDebut,
                                        sondage.dateFin,
                                        sondage.heureDebut,
                                        sondage.heureFin,
                                        sondageId
                                        );
  var legendeParticipants = creerLegende(sondageId);

  // Remplace les doubles-accolades par un texte.
  var motsARemplacer = [titreSondage,
                        titreSondage,
                        urlSondage,
                        tableauResultats,
                        legendeParticipants
                        ];
  resultsHTML = substituerPlusieursMots(resultsHTML, motsARemplacer);

  return resultsHTML;
};


// -----Fonctions utilitaires-----
var mois = [
  'Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
var MILLIS_PAR_JOUR = (24 * 60 * 60 * 1000);

// Retourne true si l'annee en est une bissextile
var bissextile = function (annee) {
  if ((+annee % 4 == 0 && +annee % 100 != 0) ||
      (+annee % 100 == 0 && +annee % 400 == 0)
      ) {
    return true;
  } else {
    return false;
  }
};

// Verifie que l'indentifiant ne contient que des tirets, lettres et chiffres
var verifId = function (id) {
  for (var i = 0; i < id.length; i++) {
    if (!(id.charAt(i) == "-" ||
        (48 <= id.charCodeAt(i) && id.charCodeAt(i) <= 57 ||
         65 <= id.charCodeAt(i) && id.charCodeAt(i) <= 90 ||
         97 <= id.charCodeAt(i) && id.charCodeAt(i) <= 122)
         )) {
      return false;
    }
  }
  return true;
};

// Verifie si l'heure de debut est avant ou egale a l'heure de fin
var verifHeures = function (heure1, heure2) {
  if (+heure1 <= +heure2) {
    return true;
  } else {
    return false;
  }
};

// Verifie la duree maximale de 30 jours et minimale de 0 jours
var dureeMax = function (date1, date2) {
  var millisDateDebut = new Date(date1).getTime();
  var millisDateFin = new Date(date2).getTime();

  if (millisDateFin - millisDateDebut < (30 * MILLIS_PAR_JOUR) &&
      millisDateFin - millisDateDebut >= 0
      ) {
    return true;
  } else {
    return false;
  }
};

// Genere la i eme couleur parmi un nombre total au format hexadecimal HTML
var genColor = function (i, nbTotal) {
  var teinte = (i / nbTotal) * 360;
  var h = teinte / 60;
  var c = 0.7;
  var x = c * (1 - Math.abs(h % 2 - 1));
  var rgb = [0, 0, 0];

  switch (Math.floor(h)) {
    case 0:
      rgb = [c, x, 0];
      break;
    case 1:
      rgb = [x, c, 0];
      break;
    case 2:
      rgb = [0, c, x];
      break;
    case 3:
      rgb = [0, x, c];
      break;
    case 4:
      rgb = [x, 0, c];
      break;
    case 5:
      rgb = [c, 0, x];
      break;
    default:
      rgb = [0, 0, 0];
  }

  var rgb2 = rgb.map(function (x) {
    return Math.floor(x * 255).toString(16);
  });
  var rgbHex = '#';
  rgb2.forEach(function (x) {
    if (x.length == 1) {
      rgbHex += "0" + x;
    } else {
      rgbHex += x;
    }
  });
  return rgbHex; //"#000000"
};

// Trouve les donnees du calendrier voulu parmi les sondages enregistres
var indexSondage = function (sondageId) {
  var indexCalendrier = -1;
  sondagesOuverts.forEach(function (x, i) {
    if (x.id == sondageId) {
      indexCalendrier = i;
    }
  });
  return indexCalendrier;
};

// Retourne l'index d'une tuile dans un tableau contenant des tuiles
var indexTuileDansTab = function (tableau, tuile) {
  return tableau.indexOf(tuile);
};

// Retourne un tableau contenant une paire d'index, soit celui de la premiere
// accolade d'une paire d'accolades ouvrantes et la deuxieme accolade d'une
// paire d'accolades fermantes
var positionsAccolades = function (texte) {
  var tableauAccolades = [];

  for (var i = 0; i < texte.length; i++) {
    if (texte.charAt(i) == "{") {
      tableauAccolades.push(i++);
    } else if (texte.charAt(i) == "}") {
      tableauAccolades.push(++i);
      break;
    }
  }
  return tableauAccolades;
};

// Permet de remplacer un mot par un autre dans une chaine de texte
var substituerMotHTML = function (texte, mot, index1, index2) {
  texte = texte.slice(0, index1) + mot + texte.slice(index2+1, texte.length+1);
  return texte;
};

// Substitue une expression {{ }} par un texte
var substituerMotAccolades = function (tabAccolades, phrase, mot) {
  tabAccolades = positionsAccolades(phrase);
  phrase = substituerMotHTML("" + phrase,
                             mot,
                             tabAccolades[0],
                             tabAccolades[1]
                             );
  return phrase;
};

// Modifie une chaine de texte pour y remplacer certains mots par d'autres
var substituerPlusieursMots = function (phrase, tableauMots) {
  for (var i = 0; i < tableauMots.length; i++) {
    var tabAccolades = positionsAccolades(phrase);
    phrase = substituerMotAccolades(tabAccolades, phrase, tableauMots[i]);
  }
  return phrase;
};

// Retourne un tableau contenant les dates du sondage
var tableauDiffDates = function (dateDebut, dateFin) {
  var tableauDates = [];
  var date1 = new Date(dateDebut);
  var date2 = new Date(dateFin);
  var date1Jours = date1.getTime() / MILLIS_PAR_JOUR;
  var date2Jours = date2.getTime() / MILLIS_PAR_JOUR;
  var mois1 = date1.getMonth();
  var dateJoursMois = ["31", "28", "31", "30", "31", "30", "31", 
                       "31", "30", "31", "30", "31"
                       ];
  var dateJoursMoisBis = ["31", "29", "31", "30", "31", "30", "31",
                          "31", "30", "31", "30", "31"
                          ];
  var joursDuMoisBis = dateJoursMoisBis[date1.getMonth()];
  var joursDuMoisSuivantBis = dateJoursMoisBis[date1.getMonth() + 1];
  var joursDuMois = dateJoursMois[date1.getMonth()];
  var joursDuMoisSuivant = dateJoursMois[date1.getMonth() + 1];

  for (var i = 0; i <= date2Jours - date1Jours; i++) {
    var date = (date1).getDate() + 1 + i;

    // Annee bissextile
    if (bissextile(date1.getFullYear())) {
      if (date > +joursDuMoisBis) {
        date -= +joursDuMoisBis;
        if (date > +joursDuMoisSuivantBis) {
          date -= +joursDuMoisSuivantBis;
        }
        if (mois1 == 11 && date == 1) {
          mois1 = 0;
        } else if (date == 1) {
          mois1++;
        }
      }
      tableauDates.push(date + " " + mois[mois1]);
      
      // Annee non bissextile
    } else {
      if (date > +joursDuMois) {
        date -= +joursDuMois;
        if (date > +joursDuMoisSuivant) {
          date -= +joursDuMoisSuivant;
        }
        if (mois1 == 11 && date == 1) {
          mois1 = 0;
        } else if (date == 1) {
          mois1++;
        }
      }
      tableauDates.push(date + " " + mois[mois1]);
    }
  }
  return (tableauDates);
};

// Retourne un tableau contenant les heures du sondage
var tableauDiffHeures = function (heureDebut, heureFin) {
  var tableauHeures = [];
  for (var i = +heureDebut; i <= +heureFin; i++) {
    tableauHeures.push(i + "h");
  }
  return tableauHeures;
};

// Retourne un enregistrement contenant un tableau contenant les choix les
// plus populaires et un tableau contenant les choix les moins populaires
// parmi tous les choix effectues (ou non)
var maximumMinimum = function (donneesBinSond) {
  var max = [0];
  var min = [0];
  for (var m = 0; m < donneesBinSond.length; m++) {
    if (+donneesBinSond.charAt(m) > +donneesBinSond.charAt(max[0])) {
      max = [];
      max.push(m);
    } else if (+donneesBinSond.charAt(m) == +donneesBinSond.charAt(max[0])) {
      if (m != 0) {
        max.push(m);
      }
    }
    if (+donneesBinSond.charAt(m) < +donneesBinSond.charAt(min[0])) {
      min = [];
      min.push(m);
    } else if (+donneesBinSond.charAt(m) == +donneesBinSond.charAt(min[0])) {
      if (m != 0) {
        min.push(m);
      }
    }
  }
  return {
    max: max,
    min: min
  };
};

// Prend les donnees d'un sondage et les compile en une chaine de 1 et 0
var compilationDonnees = function (sondage) {
  var donneesBinSondage = "";
  for (var j = 0; j < sondage.participants[0].disponibilites.length; j++) {
    var addition = 0;
    for (var i = 0; i < sondage.participants.length; i++) {
      addition += +sondage.participants[i].disponibilites.charAt(j);
    }
    donneesBinSondage += addition;
  }
  return donneesBinSondage;
};

// Ajoute les id des tuiles extremes (min ou max) a un tableau
var tuilesMinMax = function (extreme, id, nbJours) {
  for (var k = 0; k < extreme.length; k++) {
    var identifiant = "";
    identifiant += extreme[k] % nbJours + "-" + Math.floor(extreme[k]/nbJours);
    id.push(identifiant);
  }
};

// Ajoute les donnees du dernier participant au sondage
var dernierParticipant = function (dernierPart, nbJours) {
  for (var j = 0; j < dernierPart.disponibilites.length; j++) {
    if (dernierPart.disponibilites.charAt(j) == 1) {
      dernierPart.tableauChoix.push(j % nbJours + "-" + Math.floor(j/nbJours));
    }
  }
};

// Trouve les choix les plus et moins poulaires
var analyseDonnees = function (sondageId) {

  // Trouve les donnees du calendrier voulu parmi les calendriers enregistres
  var indexCal = indexSondage(sondageId);
  var sondage = sondagesOuverts[indexCal];
  var donneesBinSondage = compilationDonnees(sondage);

  // Calcule le max et le min et les remplace dans les tableaux max et min
  var maxMin = maximumMinimum(donneesBinSondage);
  var max = maxMin.max;
  var min = maxMin.min;

  var IdMax = [];
  var IdMin = [];
  var nbJours = tableauDiffDates(sondage.dateDebut, sondage.dateFin).length;

  // Complete les tableaux IdMax et IdMin pour avoir tous les Ids
  tuilesMinMax(max, IdMax, nbJours);
  tuilesMinMax(min, IdMin, nbJours);

  // Si la chaine est compose uniquement de "0", il n'y a pas de max
  if (+donneesBinSondage == 0) {
    IdMax = [];
  }

  // Ajoute les tableaux de Id(s) a l'enregistrement du sondage
  sondage.tableauMax = IdMax;
  sondage.tableauMin = IdMin;
  var dernierPart = sondage.participants[sondage.participants.length - 1];

  dernierParticipant(dernierPart, nbJours);
};

// -----Tests pertinents de certaines fonctions-----
var testFonctions = function () {
  var assert = require('assert');

  // bissextile
  assert(bissextile(2000));
  assert(bissextile(2018) == false);
  assert(bissextile(2020));

  // indexSondage
  assert(indexSondage("...") == -1);

  // tableauDiffDates
  assert(tableauDiffDates("2018-12-01", "2018-12-01") == ("1 Dec"));
  assert(tableauDiffDates("2018-12-31", "2019-01-01") == ("31 Dec,1 Jan"));

  // tableauDiffHeures
  assert(tableauDiffHeures("17", "17") == ("17h"));
  assert(tableauDiffHeures("17", "18") == ("17h,18h"));
  assert(tableauDiffHeures("17", "19") == ("17h,18h,19h"));

  // indexTuileDansTab
  assert(indexTuileDansTab(["0-1", "1-1", "4-6"], "4-6") == 2);
  assert(indexTuileDansTab(["0-1", "1-1", "4-6"], "4-7") == -1);
  assert(indexTuileDansTab([], "0-1") == -1);


  // positionAccolades
  assert(positionsAccolades("012{{5678}}123") == "3,10");
  assert(positionsAccolades("{{}}56789012{{5678}}123") == "0,3");

  // substituerMotHTML
  assert(substituerMotHTML("0123456789", "mot", 0, 1) == "mot23456789");
  assert(substituerMotHTML("0123456789", "mot", 8, 9) == "01234567mot");

  // substituerMotAccolades
  assert(substituerMotAccolades([0, 3], "{{}}456789", "mot") == "mot456789");
  assert(substituerMotAccolades([6, 9], "012345{{}}", "mot") == "012345mot");

  // substituerPlusieursMots
  assert(substituerPlusieursMots("012{{}}789", ["mot"]) == "012mot789");
  assert(substituerPlusieursMots("{{}}45{{}}", ["MOT", "mot"]) == "MOT45mot");

  // verifID
  assert(verifId("abc123"));
  assert(verifId("pp.2") == false);
  assert(verifId("/*asw2¦¦") == false);
  assert(verifId("al-lo"));

  // verifHeures
  assert(verifHeures("17", "19"));
  assert(verifHeures("0", "23"));
  assert(verifHeures("23", "16") == false);
  assert(verifHeures("12", "12"));

  // dureeMax
  assert(dureeMax("2017-01-31", "2017-03-01"));
  assert(dureeMax("2016-01-31", "2016-03-01") == false);
  assert(dureeMax("2017-01-31", "2017-01-29") == false);
  assert(dureeMax("2017-01-31", "2017-02-15"));

  // creerSondage
  assert(!creerSondage("1", "12*3", "2018-12-28", "2018-12-31", "17", "19"));
  assert(!creerSondage("1", "123", "2018-12-31", "2018-12-28", "17", "19"));
  assert(!creerSondage("1", "123", "2018-12-28", "2018-12-31", "19", "17"));
  assert(!creerSondage("1", "1*23", "2018-12-28", "2018-12-26", "21", "19"));
  assert(creerSondage("1", "123", "2018-12-28", "2018-12-31", "17", "19"));

  // genColor
  assert(genColor(0, 0) == ("#000000"));
  assert(genColor(1, 1) == ("#000000"));
  assert(genColor(2, 10) == ("#8eb200"));
  assert(genColor(10, 10) == ("#000000"));

};
// Decommenter ci-dessous pour tester les fonctions
// testFonctions();


/*
 * Creation du serveur HTTP
 * Note : pas besoin de toucher au code ici (sauf peut-être si vous
 * faites les bonus)
 */
http.createServer(function (requete, reponse) {
  var url = urlParse(requete.url);

  // Redirect to index.html
  if (url.pathname == '/') {
    redirect(reponse, defaultPage, url.query);
    return;
  }

  var doc;

  if (url.pathname == defaultPage) {
    var res = indexQuery(url.query);

    if (res.exists) {
      redirect(reponse, res.id);
      return;
    } else {
      doc = getIndex(res.data);
    }
  } else {
    var parsedPath = pathParse(url.pathname);

    if (parsedPath.ext.length == 0) {
      var id;

      if (parsedPath.dir == '/') {
        id = parsedPath.base;

        if (calQuery(id, url.query)) {
          redirect(reponse, '/' + id + '/results');
          return;
        }

        var data = getCalendar(id);

        if (data === false) {
          redirect(reponse, '/error404.html');
          return;
        }

        doc = {
          status: 200,
          data: data,
          type: 'text/html'
        };
      } else {
        if (parsedPath.base == 'results') {
          id = parsedPath.dir.slice(1);
          var data = getResults(id);

          if (data === false) {
            redirect(reponse, '/error404.html');
            return;
          }

          doc = {
            status: 200,
            data: data,
            type: 'text/html'
          };
        } else {
          redirect(reponse, '/error404.html');
          return;
        }
      }
    } else {
      doc = getDocument(url);
    }
  }

  sendPage(reponse, doc);

}).listen(port);