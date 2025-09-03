import Canvas from "./components/canvas";

const App = () => {

    <style>
    {`
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');

      body, html {
        font-family: 'Poppins', sans-serif;
        overflow-x: hidden;  /* Remove horizontal scrollbar */
      }
    `}
  </style>
    return (
        <div>
            <Canvas/>
        </div>
    )
}

export default App;