import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { StoreProvider } from "./lib/store";
import { DemoStoreProvider } from "./lib/demo/demoStore";
import { isDemo } from "./lib/mode";

// The demo build runs inside an embedded preview, so it keeps navigation in memory instead of the URL.
const Provider = isDemo ? DemoStoreProvider : StoreProvider;
const Router = isDemo ? MemoryRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider>
      <Router>
        <App />
      </Router>
    </Provider>
  </React.StrictMode>,
);
