export function createRating(containerId,field,onChange){

const container =
document.getElementById(containerId);

for(let i=1;i<=5;i++){

const star =
document.createElement("span");

star.innerText="★";

star.addEventListener("click",()=>{

onChange(field,i);

highlight(container,i);

});

container.appendChild(star);

}

}


function highlight(container,value){

const stars =
container.querySelectorAll("span");

stars.forEach((s,index)=>{

s.classList.toggle(

"active",

index < value

);

});

}
