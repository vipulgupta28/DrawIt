import { useEffect } from "react";
import Canvas from "./components/canvas";
import { setupTokenRefresh } from "./lib/ws";

const App = () => {
  useEffect(() => {
    setupTokenRefresh();
  }, []);

  return <Canvas />;
};

export default App;
