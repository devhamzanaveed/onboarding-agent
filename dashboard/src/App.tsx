import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { OverviewPage } from './pages/OverviewPage';
import { EmployeePage } from './pages/EmployeePage';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/employee/:slackId" element={<EmployeePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
