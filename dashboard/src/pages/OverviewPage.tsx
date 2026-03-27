import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Employee, Stats } from '../api/client';
import { ProgressBar } from '../components/ProgressBar';

export function OverviewPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getEmployees(), api.getStats()])
      .then(([emp, st]) => { setEmployees(emp); setStats(st); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <h1>Onboarding Dashboard</h1>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{stats.totalEmployees}</div>
            <div className="stat-label">Total Employees</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.activeEmployees}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.completedEmployees}</div>
            <div className="stat-label">Completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.avgProgress}%</div>
            <div className="stat-label">Avg Progress</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.totalDocuments}</div>
            <div className="stat-label">Knowledge Docs</div>
          </div>
        </div>
      )}

      <h2>Employees</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Day</th>
              <th>Tasks</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td>
                  <Link to={`/employee/${emp.slackId}`}>{emp.name}</Link>
                </td>
                <td>{emp.role}</td>
                <td>{emp.currentDay}/{emp.totalDays}</td>
                <td>{emp.completedTasks}/{emp.totalTasks}</td>
                <td style={{ width: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ProgressBar percent={emp.progress} />
                    <span style={{ fontSize: 13, minWidth: 35 }}>{emp.progress}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888' }}>
                No employees onboarded yet
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
