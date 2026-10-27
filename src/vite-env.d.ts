/// <reference types="vite/client" />

declare module "*?worker&inline" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs";
declare module "pdfjs-dist/build/pdf.worker.mjs";
