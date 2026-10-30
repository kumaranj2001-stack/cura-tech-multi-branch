import http from "node:http";
import { app, db, COLLECTIONS, firebaseConfig } from "./firebase.mjs";

async function run() {
  console.log("Testing server endpoints against kumaran-5...");
  const res = await fetch("http://localhost:3001/api/health").catch(() => null);
  console.log("Checking if local server is already running...");
  if (!res) {
    console.log("Server not actively running on 3001 (will be started with 'npm run server').");
  } else {
    const data = await res.json();
    console.log("Server health response:", data);
  }
}

run();
