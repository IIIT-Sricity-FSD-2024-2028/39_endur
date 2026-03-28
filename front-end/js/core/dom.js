export function qs(selector){

return document.querySelector(selector);

}

export function qsa(selector){

return document.querySelectorAll(selector);

}

export function setText(id,text){

document.getElementById(id).innerText=text;

}
