import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import SearchResults from './pages/SearchResults';
import ProgramDetail from './pages/ProgramDetail';
import Auth from './pages/Auth';
import ProfilePage from './pages/Profile';
import Universities from './pages/Universities';
import About from './pages/About';
import Contact from './pages/Contact';
import ItalyCoursesPage from './pages/ItalyCourses';
import Jobs from './pages/Jobs';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/program/:id" element={<ProgramDetail />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/universities" element={<Universities />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/italy-courses" element={<ItalyCoursesPage />} />
        <Route path="/jobs" element={<Jobs />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
