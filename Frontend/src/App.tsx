import { useEffect } from "react";
import Canvas from "./components/canvas";
import { setupTokenRefresh } from "./lib/ws";

const App = () => {
  useEffect(() => {
    // Set up automatic token refresh
    setupTokenRefresh();
  }, []);

  return (
    <>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');

          body, html {
            font-family: 'Poppins', sans-serif;
            overflow-x: hidden;  /* Remove horizontal scrollbar */
          }
        `}
      </style>
      <div>
        <Canvas/>
      </div>
    </>
  )
}

export default App;