export function get(key){

return JSON.parse(
localStorage.getItem(key)
);

}

export function set(key,value){

localStorage.setItem(
key,
JSON.stringify(value)
);

}

export function remove(key){

localStorage.removeItem(key);

}
