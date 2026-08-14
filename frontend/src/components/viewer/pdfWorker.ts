/**
 * The pdf.js worker, from `node_modules` rather than from a CDN.
 *
 * react-pdf ships no default worker path, and the usage everywhere in this
 * repository pointed at `unpkg.com`. That is a request to a third party for
 * executable code, on every reader who opens a document, on a site that
 * otherwise fetches nothing off its own origin. Vite's `?url` import emits the
 * worker as a build asset and hands back its hashed path.
 *
 * Importing this module is the whole of its effect. Any module that renders a
 * `<Document>` imports it, and the assignment is idempotent.
 */

import { pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export { workerSrc };
