import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import SearchResults from './pages/SearchResults';
import ProgramDetail from './pages/ProgramDetail';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/program/:id" element={<ProgramDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
