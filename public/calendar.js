'use strict';

document.addEventListener('DOMContentLoaded', function() {
});

// Ajoute ou enleve un crochet lorsque l'utilisateur clique sur une case
var onClick= function(event) {
  var t = event.target;
  //empeche que le tableau disparaisse quand on clique sur une bordure
  if (t.tagName!="TD"){
    return false;
  }
  //vider la case si pleine, sinon ajouter crochet
  if (t.textContent!=""){
    t.textContent="";
  } else {
    t.innerHTML="&#10003;"; 
  }
};

// Change les valeurs du tableau lors d'un clic glisse
var onMove = function (event) {
  var t = event.target;
  // Ne rien faire jusqu'a un clique, appeler onClick si clique detecte
  if (event.buttons!=0){
    onClick(event);
  }
};

// Retourne une chaine de 0 et de 1 ou les 1 correspondent aux cases cochees
var compacterDisponibilites = function() {
  var donnees="";
  var nom = document.getElementById("nom");
  for (var i=0;i<nom.value.length;i++){
    if (nom.value.charAt(i)=="<"){
      nom.value.charAt(i)="&lt;";
    } else if (nom.value.charAt(i)==">"){
      nom.value.charAt(i)="&gt;"
    }
  }
  var cal = document.getElementById("calendrier");
  var nbHeures = cal.dataset.nbheures;
  var nbJours = cal.dataset.nbjours;
  for (var j = 0; j<nbHeures;j++){
    for(var i=0;i<nbJours;i++){
      if(document.getElementById(""+i+"-"+j).textContent==""){
        donnees+="0";
      } else {
        donnees+="1";
      }
    }
  }
  return donnees;
};
