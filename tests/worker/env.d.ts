// Vite raw imports (`?raw`) used by the Worker tests.
declare module '*?raw' {
  const content: string;
  export default content;
}
