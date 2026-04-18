import { requireAuth } from "./session.js";
import { loadSidebar } from "../components/sidebar.js";

export function init(page){

requireAuth();

loadSidebar(page);

}
