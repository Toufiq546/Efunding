import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { StoreProvider } from "./lib/store";
import { DemoStoreProvider } from "./lib/demo/demoStore";
import { isDemo } from "./lib/mode";
import { LanguageProvider } from "./lib/i18n";

// The demo build runs inside an embedded preview, so it keeps navigation in memory instead of the URL.
const Provider = isDemo ? DemoStoreProvider : StoreProvider;
const Router = isDemo ? MemoryRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <Provider>
        <Router>
          <App />
        </Router>
      </Provider>
    </LanguageProvider>
  </React.StrictMode>,
);
