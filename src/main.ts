import { NeoDuckHuntApp } from "./ui/NeoDuckHuntApp";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root.");
}

const app = new NeoDuckHuntApp(root);

app.boot().catch((error: unknown) => {
  console.error(error);
  root.innerHTML = "";
  const fatal = document.createElement("div");
  fatal.className = "fatal";
  const title = document.createElement("strong");
  title.textContent = "Neo Duck Hunt failed to start.";
  const detail = document.createElement("span");
  detail.textContent = String(error);
  fatal.append(title, detail);
  root.append(fatal);
});
